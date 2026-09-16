/* Jenga Code reader: camera dialog, local decoding and explicit result actions. */
"use strict";

class ScannerApp {
  constructor() {
    this.ui = Object.fromEntries([
      "startCameraButton", "uploadZone", "imageInput", "scanFormat", "scannerStatus",
      "resultPanel", "resultTitle", "resultOutput", "detailFormat", "copyResultButton",
      "openResultLink", "scanAgainButton", "imagePreview", "uploadedImage",
      "cameraDialog", "cameraVideo", "cameraStatus", "closeCameraButton",
      "switchCameraButton", "stopCameraButton", "scannerCanvas"
    ].map(id => [id, document.getElementById(id)]));
    this.session = 0;
    this.stream = null;
    this.worker = null;
    this.pendingDecode = null;
    this.timer = null;
    this.previewURL = null;
    this.facing = "environment";
    this.result = null;
    this.lastSource = null;
    this.nativeFormats = null;
    this.detector = null;
    this.detectorKey = null;
  }

  init() {
    const u = this.ui;
    u.startCameraButton.addEventListener("click", () => this.startCamera());
    u.closeCameraButton.addEventListener("click", () => this.closeCamera());
    u.stopCameraButton.addEventListener("click", () => this.closeCamera());
    u.cameraDialog.addEventListener("cancel", event => {
      event.preventDefault();
      this.closeCamera();
    });
    u.cameraDialog.addEventListener("close", () => {
      if (!u.cameraDialog.open) this.cancelWork();
    });
    u.switchCameraButton.addEventListener("click", () => {
      this.facing = this.facing === "environment" ? "user" : "environment";
      this.startCamera();
    });
    u.uploadZone.addEventListener("click", () => u.imageInput.click());
    u.imageInput.addEventListener("change", () => {
      const file = u.imageInput.files[0];
      if (file) this.scanFile(file);
      u.imageInput.value = "";
    });
    u.uploadZone.addEventListener("dragover", event => {
      event.preventDefault();
      u.uploadZone.classList.add("drag-over");
    });
    u.uploadZone.addEventListener("dragleave", () => u.uploadZone.classList.remove("drag-over"));
    u.uploadZone.addEventListener("drop", event => {
      event.preventDefault();
      u.uploadZone.classList.remove("drag-over");
      if (event.dataTransfer.files[0]) this.scanFile(event.dataTransfer.files[0]);
    });
    u.copyResultButton.addEventListener("click", () => this.copyResult());
    u.scanAgainButton.addEventListener("click", () => {
      if (this.lastSource === "camera") this.startCamera();
      else u.imageInput.click();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && u.cameraDialog.open) this.closeCamera();
    });
    window.addEventListener("pagehide", () => {
      this.closeCamera(false);
      this.clearPreview();
    });
  }

  status(message, error = false) {
    this.ui.scannerStatus.textContent = message;
    this.ui.scannerStatus.dataset.error = String(error);
  }

  clearResult() {
    this.result = null;
    this.ui.resultPanel.hidden = true;
    this.ui.resultOutput.value = "";
    this.ui.copyResultButton.disabled = true;
    this.ui.copyResultButton.textContent = "Copy text";
    this.ui.openResultLink.hidden = true;
    this.ui.openResultLink.removeAttribute("href");
  }

  clearPreview() {
    if (this.previewURL) URL.revokeObjectURL(this.previewURL);
    this.previewURL = null;
    this.ui.uploadedImage.removeAttribute("src");
    this.ui.imagePreview.hidden = true;
    this.ui.imagePreview.open = false;
  }

  // Invalidate in-flight camera permission, image and decoder results.
  cancelWork() {
    ++this.session;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.stream) this.stream.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.ui.cameraVideo.pause();
    this.ui.cameraVideo.srcObject = null;
    if (this.worker) this.worker.terminate();
    this.worker = null;
    if (this.pendingDecode) this.pendingDecode(null);
    this.pendingDecode = null;
    this.ui.switchCameraButton.disabled = true;
  }

  closeCamera(announce = true) {
    this.cancelWork();
    if (this.ui.cameraDialog.open) this.ui.cameraDialog.close();
    if (announce) this.status("Camera closed. Open it again or upload an image.");
  }

  async startCamera() {
    this.cancelWork();
    const token = this.session;
    const u = this.ui;
    this.clearResult();
    this.clearPreview();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.status("Camera unavailable. Open this page over HTTPS, or upload an image instead.", true);
      return;
    }
    if (!u.cameraDialog.open) u.cameraDialog.showModal();
    u.cameraStatus.textContent = "Allow camera access when your browser asks.";
    this.status("Opening camera…");
    let acquired = null;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: this.facing }, width: { ideal: 1280 }, height: { ideal: 960 } }
      });
      // Permission can resolve after Cancel; stop that late stream immediately.
      if (token !== this.session || !u.cameraDialog.open) {
        acquired.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = acquired;
      u.cameraVideo.srcObject = acquired;
      await u.cameraVideo.play();
      if (token !== this.session) return;
      u.switchCameraButton.disabled = false;
      u.cameraStatus.textContent = "Keep the whole code in view. Hold still for a moment.";
      this.status("Scanning with your camera…");
      acquired.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (token === this.session) {
          this.closeCamera(false);
          this.status("Camera disconnected. Try opening it again.", true);
        }
      });
      this.scanFrame(token);
    } catch (error) {
      if (acquired) acquired.getTracks().forEach(track => track.stop());
      if (token !== this.session) return;
      this.cancelWork();
      const messages = {
        NotAllowedError: "Camera permission was denied. Allow it in your browser settings, or upload an image.",
        NotFoundError: "No camera was found. Try uploading an image.",
        NotReadableError: "The camera is busy. Close other camera apps and try again.",
        OverconstrainedError: "This camera could not use the requested settings. Try another camera."
      };
      const message = messages[error.name] || "Could not open the camera. Try again or upload an image.";
      u.cameraStatus.textContent = message;
      this.status(message, true);
    }
  }

  drawFrame(source, maxSide) {
    const width = source.videoWidth || source.naturalWidth;
    const height = source.videoHeight || source.naturalHeight;
    if (!width || !height) return null;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = this.ui.scannerCanvas;
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async scanFrame(token) {
    if (token !== this.session || !this.ui.cameraDialog.open) return;
    try {
      if (this.ui.cameraVideo.readyState >= 2) {
        const canvas = this.drawFrame(this.ui.cameraVideo, 1280);
        if (canvas) {
          const result = await this.decode(canvas, token);
          if (token !== this.session) return;
          if (result) {
            this.showResult(result, "camera");
            return;
          }
        }
      }
    } catch (error) {
      if (token !== this.session) return;
      this.ui.cameraStatus.textContent = error.message;
      this.status(error.message, true);
      return;
    }
    // No overlapping frame decodes, including on slower phones.
    if (token === this.session) this.timer = setTimeout(() => this.scanFrame(token), 220);
  }

  async scanFile(file) {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      this.status("Choose a PNG, JPEG or WebP image.", true);
      return;
    }
    this.closeCamera(false);
    const token = this.session;
    this.clearResult();
    this.clearPreview();
    const url = URL.createObjectURL(file);
    this.previewURL = url;
    this.ui.uploadedImage.src = url;
    this.ui.imagePreview.hidden = false;
    this.status("Reading image…");
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("This image could not be opened. Choose another image."));
        image.src = url;
      });
      if (token !== this.session) return;
      let result = null;
      // Retry a higher resolution for dense codes in large photographs.
      for (const size of [1280, 2400]) {
        const canvas = this.drawFrame(image, size);
        if (canvas) result = await this.decode(canvas, token);
        if (token !== this.session) return;
        if (result || Math.max(image.naturalWidth, image.naturalHeight) <= size) break;
      }
      if (result) this.showResult(result, "image");
      else this.status("No QR or Data Matrix code found. Try a sharper image with the whole code visible.", true);
    } catch (error) {
      if (token === this.session) this.status(error.message, true);
    }
  }

  async decode(canvas, token) {
    const format = this.ui.scanFormat.value;
    // Use native detection where supported; retain the existing decoders as fallback.
    if (typeof BarcodeDetector !== "undefined") {
      try {
        this.nativeFormats ??= await BarcodeDetector.getSupportedFormats();
        if (token !== this.session) return null;
        const requested = format === "auto" ? ["qr_code", "data_matrix"] : [format === "qr" ? "qr_code" : "data_matrix"];
        const formats = requested.filter(f => this.nativeFormats.includes(f));
        if (formats.length) {
          const key = formats.join(",");
          if (key !== this.detectorKey) {
            this.detector = new BarcodeDetector({ formats });
            this.detectorKey = key;
          }
          const results = await this.detector.detect(canvas);
          if (token !== this.session) return null;
          if (results.length) return { text: results[0].rawValue, format: results[0].format };
        }
      } catch (_) { /* Fall through to the project's QR / Data Matrix decoders. */ }
    }
    if (token !== this.session) return null;
    const image = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      let worker;
      let timeout;
      const finish = (result, error) => {
        clearTimeout(timeout);
        this.pendingDecode = null;
        if (error) reject(error);
        else resolve(result);
      };
      try {
        worker = this.worker || new Worker("js/scan-worker.js");
        this.worker = worker;
        this.pendingDecode = result => finish(result);
        worker.onmessage = event => finish(event.data.result);
        worker.onerror = () => {
          worker.terminate();
          if (this.worker === worker) this.worker = null;
          finish(null, new Error("The scanner files could not load. Reload the page and try again."));
        };
        timeout = setTimeout(() => {
          worker.terminate();
          if (this.worker === worker) this.worker = null;
          finish(null, new Error("This image took too long to read. Try a closer, clearer image."));
        }, 10000);
        worker.postMessage({ buffer: image.data.buffer, width: image.width, height: image.height, format }, [image.data.buffer]);
      } catch (_) {
        finish(null, new Error("The scanner could not start. Open this page through your website or localhost."));
      }
    });
  }

  showResult(result, source) {
    if (typeof result.text !== "string") return;
    this.closeCamera(false);
    this.result = result.text;
    this.lastSource = source;
    const u = this.ui;
    u.resultOutput.value = result.text;
    u.detailFormat.textContent = String(result.format).toUpperCase().includes("DATA") ? "Data Matrix" : "QR Code";
    u.resultPanel.hidden = false;
    u.copyResultButton.disabled = false;
    u.openResultLink.hidden = true;
    u.openResultLink.removeAttribute("href");
    try {
      const url = new URL(result.text.trim());
      if (["https:", "http:"].includes(url.protocol)) {
        u.openResultLink.href = url.href;
        u.openResultLink.hidden = false;
      }
    } catch (_) { /* Ordinary text has no website action. */ }
    this.status("Code read successfully.");
    u.resultTitle.focus({ preventScroll: true });
    u.resultPanel.scrollIntoView({ block: "nearest", behavior: "auto" });
  }

  async copyResult() {
    if (this.result === null) return;
    const text = this.result;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      this.status("Text copied.");
    } catch (_) {
      this.ui.resultOutput.focus();
      this.ui.resultOutput.select();
      try {
        if (!document.execCommand("copy")) throw new Error("Copy unavailable");
        this.status("Text copied.");
      } catch (_) {
        this.status("Text selected. Use your device’s Copy command.");
      }
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.scannerApp = new ScannerApp();
  window.scannerApp.init();
});
