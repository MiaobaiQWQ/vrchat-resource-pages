import { initializeCanvas } from "ag-psd";
import { photoshopPixels } from "./photoshop.js";

initializeCanvas(
  (width, height) => new OffscreenCanvas(width, height),
  (width, height) => new ImageData(width, height),
);
self.onmessage = async ({ data }) => {
  const { requestId, file } = data;
  try {
    const { pixels, width, height } = photoshopPixels(await file.arrayBuffer());
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
