"use client";

/* eslint-disable @next/next/no-img-element -- blob URL xem trước chỉ tồn tại trong trình duyệt */

import Image from "next/image";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Download, ExternalLink, Eye, File as FileIcon, FileImage, FileSpreadsheet, FileText, GripVertical, LoaderCircle, LockKeyhole, Merge, PencilLine, Plus, RotateCcw, Settings, ShieldCheck, Sparkles, Trash2, UploadCloud, X, Zap } from "lucide-react";
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import PdfEditor from "./pdf-editor";

const ACCEPTED = ["xlsx", "xls", "docx", "doc", "pptx", "ppt", "pdf", "jpg", "jpeg", "png", "webp"];
const OFFICE = ["xlsx", "xls", "docx", "doc", "pptx", "ppt"];
const MAX_SIZE = 100 * 1024 * 1024;
const MAX_TOTAL_SIZE = 500 * 1024 * 1024;
const MAX_FILES = 50;
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://tool-merge-pdf.onrender.com").replace(/\/$/, "");
const MIME_HINTS: Record<string, string[]> = {
  pdf: ["application/pdf"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], webp: ["image/webp"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", "application/octet-stream"], xls: ["application/vnd.ms-excel", "application/octet-stream"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream"], doc: ["application/msword", "application/octet-stream"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip", "application/octet-stream"], ppt: ["application/vnd.ms-powerpoint", "application/octet-stream"],
};

type Item = { id: string; file: File; ext: string; status: "ready" | "processing" | "done" | "error"; rotation: number };
type PageOrientation = "portrait" | "landscape";
type PreviewState = { itemId: string; name: string; kind: "image" | "pdf"; url: string; loading: boolean; message: string; error: string; pages?: number; orientation: PageOrientation };
type ExcelOptions = { layout: "original" | "fit_width" | "single_page" | "custom_scale"; pageSize: "a4" | "a3" | "letter"; orientation: "auto" | "portrait" | "landscape"; scale: number };
type EditingPdf = { kind: "source"; item: Item } | { kind: "result"; file: File };

const defaultOutputName = () => {
  const now = new Date();
  const part = (value: number) => String(value).padStart(2, "0");
  return `merged-${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}.pdf`;
};

const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const fileTone = (ext: string) => ["xlsx", "xls"].includes(ext) ? "green" : ["docx", "doc"].includes(ext) ? "blue" : ["pptx", "ppt"].includes(ext) ? "orange" : ext === "pdf" ? "red" : "purple";
const pageOrientation = (page: { getWidth: () => number; getHeight: () => number; getRotation: () => { angle: number } }): PageOrientation => {
  const sideways = Math.abs(page.getRotation().angle % 180) === 90;
  const width = sideways ? page.getHeight() : page.getWidth();
  const height = sideways ? page.getWidth() : page.getHeight();
  return width >= height ? "landscape" : "portrait";
};

function TypeIcon({ ext }: { ext: string }) {
  const props = { size: 21, strokeWidth: 2 };
  if (["xlsx", "xls"].includes(ext)) return <FileSpreadsheet {...props} />;
  if (["docx", "doc", "pdf"].includes(ext)) return <FileText {...props} />;
  if (["pptx", "ppt"].includes(ext)) return <FileIcon {...props} />;
  return <FileImage {...props} />;
}

async function imageToPng(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Không thể đọc ảnh WebP");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Không thể chuyển ảnh WebP");
  return blob.arrayBuffer();
}

async function hasValidSignature(item: Item) {
  const bytes = new Uint8Array(await item.file.slice(0, 16).arrayBuffer());
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (item.ext === "pdf") return starts(0x25, 0x50, 0x44, 0x46, 0x2d);
  if (["jpg", "jpeg"].includes(item.ext)) return starts(0xff, 0xd8, 0xff);
  if (item.ext === "png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (item.ext === "webp") return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (["xlsx", "docx", "pptx"].includes(item.ext)) return starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06);
  return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
}

const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Đã hủy", "AbortError")); }, { once: true });
});

async function waitForConverter(signal: AbortSignal, report: (message: string) => void) {
  const delays = [0, 2000, 3500, 5000, 8000, 10000, 12000];
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await pause(delays[attempt], signal);
    report(attempt < 2 ? "Đang kết nối bộ xử lý..." : "Đang khởi động máy chủ — lần đầu có thể lâu hơn một chút...");
    try {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const response = await fetch(`${API_URL}/health`, { signal: requestSignal, cache: "no-store" });
      const health = await response.json() as { ready?: boolean };
      if (response.ok && health.ready) return;
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  throw new Error("Bộ xử lý Office chưa sẵn sàng. Vui lòng thử lại sau ít phút.");
}

async function convertOffice(file: File, signal: AbortSignal, report: (message: string) => void, excel: ExcelOptions) {
  await waitForConverter(signal, report);
  report(`Đang chuyển đổi ${file.name}...`);
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("excel_layout", excel.layout);
  form.append("page_size", excel.pageSize);
  form.append("orientation", excel.orientation);
  form.append("scale_percent", String(excel.scale));
  const response = await fetch(`${API_URL}/convert`, { method: "POST", body: form, signal: AbortSignal.any([signal, AbortSignal.timeout(130000)]) });
  if (!response.ok) {
    let message = "Không thể chuyển đổi tệp Office này.";
    try { const body = await response.json() as { detail?: string }; if (body.detail) message = body.detail; } catch { /* response không phải JSON */ }
    throw new Error(message);
  }
  const data = await response.arrayBuffer();
  if (new Uint8Array(data).slice(0, 5).toString() !== "37,80,68,70,45") throw new Error("Máy chủ trả về một tệp PDF không hợp lệ.");
  return data;
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isMerging, setIsMerging] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [outputName, setOutputName] = useState(defaultOutputName);
  const [processingMessage, setProcessingMessage] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [resultPreviewOpen, setResultPreviewOpen] = useState(false);
  const [resultOrientation, setResultOrientation] = useState<PageOrientation>("portrait");
  const [editingPdf, setEditingPdf] = useState<EditingPdf | null>(null);
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [excelOptions, setExcelOptions] = useState<ExcelOptions>({ layout: "fit_width", pageSize: "a4", orientation: "auto", scale: 85 });
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);
  const convertedCacheRef = useRef(new Map<string, ArrayBuffer>());

  const updateExcelOptions = (patch: Partial<ExcelOptions>) => {
    convertedCacheRef.current.clear();
    setDownloadUrl(null);
    setExcelOptions((current) => ({ ...current, ...patch }));
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    setError("");
    const valid: Item[] = [];
    const problems: string[] = [];
    Array.from(files).forEach((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ACCEPTED.includes(ext)) problems.push(`${file.name}: định dạng chưa hỗ trợ`);
      else if (file.size > MAX_SIZE) problems.push(`${file.name}: vượt quá 100 MB`);
      else if (file.type && !MIME_HINTS[ext]?.includes(file.type)) problems.push(`${file.name}: loại tệp không khớp với phần mở rộng`);
      else valid.push({ id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`, file, ext, status: "ready", rotation: 0 });
    });
    const slots = Math.max(0, MAX_FILES - items.length);
    if (valid.length > slots) { problems.push(`Mỗi lượt xử lý tối đa ${MAX_FILES} tệp`); valid.splice(slots); }
    const currentSize = items.reduce((sum, item) => sum + item.file.size, 0);
    let removedForTotal = false;
    while (valid.length && currentSize + valid.reduce((sum, item) => sum + item.file.size, 0) > MAX_TOTAL_SIZE) { valid.pop(); removedForTotal = true; }
    if (removedForTotal) problems.push("Một số tệp không được thêm vì tổng dung lượng vượt quá 500 MB");
    if (problems.length) setError(problems.join(" · "));
    if (valid.length) {
      setItems((current) => [...current, ...valid].slice(0, MAX_FILES));
      setDownloadUrl((url) => { if (url) URL.revokeObjectURL(url); return null; });
      setProgress(0);
    }
  }, [items]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = Array.from(event.clipboardData?.files || []);
      if (pasted.length) { event.preventDefault(); addFiles(pasted); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview?.url]);

  const onChoose = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    setItems((current) => { const copy = [...current]; const [picked] = copy.splice(from, 1); copy.splice(to, 0, picked); return copy; });
    setDownloadUrl(null);
  };
  const remove = (id: string) => { convertedCacheRef.current.delete(id); setItems((current) => current.filter((item) => item.id !== id)); setDownloadUrl(null); setProgress(0); };
  const rotate = (id: string) => { setItems((current) => current.map((item) => item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item)); setDownloadUrl(null); };

  const closePreview = () => {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    setPreview((current) => { if (current?.url) URL.revokeObjectURL(current.url); return null; });
  };

  const previewItem = async (item: Item) => {
    closePreview();
    const kind = ["jpg", "jpeg", "png", "webp"].includes(item.ext) ? "image" : "pdf";
    const expectedOrientation: PageOrientation = excelOptions.orientation === "landscape" && ["xlsx", "xls"].includes(item.ext) ? "landscape" : "portrait";
    setPreview({ itemId: item.id, name: item.file.name, kind, url: "", loading: true, message: "Đang chuẩn bị bản xem trước...", error: "", orientation: expectedOrientation });
    const controller = new AbortController();
    previewAbortRef.current = controller;
    try {
      if (!(await hasValidSignature(item))) throw new Error("Tệp có thể đã hỏng hoặc không đúng định dạng.");
      if (kind === "image") {
        const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
        const orientation: PageOrientation = bitmap.width >= bitmap.height ? "landscape" : "portrait";
        bitmap.close();
        const url = URL.createObjectURL(item.file);
        setPreview({ itemId: item.id, name: item.file.name, kind, url, loading: false, message: "", error: "", orientation });
        return;
      }
      let pdfBytes: ArrayBuffer;
      if (item.ext === "pdf") pdfBytes = await item.file.arrayBuffer();
      else {
        const cached = convertedCacheRef.current.get(item.id);
        pdfBytes = cached || await convertOffice(item.file, controller.signal, (message) => setPreview((current) => current ? { ...current, message } : current), excelOptions);
        if (!cached) convertedCacheRef.current.set(item.id, pdfBytes);
      }
      const { PDFDocument } = await import("pdf-lib");
      const document = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      if (!document.getPageCount()) throw new Error("PDF không có trang nào để xem trước.");
      const orientation = pageOrientation(document.getPage(0));
      const url = URL.createObjectURL(new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }));
      setPreview({ itemId: item.id, name: item.file.name, kind: "pdf", url, loading: false, message: "", error: "", pages: document.getPageCount(), orientation });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "Không thể tạo bản xem trước.";
      setPreview((current) => current ? { ...current, loading: false, message: "", error: message } : current);
    } finally {
      if (previewAbortRef.current === controller) previewAbortRef.current = null;
    }
  };

  const mergeFiles = async () => {
    if (!items.length || isMerging) return;
    setError(""); setIsMerging(true); setProgress(4);
    setResultPreviewOpen(true);
    setPageCount(0);
    setResultFile(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloadUrl((url) => { if (url) URL.revokeObjectURL(url); return null; });
    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const result = await PDFDocument.create();
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setProcessingMessage(`Đang xử lý tệp ${index + 1}/${items.length}: ${item.file.name}`);
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "processing" } : entry));
        if (!(await hasValidSignature(item))) throw new Error(`${item.file.name} có thể đã hỏng hoặc không đúng định dạng.`);
        const bytes = await item.file.arrayBuffer();
        if (item.ext === "pdf") {
          const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const pages = await result.copyPages(source, source.getPageIndices());
          pages.forEach((page) => { if (item.rotation) page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360)); result.addPage(page); });
        } else if (["jpg", "jpeg", "png", "webp"].includes(item.ext)) {
          const imageBytes = await imageToPng(item.file);
          const image = await result.embedPng(imageBytes);
          const page = result.addPage(image.height >= image.width ? [595.28, 841.89] : [841.89, 595.28]);
          const margin = 32;
          const scale = Math.min((page.getWidth() - margin * 2) / image.width, (page.getHeight() - margin * 2) / image.height);
          page.drawImage(image, { x: (page.getWidth() - image.width * scale) / 2, y: (page.getHeight() - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
          if (item.rotation) page.setRotation(degrees(item.rotation));
        } else {
          const converted = convertedCacheRef.current.get(item.id) || await convertOffice(item.file, controller.signal, setProcessingMessage, excelOptions);
          if (!convertedCacheRef.current.has(item.id)) convertedCacheRef.current.set(item.id, converted);
          const source = await PDFDocument.load(converted);
          const pages = await result.copyPages(source, source.getPageIndices());
          pages.forEach((page) => { if (item.rotation) page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360)); result.addPage(page); });
        }
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "done" } : entry));
        setProgress(Math.round(((index + 1) / items.length) * 92));
      }
      result.setTitle(outputName.replace(/\.pdf$/i, "")); result.setCreator("GopPDF");
      setProcessingMessage("Đang kiểm tra và hoàn tất PDF...");
      setPageCount(result.getPageCount());
      if (result.getPageCount()) setResultOrientation(pageOrientation(result.getPage(0)));
      const pdfBytes = await result.save();
      const completedFile = new File([new Uint8Array(pdfBytes)], finalName, { type: "application/pdf" });
      setResultFile(completedFile);
      setDownloadUrl(URL.createObjectURL(completedFile));
      setProgress(100);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") setError("Đã hủy quá trình tạo PDF.");
      else setError(cause instanceof Error ? `Không thể xử lý: ${cause.message}` : "Không thể xử lý các tệp đã chọn.");
      setItems((current) => current.map((item) => item.status === "processing" ? { ...item, status: "error" } : item));
    } finally { setIsMerging(false); abortRef.current = null; }
  };

  const cleanName = outputName.trim().replace(/[\\/:*?"<>|]/g, "-") || "tai-lieu-da-gop.pdf";
  const finalName = cleanName.toLowerCase().endsWith(".pdf") ? cleanName : `${cleanName}.pdf`;
  const closePdfEditor = useCallback(() => setEditingPdf(null), []);
  const applyPdfEdits = useCallback(async (editedFile: File) => {
    if (!editingPdf) return;
    if (editingPdf.kind === "source") {
      convertedCacheRef.current.delete(editingPdf.item.id);
      setItems((current) => current.map((item) => item.id === editingPdf.item.id ? { ...item, file: editedFile, rotation: 0, status: "ready" } : item));
      setDownloadUrl((url) => { if (url) URL.revokeObjectURL(url); return null; });
      setResultFile(null);
      setProgress(0);
      setResultPreviewOpen(false);
    } else {
      const { PDFDocument } = await import("pdf-lib");
      const document = await PDFDocument.load(await editedFile.arrayBuffer(), { ignoreEncryption: true });
      setPageCount(document.getPageCount());
      if (document.getPageCount()) setResultOrientation(pageOrientation(document.getPage(0)));
      setResultFile(editedFile);
      setDownloadUrl((url) => { if (url) URL.revokeObjectURL(url); return URL.createObjectURL(editedFile); });
    }
    setEditingPdf(null);
  }, [editingPdf]);

  return <main className="app-shell">
    <nav className="topbar" aria-label="Điều hướng chính">
      <a className="brand" href="#top" aria-label="Gộp PDF - Trang chủ"><span className="brand-mark"><FileText size={20} /><span className="brand-plus">+</span></span><span>Gộp<span>PDF</span></span></a>
      <div className="nav-links"><a href="#how">Cách hoạt động</a><a href="#formats">Định dạng</a><button className="help-button" onClick={() => setSettingsOpen(true)} aria-label="Cài đặt"><Settings size={18} /> Cài đặt</button></div>
    </nav>

    <section className="hero" id="top">
      <div className="eyebrow"><Sparkles size={14} /> Công cụ PDF miễn phí</div>
      <h1>Mọi tệp tin. <span>Một PDF.</span></h1>
      <p className="hero-copy">Gộp tài liệu, bảng tính, slide và hình ảnh thành một tệp PDF duy nhất — nhanh, gọn và đúng thứ tự bạn muốn.</p>

      <div className={`workspace-stage ${resultPreviewOpen && (isMerging || downloadUrl) ? "with-result-preview" : ""}`}>
      <div className="workspace-card">
        <div className={`dropzone ${dragging ? "is-dragging" : ""} ${items.length ? "compact" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={onDrop} onClick={(event) => { if (!(event.target instanceof HTMLInputElement)) inputRef.current?.click(); }} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }} aria-label="Chọn hoặc kéo thả tệp">
          <input ref={inputRef} type="file" multiple hidden accept={ACCEPTED.map((ext) => `.${ext}`).join(",")} onChange={onChoose} />
          <div className="upload-icon"><UploadCloud size={30} /></div>
          <div><h2>{items.length ? "Thêm tệp khác" : "Kéo & thả tệp vào đây"}</h2><p>{items.length ? "Kéo thả hoặc bấm để chọn thêm" : <>hoặc <span>chọn tệp từ máy</span></>}</p></div>
          {!items.length && <div className="format-pills" id="formats">{["PDF", "DOCX", "XLSX", "PPTX", "JPG", "PNG", "+ 5"].map((format) => <span key={format}>{format}</span>)}</div>}
        </div>

        {error && <div className="error-banner" role="alert"><X size={16} /><span>{error}</span>{items.length > 0 && <button className="retry-button" onClick={mergeFiles}>Thử lại</button>}<button onClick={() => setError("")} aria-label="Đóng thông báo"><X size={14} /></button></div>}

        {items.length > 0 && <div className="file-area">
          <div className="list-heading"><div><h3>Tệp của bạn</h3><span>{items.length} tệp · {formatSize(items.reduce((sum, item) => sum + item.file.size, 0))}</span></div><button onClick={() => inputRef.current?.click()}><Plus size={16} /> Thêm tệp</button></div>
          <div className="file-list">{items.map((item, index) => <div className={`file-row ${dragIndex === index ? "drag-source" : ""}`} key={item.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragIndex !== null) move(dragIndex, index); setDragIndex(null); }} onDragEnd={() => setDragIndex(null)}>
            <GripVertical className="grip" size={19} aria-hidden="true" />
            <span className={`type-icon ${fileTone(item.ext)}`}><TypeIcon ext={item.ext} /></span>
            <div className="file-details"><strong title={item.file.name}>{item.file.name}</strong><span>{formatSize(item.file.size)} · {item.ext.toUpperCase()}</span></div>
            <div className={`file-status ${item.status}`}>{item.status === "processing" ? <><LoaderCircle size={14} className="spin" /> Đang xử lý</> : item.status === "done" ? <><CheckCircle2 size={14} /> Đã xong</> : item.status === "error" ? "Có lỗi" : OFFICE.includes(item.ext) ? "Sẽ chuyển đổi" : "Sẵn sàng"}</div>
            <div className="row-actions"><button onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Đưa ${item.file.name} lên`}><ArrowUp size={16} /></button><button onClick={() => move(index, index + 1)} disabled={index === items.length - 1} aria-label={`Đưa ${item.file.name} xuống`}><ArrowDown size={16} /></button><button onClick={() => previewItem(item)} aria-label={`Xem trước ${item.file.name}`} title="Xem trước"><Eye size={16} /></button>{item.ext === "pdf" && <button className="edit-pdf" onClick={() => { closePreview(); setEditingPdf({ kind: "source", item }); }} aria-label={`Chỉnh sửa ${item.file.name}`} title="Chỉnh sửa từng trang"><PencilLine size={16} /></button>}<button onClick={() => rotate(item.id)} aria-label={`Xoay ${item.file.name}`} title={`Xoay trang${item.rotation ? ` (${item.rotation}°)` : ""}`}><RotateCcw size={16} /></button><button className="delete" onClick={() => remove(item.id)} aria-label={`Xóa ${item.file.name}`}><Trash2 size={16} /></button></div>
          </div>)}</div>
          <div className="order-note"><GripVertical size={15} /> Kéo thả để sắp xếp thứ tự trang trong PDF</div>
          {items.some((item) => ["xlsx", "xls"].includes(item.ext)) && <div className="excel-layout-note"><FileSpreadsheet size={18} /><div><strong>Bảng tính: {excelOptions.layout === "fit_width" ? "vừa chiều rộng" : excelOptions.layout === "single_page" ? "vừa một trang" : excelOptions.layout === "custom_scale" ? `tỉ lệ ${excelOptions.scale}%` : "giữ bố cục gốc"}</strong><span>{excelOptions.layout === "original" ? "Dùng thiết lập in có sẵn trong Excel" : `${excelOptions.pageSize.toUpperCase()} · ${excelOptions.orientation === "auto" ? "tự chọn hướng trang" : excelOptions.orientation === "landscape" ? "trang ngang" : "trang dọc"}`}</span></div><button onClick={() => setSettingsOpen(true)}>Điều chỉnh</button></div>}
          <div className="output-row"><label htmlFor="output-name">Tên tệp kết quả</label><div><input id="output-name" value={outputName} onChange={(event) => setOutputName(event.target.value)} /><span>PDF</span></div></div>
          {isMerging && <div className="progress-wrap" aria-live="polite"><div><span>Đang tạo PDF của bạn...</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
          {downloadUrl ? <div className="result-panel"><span className="result-check"><CheckCircle2 /></span><div><strong>Hoàn tất! PDF của bạn đã được tạo</strong><p>{finalName} · {pageCount} trang · {items.length} tệp</p></div><a className="primary-action success" href={downloadUrl} download={finalName}><Download size={20} /> Tải PDF</a><div className="result-links"><button onClick={() => setResultPreviewOpen(true)}><Eye size={14} /> Xem PDF bên cạnh</button><button onClick={() => { convertedCacheRef.current.clear(); setItems([]); setDownloadUrl(null); setProgress(0); setResultPreviewOpen(false); }}>Gộp bộ tệp mới</button></div></div> : <button className="primary-action" onClick={mergeFiles} disabled={isMerging}>{isMerging ? <LoaderCircle className="spin" size={20} /> : <Merge size={20} />}{isMerging ? "Đang gộp tệp..." : `Gộp ${items.length} tệp thành PDF`}</button>}
          <p className="privacy-line"><LockKeyhole size={14} /> Tệp được xử lý trong phiên này và không được lưu trữ lâu dài</p>
        </div>}
      </div>
      {resultPreviewOpen && (isMerging || downloadUrl) && <aside className={`merge-preview-panel ${resultOrientation}`} aria-label="Xem trước PDF đã gộp">
        <div className="merge-preview-header"><div><span>{isMerging ? "Đang tạo bản xem trước" : "PDF hoàn chỉnh"}</span><h2>{isMerging ? "Đang gộp tài liệu..." : finalName}</h2>{!isMerging && <p>{pageCount} trang · {items.length} tệp</p>}</div><button onClick={() => setResultPreviewOpen(false)} aria-label="Đóng khung xem trước"><X /></button></div>
        {isMerging ? <div className="merge-processing" aria-live="polite"><span className="processing-icon"><LoaderCircle className="spin" /></span><strong>{progress}% hoàn tất</strong><p>{processingMessage}</p><div className="modal-progress"><span style={{ width: `${progress}%` }} /></div><div className="processing-list">{items.map((item) => <div key={item.id} className={item.status}><span>{item.status === "done" ? <CheckCircle2 /> : item.status === "processing" ? <LoaderCircle className="spin" /> : <span className="pending-dot" />}</span><strong>{item.file.name}</strong></div>)}</div><button onClick={() => abortRef.current?.abort()}>Hủy xử lý</button></div> : downloadUrl && <><div className="merged-pdf-frame"><iframe src={`${downloadUrl}#toolbar=0&navpanes=0&view=FitH`} title={`Xem trước ${finalName}`} /></div><div className="merge-preview-footer"><span><CheckCircle2 /> Sẵn sàng tải xuống</span><div>{resultFile && <button type="button" onClick={() => setEditingPdf({ kind: "result", file: resultFile })}><PencilLine /> Xoay từng trang</button>}<a href={downloadUrl} target="_blank" rel="noreferrer"><ExternalLink /> Mở tab mới</a><a className="mini-download" href={downloadUrl} download={finalName}><Download /> Tải PDF</a></div></div></>}
      </aside>}
      </div>
      <div className="trust-row"><span><ShieldCheck size={17} /> Kết nối bảo mật</span><span><Zap size={17} /> Xử lý nhanh</span><span><CheckCircle2 size={17} /> Không cần đăng ký</span></div>
    </section>

    <section className="brand-showcase" aria-label="Hình ảnh GộpPDF dành cho Kho Xúc Xích Nhà Máy Một PRO">
      <div className="brand-showcase-frame">
        <Image
          src="/goppdf-long-kho.png"
          alt="GộpPDF — Mọi tệp tin, một PDF — Kho Xúc Xích Nhà Máy Một PRO"
          width={1730}
          height={909}
          sizes="(max-width: 700px) calc(100vw - 24px), (max-width: 1200px) calc(100vw - 64px), 1080px"
        />
      </div>
    </section>

    {preview && <div className="preview-overlay" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => { if (event.currentTarget === event.target) closePreview(); }}>
      <div className={`preview-card ${preview.orientation}`}>
        <div className="preview-header"><div><span>Bản xem trước</span><h2 id="preview-title">{preview.name}</h2>{preview.pages && <p>{preview.pages} trang</p>}</div><button onClick={closePreview} aria-label="Đóng bản xem trước"><X /></button></div>
        <div className={`preview-canvas ${preview.kind}`}>
          {preview.loading ? <div className="preview-message"><LoaderCircle className="spin" /><strong>Đang chuẩn bị...</strong><p>{preview.message}</p></div> : preview.error ? <div className="preview-message error"><X /><strong>Không thể xem trước</strong><p>{preview.error}</p><button onClick={() => { const item = items.find((entry) => entry.id === preview.itemId); if (item) previewItem(item); }}>Thử lại</button></div> : preview.kind === "image" ? <img src={preview.url} alt={`Xem trước ${preview.name}`} /> : <iframe src={`${preview.url}#toolbar=0&navpanes=0`} title={`Xem trước ${preview.name}`} />}
        </div>
        <div className="preview-footer"><span>{preview.kind === "image" ? "Ảnh gốc · tự động vừa trang A4 khi gộp" : "PDF giữ nguyên chất lượng văn bản và vector"}</span>{preview.url && <a href={preview.url} target="_blank" rel="noreferrer"><ExternalLink /> Mở trong tab mới</a>}</div>
      </div>
    </div>}

    {editingPdf && <PdfEditor file={editingPdf.kind === "source" ? editingPdf.item.file : editingPdf.file} initialRotation={editingPdf.kind === "source" ? editingPdf.item.rotation : 0} onClose={closePdfEditor} onApply={applyPdfEdits} />}

    {settingsOpen && <div className="processing-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => { if (event.currentTarget === event.target) setSettingsOpen(false); }}><div className="settings-card"><button className="close-settings" onClick={() => setSettingsOpen(false)} aria-label="Đóng cài đặt"><X /></button><h2 id="settings-title">Cài đặt</h2><label>Ngôn ngữ<input value="Tiếng Việt" disabled /></label><label>Tên tệp mặc định<input value={outputName} onChange={(event) => setOutputName(event.target.value)} /></label><div className="settings-divider"><span>Bố cục Excel</span></div><label>Cách chia trang<select value={excelOptions.layout} onChange={(event) => updateExcelOptions({ layout: event.target.value as ExcelOptions["layout"] })}><option value="fit_width">Vừa chiều rộng — khuyên dùng</option><option value="single_page">Thu nhỏ vừa một trang</option><option value="custom_scale">Tỉ lệ tùy chỉnh</option><option value="original">Giữ thiết lập in gốc</option></select></label>{excelOptions.layout === "custom_scale" && <label className="scale-control"><span>Tỉ lệ thu phóng <strong>{excelOptions.scale}%</strong></span><input type="range" min="25" max="150" step="5" value={excelOptions.scale} onChange={(event) => updateExcelOptions({ scale: Number(event.target.value) })} /><div><small>25%</small><small>100%</small><small>150%</small></div></label>}<div className="setting-pair"><label>Khổ giấy<select value={excelOptions.pageSize} disabled={excelOptions.layout === "original"} onChange={(event) => updateExcelOptions({ pageSize: event.target.value as ExcelOptions["pageSize"] })}><option value="a4">A4</option><option value="a3">A3</option><option value="letter">Letter</option></select></label><label>Hướng trang<select value={excelOptions.orientation} disabled={excelOptions.layout === "original"} onChange={(event) => updateExcelOptions({ orientation: event.target.value as ExcelOptions["orientation"] })}><option value="auto">Tự động</option><option value="landscape">Ngang</option><option value="portrait">Dọc</option></select></label></div><p className="settings-hint">“Vừa chiều rộng” chống mất cột tự động. “Tỉ lệ tùy chỉnh” cho phép chọn 25–150%; tỉ lệ lớn hơn giúp chữ rõ hơn nhưng có thể chia cột sang trang tiếp theo.</p><button className="primary-action" onClick={() => setSettingsOpen(false)}>Áp dụng cài đặt</button></div></div>}

    <section className="steps" id="how"><div className="section-label">Đơn giản từ đầu đến cuối</div><h2>Ba bước. Xong ngay.</h2><div className="step-grid">
      <article><span className="step-number">01</span><div className="step-icon"><UploadCloud /></div><h3>Thêm tệp</h3><p>Chọn hoặc kéo thả mọi tài liệu bạn muốn gộp.</p></article>
      <article><span className="step-number">02</span><div className="step-icon"><GripVertical /></div><h3>Sắp xếp</h3><p>Kéo các tệp theo đúng thứ tự trang bạn cần.</p></article>
      <article><span className="step-number">03</span><div className="step-icon"><Download /></div><h3>Tải PDF</h3><p>Nhấn gộp và tải tệp PDF hoàn chỉnh về máy.</p></article>
    </div></section>

    <footer><div className="brand footer-brand"><span className="brand-mark"><FileText size={18} /><span className="brand-plus">+</span></span><span>Gộp<span>PDF</span></span></div><p>Công cụ gộp tài liệu nhẹ nhàng cho công việc mỗi ngày.</p><button><span className="status-dot" /> Hệ thống hoạt động tốt <ChevronDown size={14} /></button></footer>
  </main>;
}
