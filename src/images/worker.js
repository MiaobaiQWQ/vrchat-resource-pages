import { initializeCanvas, readPsd } from "ag-psd";

initializeCanvas(
  (width, height) => new OffscreenCanvas(width, height),
  (width, height) => new ImageData(width, height),
);
self.onmessage = async ({ data }) => {
  const { requestId, file } = data;
  try {
    const bytes = await file.arrayBuffer(),
      view = new DataView(bytes);
    if (bytes.byteLength < 26) throw new Error("PSD 文件头不完整");
    const width = view.getUint32(18),
      height = view.getUint32(14);
    if (!width || !height || width * height > 64 * 1024 * 1024)
      throw new Error("PSD 尺寸超过本地解码限制，请导出 PNG");
    const psd = readPsd(bytes, {
      useImageData: true,
      skipLayerImageData: true,
      skipThumbnail: true,
    });
    if (!psd.imageData)
      throw new Error(
        "PSD 未保存合成图，请用 Photoshop 保存兼容图层或导出 PNG",
      );
    let pixels = psd.imageData.data;
    if (!(pixels instanceof Uint8ClampedArray)) {
      const max = pixels instanceof Uint16Array ? 65535 : 1;
      pixels = Uint8ClampedArray.from(pixels, (channel) =>
        Math.round(Math.max(0, Math.min(1, channel / max)) * 255),
      );
    }
    const canvas = new OffscreenCanvas(width, height);
    canvas
      .getContext("2d")
      .putImageData(new ImageData(pixels, width, height), 0, 0);
    self.postMessage({
      requestId,
      blob: await canvas.convertToBlob({ type: "image/png" }),
      width,
      height,
    });
  } catch (error) {
    self.postMessage({ requestId, error: error.message });
  }
};
