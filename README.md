# VRChat 本地资源库

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

仓库里**不要放 Wrangler 配置文件**（`wrangler.jsonc` / `wrangler.toml`）：Pages 一旦在仓库里找到它，就把它当作唯一配置来源，仪表盘的构建命令被禁用，而 Pages 的 Wrangler 配置又没有"构建命令"字段，构建日志会变成 `No build command specified. Skipping build step.` → `Output directory "dist" not found`。所以本项目把它删掉了，构建参数只放在仪表盘。

**Deploy command 必须留空**（部分新建项目会预填 `npx wrangler deploy`，那是 Workers 的命令，会在构建成功后报 `Missing entry-point to Worker script or to assets directory`，日志里还会出现 `you have run wrangler deploy on a Pages project`）。Pages 会在构建完成后自行上传 `dist`，不需要再跑部署命令；确实要填就填 `npx wrangler pages deploy dist`。

直接上传（不经过 Git 集成）：登录自己的 Cloudflare 账号后执行：

```sh
npx wrangler login
npm run deploy
```

`npm run deploy` 里的项目名 `vrchat-resource-pages` 是唯一的写死项（Pages Direct Upload 必须显式指定）；改项目名时同时改 `package.json` 那一行。构建产物使用相对路径，部署在根路径、子目录或 GitHub Pages 项目页下都能直接打开。

发布地址和 localhost 的浏览器存储相互独立，首次访问新域名时需要重新添加目录。

只交付构建包时，提交代码后执行 `npm run release`。`release/pages-deploy.zip` 可解压后用于 Pages Direct Upload；`pages-source.zip` 为源码，`pages-history.bundle` 保留 Git 提交历史。本项目不需要 Pages Functions、数据库或存储桶。

## 浏览与分类

左侧按目录中的明确分类名称识别角色模型、衣服、配饰等；找不到分类标记时显示“本地资源”。内容类型筛选独立区分模型、贴图、压缩包、文档等，不会移动原文件。

同一资源目录里的封面、模型包、材质包与说明合为一项；多个本地来源互不串组。裸模型可关联同来源的相对路径与唯一同名引用，存在歧义时报告原因。

资源列表优先读取已有图片封面，不在后台启动模型渲染。点击资源后自动选择模型、解析材质引用并加载贴图；可以切换模型、替换指定材质贴图，或选择同系列随机配色。贴图也能单独展示。

拖入即添加：把文件夹、模型、贴图或压缩包拖到窗口**任意位置**都算数，系统会自动分辨是目录还是散装文件（Chromium 直接用目录句柄，其他浏览器按目录条目递归读取）。

## 格式与限制

- 模型：FBX、GLB、glTF、VRM、OBJ、STL、PLY、Collada、3MF、3DS、AMF、VTK/VTP、VRML 2.0（WRL）。OBJ 读取 `mtllib` 指定的本地 MTL，贴图按 MTL 所在目录解析相对路径，支持空格与中文；缺失或重名引用给出提示。支持 glTF 的 Draco、Meshopt 和 KTX2 解码。新增模型加载器按需下载。VTK 限 POLYDATA；3MF 扩展、VRML 场景行为和特殊着色器不保证完整支持。Blend、PMX、PMD 等尚不能直接预览。
- 图像：浏览器原生图像及 PSD、PSB、TGA、TIFF、DDS、EXR、HDR、KTX2、KTX、PVR。PSD/PSB 需要已保存的合成图，上限 6400 万像素；不支持所有颜色模式与 Photoshop 特效。KTX 当前读取二维压缩纹理，PVR 当前读取 PVRTC；压缩编码依赖显卡与浏览器，不支持时会显示转换格式提示。
- 容器：ZIP、Unitypackage、TAR、gzip、7z、RAR、BZIP2（BZ2/TBZ/TBZ2）、XZ（XZ/TXZ），包括 TAR.BZ2 与 TAR.XZ；递归嵌套最多 6 层。ZIP 密码按资源设置，可选仅在本浏览器保存。大 Unity 容器使用流式索引与按需提取，容器及展开数据上限 2 GB；普通单资源、7z/RAR/BZIP2/XZ 容器及模型解码上限 512 MB。
- Unity：可读材质、预制体、动画与控制器元数据，并调整模型内的 BlendShape；不执行包内脚本、插件和世界。只有未提供绑定关系的同名部件材质会使用带提示的推断匹配。
- 媒体与文档：音视频由浏览器解码；文本只读，过大文本限制展示前 2 MB。

兼容性说明只描述已实现的读取路径，不代表所有导出器、包内容、媒体编码或设备都经过验证。实测样本与限制写在 `npm test` 覆盖的用例里；此版本未提供 Unity 一键导入插件。


