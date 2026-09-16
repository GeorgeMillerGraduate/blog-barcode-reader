/* ZXing 0.23.0, Apache-2.0. See vendor/ZXING-LICENSE.txt.
   A local fallback for browsers without native QR / Data Matrix detection.
   Decoding runs off the UI thread so Cancel remains responsive. */
"use strict";
importScripts("vendor/zxing.min.js");

const readers = {
  qr: new ZXing.QRCodeReader(),
  datamatrix: new ZXing.DataMatrixReader()
};
const hints = new Map([[ZXing.DecodeHintType.TRY_HARDER, true]]);

self.onmessage = ({ data }) => {
  try {
    const selected = data.format === "auto" ? Object.values(readers) : [readers[data.format]];
    const rgba = new Uint8ClampedArray(data.buffer);
    const luminance = new Uint8ClampedArray(data.width * data.height);
    for (let i = 0; i < luminance.length; i++) {
      const offset = i * 4;
      luminance[i] = (rgba[offset] + 2 * rgba[offset + 1] + rgba[offset + 2]) >> 2;
    }
    const source = new ZXing.RGBLuminanceSource(luminance, data.width, data.height);
    let decoded = null;
    scan: for (const candidate of [source, source.invert()]) {
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(candidate));
      for (const reader of selected) {
        try {
          decoded = reader.decode(bitmap, hints);
          break scan;
        } catch (_) { /* No detection: try the next format or reversed colours. */ }
      }
    }
    self.postMessage({ result: decoded ? {
      text: decoded.getText(),
      format: decoded.getBarcodeFormat() === ZXing.BarcodeFormat.DATA_MATRIX ? "DATA_MATRIX" : "QR_CODE"
    } : null });
  } catch (_) {
    self.postMessage({ result: null });
  } finally {
    Object.values(readers).forEach(reader => reader.reset());
  }
};
