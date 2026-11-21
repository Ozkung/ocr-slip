import 'server-only';

// Server-side client for OpenThai 2.0 (iapp/openthai2.0-qwen3.8-27b), a Thai vision-language model.
// Talks to any OpenAI-compatible /chat/completions server: vLLM, SGLang, Ollama, llama.cpp, LM Studio,
// or a hosted endpoint. Configure with env vars (see .env.example).

import { normalizeScanData, parseDocument } from './parser';
import type { ScanResponse } from './types';

export interface OpenThaiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  jsonMode: 'json_schema' | 'json_object' | 'none';
  disableThinking: boolean;
  timeoutMs: number;
  maxTokens: number;
}

export class ConfigError extends Error {}
export class UpstreamError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): OpenThaiConfig {
  const baseUrl = (env.OPENTHAI_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new ConfigError('ยังไม่ได้ตั้งค่า OPENTHAI_BASE_URL (URL ของเซิร์ฟเวอร์โมเดล เช่น http://localhost:8000/v1)');
  }
  const jsonMode = (env.OPENTHAI_JSON_MODE || 'json_schema') as OpenThaiConfig['jsonMode'];
  return {
    baseUrl,
    apiKey: env.OPENTHAI_API_KEY || '',
    model: env.OPENTHAI_MODEL || 'iapp/openthai2.0-qwen3.8-27b',
    jsonMode: ['json_schema', 'json_object', 'none'].includes(jsonMode) ? jsonMode : 'json_schema',
    disableThinking: env.OPENTHAI_DISABLE_THINKING !== 'false',
    timeoutMs: Number(env.OPENTHAI_TIMEOUT_MS) || 120_000,
    maxTokens: Number(env.OPENTHAI_MAX_TOKENS) || 4096,
  };
}

const nullable = (type: string) => ({ type: [type, 'null'] });

export const SCAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'merchant', 'date', 'time', 'total', 'subtotal', 'vat', 'tax_id', 'reference', 'from', 'to', 'items', 'raw_text'],
  properties: {
    type: { type: 'string', enum: ['receipt', 'slip'] },
    merchant: { type: 'string' },
    date: { type: 'string' },
    time: { type: 'string' },
    total: nullable('number'),
    subtotal: nullable('number'),
    vat: nullable('number'),
    tax_id: { type: 'string' },
    reference: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'qty', 'amount'],
        properties: { name: { type: 'string' }, qty: { type: 'number' }, amount: nullable('number') },
      },
    },
    raw_text: { type: 'string' },
  },
} as const;

export const SYSTEM_PROMPT = `คุณคือระบบอ่านเอกสารการเงินภาษาไทย (OCR + ดึงข้อมูล) ที่แม่นยำ
อ่านภาพใบเสร็จ/ใบกำกับภาษี หรือสลิปโอนเงินธนาคาร/พร้อมเพย์ แล้วตอบเป็น JSON อย่างเดียว ห้ามมีข้อความอื่น`;

export const USER_PROMPT = `อ่านเอกสารในภาพแล้วตอบเป็น JSON ตามโครงสร้างนี้:
{
  "type": "receipt" | "slip",          // slip = สลิปโอนเงิน/ชำระเงิน, receipt = ใบเสร็จ/ใบกำกับภาษี/บิล
  "merchant": string,                   // ชื่อร้าน/บริษัท (receipt) หรือชื่อผู้รับเงิน (slip)
  "date": "YYYY-MM-DD",                 // แปลงเป็นปี ค.ศ. เสมอ (พ.ศ. ลบ 543), ไม่พบให้ใส่ ""
  "time": "HH:mm",                      // ไม่พบให้ใส่ ""
  "total": number | null,               // ยอดรวมสุทธิที่ชำระ / จำนวนเงินที่โอน
  "subtotal": number | null,            // ยอดก่อนภาษี
  "vat": number | null,                 // ภาษีมูลค่าเพิ่ม
  "tax_id": string,                     // เลขประจำตัวผู้เสียภาษี 13 หลัก (ตัวเลขล้วน)
  "reference": string,                  // เลขที่ใบเสร็จ / เลขที่รายการ / รหัสอ้างอิง
  "from": string,                       // ชื่อผู้โอน (slip)
  "to": string,                         // ชื่อผู้รับ (slip)
  "items": [{ "name": string, "qty": number, "amount": number | null }],  // รายการสินค้า (receipt), amount = ราคารวมของบรรทัด
  "raw_text": string                    // ข้อความทั้งหมดในภาพตามลำดับบรรทัด คั่นด้วย \\n
}
กฎ: ตัวเลขเงินเป็น number ไม่มีคอมมาหรือสัญลักษณ์ ฿, ใช้เลขอารบิก, ห้ามเดาค่าที่ไม่ปรากฏในภาพ (ใช้ "" หรือ null)`;

export function buildRequestBody(cfg: OpenThaiConfig, imageDataUrl: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    temperature: 0,
    max_tokens: cfg.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl } },
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  };
  if (cfg.jsonMode === 'json_schema') {
    body.response_format = { type: 'json_schema', json_schema: { name: 'scan_result', strict: true, schema: SCAN_JSON_SCHEMA } };
  } else if (cfg.jsonMode === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  // Qwen3-family chat templates: turn off <think> for faster, deterministic extraction (vLLM/SGLang).
  if (cfg.disableThinking) body.chat_template_kwargs = { enable_thinking: false };
  return body;
}

/** Strip <think> blocks / code fences and pull the first JSON object out of the model's reply. */
export function extractJson(content: string): Record<string, unknown> | null {
  const text = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Turn the model's raw reply into a ScanResponse (JSON first, rule-based fallback). */
export function interpretReply(content: string, model: string, ms: number): ScanResponse {
  const json = extractJson(content);
  if (json) {
    const rawText = typeof json.raw_text === 'string' ? json.raw_text : '';
    return { data: normalizeScanData(json, rawText), rawText, model, source: 'model', ms };
  }
  const rawText = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { data: parseDocument(rawText), rawText, model, source: 'fallback', ms };
}

export async function scanImage(
  imageDataUrl: string,
  cfg: OpenThaiConfig = getConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<ScanResponse> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(buildRequestBody(cfg, imageDataUrl)),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'TimeoutError') throw new UpstreamError(`โมเดลตอบช้าเกิน ${cfg.timeoutMs / 1000} วินาที`, 504);
    throw new UpstreamError(`เชื่อมต่อเซิร์ฟเวอร์โมเดลไม่ได้ (${cfg.baseUrl}): ${err.message}`);
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new UpstreamError(`เซิร์ฟเวอร์โมเดลตอบกลับ ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  const payload = (await res.json().catch(() => null)) as
    | { choices?: { message?: { content?: string | { type: string; text?: string }[] } }[]; model?: string }
    | null;
  const raw = payload?.choices?.[0]?.message?.content;
  const content = Array.isArray(raw) ? raw.map((p) => p.text ?? '').join('') : raw ?? '';
  if (!content.trim()) throw new UpstreamError('โมเดลไม่ได้ส่งข้อความกลับมา');

  return interpretReply(content, payload?.model || cfg.model, Date.now() - started);
}
