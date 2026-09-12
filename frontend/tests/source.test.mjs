import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("giao diện và metadata dùng tiếng Việt", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /lang="vi"/);
  assert.match(layout, /GộpPDF/);
  assert.match(page, /Mọi tệp tin/);
  assert.match(page, /Kéo & thả tệp vào đây/);
  assert.doesNotMatch(page + layout, /codex-preview|react-loading-skeleton/);
});

test("có pipeline thật cho PDF, ảnh và Office", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /PDFDocument\.load/);
  assert.match(page, /embedPng/);
  assert.match(page, /imageOrientation: "from-image"/);
  assert.match(page, /\/health/);
  assert.match(page, /\/convert/);
  assert.match(page, /AbortController/);
  assert.match(page, /hasValidSignature/);
  assert.match(page, /Xem trước/);
  assert.match(page, /convertedCacheRef/);
  assert.match(page, /<iframe/);
  assert.match(page, /merge-preview-panel/);
  assert.match(page, /Xem PDF bên cạnh/);
  assert.match(page, /PdfEditor/);
  assert.match(page, /resultOrientation/);
  assert.match(page, /Xoay từng trang/);
  const editor = await readFile(new URL("../app/pdf-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /pdfjs-dist/);
  assert.match(editor, /Chỉnh sửa PDF/);
  assert.match(editor, /copyPages/);
  assert.match(editor, /Nhân bản/);
});

test("loading dùng dây chuyền cây xúc xích và hỗ trợ giảm chuyển động", async () => {
  const [page, editor, loader, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pdf-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sausage-factory-loader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /SausageFactoryLoader/);
  assert.match(editor, /SausageFactoryLoader/);
  assert.match(loader, /sausage-stick/);
  assert.match(loader, /cây xúc xích/);
  assert.match(styles, /@keyframes sausage-travel/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("footer nằm cuối màn hình nhưng không đè lên danh sách dài", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.app-shell\s*\{[^}]*min-height:100dvh[^}]*display:flex[^}]*flex-direction:column/s);
  assert.match(styles, /\.hero\s*\{[^}]*flex:1 0 auto/s);
  assert.match(styles, /footer\s*\{[^}]*flex:0 0 auto/s);
  assert.doesNotMatch(styles, /footer\s*\{[^}]*position:(?:fixed|sticky)/s);
});
