import { describe, expect, test, vi } from 'vitest';
import { ConfigError, UpstreamError, buildRequestBody, extractJson, getConfig, interpretReply, scanImage } from '@/lib/openthai';

const cfg = getConfig({ OPENTHAI_BASE_URL: 'http://model:8000/v1/', OPENTHAI_API_KEY: 'k' } as unknown as NodeJS.ProcessEnv);
const IMG = 'data:image/jpeg;base64,AAAA';

const reply = (content: string, status = 200) =>
  new Response(JSON.stringify({ model: 'iapp/openthai2.0-qwen3.8-27b', choices: [{ message: { content } }] }), { status });

describe('config', () => {
  test('requires base URL and applies defaults', () => {
    expect(() => getConfig({} as unknown as NodeJS.ProcessEnv)).toThrow(ConfigError);
    expect(cfg).toMatchObject({
      baseUrl: 'http://model:8000/v1', model: 'iapp/openthai2.0-qwen3.8-27b', jsonMode: 'json_schema', disableThinking: true,
    });
  });
});

describe('request', () => {
  test('sends image + prompt with json_schema and thinking disabled', () => {
    const body = buildRequestBody(cfg, IMG) as any;
    expect(body.model).toBe('iapp/openthai2.0-qwen3.8-27b');
    expect(body.temperature).toBe(0);
    expect(body.messages[1].content[0]).toEqual({ type: 'image_url', image_url: { url: IMG } });
    expect(body.response_format.type).toBe('json_schema');
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  test('json mode none / thinking on', () => {
    const body = buildRequestBody({ ...cfg, jsonMode: 'none', disableThinking: false }, IMG);
    expect(body.response_format).toBeUndefined();
    expect(body.chat_template_kwargs).toBeUndefined();
  });
});

describe('reply parsing', () => {
  test('extracts JSON from fences and think blocks', () => {
    expect(extractJson('<think>hmm {"x":0}</think>\n```json\n{"total": 5}\n```')).toEqual({ total: 5 });
    expect(extractJson('no json here')).toBeNull();
  });

  test('model JSON → normalised data', () => {
    const r = interpretReply(JSON.stringify({
      type: 'receipt', merchant: 'ร้านกาแฟดีดี', date: '2567-11-08', time: '09:15', total: 185, subtotal: null, vat: 12.1,
      tax_id: '0105556123456', reference: 'R1', from: '', to: '', items: [{ name: 'ลาเต้', qty: 2, amount: 120 }],
      raw_text: 'ร้านกาแฟดีดี\nรวมทั้งสิ้น 185.00',
    }), 'm', 10);
    expect(r.source).toBe('model');
    expect(r.data).toMatchObject({ date: '2024-11-08', total: 185, vat: 12.1, taxId: '0105556123456' });
    expect(r.rawText).toContain('รวมทั้งสิ้น');
  });

  test('plain text reply → rule-based fallback', () => {
    const r = interpretReply('ร้านเอ\nวันที่ 01/02/2024\nรวมทั้งสิ้น 99.00', 'm', 1);
    expect(r.source).toBe('fallback');
    expect(r.data.total).toBe(99);
  });
});

describe('scanImage', () => {
  test('posts to /chat/completions with bearer auth', async () => {
    const f = vi.fn(async () => reply('{"type":"slip","total":"1,500.00","date":"2024-11-08"}'));
    const r = await scanImage(IMG, cfg, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://model:8000/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k');
    expect(r.data).toMatchObject({ type: 'slip', total: 1500 });
  });

  test('upstream HTTP error', async () => {
    const f = async () => new Response('boom', { status: 500 });
    await expect(scanImage(IMG, cfg, f as typeof fetch)).rejects.toThrow(UpstreamError);
  });

  test('network error', async () => {
    const f = async () => { throw new TypeError('fetch failed'); };
    await expect(scanImage(IMG, cfg, f as typeof fetch)).rejects.toThrow(/เชื่อมต่อเซิร์ฟเวอร์โมเดลไม่ได้/);
  });

  test('empty content', async () => {
    await expect(scanImage(IMG, cfg, (async () => reply('')) as typeof fetch)).rejects.toThrow(/ไม่ได้ส่งข้อความ/);
  });
});
