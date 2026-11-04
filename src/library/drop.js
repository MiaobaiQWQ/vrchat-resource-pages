// 拖入识别：优先用 File System Access 的 getAsFileSystemHandle（可直接拿到目录句柄），
// 浏览器不支持时退回 webkitGetAsEntry 递归读取目录——于是整页拖入、文件夹和散装文件都能自动分辨。
function readAll(entry) {
  const reader = entry.createReader();
  return new Promise((resolve, reject) => {
    const batch = [];
    const next = () =>
      reader.readEntries((items) => {
        if (!items.length) return resolve(batch);
        batch.push(...items);
        next();
      }, reject);
    next();
  });
}

const fileOf = (entry) =>
  new Promise((resolve, reject) => entry.file(resolve, reject));

// File 的 webkitRelativePath 是只读的，包一层可写的同名属性，交给 SourceManager 按“文件夹”来源处理。
function withRelativePath(file, path) {
  const wrapped = new File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
  Object.defineProperty(wrapped, "webkitRelativePath", { value: path });
  return wrapped;
}

async function walk(entry, prefix, output) {
  if (entry.isFile) {
    const file = await fileOf(entry);
    output.push(withRelativePath(file, prefix + entry.name));
    return;
  }
  if (!entry.isDirectory) return;
  for (const child of await readAll(entry))
    await walk(child, prefix + entry.name + "/", output);
}

export async function readDrop(dataTransfer) {
  const items = [...(dataTransfer?.items || [])].filter(
    (item) => item.kind === "file",
  );
  const directories = [],
    files = [],
    folders = [];
  for (const item of items) {
    let handle = null;
    try {
      handle = (await item.getAsFileSystemHandle?.()) || null;
    } catch {}
    if (handle?.kind === "directory") {
      directories.push(handle);
      continue;
    }
    if (handle?.kind === "file") {
      files.push(await handle.getFile());
      continue;
    }
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      const list = [];
      await walk(entry, "", list);
      if (list.length) folders.push({ root: entry.name, files: list });
      continue;
    }
    const file = item.getAsFile?.();
    if (file) files.push(file);
  }
  return { directories, files, folders };
}
