import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, rgb } from "pdf-lib";

async function samplePdf(pageCount, marker) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([200 + marker, 300]);
    page.drawRectangle({ x: 10, y: 10, width: 20, height: 20, color: rgb(marker / 20, 0, 0) });
  }
  return pdf.save();
}

async function merge(inputs) {
  const output = await PDFDocument.create();
  for (const bytes of inputs) {
    const source = await PDFDocument.load(bytes);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  return PDFDocument.load(await output.save());
}

test("gộp 2 PDF giữ đúng số trang và thứ tự", async () => {
  const result = await merge([await samplePdf(2, 1), await samplePdf(3, 2)]);
  assert.equal(result.getPageCount(), 5);
  assert.equal(result.getPage(0).getWidth(), 201);
  assert.equal(result.getPage(2).getWidth(), 202);
});

test("gộp 10 PDF", async () => {
  const inputs = await Promise.all(Array.from({ length: 10 }, (_, index) => samplePdf(1, index + 1)));
  const result = await merge(inputs);
  assert.equal(result.getPageCount(), 10);
  assert.deepEqual(result.getPages().map((page) => page.getWidth()), Array.from({ length: 10 }, (_, index) => 201 + index));
});

test("từ chối PDF bị hỏng", async () => {
  await assert.rejects(() => PDFDocument.load(new Uint8Array([1, 2, 3, 4])));
});
