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

直接上传：登录自己的 Cloudflare 账号后执行：

```sh
npx wrangler login
npm run deploy
```

项目名称与产物目录只在 `wrangler.jsonc` 中设置（`npm run deploy` 直接沿用配置），换账号或改项目名只改这一处。构建产物使用相对路径，部署在根路径、子目录或 GitHub Pages 项目页下都能直接打开。

发布地址和 localhost 的浏览器存储相互独立，首次访问新域名时需要重新添加目录。

只交付构建包时，提交代码后执行 `npm run release`。`release/pages-deploy.zip` 可解压后用于 Pages Direct Upload；`pages-source.zip` 为源码，`pages-history.bundle` 保留 Git 提交历史。本项目不需要 Pages Functions、数据库或存储桶。

## 浏览与分类

左侧按目录中的明确分类名称识别角色模型、衣服、配饰等；找不到分类标记时显示“本地资源”。内容类型筛选独立区分模型、贴图、压缩包、文档等，不会移动原文件。

同一资源目录里的封面、模型包、材质包与说明合为一项；多个本地来源互不串组。裸模型可关联同来源的相对路径与唯一同名引用，存在歧义时报告原因。

资源列表优先读取已有图片封面，不在后台启动模型渲染。点击资源后自动选择模型、解析材质引用并加载贴图；可以切换模型、替换指定材质贴图，或选择同系列随机配色。贴图也能单独展示。

## 格式与限制

- 模型：FBX、GLB、glTF、VRM、OBJ、STL、PLY、Collada；支持 glTF 的 Draco、Meshopt 和 KTX2 解码。特殊扩展与自定义着色器不保证与 Unity 完全一致。
- 图像：浏览器原生图像及 PSD、TGA、TIFF、DDS、EXR、HDR、KTX2。PSD 需要已保存的合成图；不支持所有颜色模式与 Photoshop 特效。
- 容器：ZIP、Unitypackage、TAR、gzip、7z、RAR；递归嵌套最多 6 层。ZIP 密码按资源设置，可选仅在本浏览器保存。大 Unity 容器使用流式索引与按需提取，容器及展开数据上限 2 GB；普通单资源、RAR / 7z 及模型解码上限 512 MB。
- Unity：可读材质、预制体、动画与控制器元数据，并调整模型内的 BlendShape；不执行包内脚本、插件和世界。只有未提供绑定关系的同名部件材质会使用带提示的推断匹配。
- 媒体与文档：音视频由浏览器解码；文本只读，过大文本限制展示前 2 MB。

兼容性说明只描述已实现的读取路径，不代表所有导出器、包内容、媒体编码或设备都经过验证。实测样本与限制写在 `npm test` 覆盖的用例里；此版本未提供 Unity 一键导入插件。

