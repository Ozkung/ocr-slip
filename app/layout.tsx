import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OCR Slip Scanner',
  description: 'สแกนใบเสร็จและสลิปโอนเงินด้วย OpenThai 2.0 แล้วส่งออกเป็น CSV',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
