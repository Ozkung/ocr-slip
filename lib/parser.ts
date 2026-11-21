// Rule-based helpers for Thai/English receipts and bank slips.
// Used to (1) normalise the vision model's JSON (BE years, "1,234.50" strings, …) and
// (2) fall back to keyword/regex parsing when the model returns plain text instead of JSON.

import type { DocType, LineItem, ScanData } from './types';

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

const THAI_MONTHS: string[][] = [
  ['มกราคม', 'ม.ค.', 'มค'],
  ['กุมภาพันธ์', 'ก.พ.', 'กพ'],
  ['มีนาคม', 'มี.ค.', 'มีค'],
  ['เมษายน', 'เม.ย.', 'เมย'],
  ['พฤษภาคม', 'พ.ค.', 'พค'],
  ['มิถุนายน', 'มิ.ย.', 'มิย'],
  ['กรกฎาคม', 'ก.ค.', 'กค'],
  ['สิงหาคม', 'ส.ค.', 'สค'],
  ['กันยายน', 'ก.ย.', 'กย'],
  ['ตุลาคม', 'ต.ค.', 'ตค'],
  ['พฤศจิกายน', 'พ.ย.', 'พย'],
  ['ธันวาคม', 'ธ.ค.', 'ธค'],
];

const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const TOTAL_KEYWORDS = [
  'รวมทั้งสิ้น', 'ยอดสุทธิ', 'ยอดรวมสุทธิ', 'รวมสุทธิ', 'ยอดชำระ', 'ยอดที่ต้องชำระ', 'ยอดรวม', 'รวมเงิน',
  'grand total', 'net total', 'total amount', 'amount due', 'total', 'รวม',
];
const SLIP_AMOUNT_KEYWORDS = ['จำนวนเงิน', 'จํานวนเงิน', 'จำนวน', 'amount'];
const VAT_KEYWORDS = ['vat', 'ภาษีมูลค่าเพิ่ม', 'ภาษี'];
const SUBTOTAL_KEYWORDS = ['subtotal', 'sub total', 'รวมก่อนภาษี', 'มูลค่าสินค้า'];
const SKIP_ITEM_KEYWORDS = [
  ...TOTAL_KEYWORDS, ...VAT_KEYWORDS, ...SUBTOTAL_KEYWORDS,
  'เงินสด', 'cash', 'change', 'เงินทอน', 'ทอน', 'ส่วนลด', 'discount', 'tax', 'เลขประจำตัว',
  'โทร', 'tel', 'วันที่', 'date', 'ใบเสร็จ', 'receipt', 'invoice', 'pos', 'ค่าธรรมเนียม', 'fee',
  'service charge', 'ยอดคงเหลือ', 'balance', 'card', 'บัตร',
];
const SLIP_KEYWORDS = [
  'โอนเงินสำเร็จ', 'โอนสำเร็จ', 'ทำรายการสำเร็จ', 'รายการสำเร็จ', 'จ่ายบิลสำเร็จ', 'ชำระเงินสำเร็จ',
  'promptpay', 'พร้อมเพย์', 'เลขที่รายการ', 'รหัสอ้างอิง', 'transfer', 'ค่าธรรมเนียม',
];

export function emptyScanData(type: DocType = 'receipt'): ScanData {
  return {
    type, merchant: '', date: '', time: '', total: null, subtotal: null, vat: null,
    taxId: '', reference: '', from: '', to: '', items: [],
  };
}

/** Collapse "ยอ ด รวม" (spaces inside Thai words) only when gaps are dense. */
function collapseThaiSpacing(line: string): string {
  const thaiChars = (line.match(/[฀-๿]/g) || []).length;
  const gaps = (line.match(/[฀-๿] (?=[฀-๿])/g) || []).length;
  if (!gaps || gaps / thaiChars <= 0.25) return line;
  let out = line;
  for (let i = 0; i < 3; i++) out = out.replace(/([฀-๿]) (?=[฀-๿])/g, '$1');
  return out;
}

export function thaiDigitsToArabic(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}

/** Normalise OCR text: Thai digits → Arabic, tidy whitespace. */
export function normalizeText(text: unknown): string {
  return thaiDigitsToArabic(String(text ?? ''))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => collapseThaiSpacing(l.trim()))
    .filter(Boolean)
    .join('\n');
}

/** Parse "1,234.50" / "฿ 89" / "1234,50" / 89 → number (or null). */
export function parseAmount(input: unknown): number | null {
  if (input == null || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = thaiDigitsToArabic(String(input)).replace(/[฿$]|บาท|thb/gi, '').trim();
  const m = s.match(/-?\d{1,3}(?:[,\s]\d{3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  s = m[0].replace(/\s/g, '');
  const dec = s.match(/[.,](\d{1,2})$/);
  if (dec) {
    const intPart = s.slice(0, -dec[0].length).replace(/[.,]/g, '');
    s = `${intPart}.${dec[1]}`;
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

interface Money { value: number; raw: string; decimal: boolean }

function amountsInLine(line: string): Money[] {
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}\b|\d+(?=\s*(?:บาท|thb|฿)\b)|\b\d+\b/gi;
  const out: Money[] = [];
  for (const m of line.matchAll(re)) {
    const v = parseAmount(m[0]);
    if (v != null) out.push({ value: v, raw: m[0], decimal: /\.\d{2}$/.test(m[0]) });
  }
  return out;
}

function lastMoney(line: string): number | null {
  const list = amountsInLine(line);
  const withDec = list.filter((a) => a.decimal || a.raw.includes(','));
  const pick = (withDec.length ? withDec : list).at(-1);
  return pick ? pick.value : null;
}

function toCE(year: string | number): number {
  let y = Number(year);
  if (y < 100) y += y >= 40 ? 2500 : 2000; // 67 → 2567 (BE), 24 → 2024
  if (y > 2400) y -= 543; // Buddhist Era → CE
  return y;
}

const pad = (n: string | number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Extract a date (ISO yyyy-mm-dd, CE). Supports BE years, Thai/English month names. */
export function parseDate(text: unknown): string {
  const t = normalizeText(text);
  let m = t.match(/\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/);
  if (m) {
    const r = validDate(toCE(m[1]), Number(m[2]), Number(m[3]));
    if (r) return r;
  }
  m = t.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) {
    const r = validDate(toCE(m[3]), Number(m[2]), Number(m[1]));
    if (r) return r;
  }
  // OCR sometimes reads the 2nd "/" as a digit: "08/1102567" → 08/11/2567
  m = t.match(/\b(\d{1,2})[/\-.](\d{2})\d((?:25|20)\d{2})\b/);
  if (m) {
    const r = validDate(toCE(m[3]), Number(m[2]), Number(m[1]));
    if (r) return r;
  }
  for (let i = 0; i < THAI_MONTHS.length; i++) {
    for (const name of THAI_MONTHS[i]) {
      const esc = name.replace(/\./g, '\\.?');
      const mm = t.match(new RegExp(`(\\d{1,2})\\s*${esc}\\s*(\\d{2,4})`));
      if (mm) {
        const r = validDate(toCE(mm[2]), i + 1, Number(mm[1]));
        if (r) return r;
      }
    }
  }
  m = t.match(/\b(\d{1,2})\s*([A-Za-z]{3})[a-z]*\.?,?\s*(\d{2,4})\b/);
  if (m && EN_MONTHS.includes(m[2].toLowerCase())) {
    const r = validDate(toCE(m[3]), EN_MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[1]));
    if (r) return r;
  }
  m = t.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})\b/);
  if (m && EN_MONTHS.includes(m[1].toLowerCase())) {
    const r = validDate(toCE(m[3]), EN_MONTHS.indexOf(m[1].toLowerCase()) + 1, Number(m[2]));
    if (r) return r;
  }
  return '';
}

export function parseTime(text: unknown): string {
  const m = normalizeText(text).match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?/);
  return m ? `${pad(m[1])}:${m[2]}${m[3] ? `:${m[3]}` : ''}` : '';
}

const has = (line: string, words: string[]) => {
  const l = line.toLowerCase();
  return words.some((w) => l.includes(w));
};

function findByKeywords(lines: string[], keywords: string[]): number | null {
  for (const kw of keywords) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.toLowerCase().includes(kw)) continue;
      if (kw === 'total' && /sub\s*total/i.test(line)) continue;
      if (kw === 'รวม' && has(line, ['ก่อนภาษี', 'รายการ', 'ชิ้น'])) continue;
      let v = lastMoney(line.slice(line.toLowerCase().indexOf(kw) + kw.length));
      if (v == null && lines[i + 1]) v = lastMoney(lines[i + 1]);
      if (v != null) return v;
    }
  }
  return null;
}

function findLabelValue(lines: string[], labels: string[]): string {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const low = l.toLowerCase();
    const label = labels.find((x) => low.includes(x));
    if (!label) continue;
    let rest = l.slice(low.indexOf(label) + label.length).replace(/^[\s:：.\-]+/, '').trim();
    if (!rest && lines[i + 1]) rest = lines[i + 1].trim();
    if (rest) return rest;
  }
  return '';
}

/** Detect document kind: 'slip' (bank transfer) or 'receipt'. */
export function detectType(text: unknown): DocType {
  const t = normalizeText(text).toLowerCase();
  const score = SLIP_KEYWORDS.filter((k) => t.includes(k)).length;
  return score >= 1 && !/ใบกำกับภาษี|tax invoice|receipt|ใบเสร็จ/.test(t) ? 'slip' : 'receipt';
}

function parseItems(lines: string[]): LineItem[] {
  const items: LineItem[] = [];
  for (const line of lines) {
    if (has(line, SKIP_ITEM_KEYWORDS)) continue;
    const m = line.match(/^(.*?[A-Za-z฀-๿].*?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})$/);
    if (!m) continue;
    let name = m[1].trim();
    let qty = 1;
    const q = name.match(/^(\d{1,3})\s*[xX@]?\s+(.+)$/)
      || name.match(/^(.+?)\s+[xX]?\s*(\d{1,3})\s*[xX@]?(?:\s*\d+(?:\.\d{2})?)?$/);
    if (q) {
      if (/^\d/.test(q[1])) { qty = Number(q[1]); name = q[2]; } else { name = q[1]; qty = Number(q[2]); }
    }
    name = name.replace(/[|_*#]+/g, '').trim();
    if (name.length < 2 || !qty) continue;
    items.push({ name, qty, amount: parseAmount(m[2]) });
  }
  return items;
}

/** Rule-based parse of plain text (fallback when the model doesn't return JSON). */
export function parseDocument(rawText: unknown): ScanData {
  const text = normalizeText(rawText);
  const lines = text.split('\n');
  const result = emptyScanData(detectType(text));
  result.date = parseDate(text);
  result.time = parseTime(text);

  const tax = text.replace(/[\s-]/g, '').match(/(?<!\d)\d{13}(?!\d)/);
  if (tax) result.taxId = tax[0];

  if (result.type === 'slip') {
    result.total = findByKeywords(lines, SLIP_AMOUNT_KEYWORDS);
    result.reference = (findLabelValue(lines, ['เลขที่รายการ', 'รหัสอ้างอิง', 'หมายเลขอ้างอิง', 'เลขอ้างอิง', 'ref. no', 'ref no', 'reference', 'transaction id', 'ref'])
      .match(/[A-Za-z0-9]{6,}/) || [''])[0];
    result.from = findLabelValue(lines, ['จาก', 'from']);
    result.to = findLabelValue(lines, ['ไปยัง', 'ถึง', 'to']);
    result.merchant = result.to;
    result.taxId = '';
  } else {
    result.total = findByKeywords(lines, TOTAL_KEYWORDS);
    result.subtotal = findByKeywords(lines, SUBTOTAL_KEYWORDS);
    result.vat = findByKeywords(lines, VAT_KEYWORDS);
    result.reference = (findLabelValue(lines, ['เลขที่ใบเสร็จ', 'เลขที่', 'receipt no', 'invoice no', 'bill no', 'no.'])
      .match(/[A-Za-z0-9\-/]{3,}/) || [''])[0];
    result.items = parseItems(lines);
    result.merchant = lines.find((l) => /[A-Za-z฀-๿]{3,}/.test(l)
      && !has(l, ['ใบเสร็จ', 'ใบกำกับ', 'receipt', 'invoice', 'tax id', 'เลขประจำตัว', 'วันที่', 'date'])) || '';
    if (result.total == null && result.items.length) {
      result.total = Math.round(result.items.reduce((s, it) => s + (it.amount || 0), 0) * 100) / 100;
    }
  }

  if (result.total == null) {
    const all = lines.flatMap(amountsInLine).filter((a) => a.decimal);
    if (all.length) result.total = Math.max(...all.map((a) => a.value));
  }

  result.from = result.from.slice(0, 80);
  result.to = result.to.slice(0, 80);
  result.merchant = result.merchant.slice(0, 80);
  return result;
}

const str = (v: unknown, max = 120) => (v == null ? '' : String(v).trim().slice(0, max));

/**
 * Coerce a loosely-typed object (e.g. the vision model's JSON) into ScanData.
 * Missing fields are filled from `fallbackText` using the rule-based parser.
 */
export function normalizeScanData(input: Record<string, unknown>, fallbackText = ''): ScanData {
  const fb = fallbackText ? parseDocument(fallbackText) : emptyScanData();
  const rawType = str(input.type).toLowerCase();
  const type: DocType = /slip|transfer|โอน|สลิป/.test(rawType) ? 'slip' : /receipt|invoice|ใบเสร็จ|ใบกำกับ/.test(rawType) ? 'receipt' : fb.type;

  const rawDate = str(input.date);
  let date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : parseDate(rawDate);
  if (date) {
    // The model may echo a Buddhist-Era year in ISO form ("2567-11-08").
    const [y, m, d] = date.split('-').map(Number);
    date = validDate(toCE(y), m, d) || '';
  }

  const items: LineItem[] = Array.isArray(input.items)
    ? (input.items as Record<string, unknown>[])
        .filter((it) => it && typeof it === 'object' && str(it.name))
        .map((it) => ({
          name: str(it.name),
          qty: parseAmount(it.qty) ?? 1,
          amount: parseAmount(it.amount ?? it.price ?? it.total),
        }))
    : [];

  const pick = <K extends keyof ScanData>(key: K, value: ScanData[K]): ScanData[K] =>
    value === '' || value == null ? fb[key] : value;

  const taxId = thaiDigitsToArabic(str(input.taxId ?? input.tax_id)).replace(/\D/g, '');

  return {
    type,
    merchant: pick('merchant', str(input.merchant, 80)),
    date: pick('date', date),
    time: pick('time', str(input.time) ? parseTime(str(input.time)) : ''),
    total: pick('total', parseAmount(input.total)),
    subtotal: pick('subtotal', parseAmount(input.subtotal)),
    vat: pick('vat', parseAmount(input.vat)),
    taxId: pick('taxId', taxId.length === 13 ? taxId : ''),
    reference: pick('reference', str(input.reference, 60)),
    from: pick('from', str(input.from, 80)),
    to: pick('to', str(input.to, 80)),
    items: items.length ? items : type === 'receipt' ? fb.items : [],
  };
}
