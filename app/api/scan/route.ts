import { NextResponse } from 'next/server';
import { ConfigError, UpstreamError, getConfig, scanImage } from '@/lib/openthai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/**
 * POST /api/scan  (multipart/form-data, field "image")
 * Sends the image to OpenThai 2.0 and returns structured data. Nothing is stored.
 */
export async function POST(req: Request) {
  let cfg;
  try {
    cfg = getConfig();
  } catch (e) {
    if (e instanceof ConfigError) return error(e.message, 500);
    throw e;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error('ต้องส่งเป็น multipart/form-data', 400);
  }
  const file = form.get('image');
  if (!(file instanceof File)) return error('ไม่พบไฟล์รูปภาพ (field "image")', 400);
  if (!ALLOWED.includes(file.type)) return error('รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP', 415);
  if (file.size > MAX_BYTES) return error('ไฟล์ใหญ่เกิน 10MB', 413);

  const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;

  try {
    return NextResponse.json(await scanImage(dataUrl, cfg), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof UpstreamError) return error(e.message, e.status);
    console.error('scan failed', e);
    return error('สแกนไม่สำเร็จ', 500);
  }
}
