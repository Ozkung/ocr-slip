// CSV export (UTF-8 with BOM so Excel shows Thai correctly).

import type { ScanData, ScanRecord } from './types';

type Row = Partial<ScanData> & { file?: string };

export const SUMMARY_COLUMNS: [keyof Row, string][] = [
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

const TYPE_LABEL: Record<string, string> = { receipt: 'ใบเสร็จ', slip: 'สลิปโอนเงิน' };

export function escapeCsv(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  // Guard against spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: unknown[]) => cells.map(escapeCsv).join(',');
const BOM = '﻿';

/** One row per scanned document. */
export function toSummaryCsv(records: Row[]): string {
  const lines = [row(SUMMARY_COLUMNS.map(([, label]) => label))];
  for (const r of records) {
    lines.push(row(SUMMARY_COLUMNS.map(([key]) => (key === 'type' ? TYPE_LABEL[r.type ?? ''] ?? r.type : r[key]))));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** One row per line item (receipts). */
export function toItemsCsv(records: Row[]): string {
  const lines = [row(['ไฟล์', 'ร้านค้า', 'วันที่', 'รายการ', 'จำนวน', 'ราคา'])];
  for (const r of records) {
    for (const it of r.items ?? []) lines.push(row([r.file, r.merchant, r.date, it.name, it.qty, it.amount]));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(content: string, filename: string): void {
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

export type { ScanRecord };
