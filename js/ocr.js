// Thin wrapper around Tesseract.js (loaded from CDN in index.html as window.Tesseract).

let workerPromise = null;
let progressHandler = () => {};

export function onProgress(fn) {
  progressHandler = fn;
}

function getWorker() {
  if (!workerPromise) {
    if (!window.Tesseract) throw new Error('โหลด Tesseract.js ไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)');
    workerPromise = window.Tesseract.createWorker(['tha', 'eng'], 1, {
      logger: (m) => progressHandler(m),
    }).then(async (worker) => {
      await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' });
      return worker;
    });
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

/** Run OCR on a canvas/image; returns { text, confidence }. */
export async function recognize(image) {
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  return { text: data.text, confidence: Math.round(data.confidence) };
}
