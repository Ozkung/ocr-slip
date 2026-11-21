import Scanner from '@/components/Scanner';

export default function Home() {
  return (
    <>
      <header>
        <h1>OCR Slip — สแกนใบเสร็จและสลิปโอนเงิน</h1>
        <p className="lead">
          ถ่ายจากกล้องหรือเลือกรูปภาพ โมเดล OpenThai 2.0 จะอ่านเอกสาร (ไทย/อังกฤษ) ดึงยอดเงิน วันที่ และเลขอ้างอิง
          แล้วส่งออกเป็นไฟล์ <a href="#results-section">CSV</a> ได้ทันที
        </p>
        <p className="muted">ไม่มีการบันทึกข้อมูลลงฐานข้อมูล รูปถูกส่งไปยังเซิร์ฟเวอร์โมเดลเพื่ออ่านเท่านั้น</p>
      </header>
      <Scanner />
      <footer>
        อ่านเอกสารด้วย{' '}
        <a href="https://huggingface.co/iapp/openthai2.0-qwen3.8-27b" target="_blank" rel="noreferrer">
          iapp/openthai2.0-qwen3.8-27b
        </a>{' '}
        · ไฟล์ CSV เป็น UTF-8 (BOM) เปิดใน Excel/Google Sheets ได้
      </footer>
    </>
  );
}
