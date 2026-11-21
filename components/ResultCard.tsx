'use client';

import type { ScanData, ScanRecord } from '@/lib/types';

type FieldKey = Exclude<keyof ScanData, 'items'>;

const FIELDS: [FieldKey, string][] = [
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
const MONEY: FieldKey[] = ['total', 'subtotal', 'vat'];

interface Props {
  record: ScanRecord;
  onChange: (patch: Partial<ScanRecord>) => void;
  onRemove: () => void;
}

export default function ResultCard({ record: r, onChange, onRemove }: Props) {
  const hidden: FieldKey[] = r.type === 'slip' ? ['subtotal', 'vat', 'taxId'] : ['from', 'to'];

  return (
    <article className="result">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="thumb" src={r.thumb} alt={`ภาพตัวอย่าง ${r.file}`} />
      <div className="fields">
        <div className="fname">{r.file}</div>
        <div className="badge-row">
          <span className="badge">{r.type === 'slip' ? 'สลิปโอนเงิน' : 'ใบเสร็จ'}</span>
          <span className="badge plain">
            {r.source === 'model' ? 'OpenThai 2.0' : 'OpenThai 2.0 + กฎสำรอง'}
          </span>
        </div>

        <div className="grid">
          {FIELDS.filter(([k]) => !hidden.includes(k)).map(([key, label]) => (
            <label key={key}>
              {label}
              {key === 'type' ? (
                <select value={r.type} onChange={(e) => onChange({ type: e.target.value as ScanData['type'] })}>
                  <option value="receipt">ใบเสร็จ</option>
                  <option value="slip">สลิปโอนเงิน</option>
                </select>
              ) : MONEY.includes(key) ? (
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={r[key] == null ? '' : Number(r[key]).toFixed(2)}
                  onBlur={(e) => onChange({ [key]: e.target.value === '' ? null : Number(e.target.value) })}
                />
              ) : (
                <input
                  type={key === 'date' ? 'date' : 'text'}
                  defaultValue={String(r[key] ?? '')}
                  onBlur={(e) => onChange({ [key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>

        {r.items.length > 0 && (
          <details>
            <summary>รายการสินค้า ({r.items.length})</summary>
            <table className="items">
              <thead>
                <tr><th>รายการ</th><th>จำนวน</th><th>ราคา</th></tr>
              </thead>
              <tbody>
                {r.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.name}</td>
                    <td>{it.qty}</td>
                    <td>{it.amount == null ? '' : it.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        <details>
          <summary>ข้อความที่โมเดลอ่านได้</summary>
          <pre className="raw">{r.rawText || '—'}</pre>
        </details>
        <button className="linklike" onClick={onRemove}>ลบรายการนี้</button>
      </div>
    </article>
  );
}
