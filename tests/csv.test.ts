import { expect, test } from 'vitest';
import { escapeCsv, toItemsCsv, toSummaryCsv } from '@/lib/csv';

test('CSV export: BOM, Thai type label, escaping, items', () => {
  const recs = [{ file: 'a.jpg', type: 'receipt' as const, merchant: 'Shop, "A"', date: '2024-01-01', total: 10, items: [{ name: 'x', qty: 1, amount: 10 }] }];
  const csv = toSummaryCsv(recs);
  expect(csv.startsWith('﻿ไฟล์,ประเภท')).toBe(true);
  expect(csv).toMatch(/a\.jpg,ใบเสร็จ,"Shop, ""A""",2024-01-01,,10,/);
  expect(toItemsCsv(recs)).toMatch(/a\.jpg,"Shop, ""A""",2024-01-01,x,1,10/);
  expect(escapeCsv('=SUM(A1)')).toBe("'=SUM(A1)");
  expect(escapeCsv(-5)).toBe('-5');
});
