import { Camera } from './camera.js';
import { loadImage, preprocess } from './preprocess.js';
import { recognize, onProgress } from './ocr.js';
import { parseDocument } from './parser.js';
import { SUMMARY_COLUMNS, toSummaryCsv, toItemsCsv, downloadCsv } from './csv.js';

const $ = (sel) => document.querySelector(sel);

// In-memory only — nothing is persisted.
const records = [];
let nextId = 1;
const queue = [];
let busy = false;

const EDITABLE = SUMMARY_COLUMNS.filter(([k]) => k !== 'file');

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('hidden', p.id !== `panel-${btn.dataset.tab}`));
    if (btn.dataset.tab !== 'camera') stopCamera();
  });
});

/* ---------- upload ---------- */
const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
fileInput.addEventListener('change', () => {
  enqueue([...fileInput.files]);
  fileInput.value = '';
});
['dragover', 'dragenter'].forEach((e) => dropzone.addEventListener(e, (ev) => { ev.preventDefault(); dropzone.classList.add('over'); }));
['dragleave', 'drop'].forEach((e) => dropzone.addEventListener(e, () => dropzone.classList.remove('over')));
dropzone.addEventListener('drop', (ev) => {
  ev.preventDefault();
  enqueue([...ev.dataTransfer.files].filter((f) => f.type.startsWith('image/')));
});
window.addEventListener('paste', (ev) => {
  const files = [...(ev.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) enqueue(files);
});

/* ---------- camera ---------- */
const camera = new Camera($('#video'));
const camButtons = ['#captureBtn', '#switchCam', '#stopCam'];
function setCamUi(on) {
  camButtons.forEach((s) => { $(s).disabled = !on; });
  $('#startCam').disabled = on;
}
function stopCamera() { camera.stop(); setCamUi(false); }

if (!Camera.isSupported()) {
  $('#startCam').disabled = true;
  $('#camHint').textContent = 'เบราว์เซอร์นี้ไม่รองรับกล้อง (ต้องเปิดผ่าน HTTPS หรือ localhost) — ใช้แท็บ “เลือกรูปภาพ” แทน';
}
$('#startCam').addEventListener('click', async () => {
  try { await camera.start(); setCamUi(true); } catch (e) { alert(`เปิดกล้องไม่ได้: ${e.message}`); }
});
$('#switchCam').addEventListener('click', () => camera.switch().catch((e) => alert(e.message)));
$('#stopCam').addEventListener('click', stopCamera);
$('#captureBtn').addEventListener('click', () => {
  try {
    const canvas = camera.capture();
    const ts = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-');
    enqueue([{ canvas, name: `camera-${ts}.jpg` }]);
  } catch (e) { alert(e.message); }
});

/* ---------- OCR queue ---------- */
function enqueue(items) {
  queue.push(...items);
  processQueue();
}

function setStatus(text, pct) {
  $('#status').classList.toggle('hidden', text == null);
  if (text != null) $('#statusText').textContent = text;
  if (pct != null) $('#progress').style.width = `${Math.round(pct * 100)}%`;
}

let currentLabel = '';
onProgress((m) => {
  const labels = {
    'loading tesseract core': 'กำลังโหลดตัว OCR',
    'loading language traineddata': 'กำลังโหลดภาษา (ครั้งแรกอาจใช้เวลาสักครู่)',
    'initializing api': 'กำลังเตรียมระบบ',
    'recognizing text': 'กำลังอ่านข้อความ',
  };
  setStatus(`${currentLabel} — ${labels[m.status] || m.status}`, m.progress);
});

async function processQueue() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const item = queue.shift();
    const name = item.name || 'image';
    currentLabel = `${name}${queue.length ? ` (เหลืออีก ${queue.length})` : ''}`;
    setStatus(`${currentLabel} — กำลังเตรียมภาพ`, 0);
    try {
      const img = item.canvas || (await loadImage(item));
      const thumb = toThumb(img);
      const prepared = preprocess(img, { binarize: $('#binarize').checked });
      const { text, confidence } = await recognize(prepared);
      const parsed = parseDocument(text);
      records.push({ id: nextId++, file: name, thumb, rawText: text, confidence, ...parsed });
      render();
    } catch (e) {
      console.error(e);
      alert(`สแกน ${name} ไม่สำเร็จ: ${e.message}`);
    }
  }
  setStatus(null);
  busy = false;
}

function toThumb(img) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const s = 240 / Math.max(w0, h0);
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * s);
  c.height = Math.round(h0 * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

/* ---------- rendering ---------- */
function render() {
  const wrap = $('#results');
  wrap.textContent = '';
  const tpl = $('#resultTpl');
  for (const r of records) {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.thumb').src = r.thumb;
    node.querySelector('.thumb').alt = `ภาพตัวอย่าง ${r.file}`;
    node.querySelector('.fname').textContent = r.file;
    node.querySelector('.badge.type').textContent = r.type === 'slip' ? 'สลิปโอนเงิน' : 'ใบเสร็จ';
    node.querySelector('.badge.conf').textContent = `ความมั่นใจ OCR ${r.confidence}%`;
    node.querySelector('.raw').textContent = r.rawText;

    const grid = node.querySelector('.grid');
    const hide = r.type === 'slip' ? ['subtotal', 'vat', 'taxId'] : ['from', 'to'];
    for (const [key, label] of EDITABLE) {
      if (hide.includes(key)) continue;
      const lab = document.createElement('label');
      lab.textContent = label;
      let input;
      if (key === 'type') {
        input = document.createElement('select');
        input.innerHTML = '<option value="receipt">ใบเสร็จ</option><option value="slip">สลิปโอนเงิน</option>';
        input.value = r.type;
      } else {
        input = document.createElement('input');
        input.type = key === 'date' ? 'date' : ['total', 'subtotal', 'vat'].includes(key) ? 'number' : 'text';
        if (input.type === 'number') input.step = '0.01';
        const v = r[key];
        input.value = v == null ? '' : input.type === 'number' ? Number(v).toFixed(2) : v;
      }
      input.addEventListener('change', () => {
        r[key] = input.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value;
        if (key === 'type') render();
      });
      lab.appendChild(input);
      grid.appendChild(lab);
    }

    const itemsWrap = node.querySelector('.items-wrap');
    if (r.items.length) {
      const table = node.querySelector('.items');
      table.innerHTML = '<tr><th>รายการ</th><th>จำนวน</th><th>ราคา</th></tr>';
      for (const it of r.items) {
        const tr = document.createElement('tr');
        for (const v of [it.name, it.qty, it.amount?.toFixed(2)]) {
          const td = document.createElement('td');
          td.textContent = v ?? '';
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      itemsWrap.querySelector('summary').textContent = `รายการสินค้า (${r.items.length})`;
    } else {
      itemsWrap.remove();
    }

    node.querySelector('.remove').addEventListener('click', () => {
      records.splice(records.indexOf(r), 1);
      render();
    });
    wrap.appendChild(node);
  }
  if (!records.length) wrap.innerHTML = '<p class="empty">ยังไม่มีผลการสแกน</p>';
  $('#count').textContent = records.length;
  $('#exportSummary').disabled = !records.length;
  $('#exportItems').disabled = !records.some((r) => r.items.length);
  $('#clearAll').disabled = !records.length;
}

/* ---------- export ---------- */
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
$('#exportSummary').addEventListener('click', () => downloadCsv(toSummaryCsv(records), `ocr-summary-${stamp()}.csv`));
$('#exportItems').addEventListener('click', () => downloadCsv(toItemsCsv(records), `ocr-items-${stamp()}.csv`));
$('#clearAll').addEventListener('click', () => {
  if (confirm('ล้างผลการสแกนทั้งหมด?')) { records.length = 0; render(); }
});
