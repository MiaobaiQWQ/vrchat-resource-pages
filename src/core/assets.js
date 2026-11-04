// 解码器与解析器的静态资源地址不能写死成站点根路径：部署在子目录、GitHub Pages 项目页
// 或本地以 file/本地端口打开时，"/vendor/..." 会 404，模型直接不能用。
// 统一按 Vite 的 base（默认相对路径）解析，运行时由 index.html 的位置决定。
const base = import.meta.env?.BASE_URL ?? "/";

export function assetUrl(path) {
  const relative = String(path).replace(/^\/+/, "");
  const root = typeof document === "undefined" ? "http://localhost/" : document.baseURI;
  return new URL(base + relative, root).href;
}
