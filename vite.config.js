import { defineConfig } from "vite";

const headers = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
};

export default defineConfig({
  // 相对 base：部署到根路径、子目录、GitHub Pages 项目页或直接拿 dist 本地打开都能取到资源。
  base: "./",
  preview: { headers },
  build: { chunkSizeWarningLimit: 1100 },
});
