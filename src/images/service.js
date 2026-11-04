import { extension } from "../core/paths.js";

export class ImageService {
  cache = new Map();
  worker;
  sequence = 0;
  pending = new Map();
  async decode(entry) {
    if (!this.cache.has(entry.id))
      this.cache.set(
        entry.id,
        this.load(entry).catch((error) => {
          this.cache.delete(entry.id);
          throw error;
        }),
      );
    return this.cache.get(entry.id);
  }
  async load(entry) {
    const ext = entry.format || extension(entry.path),
      file = await entry.read();
    if (file.size > 512 * 1024 * 1024)
      throw new Error("图像过大，请先缩小图像后预览");
    if (ext === ".psd") {
      if (!this.worker) {
        this.worker = new Worker(new URL("./worker.js", import.meta.url), {
          type: "module",
        });
        this.worker.onmessage = ({ data }) => {
          const task = this.pending.get(data.requestId);
          if (!task) return;
          this.pending.delete(data.requestId);
          if (data.error) task.reject(new Error(data.error));
          else task.resolve(data);
        };
      }
      return new Promise((resolve, reject) => {
        const requestId = ++this.sequence;
        this.pending.set(requestId, { resolve, reject });
        this.worker.postMessage({ requestId, file });
      });
    }
    if ([".tga", ".tif", ".tiff"].includes(ext)) {
      const { engineImage } = await import("../viewer/engine.js");
      return engineImage(file, ext);
    }
    if ([".dds", ".exr", ".hdr", ".ktx2"].includes(ext)) {
      const { renderImageFile } = await import("../viewer/engine.js");
      return renderImageFile(file, ext);
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      return {
        blob: file,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async url(entry) {
    const result = await this.decode(entry);
    if (!result.url) result.url = URL.createObjectURL(result.blob);
    return result.url;
  }
  async thumbnail(entry) {
    const result = await this.decode(entry);
    if (result.thumbnail) return result.thumbnail;
    const image = await loadImage(await this.url(entry)),
      canvas = document.createElement("canvas"),
      ratio = Math.min(1, 640 / Math.max(result.width, result.height));
    canvas.width = Math.max(1, Math.round(result.width * ratio));
    canvas.height = Math.max(1, Math.round(result.height * ratio));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    result.thumbnail = await canvasBlob(canvas);
    return result.thumbnail;
  }
  forget(sourceId) {
    for (const [key, promise] of this.cache)
      if (key.startsWith(sourceId + ":")) {
        promise
          .then((value) => {
            if (value.url) URL.revokeObjectURL(value.url);
          })
          .catch(() => {});
        this.cache.delete(key);
      }
  }
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("图像无法解码，文件可能损坏或浏览器不支持其编码"));
    image.src = url;
  });
}
export const canvasBlob = (canvas, type = "image/png") =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("未能生成图像"))),
      type,
      0.85,
    ),
  );
