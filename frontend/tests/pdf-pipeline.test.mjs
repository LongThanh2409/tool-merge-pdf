import assert from "node:assert/strict";
import test from "node:test";
import { degrees, PDFDocument, rgb } from "pdf-lib";

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

test("chỉnh sửa cấp trang giữ đúng thứ tự, bản sao và góc xoay", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 300]);
  source.addPage([220, 300]);
  source.addPage([240, 300]);
  const sourceBytes = await source.save();
  const loaded = await PDFDocument.load(sourceBytes);
  const output = await PDFDocument.create();
  const edits = [
    { sourceIndex: 2, rotation: 90 },
    { sourceIndex: 0, rotation: 0 },
    { sourceIndex: 0, rotation: 180 },
  ];
  for (const edit of edits) {
    const [page] = await output.copyPages(loaded, [edit.sourceIndex]);
    page.setRotation(degrees(edit.rotation));
    output.addPage(page);
  }
  const edited = await PDFDocument.load(await output.save());
  assert.equal(edited.getPageCount(), 3);
  assert.deepEqual(edited.getPages().map((page) => page.getWidth()), [240, 200, 200]);
  assert.deepEqual(edited.getPages().map((page) => page.getRotation().angle), [90, 0, 180]);
});

test("xoay riêng một trang cộng đúng với hướng có sẵn", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 300]).setRotation(degrees(270));
  source.addPage([200, 300]);
  const loaded = await PDFDocument.load(await source.save());
  const output = await PDFDocument.create();
  const pages = await output.copyPages(loaded, loaded.getPageIndices());
  pages[0].setRotation(degrees((pages[0].getRotation().angle + 90) % 360));
  pages.forEach((page) => output.addPage(page));
  const edited = await PDFDocument.load(await output.save());
  assert.deepEqual(edited.getPages().map((page) => page.getRotation().angle), [0, 0]);
});
