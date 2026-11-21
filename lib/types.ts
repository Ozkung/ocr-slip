export type DocType = 'receipt' | 'slip';

export interface LineItem {
  name: string;
  qty: number;
  amount: number | null;
}

/** Structured data extracted from one receipt or bank slip. */
export interface ScanData {
  type: DocType;
  merchant: string;
  date: string; // ISO yyyy-mm-dd (CE), '' if unknown
  time: string; // HH:mm[:ss], '' if unknown
  total: number | null;
  subtotal: number | null;
  vat: number | null;
  taxId: string;
  reference: string;
  from: string;
  to: string;
  items: LineItem[];
}

/** Response body of POST /api/scan. */
export interface ScanResponse {
  data: ScanData;
  rawText: string;
  model: string;
  /** 'model' = parsed from the model's JSON; 'fallback' = rule-based parse of the model's text. */
  source: 'model' | 'fallback';
  ms: number;
}

/** A scan kept in browser memory only (never persisted). */
export interface ScanRecord extends ScanData {
  id: number;
  file: string;
  thumb: string;
  rawText: string;
  source: ScanResponse['source'];
}
