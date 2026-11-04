import {
  basename,
  dirname,
  stem,
  extension,
  comparisonKey,
} from "../core/paths.js";
import { detectAvatars } from "../core/formats.js";

export function createResources(files) {
  const resources = [],
    folders = new Map(),
    assigned = new Set();
  for (const file of files) {
    const key = file.sourceId + ":" + dirname(file.path);
    if (!folders.has(key)) folders.set(key, []);
    folders.get(key).push(file);
  }
  const broad = new Set([
    "衣服",
    "角色模型",
    "配饰",
    "连衣裙与套装",
    "外套",
    "上衣",
    "下装",
    "泳装",
    "家居服与睡衣",
    "材质与贴图",
    "头发与发型",
    "动作与表情",
    "功能道具",
  ]);
  const covers = [...folders].filter(([, entries]) => {
    const first = entries[0],
      directory = dirname(first.path);
    if (
      (!directory && first.sourceKind === "files") ||
      broad.has(directory ? basename(directory) : first.sourceName)
    )
      return false;
    if (
      !entries.some(
        (entry) =>
          entry.kind === "texture" &&
          /base_resized|(?:^|[ _-])cover[._-]/i.test(entry.name),
      )
    )
      return false;
    return files.some(
      (entry) =>
        entry.sourceId === first.sourceId &&
        entry.path.startsWith(directory ? directory + "/" : "") &&
        ["model", "archive"].includes(entry.kind),
    );
  });
  const candidates = new Map(
    [...folders].filter(([, entries]) =>
      entries.some((entry) => entry.kind === "archive"),
    ),
  );
  for (const [key, entries] of covers) candidates.set(key, entries);
  const anchors = [...candidates].filter(
    ([key, entries]) =>
      !covers.some(
        ([parent, group]) =>
          parent !== key &&
          group[0].sourceId === entries[0].sourceId &&
          dirname(entries[0].path).startsWith(
            dirname(group[0].path) ? dirname(group[0].path) + "/" : "",
          ),
      ),
  );
  for (const [key, entries] of anchors) {
    const first = entries[0],
      directory = dirname(first.path),
      archives = entries.filter((entry) => entry.kind === "archive");
    const group =
      directory ||
      ["directory", "folder-files"].includes(first.sourceKind) ||
      (archives.length === 1 &&
        entries.some((entry) => entry.kind === "texture"));
    if (!group) {
      for (const archive of archives) {
        assigned.add(archive.id);
        resources.push({
          id: archive.id,
          sourceId: archive.sourceId,
          name: stem(archive.name),
          path: archive.path,
          kind: "archive",
          size: archive.size,
          modified: archive.modified,
          entries: [archive],
          archives: [archive],
          avatars: detectAvatars(archive.path),
          warnings: [],
        });
      }
      continue;
    }
    const prefix = directory ? directory + "/" : "";
    const nestedAnchors = anchors
      .filter(
        ([other, group]) =>
          other !== key &&
          group[0].sourceId === first.sourceId &&
          dirname(group[0].path).startsWith(prefix),
      )
      .map(([, group]) => dirname(group[0].path) + "/");
    const related = files.filter(
      (entry) =>
        entry.sourceId === first.sourceId &&
        entry.path.startsWith(prefix) &&
        !nestedAnchors.some((path) => entry.path.startsWith(path)),
    );
    related.forEach((entry) => assigned.add(entry.id));
    resources.push({
      id: key + ":bundle",
      sourceId: first.sourceId,
      name: directory
        ? basename(directory)
        : first.sourceKind === "files"
          ? stem(archives[0].name)
          : first.sourceName || stem(archives[0].name),
      path: directory || first.sourceName || archives[0].path,
      kind: related.some((entry) => entry.kind === "archive")
        ? "archive"
        : "model",
      size: related.reduce((n, entry) => n + entry.size, 0),
      modified: Math.max(...related.map((entry) => entry.modified || 0)),
      entries: related,
      archives: related.filter((entry) => entry.kind === "archive"),
      avatars: detectAvatars(related.map((entry) => entry.path).join(" ")),
      warnings: [],
    });
  }
  for (const [key, entries] of [...folders].sort(
    ([a], [b]) => a.split("/").length - b.split("/").length,
  )) {
    const models = entries.filter(
      (entry) => entry.kind === "model" && !assigned.has(entry.id),
    );
    if (!models.length || models.every((entry) => assigned.has(entry.id)))
      continue;
    const first = models[0],
      directory = dirname(first.path),
      prefix = directory ? directory + "/" : "";
    const related = files.filter(
      (file) =>
        file.sourceId === first.sourceId &&
        file.kind !== "archive" &&
        !assigned.has(file.id) &&
        file.path.startsWith(prefix),
    );
    related.forEach((file) => assigned.add(file.id));
    resources.push({
      id: key + ":model",
      sourceId: first.sourceId,
      name: directory ? basename(directory) : stem(first.name),
      path: directory || first.path,
      kind: "model",
      size: related.reduce((n, e) => n + e.size, 0),
      modified: Math.max(...related.map((m) => m.modified || 0)),
      entries: related,
      avatars: detectAvatars(
        directory + " " + models.map((m) => m.name).join(" "),
      ),
      warnings: [],
    });
  }
  for (const [key, entries] of folders) {
    const remaining = entries.filter(
      (entry) => !assigned.has(entry.id) && entry.kind !== "archive",
    );
    const textures = remaining.filter((entry) => entry.kind === "texture");
    if (textures.length) {
      const first = textures[0],
        directory = dirname(first.path);
      resources.push({
        id: key + ":textures",
        sourceId: first.sourceId,
        name: directory
          ? basename(directory)
          : textures.length === 1
            ? stem(first.name)
            : "图像与贴图",
        path: directory || first.path,
        kind: "texture",
        size: textures.reduce((n, entry) => n + entry.size, 0),
        modified: Math.max(...textures.map((t) => t.modified)),
        entries: remaining,
        avatars: detectAvatars(textures.map((e) => e.path).join(" ")),
        warnings: [],
      });
    }
    for (const file of remaining.filter(
      (entry) => !["texture", "unity"].includes(entry.kind),
    )) {
      resources.push({
        id: file.id,
        sourceId: file.sourceId,
        name: file.name,
        path: file.path,
        kind: file.kind,
        size: file.size,
        modified: file.modified,
        entries: [file],
        avatars: detectAvatars(file.path),
        warnings: [],
      });
    }
    const unity = remaining.filter(
      (entry) => entry.kind === "unity" && extension(entry.path) !== ".meta",
    );
    if (unity.length && !textures.length) {
      const file = unity[0];
      resources.push({
        id: key + ":unity",
        sourceId: file.sourceId,
        name: dirname(file.path)
          ? basename(dirname(file.path))
          : stem(file.name),
        path: dirname(file.path),
        kind: "unity",
        size: unity.reduce((n, e) => n + e.size, 0),
        modified: file.modified,
        entries: remaining,
        avatars: detectAvatars(file.path),
        warnings: [],
      });
    }
  }
  return resources.map((resource) => {
    const source = files.find((file) => file.sourceId === resource.sourceId);
    const parts = ((source?.sourceName || "") + "/" + resource.path).split("/");
    const aliases = {
      角色模型: "角色模型",
      avatars: "角色模型",
      衣服: "衣服",
      服装: "衣服",
      泳装: "衣服",
      泳衣: "衣服",
      outfits: "衣服",
      clothing: "衣服",
      clothes: "衣服",
      头发与发型: "头发与发型",
      hair: "头发与发型",
      头发贴图: "头发贴图",
      配饰: "配饰",
      accessories: "配饰",
      材质与贴图: "材质与贴图",
      textures: "材质与贴图",
      动作与表情: "动作与表情",
      animations: "动作与表情",
      expressions: "动作与表情",
      功能道具: "功能道具",
      props: "功能道具",
      世界: "世界",
      worlds: "世界",
      混合资源: "混合资源",
    };
    const index = parts.findIndex((part) => aliases[comparisonKey(part)]);
    resource.category =
      index >= 0 ? aliases[comparisonKey(parts[index])] : "本地资源";
    resource.subcategory =
      index >= 0
        ? parts[index] !== resource.category
          ? parts[index]
          : index + 1 < parts.length - 1
            ? parts[index + 1]
            : ""
        : "";
    return resource;
  });
}

export class Catalog extends EventTarget {
  resources = [];
  urls = new Map();
  epoch = 0;
  constructor(sources, archives) {
    super();
    this.sources = sources;
    this.archives = archives;
  }
  rebuild() {
    this.epoch++;
    const previous = new Map(
      this.resources.map((resource) => [resource.id, resource]),
    );
    this.resources = createResources(this.sources.files()).map((resource) => {
      const old = previous.get(resource.id);
      return old &&
        old.size === resource.size &&
        old.modified === resource.modified
        ? old
        : resource;
    });
    this.dispatchEvent(new Event("change"));
  }
  async expand(resource, full = false) {
    resource.references = [
      ...new Map(
        [
          ...this.sources.files(),
          ...this.resources
            .filter((item) => item.id !== resource.id)
            .flatMap((item) => item.entries),
          ...resource.entries,
        ].map((entry) => [entry.id, entry]),
      ).values(),
    ];
    const field = full ? "fullPromise" : "listPromise";
    if (resource[field]) return resource[field];
    resource[field] = (async () => {
      if (full) await this.expand(resource, false);
      const visited = (resource.visited ||= new Set());
      const walk = async (entry, depth) => {
        if (depth > 6) {
          resource.warnings.push("嵌套超过 6 层，请先解压此资源");
          return;
        }
        if (visited.has(entry.id)) return;
        if (!full && extension(entry.path) === ".unitypackage") return;
        try {
          const children = await this.archives.children(entry, resource.id);
          visited.add(entry.id);
          for (const child of children) {
            child.depth = depth + 1;
            if (!resource.entries.some((e) => e.id === child.id))
              resource.entries.push(child);
            if (child.kind === "archive") await walk(child, depth + 1);
          }
        } catch (error) {
          resource.warnings.push(`${entry.name}：${error.message}`);
          if (error.code === "PASSWORD_REQUIRED") {
            resource.locked = true;
            throw error;
          }
        }
      };
      for (const entry of [...resource.entries].filter(
        (e) => e.kind === "archive",
      ))
        await walk(entry, entry.depth || 0);
      resource.models = resource.entries.filter((e) => e.kind === "model");
      resource.textures = resource.entries.filter((e) => e.kind === "texture");
      resource.references = [
        ...new Map(
          [
            ...this.sources.files(),
            ...this.resources
              .filter((item) => item.id !== resource.id)
              .flatMap((item) => item.entries),
            ...resource.entries,
          ].map((entry) => [entry.id, entry]),
        ).values(),
      ];
      if (resource.models.length) resource.detectedKind = "model";
      else if (resource.textures.length) resource.detectedKind = "texture";
      resource.isWorld =
        resource.category === "世界" ||
        (resource.entries.some((e) => e.kind === "world") &&
          !resource.models.length);
      if (!resource.avatars.length)
        resource.avatars = detectAvatars(
          resource.entries.map((entry) => entry.path).join(" "),
        );
      if (!resource.avatars.length)
        for (const entry of resource.entries
          .filter(
            (e) =>
              /(?:readme|说明|対応|about)/i.test(e.name) && e.size < 100000,
          )
          .slice(0, 5)) {
          try {
            resource.avatars.push(
              ...detectAvatars(
                await (await entry.read()).slice(0, 32000).text(),
              ),
            );
          } catch {}
        }
      resource.avatars = [...new Set(resource.avatars)];
      return resource;
    })();
    try {
      return await resource[field];
    } catch (error) {
      resource[field] = null;
      throw error;
    }
  }
  async retry(resource, password, remember) {
    await this.archives.setPassword(resource.id, password, remember);
    resource.locked = false;
    resource.warnings = [];
    resource.listPromise = null;
    resource.fullPromise = null;
    return this.expand(resource, true);
  }
  async url(entry) {
    if (!this.urls.has(entry.id))
      this.urls.set(
        entry.id,
        entry
          .read()
          .then((blob) => URL.createObjectURL(blob))
          .catch((error) => {
            this.urls.delete(entry.id);
            throw error;
          }),
      );
    return this.urls.get(entry.id);
  }
  async removeSource(id) {
    for (const [key, promise] of this.urls)
      if (key.startsWith(id + ":")) {
        URL.revokeObjectURL(await promise.catch(() => ""));
        this.urls.delete(key);
      }
    this.archives.forget(id);
    await this.sources.remove(id);
  }
  chooseModel(resource) {
    const models = resource.entries.filter((entry) => entry.kind === "model");
    return [...models].sort(
      (a, b) =>
        modelScore(b, resource.name) - modelScore(a, resource.name) ||
        b.path.localeCompare(a.path, undefined, { numeric: true }),
    )[0];
  }
  compatibleModels(resource) {
    if (!resource.avatars.length) return [];
    return this.resources.filter(
      (other) =>
        other.id !== resource.id &&
        (other.kind === "model" ||
          other.detectedKind === "model" ||
          (other.kind === "archive" &&
            /角色模型|avatars?|(?:^|\/)models?\//i.test(other.path))) &&
        other.avatars.some((name) => resource.avatars.includes(name)),
    );
  }
}

function modelScore(entry, title) {
  const name = comparisonKey(stem(entry.path)),
    target = comparisonKey(title);
  return (
    entry.size / 1e6 +
    (name === target ? 2000 : name.includes(target) ? 1000 : 0) -
    (/sample|demo|accessor|only|mobile/i.test(entry.path) ? 300 : 0)
  );
}
