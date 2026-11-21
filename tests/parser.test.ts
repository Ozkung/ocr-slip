import { describe, expect, test } from 'vitest';
import { detectType, normalizeScanData, normalizeText, parseAmount, parseDate, parseDocument } from '@/lib/parser';

describe('parser helpers', () => {
  test('parseAmount', () => {
    expect(parseAmount('1,234.50')).toBe(1234.5);
    expect(parseAmount('฿ 89.00')).toBe(89);
    expect(parseAmount('1234,50')).toBe(1234.5);
    expect(parseAmount('500 บาท')).toBe(500);
    expect(parseAmount('๑,๕๐๐.๐๐')).toBe(1500);
    expect(parseAmount(42)).toBe(42);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });

  test('normalizeText', () => {
    expect(normalizeText('ยอ ด รวม ๑๒๓.๐๐')).toBe('ยอดรวม 123.00');
    expect(normalizeText('นาย สมชาย ใจดี')).toBe('นาย สมชาย ใจดี');
  });

  test('parseDate', () => {
    expect(parseDate('วันที่ 08/11/2567')).toBe('2024-11-08');
    expect(parseDate('8 พ.ย. 67 14:30')).toBe('2024-11-08');
    expect(parseDate('Date: 2024-03-05')).toBe('2024-03-05');
    expect(parseDate('05 Mar 2024')).toBe('2024-03-05');
    expect(parseDate('วันที่ 08/1102567')).toBe('2024-11-08');
    expect(parseDate('ไม่มีวันที่')).toBe('');
  });
});

describe('parseDocument (rule-based fallback)', () => {
  test('Thai receipt', () => {
    const r = parseDocument(`ร้านกาแฟดีดี สาขาสยาม
เลขประจำตัวผู้เสียภาษี 0105556123456
ใบเสร็จรับเงิน เลขที่ R2024-0012
วันที่ 08/11/2567 เวลา 09:15
ลาเต้เย็น 2 120.00
ครัวซองต์ 65.00
รวมก่อนภาษี 172.90
VAT 7% 12.10
รวมทั้งสิ้น 185.00
เงินสด 200.00`);
    expect(r).toMatchObject({
      type: 'receipt', merchant: 'ร้านกาแฟดีดี สาขาสยาม', date: '2024-11-08', time: '09:15',
      total: 185, subtotal: 172.9, vat: 12.1, taxId: '0105556123456', reference: 'R2024-0012',
    });
    expect(r.items).toEqual([
      { name: 'ลาเต้เย็น', qty: 2, amount: 120 },
      { name: 'ครัวซองต์', qty: 1, amount: 65 },
    ]);
  });

  test('bank slip', () => {
    const text = `โอนเงินสำเร็จ
8 พ.ย. 67 14:32 น.
จาก นาย สมชาย ใจดี
ไปยัง นางสาว สมหญิง รักดี
จำนวนเงิน
1,500.00 บาท
เลขที่รายการ: 2024110814320001234`;
    expect(detectType(text)).toBe('slip');
    expect(parseDocument(text)).toMatchObject({
      type: 'slip', total: 1500, date: '2024-11-08', time: '14:32', reference: '2024110814320001234',
      from: 'นาย สมชาย ใจดี', to: 'นางสาว สมหญิง รักดี',
    });
  });
});

describe('normalizeScanData (model JSON → ScanData)', () => {
  test('coerces strings, BE years and snake_case', () => {
    const d = normalizeScanData({
      type: 'slip', merchant: 'นางสาว สมหญิง', date: '2567-11-08', time: '14:32:10',
      total: '1,500.00', tax_id: '', reference: 'ABC123456', from: 'นาย สมชาย', to: 'นางสาว สมหญิง', items: [],
    });
    expect(d).toMatchObject({ type: 'slip', date: '2024-11-08', time: '14:32:10', total: 1500, reference: 'ABC123456' });
  });

  test('accepts Thai date strings and item price aliases', () => {
    const d = normalizeScanData({
      type: 'receipt', date: '8 พฤศจิกายน 2567', total: 185, tax_id: '0-1055-56123-45-6',
      items: [{ name: 'ลาเต้', qty: '2', price: '120.00' }, { name: '' }],
    });
    expect(d.date).toBe('2024-11-08');
    expect(d.taxId).toBe('0105556123456');
    expect(d.items).toEqual([{ name: 'ลาเต้', qty: 2, amount: 120 }]);
  });

  test('fills missing fields from raw text', () => {
    const d = normalizeScanData({ type: 'receipt', total: null }, 'ร้านเอ\nวันที่ 01/02/2024\nรวมทั้งสิ้น 99.00');
    expect(d).toMatchObject({ merchant: 'ร้านเอ', date: '2024-02-01', total: 99 });
  });
});
