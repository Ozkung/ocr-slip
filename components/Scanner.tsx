'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CameraPanel from './CameraPanel';
import ResultCard from './ResultCard';
import { downloadCsv, toItemsCsv, toSummaryCsv } from '@/lib/csv';
import { loadImage, toThumb, toUploadBlob, type ImageSource } from '@/lib/image';
import type { ScanRecord, ScanResponse } from '@/lib/types';

type Job = { name: string; source: File | HTMLCanvasElement };

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

async function scan(img: ImageSource): Promise<ScanResponse> {
  const form = new FormData();
  form.append('image', await toUploadBlob(img), 'image.jpg');
  const res = await fetch('/api/scan', { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as ScanResponse;
}

export default function Scanner() {
  const [tab, setTab] = useState<'upload' | 'camera'>('upload');
  // In-memory only — nothing is persisted (no database, no localStorage).
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const queue = useRef<Job[]>([]);
  const busy = useRef(false);
  const nextId = useRef(1);

  const processQueue = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length) {
      const job = queue.current.shift()!;
      const left = queue.current.length;
      setStatus(`กำลังอ่าน ${job.name} ด้วย OpenThai 2.0${left ? ` (เหลืออีก ${left})` : ''}…`);
      try {
        const img = job.source instanceof File ? await loadImage(job.source) : job.source;
        const res = await scan(img);
        const rec: ScanRecord = {
          ...res.data,
          id: nextId.current++,
          file: job.name,
          thumb: toThumb(img),
          rawText: res.rawText,
          source: res.source,
        };
        setRecords((rs) => [...rs, rec]);
      } catch (e) {
        alert(`สแกน ${job.name} ไม่สำเร็จ: ${(e as Error).message}`);
      }
    }
    setStatus(null);
    busy.current = false;
  }, []);

  const enqueue = useCallback(
    (jobs: Job[]) => {
      if (!jobs.length) return;
      queue.current.push(...jobs);
      processQueue();
    },
    [processQueue],
  );

  const enqueueFiles = useCallback(
    (files: Iterable<File>) => enqueue([...files].filter((f) => f.type.startsWith('image/')).map((f) => ({ name: f.name, source: f }))),
    [enqueue],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => enqueueFiles(e.clipboardData?.files ?? []);
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [enqueueFiles]);

  const update = (id: number, patch: Partial<ScanRecord>) =>
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <main>
      <section className="card">
        <div className="tabs" role="tablist">
          {(['upload', 'camera'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'upload' ? 'เลือกรูปภาพ' : 'กล้อง'}
            </button>
          ))}
        </div>

        {tab === 'upload' ? (
          <label
            className={`dropzone${over ? ' over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); enqueueFiles(e.dataTransfer.files); }}
          >
            <input
              type="file"
              id="fileInput"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => { enqueueFiles(e.target.files ?? []); e.target.value = ''; }}
            />
            <span>
              <u>แตะเพื่อเลือกรูป</u> หรือลากไฟล์มาวางที่นี่
              <br />
              <span className="muted">เลือกได้หลายรูป · วางจากคลิปบอร์ดได้ (Ctrl+V)</span>
            </span>
          </label>
        ) : (
          <CameraPanel
            onCapture={(canvas) =>
              enqueue([{ name: `camera-${new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-')}.jpg`, source: canvas }])
            }
          />
        )}

        {status && (
          <div className="status" role="status">
            <div className="bar"><div className="indeterminate" /></div>
            <span>{status}</span>
          </div>
        )}
      </section>

      <section className="card" id="results-section">
        <div className="section-head">
          <h2>ผลการสแกน ({records.length})</h2>
          <div className="row">
            <button className="primary" disabled={!records.length} onClick={() => downloadCsv(toSummaryCsv(records), `ocr-summary-${stamp()}.csv`)}>
              ดาวน์โหลด CSV สรุป →
            </button>
            <button disabled={!records.some((r) => r.items.length)} onClick={() => downloadCsv(toItemsCsv(records), `ocr-items-${stamp()}.csv`)}>
              CSV รายการสินค้า
            </button>
            <button disabled={!records.length} onClick={() => confirm('ล้างผลการสแกนทั้งหมด?') && setRecords([])}>
              ล้างทั้งหมด
            </button>
          </div>
        </div>
        <p className="muted">แก้ไขค่าได้ก่อนส่งออก · ข้อมูลอยู่ในหน้านี้เท่านั้น ปิดหรือรีเฟรชแล้วจะหายไป</p>
        <div id="results">
          {records.length === 0 ? (
            <p className="empty">ยังไม่มีผลการสแกน</p>
          ) : (
            records.map((r) => (
              <ResultCard
                key={r.id}
                record={r}
                onChange={(p) => update(r.id, p)}
                onRemove={() => setRecords((rs) => rs.filter((x) => x.id !== r.id))}
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}
