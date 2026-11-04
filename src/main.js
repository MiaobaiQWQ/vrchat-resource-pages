import "./styles.css";
import { SourceManager } from "./library/sources.js";
import { ArchiveClient } from "./archives/client.js";
import { Catalog } from "./library/catalog.js";
import { ImageService } from "./images/service.js";
import { CoverQueue } from "./covers/queue.js";
import { Shell } from "./ui/shell.js";
import { Detail } from "./ui/detail.js";
import { toast } from "./ui/elements.js";
import { friendlyError } from "./core/async.js";

document.documentElement.dataset.theme = "dark";
const sources = new SourceManager(),
  archives = new ArchiveClient(),
  catalog = new Catalog(sources, archives),
  images = new ImageService(),
  covers = new CoverQueue(catalog, images);
const app = { sources, archives, catalog, images, covers };
app.shell = new Shell(app);
app.detail = new Detail(app);
app.shell.renderSources();
app.shell.render();
sources.init().catch((error) => toast(friendlyError(error)));
// 未捕获的同步异常与 Promise 拒绝也按中文提示，原始错误留在控制台便于排查。
window.addEventListener("error", (event) => {
  if (!event.error) return; // 资源 404 之类的加载失败不打扰用户
  console.error(event.error);
  toast(friendlyError(event.error));
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  toast("操作未完成：" + friendlyError(event.reason));
});
