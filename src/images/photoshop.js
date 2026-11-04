import { readPsd } from "ag-psd";

export function photoshopPixels(bytes) {
  if (bytes.byteLength < 26) throw new Error("PSD / PSB 文件头不完整");
  const view = new DataView(bytes);
  if (view.getUint32(0) !== 0x38425053 || ![1, 2].includes(view.getUint16(4)))
    throw new Error("PSD / PSB 文件签名或版本不正确");
  const width = view.getUint32(18),
    height = view.getUint32(14);
  if (!width || !height || width * height > 64 * 1024 * 1024)
    throw new Error("PSD / PSB 尺寸超过本地解码限制，请导出较小的 PNG");
  const psd = readPsd(bytes, {
    useImageData: true,
    skipLayerImageData: true,
    skipThumbnail: true,
  });
  if (!psd.imageData)
    throw new Error(
      "PSD / PSB 未保存合成图，请用 Photoshop 保存兼容图层或导出 PNG",
    );
  let pixels = psd.imageData.data;
  if (!(pixels instanceof Uint8ClampedArray)) {
    const max = pixels instanceof Uint16Array ? 65535 : 1;
    pixels = Uint8ClampedArray.from(pixels, (channel) =>
      Math.round(Math.max(0, Math.min(1, channel / max)) * 255),
    );
  }
  return { pixels, width, height };
}
