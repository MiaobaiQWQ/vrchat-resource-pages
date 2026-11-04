# 拾间 · 本地资源库

面向 Cloudflare Pages 的纯静态资源浏览器。目录与文件由每位访问者在自己的浏览器中选择，站点不提供上传、共享或读取其他用户资源的接口。

## 开发

需要 Node.js 24 或更新的兼容版本。

```sh
npm ci
npm run dev
```

## 检查与构建

```sh
npm test
npm run build
```

## Cloudflare Pages

Git 集成：框架预设选择 Vite，构建命令 `npm run build`，产物目录 `dist`，Node.js 版本设置为 24。只发布构建产物，不发布本地资源目录。

直接上传：登录自己的 Cloudflare 账号后执行：

```sh
npx wrangler login
npm run deploy
```

项目名称在 `wrangler.jsonc` 与 `package.json` 的 deploy 脚本中设置。发布地址和 localhost 的浏览器存储相互独立，首次访问新域名时需要重新添加目录。

