import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, parseAmount, parseDate, normalizeText, detectType } from '../js/parser.js';
import { toSummaryCsv, toItemsCsv, escapeCsv } from '../js/csv.js';

test('parseAmount handles separators', () => {
  assert.equal(parseAmount('1,234.50'), 1234.5);
  assert.equal(parseAmount('฿ 89.00'), 89);
  assert.equal(parseAmount('1234,50'), 1234.5);
  assert.equal(parseAmount('500 บาท'), 500);
  assert.equal(parseAmount('abc'), null);
});

test('normalizeText converts Thai digits and joins Thai glyph spacing', () => {
  assert.equal(normalizeText('ยอ ด รวม ๑๒๓.๐๐'), 'ยอดรวม 123.00');
});

test('parseDate supports BE years and Thai months', () => {
  assert.equal(parseDate('วันที่ 08/11/2567'), '2024-11-08');
  assert.equal(parseDate('8 พ.ย. 67 14:30'), '2024-11-08');
  assert.equal(parseDate('Date: 2024-03-05'), '2024-03-05');
  assert.equal(parseDate('05 Mar 2024'), '2024-03-05');
  assert.equal(parseDate('วันที่ 08/1102567 09:15'), '2024-11-08'); // OCR misread "/"
  assert.equal(parseDate('ไม่มีวันที่'), '');
});

test('parses a Thai receipt', () => {
  const text = `ร้านกาแฟดีดี สาขาสยาม
เลขประจำตัวผู้เสียภาษี 0105556123456
ใบเสร็จรับเงิน เลขที่ R2024-0012
วันที่ 08/11/2567 เวลา 09:15
ลาเต้เย็น 2 120.00
ครัวซองต์ 65.00
รวมก่อนภาษี 172.90
VAT 7% 12.10
รวมทั้งสิ้น 185.00
เงินสด 200.00
เงินทอน 15.00`;
  const r = parseDocument(text);
  assert.equal(r.type, 'receipt');
  assert.equal(r.merchant, 'ร้านกาแฟดีดี สาขาสยาม');
  assert.equal(r.date, '2024-11-08');
  assert.equal(r.time, '09:15');
  assert.equal(r.total, 185);
  assert.equal(r.subtotal, 172.9);
  assert.equal(r.vat, 12.1);
  assert.equal(r.taxId, '0105556123456');
  assert.equal(r.reference, 'R2024-0012');
  assert.deepEqual(r.items, [
    { name: 'ลาเต้เย็น', qty: 2, amount: 120 },
    { name: 'ครัวซองต์', qty: 1, amount: 65 },
  ]);
});

test('parses an English receipt with subtotal', () => {
  const r = parseDocument(`SUPER MART
Receipt No: 88812
05 Mar 2024 18:02
Milk 1L 45.00
Bread 2 x 70.00
Subtotal 115.00
TOTAL 115.00`);
  assert.equal(r.total, 115);
  assert.equal(r.subtotal, 115);
  assert.equal(r.date, '2024-03-05');
  assert.equal(r.merchant, 'SUPER MART');
  assert.equal(r.items.length, 2);
});

test('parses a bank transfer slip', () => {
  const text = `โอนเงินสำเร็จ
8 พ.ย. 67 14:32 น.
จาก นาย สมชาย ใจดี
xxx-x-x1234-x
ไปยัง นางสาว สมหญิง รักดี
xxx-x-x5678-x
จำนวนเงิน
1,500.00 บาท
ค่าธรรมเนียม 0.00 บาท
เลขที่รายการ: 2024110814320001234`;
  assert.equal(detectType(text), 'slip');
  const r = parseDocument(text);
  assert.equal(r.type, 'slip');
  assert.equal(r.total, 1500);
  assert.equal(r.date, '2024-11-08');
  assert.equal(r.time, '14:32');
  assert.equal(r.reference, '2024110814320001234');
  assert.match(r.from, /สมชาย/);
  assert.match(r.to, /สมหญิง/);
});

test('CSV export: BOM, header, escaping, items', () => {
  const recs = [{ file: 'a.jpg', type: 'receipt', merchant: 'Shop, "A"', date: '2024-01-01', total: 10, items: [{ name: 'x', qty: 1, amount: 10 }] }];
  const csv = toSummaryCsv(recs);
  assert.ok(csv.startsWith('﻿ไฟล์,ประเภท'));
  assert.match(csv, /a\.jpg,ใบเสร็จ,"Shop, ""A""",2024-01-01,,10,/);
  assert.match(toItemsCsv(recs), /a\.jpg,"Shop, ""A""",2024-01-01,x,1,10/);
  assert.equal(escapeCsv('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(escapeCsv(-5), '-5');
});
