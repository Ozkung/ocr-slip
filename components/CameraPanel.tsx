'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onCapture: (canvas: HTMLCanvasElement) => void;
}

export default function CameraPanel({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(!!navigator.mediaDevices?.getUserMedia);
    return () => stop();
  }, []);

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOn(false);
  }

  async function start(mode = facing) {
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setOn(true);
    } catch (e) {
      alert(`เปิดกล้องไม่ได้: ${(e as Error).message}`);
    }
  }

  function switchCam() {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    start(next);
  }

  function capture() {
    const v = videoRef.current!;
    if (!v.videoWidth) return alert('กล้องยังไม่พร้อม');
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    onCapture(c);
  }

  return (
    <div>
      <div className="video-wrap">
        <video ref={videoRef} playsInline muted />
        <div className="guide" />
      </div>
      <div className="row">
        <button onClick={() => start()} disabled={on || !supported}>เปิดกล้อง</button>
        <button className="primary" onClick={capture} disabled={!on}>ถ่ายและสแกน</button>
        <button onClick={switchCam} disabled={!on}>สลับกล้อง</button>
        <button onClick={stop} disabled={!on}>ปิดกล้อง</button>
      </div>
      <p className="muted hint">
        {supported
          ? 'ถ้าเปิดกล้องไม่ได้ ใช้แท็บ “เลือกรูปภาพ” บนมือถือจะเลือกถ่ายรูปได้เช่นกัน'
          : 'เบราว์เซอร์นี้ไม่รองรับกล้อง (ต้องเปิดผ่าน HTTPS หรือ localhost) — ใช้แท็บ “เลือกรูปภาพ” แทน'}
      </p>
    </div>
  );
}
