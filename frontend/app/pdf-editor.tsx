"use client";

/* eslint-disable @next/next/no-img-element -- thumbnail PDF là data URL sinh cục bộ trong trình duyệt */

import { ArrowLeft, ArrowRight, Copy, GripVertical, LoaderCircle, RotateCcw, RotateCw, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SausageFactoryLoader from "./sausage-factory-loader";

type EditorPage = {
  id: string;
  sourceIndex: number;
  rotation: number;
  thumbnail: string;
};

type PdfEditorProps = {
  file: File;
  initialRotation: number;
  onClose: () => void;
  onApply: (file: File) => void | Promise<void>;
};

const MAX_EDITOR_PAGES = 200;

async function rotateThumbnail(source: string, direction: 90 | -90) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.height;
  canvas.height = image.width;
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(direction * Math.PI / 180);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return canvas.toDataURL("image/webp", 0.82);
}

export default function PdfEditor({ file, initialRotation, onClose, onApply }: PdfEditorProps) {
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [initialPageCount, setInitialPageCount] = useState(0);

  const activeIndex = Math.max(0, pages.findIndex((page) => page.id === activeId));
  const activePage = pages[activeIndex];
  const changed = useMemo(() => pages.length !== initialPageCount || pages.some((page, index) => page.sourceIndex !== index || page.rotation !== initialRotation), [pages, initialPageCount, initialRotation]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [onClose, saving]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const task = pdfjs.getDocument({ data: bytes });
        loadingTask = task;
        const pdfDocument = await task.promise;
        if (pdfDocument.numPages > MAX_EDITOR_PAGES) {
          await task.destroy();
          loadingTask = null;
          throw new Error(`Trình chỉnh sửa hỗ trợ tối đa ${MAX_EDITOR_PAGES} trang mỗi lần.`);
        }
        const rendered: EditorPage[] = [];
        for (let index = 0; index < pdfDocument.numPages; index += 1) {
          if (cancelled) break;
          const page = await pdfDocument.getPage(index + 1);
          const baseViewport = page.getViewport({ scale: 1, rotation: (page.rotate + initialRotation) % 360 });
          const viewport = page.getViewport({ scale: Math.min(1.5, 320 / baseViewport.width), rotation: (page.rotate + initialRotation) % 360 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("Trình duyệt không thể dựng trang PDF.");
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          rendered.push({ id: crypto.randomUUID(), sourceIndex: index, rotation: initialRotation, thumbnail: canvas.toDataURL("image/webp", 0.82) });
          page.cleanup();
        }
        await pdfDocument.cleanup();
        await task.destroy();
        loadingTask = null;
        if (!cancelled) {
          setPages(rendered);
          setInitialPageCount(rendered.length);
          setActiveId(rendered[0]?.id || "");
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Không thể mở tài liệu PDF này.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; void loadingTask?.destroy(); };
  }, [file, initialRotation]);

  const movePage = (from: number, to: number) => {
    if (to < 0 || to >= pages.length || from === to) return;
    setPages((current) => {
      const copy = [...current];
      const [picked] = copy.splice(from, 1);
      copy.splice(to, 0, picked);
      return copy;
    });
  };

  const rotatePage = async (direction: 90 | -90) => {
    if (!activePage) return;
    const id = activePage.id;
    const thumbnail = await rotateThumbnail(activePage.thumbnail, direction);
    setPages((current) => current.map((page) => page.id === id ? { ...page, thumbnail, rotation: (page.rotation + direction + 360) % 360 } : page));
  };

  const duplicatePage = () => {
    if (!activePage) return;
    const duplicate = { ...activePage, id: crypto.randomUUID() };
    setPages((current) => [...current.slice(0, activeIndex + 1), duplicate, ...current.slice(activeIndex + 1)]);
    setActiveId(duplicate.id);
  };

  const deletePage = () => {
    if (!activePage || pages.length <= 1) return;
    const next = pages[activeIndex + 1] || pages[activeIndex - 1];
    setPages((current) => current.filter((page) => page.id !== activePage.id));
    setActiveId(next.id);
  };

  const applyChanges = async () => {
    if (!pages.length || saving) return;
    setSaving(true);
    setError("");
    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const output = await PDFDocument.create();
      for (const pageState of pages) {
        const [page] = await output.copyPages(source, [pageState.sourceIndex]);
        page.setRotation(degrees((page.getRotation().angle + pageState.rotation) % 360));
        output.addPage(page);
      }
      output.setTitle(file.name.replace(/\.pdf$/i, ""));
      output.setCreator("GopPDF PDF Editor");
      const bytes = await output.save();
      const editedFile = new File([new Uint8Array(bytes)], file.name, { type: "application/pdf", lastModified: Date.now() });
      await onApply(editedFile);
    } catch (cause) {
      setError(cause instanceof Error ? `Không thể lưu chỉnh sửa: ${cause.message}` : "Không thể lưu chỉnh sửa PDF.");
      setSaving(false);
    }
  };

  return <div className="pdf-editor-overlay" role="dialog" aria-modal="true" aria-labelledby="pdf-editor-title" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose(); }}>
    <div className="pdf-editor-modal">
      <header className="pdf-editor-header">
        <div><span>Chỉnh sửa PDF</span><h2 id="pdf-editor-title">{file.name}</h2><p>{loading ? "Đang đọc tài liệu..." : `${pages.length} trang · xử lý ngay trên thiết bị`}</p></div>
        <button onClick={onClose} disabled={saving} aria-label="Đóng trình chỉnh sửa"><X /></button>
      </header>

      {loading ? <div className="pdf-editor-loading"><SausageFactoryLoader /><strong>Đang đưa từng trang qua dây chuyền</strong><p>Tài liệu nhiều trang có thể cần thêm một chút thời gian.</p></div> : error && !pages.length ? <div className="pdf-editor-loading error"><X /><strong>Không thể mở PDF</strong><p>{error}</p><button onClick={onClose}>Đóng</button></div> : <div className="pdf-editor-workspace">
        <aside className="pdf-page-list" aria-label="Danh sách trang PDF">
          <div className="pdf-page-list-heading"><strong>Các trang</strong><span>Kéo để sắp xếp</span></div>
          <div className="pdf-page-grid">{pages.map((page, index) => <button
            type="button"
            key={page.id}
            className={`pdf-page-thumb ${page.id === activeId ? "active" : ""} ${dragIndex === index ? "dragging" : ""}`}
            draggable
            onClick={() => setActiveId(page.id)}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); if (dragIndex !== null) movePage(dragIndex, index); setDragIndex(null); }}
            onDragEnd={() => setDragIndex(null)}
            aria-label={`Chọn trang ${index + 1}`}
          ><span className="thumb-grip"><GripVertical /></span><span className="thumb-image"><img src={page.thumbnail} alt={`Trang ${index + 1}`} /></span><strong>Trang {index + 1}</strong>{page.sourceIndex !== index && <small>Gốc: {page.sourceIndex + 1}</small>}</button>)}</div>
        </aside>

        <section className="pdf-page-stage" aria-label="Trang PDF đang chỉnh sửa">
          <div className="pdf-editor-toolbar">
            <button onClick={() => movePage(activeIndex, activeIndex - 1)} disabled={activeIndex === 0} title="Đưa sang trái"><ArrowLeft /><span>Lùi trang</span></button>
            <button onClick={() => movePage(activeIndex, activeIndex + 1)} disabled={activeIndex === pages.length - 1} title="Đưa sang phải"><ArrowRight /><span>Tiến trang</span></button>
            <i />
            <button onClick={() => rotatePage(-90)} title="Xoay trái"><RotateCcw /><span>Xoay trái</span></button>
            <button onClick={() => rotatePage(90)} title="Xoay phải"><RotateCw /><span>Xoay phải</span></button>
            <button onClick={duplicatePage} title="Nhân bản trang"><Copy /><span>Nhân bản</span></button>
            <button className="danger" onClick={deletePage} disabled={pages.length <= 1} title="Xóa trang"><Trash2 /><span>Xóa trang</span></button>
          </div>
          <div className="pdf-page-preview">{activePage && <><img src={activePage.thumbnail} alt={`Xem trước trang ${activeIndex + 1}`} /><span>{activeIndex + 1} / {pages.length}</span></>}</div>
        </section>
      </div>}

      <div className="pdf-editor-footer">
        <div>{error && pages.length > 0 ? <span className="editor-error">{error}</span> : <span>{changed ? "Thay đổi chỉ được lưu khi bạn bấm Áp dụng" : "Chưa có thay đổi"}</span>}</div>
        <button className="editor-cancel" onClick={onClose} disabled={saving}>Hủy</button>
        <button className="editor-apply" onClick={applyChanges} disabled={loading || saving || !pages.length}>{saving ? <LoaderCircle className="spin" /> : <Save />} {saving ? "Đang lưu..." : `Áp dụng ${pages.length} trang`}</button>
      </div>
    </div>
  </div>;
}
