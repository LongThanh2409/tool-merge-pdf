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
  const editor = await readFile(new URL("../app/pdf-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /pdfjs-dist/);
  assert.match(editor, /Chỉnh sửa PDF/);
  assert.match(editor, /copyPages/);
  assert.match(editor, /Nhân bản/);
});
