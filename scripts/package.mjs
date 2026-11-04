import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { zipSync } from "fflate";

const root = resolve(import.meta.dirname, "..");
const status = execFileSync("git", ["status", "--porcelain"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (status) throw new Error("请先提交当前更改，再生成与 Git 提交一致的交付包");
const output = join(root, "release");
await mkdir(output, { recursive: true });
const files = {};
async function collect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) await collect(target);
    else {
      const content = await readFile(target);
      if (content.byteLength > 25 * 1024 ** 2)
        throw new Error("构建文件超过 Pages 单文件限制");
      files[relative(join(root, "dist"), target).replaceAll("\\", "/")] =
        content;
    }
  }
}
await collect(join(root, "dist"));
if (!files["index.html"]) throw new Error("构建目录缺少 index.html");
const deployment = join(output, "pages-deploy.zip"),
  source = join(output, "pages-source.zip"),
  history = join(output, "pages-history.bundle");
await writeFile(deployment, zipSync(files, { level: 6 }));
execFileSync("git", ["archive", "--format=zip", "-o", source, "HEAD"], {
  cwd: root,
});
execFileSync("git", ["bundle", "create", history, "--all"], { cwd: root });
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
await writeFile(
  join(output, "交付说明.txt"),
  `当前版本：${commit}\n\npages-deploy.zip：静态部署包，解压后根目录含 index.html，可用于 Cloudflare Pages Direct Upload。\npages-source.zip：源码，解压后 npm ci、npm run build。\npages-history.bundle：完整 Git 提交历史，可执行 git clone pages-history.bundle local-resource-pages。\n\nCloudflare Pages 构建设置：Build command 填 npm run build，Build output directory 填 dist，Deploy command 留空（预填 npx wrangler deploy 是 Workers 命令，会在构建成功后报 Missing entry-point）。\n\n本次仅交付，未进行线上发布。构建命令 npm run build，输出目录 dist。\n用户本地资源、解压密码、测试样本与浏览器缓存均不包含在交付包中。\n`,
  "utf8",
);
console.log(
  JSON.stringify(
    {
      commit,
      staticFiles: Object.keys(files).length,
      deployment,
      source,
      history,
    },
    null,
    2,
  ),
);
