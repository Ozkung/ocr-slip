// Camera capture via getUserMedia (rear camera preferred on phones).

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facing = 'environment';
  }

  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  async start() {
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: this.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  async switch() {
    this.facing = this.facing === 'environment' ? 'user' : 'environment';
    await this.start();
  }

  /** Grab the current frame as a canvas. */
  capture() {
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!w || !h) throw new Error('กล้องยังไม่พร้อม');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(this.video, 0, 0, w, h);
    return canvas;
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
