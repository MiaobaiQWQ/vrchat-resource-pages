import {
  element as el,
  button,
  icon,
  iconButton,
  sizeLabel,
  kindIcon,
  toast,
} from "./elements.js";
import { kindNames } from "../core/formats.js";
import { friendlyError } from "../core/async.js";
const matchesKind = (resource, kind) =>
  kind === "all" ||
  (kind === "archive" && resource.kind === "archive") ||
  (resource.detectedKind || resource.kind) === kind;
const matchesCategory = (resource, category) =>
  category === "all" || resource.category === category;

export class Shell {
  filter = "all";
  sourceId = "";
  query = "";
  sort = "name";
  type = "all";
  limit = 48;
  cards = new Map();
  constructor(app) {
    this.app = app;
    this.root = document.querySelector("#app");
    this.build();
    app.sources.addEventListener("change", (event) => {
      app.catalog.rebuild();
      this.renderSources();
      this.render();
      if (event.detail) toast(event.detail);
    });
    app.sources.addEventListener("progress", (event) => {
      const status = this.sourceList.querySelector(
        `[data-id="${event.detail.id}"] .source-caption`,
      );
      if (status)
        status.textContent = `正在读取 ${event.detail.count.toLocaleString()} 个文件…`;
    });
    app.covers.addEventListener("cover", (event) =>
      this.updateCover(event.detail),
    );
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        this.search.focus();
      }
      if (event.key === "Escape") this.sidebar.classList.remove("open");
    });
  }
  build() {
    this.sidebar = el("aside", "sidebar");
    const brand = el("a", "brand");
    brand.href = "#";
    brand.addEventListener("click", (event) => {
      event.preventDefault();
      this.select("all");
    });
    brand.append(
      el("span", "brand-mark"),
      el("span", "brand-copy", "VRChat 资源库"),
    );
    brand.firstChild.append(icon("cube", 25));
    this.nav = el("nav", "navigation");
    this.nav.setAttribute("aria-label", "资源分类");
    this.sourceList = el("div", "source-list");
    const sourcesTitle = el("div", "sidebar-heading");
    sourcesTitle.append(
      el("span", "", "本地来源"),
      iconButton("添加文件夹", "plus", () => this.pickDirectory()),
    );
    const privacy = el("div", "privacy-card");
    privacy.append(icon("shield", 19));
    const privacyCopy = el("div");
    privacyCopy.append(
      el("strong", "", "只属于你的资源库"),
      el("p", "", "文件留在本机，不会上传或与他人共享。"),
    );
    privacy.append(privacyCopy);
    const sidebarFooter = el("div", "sidebar-footer");
    sidebarFooter.append(
      button("使用与兼容性", "info", () => this.help(), "text-button"),
      el("span", "", "VRChat 资源库 · 本地优先"),
    );
    this.sidebar.append(
      brand,
      el("div", "sidebar-heading", "资源项目"),
      this.nav,
      sourcesTitle,
      this.sourceList,
      button("添加本地目录", "plus", () => this.pickDirectory(), "add-source"),
      privacy,
      sidebarFooter,
    );
    const content = el("div", "workspace"),
      topbar = el("header", "topbar");
    const menu = iconButton(
      "展开资源导航",
      "list",
      () => this.sidebar.classList.toggle("open"),
      "icon-button mobile-menu",
    );
    const searchBox = el("label", "search-box");
    searchBox.append(icon("search", 18));
    this.search = el("input");
    this.search.type = "search";
    this.search.placeholder = "搜索资源、模型名称或路径";
    this.search.setAttribute("aria-label", "搜索资源");
    this.search.addEventListener("input", () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.query = this.search.value;
        this.limit = 48;
        this.render();
      }, 100);
    });
    searchBox.append(this.search, el("kbd", "", "Ctrl K"));
    const add = el("details", "add-menu"),
      summary = el("summary", "button primary");
    summary.append(icon("plus"), el("span", "", "添加资源"), icon("down", 14));
    const addOptions = el("div", "menu-panel");
    addOptions.append(
      button(
        "添加文件夹",
        "folder",
        () => {
          add.open = false;
          this.pickDirectory();
        },
        "menu-item",
      ),
      button(
        "添加文件或压缩包",
        "file",
        () => {
          add.open = false;
          this.fileInput.click();
        },
        "menu-item",
      ),
      button(
        "选择文件夹（兼容模式）",
        "folder",
        () => {
          add.open = false;
          this.folderInput.click();
        },
        "menu-item",
      ),
    );
    add.append(summary, addOptions);
    const privateLabel = el("span", "private-label");
    privateLabel.append(icon("lock", 14), document.createTextNode("本机私有"));
    const refresh = iconButton("刷新已添加的目录", "refresh", async () => {
      const sources = [...this.app.sources.sources.values()].filter(
        (source) => source.handle && source.status === "granted",
      );
      if (!sources.length) {
        toast("请在本地来源中重新选择文件，或先恢复目录访问");
        return;
      }
      for (const source of sources) await this.app.sources.scan(source.id);
    });
    topbar.append(
      menu,
      searchBox,
      privateLabel,
      button("添加目录", "folder", () => this.pickDirectory()),
      refresh,
      add,
    );
    this.main = el("main", "main");
    content.append(topbar, this.main);
    this.fileInput = el("input", "sr-only");
    this.fileInput.type = "file";
    this.fileInput.multiple = true;
    this.fileInput.setAttribute("aria-label", "选择本地资源文件");
    this.fileInput.onchange = () => {
      const files = [...this.fileInput.files],
        sourceId = this.reselectId;
      this.reselectId = null;
      this.fileInput.value = "";
      this.app.sources
        .addFiles(files, { sourceId })
        .catch((error) => toast(friendlyError(error)));
    };
    this.folderInput = el("input", "sr-only");
    this.folderInput.type = "file";
    this.folderInput.multiple = true;
    this.folderInput.webkitdirectory = true;
    this.folderInput.setAttribute("aria-label", "选择兼容模式文件夹");
    this.folderInput.onchange = () => {
      const files = [...this.folderInput.files],
        sourceId = this.reselectId;
      this.reselectId = null;
      this.folderInput.value = "";
      this.app.sources
        .addFiles(files, { folder: true, sourceId })
        .catch((error) => toast(friendlyError(error)));
    };
    this.drop = el("div", "drop-overlay");
    this.drop.append(
      icon("folder", 56),
      el("h2", "", "把资源放到这里"),
      el("p", "", "文件夹、模型、贴图或压缩包，都会留在本机"),
    );
    let depth = 0;
    window.addEventListener("dragenter", (event) => {
      if (event.dataTransfer.types.includes("Files")) {
        event.preventDefault();
        depth++;
        this.drop.classList.add("visible");
      }
    });
    window.addEventListener("dragleave", () => {
      depth--;
      if (depth <= 0) {
        depth = 0;
        this.drop.classList.remove("visible");
      }
    });
    window.addEventListener("dragover", (event) => {
      if (event.dataTransfer.types.includes("Files")) event.preventDefault();
    });
    window.addEventListener("drop", async (event) => {
      event.preventDefault();
      depth = 0;
      this.drop.classList.remove("visible");
      const files = [...event.dataTransfer.files];
      const promises = [...event.dataTransfer.items]
        .filter((item) => item.kind === "file")
        .map((item) =>
          item.getAsFileSystemHandle
            ? item.getAsFileSystemHandle()
            : Promise.resolve(null),
        );
      try {
        const handles = await Promise.all(promises);
        const plain = [];
        for (let i = 0; i < handles.length; i++)
          if (handles[i]?.kind === "directory")
            await app.sources.addDirectory(handles[i]);
          else if (files[i]) plain.push(files[i]);
        if (plain.length) await app.sources.addFiles(plain);
      } catch (error) {
        toast(friendlyError(error));
      }
    });
    this.root.replaceChildren(
      this.sidebar,
      content,
      this.fileInput,
      this.folderInput,
      this.drop,
    );
  }
  async pickDirectory() {
    if (!window.showDirectoryPicker) {
      this.folderInput.click();
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({
        mode: "read",
        id: "shijian-library",
      });
      const sourceId = this.reselectId;
      this.reselectId = null;
      await this.app.sources.addDirectory(handle, { sourceId });
    } catch (error) {
      if (error.name !== "AbortError") {
        if (
          error.name === "SecurityError" ||
          error.name === "NotSupportedError"
        )
          this.folderInput.click();
        else toast(friendlyError(error));
      }
    }
  }
  select(kind, sourceId = "") {
    this.filter = kind;
    this.sourceId = sourceId;
    this.limit = 48;
    this.sidebar.classList.remove("open");
    this.render();
  }
  renderSources() {
    this.sourceList.replaceChildren();
    for (const source of this.app.sources.sources.values()) {
      const row = el("div", "source-row");
      row.dataset.id = source.id;
      const choose = button(
        "",
        "folder",
        () => this.select("all", source.id),
        "source-select",
      );
      const copy = el("span", "source-copy");
      copy.append(
        el("strong", "", source.name),
        el(
          "span",
          "source-caption",
          source.status === "scanning"
            ? "正在读取目录…"
            : source.status === "prompt" || source.status === "denied"
              ? "需要恢复访问"
              : source.status === "moved"
                ? "目录已移动，请重新定位"
                : source.status === "reselect"
                  ? "需要重新选择"
                  : `${source.count.toLocaleString()} 个文件${source.status === "session" ? " · 本次会话" : ""}`,
        ),
      );
      choose.append(copy);
      const actions = el("div", "source-actions");
      if (["prompt", "denied"].includes(source.status))
        actions.append(
          iconButton("恢复目录访问", "lock", () =>
            this.app.sources
              .restore(source.id)
              .catch((error) => toast(friendlyError(error))),
          ),
        );
      else if (source.handle && source.status !== "scanning")
        actions.append(
          iconButton("刷新此目录", "refresh", () =>
            this.app.sources.scan(source.id),
          ),
        );
      if (["reselect", "moved", "error"].includes(source.status))
        actions.append(
          iconButton(
            source.status === "reselect"
              ? "重新选择目录或文件"
              : "按新路径重新定位",
            "folder",
            () => {
              this.reselectId = source.id;
              source.kind === "files"
                ? this.fileInput.click()
                : source.kind === "folder-files"
                  ? this.folderInput.click()
                  : this.pickDirectory();
            },
          ),
        );
      actions.append(
        iconButton(`移除来源 ${source.name}`, "close", async () => {
          this.app.detail.close();
          this.app.images.forget(source.id);
          this.app.covers.forget(source.id);
          await this.app.catalog.removeSource(source.id);
          if (this.sourceId === source.id) this.sourceId = "";
          this.render();
        }),
      );
      row.append(choose, actions);
      this.sourceList.append(row);
    }
    if (!this.app.sources.sources.size)
      this.sourceList.append(el("p", "source-empty", "还没有添加本地目录"));
  }
  render() {
    this.app.covers.reset();
    this.cards.clear();
    const all = this.app.catalog.resources,
      query = this.query.normalize("NFKC").toLowerCase().trim();
    const kinds = ["all", ...new Set(all.map((resource) => resource.category))];
    this.nav.replaceChildren(
      ...kinds.map((kind) => {
        const count = all.filter((resource) =>
          matchesCategory(resource, kind),
        ).length;
        const node = button(
          kind === "all" ? "全部资源" : kind,
          kind === "all" ? "grid" : "folder",
          () => this.select(kind),
          "nav-item" +
            (this.filter === kind && !this.sourceId ? " active" : ""),
        );
        node.dataset.kind = kind;
        if (count) node.append(el("span", "nav-count", count.toLocaleString()));
        return node;
      }),
    );
    const list = all.filter(
      (resource) =>
        (!this.sourceId || resource.sourceId === this.sourceId) &&
        matchesCategory(resource, this.filter) &&
        matchesKind(resource, this.type) &&
        (!query ||
          [resource.name, resource.path, ...resource.avatars]
            .join(" ")
            .normalize("NFKC")
            .toLowerCase()
            .includes(query)),
    );
    list.sort(
      this.sort === "size"
        ? (a, b) => b.size - a.size
        : this.sort === "recent"
          ? (a, b) => (b.modified || 0) - (a.modified || 0)
          : (a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }),
    );
    const header = el("section", "page-heading"),
      heading = el("div");
    heading.append(
      el(
        "h1",
        "",
        this.sourceId
          ? this.app.sources.sources.get(this.sourceId)?.name || "本地目录"
          : this.filter === "all"
            ? "全部资源"
            : this.filter,
      ),
    );
    const description = el(
      "p",
      "page-description",
      all.length
        ? `${all.length.toLocaleString()} 个资源 · ${this.app.sources.sources.size} 个本地来源 · ${sizeLabel([...this.app.sources.sources.values()].reduce((n, source) => n + source.size, 0))}`
        : "选择本地文件夹或资源包开始浏览，文件仅在浏览器中处理。",
    );
    heading.append(description);
    const status = el("span", "local-state");
    status.append(el("i"), document.createTextNode("本地运行"));
    header.append(heading, status);
    const toolbar = el("div", "library-toolbar"),
      left = el("div", "toolbar-left");
    left.append(
      el(
        "span",
        "result-count",
        query
          ? `找到 ${list.length.toLocaleString()} 个结果`
          : `${list.length.toLocaleString()} 个资源`,
      ),
    );
    if (this.sourceId || query || this.filter !== "all" || this.type !== "all")
      left.append(
        button(
          "清除筛选",
          "close",
          () => {
            this.search.value = "";
            this.query = "";
            this.type = "all";
            this.select("all");
          },
          "text-button",
        ),
      );
    const right = el("div", "toolbar-right"),
      sort = el("select");
    sort.setAttribute("aria-label", "资源排序");
    for (const [value, label] of [
      ["name", "按名称排序"],
      ["recent", "最近修改"],
      ["size", "按文件大小"],
    ])
      sort.append(new Option(label, value));
    sort.value = this.sort;
    sort.onchange = () => {
      this.sort = sort.value;
      this.render();
    };
    const gridView = iconButton(
        "卡片视图",
        "grid",
        () => {
          this.listMode = false;
          this.render();
        },
        "icon-button" + (!this.listMode ? " selected" : ""),
      ),
      listView = iconButton(
        "列表视图",
        "list",
        () => {
          this.listMode = true;
          this.render();
        },
        "icon-button" + (this.listMode ? " selected" : ""),
      );
    const type = el("select");
    type.setAttribute("aria-label", "内容类型");
    for (const [key, label] of Object.entries(kindNames))
      type.append(new Option(key === "all" ? "所有内容类型" : label, key));
    type.value = this.type;
    type.onchange = () => {
      this.type = type.value;
      this.render();
    };
    right.append(type, sort, gridView, listView);
    toolbar.append(left, right);
    this.grid = el(
      "div",
      "resource-grid" + (this.listMode ? " list-view" : ""),
    );
    // 一次性拼进文档片段：逐个 append 会让浏览器反复做样式与布局计算。
    const fragment = document.createDocumentFragment();
    for (const resource of list.slice(0, this.limit))
      fragment.append(this.card(resource));
    this.grid.append(fragment);
    this.list = list;
    this.loadMore = null;
    this.main.replaceChildren(header);
    const restoring = [...this.app.sources.sources.values()].filter((source) =>
      ["prompt", "denied", "reselect", "moved", "error"].includes(source.status),
    );
    if (restoring.length) {
      const notice = el("div", "restore-banner");
      notice.append(
        icon("lock", 18),
        el(
          "span",
          "",
          `${restoring.length} 个来源需要恢复访问。已保存的目录不会自动获得新的权限。`,
        ),
      );
      notice.append(
        button(
          "管理来源",
          "chevron",
          () => this.sidebar.classList.add("open"),
          "text-button",
        ),
      );
      this.main.append(notice);
    }
    if (!list.length) this.main.append(this.empty(!!all.length || !!query));
    else {
      this.main.append(toolbar, this.grid);
      if (list.length > this.limit) {
        this.loadMore = button(
          `加载更多 · 还有 ${list.length - this.limit} 项`,
          "plus",
          () => this.more(),
          "button load-more",
        );
        this.main.append(this.loadMore);
      }
    }
    const footer = el("footer", "content-footer");
    footer.append(
      icon("shield", 14),
      document.createTextNode("在浏览器中读取 · 原始文件保持不变"),
    );
    this.main.append(footer);
  }
  // 追加下一页：只创建新增的卡片，不再整页重建（重建会重新解码封面、丢失滚动位置）。
  more() {
    const list = this.list || [],
      slice = list.slice(this.limit, this.limit + 48);
    if (!slice.length) return;
    const fragment = document.createDocumentFragment();
    for (const resource of slice) fragment.append(this.card(resource));
    this.grid.append(fragment);
    this.limit += slice.length;
    this.refreshLoadMore();
  }
  refreshLoadMore() {
    const remaining = (this.list?.length || 0) - this.limit;
    if (!this.loadMore) return;
    if (remaining <= 0) {
      this.loadMore.remove();
      this.loadMore = null;
      return;
    }
    const label = this.loadMore.querySelector("span:not(.icon)");
    if (label) label.textContent = `加载更多 · 还有 ${remaining} 项`;
  }
  card(resource) {
    const card = button(
      "",
      null,
      () => this.app.detail.open(resource),
      "resource-card",
    );
    card.setAttribute("aria-label", resource.name);
    const thumb = el("div", "resource-thumb");
    thumb.append(el("div", "thumb-placeholder"));
    thumb.firstChild.append(
      icon(kindIcon(resource.detectedKind || resource.kind), 44),
    );
    const copy = el("div", "resource-copy"),
      meta = el("div", "resource-meta");
    const heading = el("h3", "", resource.name);
    heading.title = resource.name;
    copy.append(
      heading,
      el(
        "p",
        "resource-path",
        resource.path ||
          this.app.sources.sources.get(resource.sourceId)?.name ||
          "本地资源",
      ),
    );
    meta.append(
      el(
        "span",
        "kind-label",
        kindNames[resource.detectedKind || resource.kind],
      ),
      el("span", "", sizeLabel(resource.size)),
    );
    copy.append(meta);
    card.append(thumb, copy);
    this.cards.set(resource.id, card);
    const state = this.app.covers.states.get(resource.id);
    if (state) this.updateCover({ resource, ...state });
    else this.app.covers.observe(card, resource);
    return card;
  }
  updateCover({ resource, status, url, message, generated }) {
    const card = this.cards.get(resource.id);
    if (!card) return;
    const thumb = card.querySelector(".resource-thumb");
    thumb.dataset.status = status;
    if (status === "ready") {
      const image = el("img");
      image.src = url;
      image.alt = resource.name;
      image.decoding = "async";
      thumb.replaceChildren(image);
      if (generated || resource.coverGenerated)
        thumb.append(el("span", "rendered-badge", "3D 预览"));
    } else if (status === "loading") {
      thumb.replaceChildren(
        el("span", "spinner"),
        el("span", "thumb-status", "正在读取封面"),
      );
    } else {
      const placeholder = el("div", "thumb-placeholder");
      placeholder.append(
        icon(
          status === "locked"
            ? "lock"
            : kindIcon(resource.detectedKind || resource.kind),
          40,
        ),
      );
      thumb.replaceChildren(
        placeholder,
        el(
          "span",
          "thumb-status",
          status === "locked"
            ? "需要密码"
            : status === "world"
              ? "世界不支持预览"
              : status === "error"
                ? "暂不展示"
                : "暂无预览",
        ),
      );
      thumb.title = message || "";
    }
    card.querySelector(".kind-label").textContent =
      kindNames[resource.detectedKind || resource.kind];
  }
  empty(filtered) {
    const node = el("section", "empty-state");
    const illustration = el("div", "empty-illustration");
    illustration.append(
      el("span", "empty-tile back"),
      el("span", "empty-tile front"),
    );
    illustration.lastChild.append(icon(filtered ? "search" : "folder", 54));
    node.append(
      illustration,
      el("h2", "", filtered ? "没有找到匹配的资源" : "从一个文件夹开始"),
      el(
        "p",
        "",
        filtered
          ? "试试其他关键词，或更换资源分类。"
          : "添加本地文件夹，或直接拖入模型、贴图与压缩包。\n支持多个目录，随时添加，也能随时移除。",
      ),
    );
    if (!filtered) {
      const actions = el("div", "empty-actions");
      actions.append(
        button(
          "添加本地文件夹",
          "plus",
          () => this.pickDirectory(),
          "button primary",
        ),
        button("选择文件", "file", () => this.fileInput.click()),
      );
      node.append(actions);
      const formats = el("div", "format-pills");
      for (const label of [
        "FBX / GLB",
        "ZIP / 7z / RAR",
        "Unitypackage",
        "PNG / PSD / TGA",
      ])
        formats.append(el("span", "", label));
      node.append(formats);
    }
    return node;
  }
  help() {
    const dialog = el("dialog", "help-dialog");
    const close = iconButton("关闭说明", "close", () => dialog.close());
    dialog.append(
      close,
      el("div", "eyebrow", "LOCAL FIRST"),
      el("h2", "", "你的文件，始终留在本机"),
      el(
        "p",
        "",
        "网站只提供页面与解码器。每位访问者只能看到自己在当前浏览器中添加的目录，没有上传或公开分享入口。",
      ),
      el("h3", "", "目录与权限"),
      el(
        "p",
        "",
        "Chrome / Edge 桌面版可保存多个目录的访问句柄；权限失效时点击来源旁的恢复按钮。其他浏览器支持选择文件、文件夹，刷新后需要重新选择。移除来源不会删除磁盘文件。",
      ),
      el("h3", "", "资源与兼容性"),
      el(
        "p",
        "",
        "支持常见 3D 模型、图像、音视频、文档与 Unity 资源。ZIP、Unitypackage、TAR、7z、RAR 可在本地解析，递归嵌套最多 6 层。大 Unity 容器按需分块提取，上限 2 GB；普通文件、模型与 RAR / 7z 的读取上限为 512 MB，更大的资源可先解压后添加目录。",
      ),
      el(
        "p",
        "",
        "Unity 的自定义着色器、插件和脚本不会执行，世界不提供 3D 预览。模型以贴图原色展示，特殊着色器效果可能与 Unity 有区别；不支持或损坏的内容会给出具体提示。",
      ),
      el("h3", "", "贴图与对应模型"),
      el(
        "p",
        "",
        "贴图始终可以单独预览。明确识别适用模型后，会从已添加的本地资源中查找；没有标注或存在多个匹配时，不会随意加载无关模型。",
      ),
      el(
        "p",
        "help-note",
        "同一浏览器配置文件共用本站本地存储。不同设备、浏览器配置文件与域名之间互不共享资源。",
      ),
    );
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
  }
}
