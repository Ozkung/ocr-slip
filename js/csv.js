// CSV export (UTF-8 with BOM so Excel shows Thai correctly).

export const SUMMARY_COLUMNS = [
  ['file', 'ไฟล์'],
  ['type', 'ประเภท'],
  ['merchant', 'ร้านค้า/ผู้รับ'],
  ['date', 'วันที่'],
  ['time', 'เวลา'],
  ['total', 'ยอดรวม'],
  ['subtotal', 'ก่อนภาษี'],
  ['vat', 'VAT'],
  ['taxId', 'เลขผู้เสียภาษี'],
  ['reference', 'เลขอ้างอิง'],
  ['from', 'จาก'],
  ['to', 'ถึง'],
];

export function escapeCsv(value) {
  if (value == null) return '';
  let s = String(value);
  // Guard against spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells) => cells.map(escapeCsv).join(',');

/** One row per scanned document. */
export function toSummaryCsv(records) {
  const lines = [row(SUMMARY_COLUMNS.map(([, label]) => label))];
  const typeLabel = { receipt: 'ใบเสร็จ', slip: 'สลิปโอนเงิน' };
  for (const r of records) {
    lines.push(row(SUMMARY_COLUMNS.map(([key]) => (key === 'type' ? typeLabel[r.type] || r.type : r[key]))));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** One row per line item (receipts). */
export function toItemsCsv(records) {
  const lines = [row(['ไฟล์', 'ร้านค้า', 'วันที่', 'รายการ', 'จำนวน', 'ราคา'])];
  for (const r of records) {
    for (const it of r.items || []) lines.push(row([r.file, r.merchant, r.date, it.name, it.qty, it.amount]));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
