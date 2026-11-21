# OCR Slip — สแกนใบเสร็จและสลิปโอนเงิน → CSV

เว็บแอป **Next.js** สำหรับสแกน **ใบเสร็จ** และ **สลิปโอนเงิน** ผ่าน **กล้อง** หรือ **รูปภาพ**
อ่านเอกสารด้วยโมเดลภาษาไทยแบบมองเห็นภาพ **[OpenThai 2.0 (`iapp/openthai2.0-qwen3.8-27b`)](https://huggingface.co/iapp/openthai2.0-qwen3.8-27b)**
ดึงข้อมูลสำคัญออกมาให้อัตโนมัติ แก้ไขได้ แล้ว **ส่งออกเป็นไฟล์ .csv**

- **ไม่บันทึกลงฐานข้อมูล** — ผลสแกนอยู่ในหน่วยความจำของหน้าเว็บเท่านั้น รูปถูกส่งไปยังเซิร์ฟเวอร์โมเดลเพื่ออ่านแล้วทิ้ง
- เบราว์เซอร์ไม่ติดต่อโมเดลโดยตรง: `ฝั่งเว็บ → /api/scan (Next.js) → เซิร์ฟเวอร์โมเดล` คีย์ API จึงอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น

## ฟีเจอร์

| | |
|---|---|
| อินพุต | กล้อง (กล้องหลังเป็นค่าเริ่มต้น, สลับกล้องได้), เลือกรูปหลายไฟล์, ลากวาง, วางจากคลิปบอร์ด — ย่อรูปเหลือด้านยาว 1600px ก่อนส่ง |
| อ่านเอกสาร | OpenThai 2.0 ผ่าน API แบบ OpenAI-compatible, บังคับตอบเป็น JSON (`response_format: json_schema`), ปิดโหมด thinking |
| ข้อมูลที่ดึง | ประเภท (ใบเสร็จ/สลิป), ร้านค้า/ผู้รับ, วันที่ (แปลง พ.ศ. → ค.ศ.), เวลา, ยอดรวม, ก่อนภาษี, VAT, เลขผู้เสียภาษี, เลขอ้างอิง, จาก/ถึง, รายการสินค้า, ข้อความทั้งหมด |
| กันพลาด | ทำความสะอาดค่าที่โมเดลส่งมา (ตัวเลขเป็นข้อความ, ปี พ.ศ., เลขไทย) และถ้าโมเดลไม่ตอบเป็น JSON จะใช้ตัวแยกข้อมูลแบบกฎ (regex) จากข้อความแทน |
| ส่งออก | `CSV สรุป` (1 แถวต่อเอกสาร) และ `CSV รายการสินค้า` (1 แถวต่อรายการ) — UTF-8 BOM เปิดใน Excel ภาษาไทยไม่เพี้ยน, ป้องกัน formula injection |

## 1) รันโมเดล OpenThai 2.0

ต้องมีเซิร์ฟเวอร์ที่ให้บริการ `/v1/chat/completions` แบบ OpenAI-compatible และรับรูปภาพได้ เลือกแบบใดแบบหนึ่ง:

**vLLM** (bf16 ต้องใช้ GPU ประมาณ 80GB):

```bash
vllm serve iapp/openthai2.0-qwen3.8-27b --port 8000 --max-model-len 16384
```

**Ollama / llama.cpp** ใช้รุ่น GGUF (Q4_K_M / Q8_0) สำหรับเครื่องที่ VRAM น้อยกว่า และ **MLX 4-bit** สำหรับ Apple Silicon
ดูชื่อไฟล์และคำสั่งที่ถูกต้องในหน้า [model card](https://huggingface.co/iapp/openthai2.0-qwen3.8-27b) และ [เอกสาร iApp](https://iapp.co.th/docs/llm/openthai2p0)
(สำหรับ llama.cpp ต้องโหลดไฟล์ `mmproj` ของ vision ด้วยจึงจะรับรูปได้)

## 2) ตั้งค่าและรันเว็บ

```bash
cp .env.example .env.local   # แก้ OPENTHAI_BASE_URL / OPENTHAI_MODEL ให้ตรงกับเซิร์ฟเวอร์โมเดล
npm install
npm run dev                  # http://localhost:3000
```

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `OPENTHAI_BASE_URL` | — (จำเป็น) | URL ของเซิร์ฟเวอร์โมเดล รวม `/v1` เช่น `http://localhost:8000/v1`, Ollama `http://localhost:11434/v1` |
| `OPENTHAI_MODEL` | `iapp/openthai2.0-qwen3.8-27b` | ชื่อโมเดลตามที่เซิร์ฟเวอร์รู้จัก (Ollama ใช้ชื่อ tag ที่ pull มา) |
| `OPENTHAI_API_KEY` | ว่าง | Bearer token ถ้าเซิร์ฟเวอร์ต้องใช้ |
| `OPENTHAI_JSON_MODE` | `json_schema` | `json_schema` / `json_object` / `none` — ถ้าเซิร์ฟเวอร์ไม่รองรับ structured output ให้ใช้ `none` |
| `OPENTHAI_DISABLE_THINKING` | `true` | ส่ง `chat_template_kwargs.enable_thinking=false` (ถ้าเซิร์ฟเวอร์ปฏิเสธ ให้ตั้ง `false`) |
| `OPENTHAI_TIMEOUT_MS` | `120000` | เวลารอโมเดลสูงสุด |
| `OPENTHAI_MAX_TOKENS` | `4096` | จำนวน token สูงสุดของคำตอบ |

กล้องใช้ได้เฉพาะผ่าน **HTTPS** หรือ **localhost** · Production: `npm run build && npm start`
(ถ้า deploy บน serverless เช่น Vercel ให้ตรวจว่าเวลารันสูงสุดของฟังก์ชันพอสำหรับโมเดล 27B)

## API

`POST /api/scan` — `multipart/form-data` field `image` (JPEG/PNG/WebP ≤ 10MB)

```json
{
  "data": { "type": "receipt", "merchant": "ร้านกาแฟดีดี", "date": "2024-11-08", "time": "09:15", "total": 185,
            "subtotal": 172.9, "vat": 12.1, "taxId": "0105556123456", "reference": "R2024-0012",
            "from": "", "to": "", "items": [{ "name": "ลาเต้เย็น", "qty": 2, "amount": 120 }] },
  "rawText": "ร้านกาแฟดีดี\n...",
  "model": "iapp/openthai2.0-qwen3.8-27b",
  "source": "model",
  "ms": 2310
}
```

## ทดสอบ

```bash
npm test        # vitest: parser, CSV, OpenThai client (mock fetch)
npm run lint    # tsc --noEmit
```

## โครงสร้าง

```
app/page.tsx              หน้าเว็บ
app/api/scan/route.ts     API รับรูป → ส่งให้ OpenThai 2.0 → คืนข้อมูลโครงสร้าง
app/globals.css           ดีไซน์ (Times New Roman, เส้น 1px, มุมเหลี่ยม, light/dark)
components/Scanner.tsx    อัปโหลด/คิวสแกน/ผลลัพธ์/ส่งออก CSV
components/CameraPanel.tsx  กล้อง
components/ResultCard.tsx   การ์ดผลสแกน (แก้ไขได้)
lib/openthai.ts           client ของโมเดล (prompt, JSON schema, จัดการ error) — server only
lib/parser.ts             ทำความสะอาดข้อมูล + ตัวแยกข้อมูลสำรองแบบกฎ
lib/csv.ts                สร้าง/ดาวน์โหลด CSV
lib/image.ts              ย่อรูป/ทำ thumbnail ฝั่งเบราว์เซอร์
tests/                    unit tests
```
