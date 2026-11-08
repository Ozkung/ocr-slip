// Receipt / bank-slip text parser.
// Turns raw OCR text (Thai + English) into structured fields.

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

const THAI_MONTHS = [
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

/** Normalise OCR text: Thai digits → Arabic, collapse spaces Tesseract puts between Thai glyphs. */
export function normalizeText(text) {
  let t = String(text || '');
  t = t.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
  t = t.replace(/\r/g, '');
  t = t.replace(/[ \t]+/g, ' ');
  return t
    .split('\n')
    .map((l) => collapseThaiSpacing(l.trim()))
    .filter(Boolean)
    .join('\n');
}

/**
 * Tesseract often outputs Thai as "ยอ ด รวม" (spaces inside words). Real Thai text has few spaces,
 * so only collapse when Thai-space-Thai gaps are dense relative to the amount of Thai text.
 */
function collapseThaiSpacing(line) {
  const thaiChars = (line.match(/[฀-๿]/g) || []).length;
  const gaps = (line.match(/[฀-๿] (?=[฀-๿])/g) || []).length;
  if (!gaps || gaps / thaiChars < 0.2) return line;
  let out = line;
  for (let i = 0; i < 3; i++) out = out.replace(/([฀-๿]) (?=[฀-๿])/g, '$1');
  return out;
}

/** Parse "1,234.50" / "1 234.50" / "1234,50" → 1234.5 (or null). */
export function parseAmount(str) {
  if (str == null) return null;
  let s = String(str).replace(/[฿$]|บาท|thb/gi, '').trim();
  const m = s.match(/-?\d{1,3}(?:[,\s]\d{3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/);
  if (!m) return null;
  s = m[0].replace(/\s/g, '');
  // Decide decimal separator: last "." or "," followed by 1-2 digits at end.
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

/** All money-looking numbers in a line (prefers values with 2 decimals). */
function amountsInLine(line) {
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}\b|\d+(?=\s*(?:บาท|thb|฿)\b)|\b\d+\b/gi;
  const out = [];
  for (const m of line.matchAll(re)) {
    const v = parseAmount(m[0]);
    if (v != null) out.push({ value: v, raw: m[0], decimal: /\.\d{2}$/.test(m[0]) });
  }
  return out;
}

function lastMoney(line) {
  const list = amountsInLine(line);
  const withDec = list.filter((a) => a.decimal || a.raw.includes(','));
  const pick = (withDec.length ? withDec : list).at(-1);
  return pick ? pick.value : null;
}

function toCE(year) {
  let y = Number(year);
  if (y < 100) y += y >= 40 ? 2500 : 2000; // 67 → 2567 (BE), 24 → 2024
  if (y > 2400) y -= 543; // Buddhist Era → CE
  return y;
}

const pad = (n) => String(n).padStart(2, '0');

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Extract date (ISO yyyy-mm-dd) from text; supports BE years and Thai/English month names. */
export function parseDate(text) {
  const t = normalizeText(text);
  // dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy
  let m = t.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) {
    const r = validDate(toCE(m[3]), Number(m[2]), Number(m[1]));
    if (r) return r;
  }
  // OCR often reads the 2nd "/" as a digit: "08/1102567" → 08/11/2567
  m = t.match(/\b(\d{1,2})[/\-.](\d{2})\d((?:25|20)\d{2})\b/);
  if (m) {
    const r = validDate(toCE(m[3]), Number(m[2]), Number(m[1]));
    if (r) return r;
  }
  // yyyy-mm-dd
  m = t.match(/\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/);
  if (m) {
    const r = validDate(toCE(m[1]), Number(m[2]), Number(m[3]));
    if (r) return r;
  }
  // 8 พ.ย. 67 / 8 พฤศจิกายน 2567
  for (let i = 0; i < THAI_MONTHS.length; i++) {
    for (const name of THAI_MONTHS[i]) {
      const esc = name.replace(/\./g, '\\.?');
      const re = new RegExp(`(\\d{1,2})\\s*${esc}\\s*(\\d{2,4})`);
      const mm = t.match(re);
      if (mm) {
        const r = validDate(toCE(mm[2]), i + 1, Number(mm[1]));
        if (r) return r;
      }
    }
  }
  // 8 Nov 2024 / Nov 8, 2024
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

export function parseTime(text) {
  const m = normalizeText(text).match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.]([0-5]\d))?\s*(?:น\.?)?/);
  return m ? `${pad(m[1])}:${m[2]}${m[3] ? `:${m[3]}` : ''}` : '';
}

const has = (line, words) => {
  const l = line.toLowerCase();
  return words.some((w) => l.includes(w));
};

function findByKeywords(lines, keywords) {
  // Keyword order = priority; search each keyword over all lines (bottom-up for totals).
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

function findLabelValue(lines, labels) {
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
export function detectType(text) {
  const t = normalizeText(text).toLowerCase();
  const score = SLIP_KEYWORDS.filter((k) => t.includes(k)).length;
  return score >= 1 && !/ใบกำกับภาษี|tax invoice|receipt|ใบเสร็จ/.test(t) ? 'slip' : 'receipt';
}

function parseItems(lines) {
  const items = [];
  for (const line of lines) {
    if (has(line, SKIP_ITEM_KEYWORDS)) continue;
    // "<name> <qty>x? <price>" or "<qty> <name> <price>"
    const m = line.match(/^(.*?[A-Za-z฀-๿].*?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})$/);
    if (!m) continue;
    let name = m[1].trim();
    let qty = 1;
    const q = name.match(/^(\d{1,3})\s*[xX@]?\s+(.+)$/) || name.match(/^(.+?)\s+[xX]?\s*(\d{1,3})\s*[xX@]?(?:\s*\d+(?:\.\d{2})?)?$/);
    if (q) {
      if (/^\d/.test(q[1])) { qty = Number(q[1]); name = q[2]; } else { name = q[1]; qty = Number(q[2]); }
    }
    name = name.replace(/[|_*#]+/g, '').trim();
    if (name.length < 2 || !qty) continue;
    items.push({ name, qty, amount: parseAmount(m[2]) });
  }
  return items;
}

/** Main entry: raw OCR text → structured result. */
export function parseDocument(rawText) {
  const text = normalizeText(rawText);
  const lines = text.split('\n');
  const type = detectType(text);

  const result = {
    type,
    merchant: '',
    date: parseDate(text),
    time: parseTime(text),
    total: null,
    subtotal: null,
    vat: null,
    taxId: '',
    reference: '',
    from: '',
    to: '',
    items: [],
  };

  const tax = text.replace(/[\s-]/g, '').match(/(?<!\d)\d{13}(?!\d)/);
  if (tax) result.taxId = tax[0];

  if (type === 'slip') {
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
    // Merchant: first line with letters that isn't a header word.
    result.merchant = lines.find((l) => /[A-Za-z฀-๿]{3,}/.test(l)
      && !has(l, ['ใบเสร็จ', 'ใบกำกับ', 'receipt', 'invoice', 'tax id', 'เลขประจำตัว', 'วันที่', 'date'])) || '';
    if (result.total == null && result.items.length) {
      result.total = Math.round(result.items.reduce((s, it) => s + (it.amount || 0), 0) * 100) / 100;
    }
  }

  // Fallback: largest money value in the document.
  if (result.total == null) {
    const all = lines.flatMap(amountsInLine).filter((a) => a.decimal);
    if (all.length) result.total = Math.max(...all.map((a) => a.value));
  }

  result.from = result.from.slice(0, 80);
  result.to = result.to.slice(0, 80);
  result.merchant = result.merchant.slice(0, 80);
  return result;
}
