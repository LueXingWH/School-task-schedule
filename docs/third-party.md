# 依赖与资源来源

确切版本见根目录 `package-lock.json`。所有依赖均在开发构建阶段安装，用户运行生产扩展不下载依赖。

| 用途 | 版本 | 主要许可 |
| --- | --- | --- |
| React / React DOM | 19.3.1 | MIT |
| Dexie | 4.4.7 | Apache-2.0 |
| Tesseract.js / core | 7.0.0 | Apache-2.0 |
| PDF.js / pdfjs-dist | 6.4.299 | Apache-2.0 |
| Mammoth | 1.13.0 | BSD-2-Clause |
| fflate | 0.8.3 | MIT |
| Zod | 4.6.7 | MIT |

传递依赖的版本、许可和声明由构建脚本写入 `dist/THIRD-PARTY-NOTICES.md`；许可证在 `dist/licenses/`，随生产 ZIP 分发。PDF 字体、CMap、ICC 和 WASM 保留发行包内容与其许可。部分 Node 可选依赖只在开发环境使用，不进入浏览器 JS。

OCR 简中/英文数据来自官方 [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)，固定提交 `87416418657359cb625c412a48b6e1d6d41c29bd`，Apache-2.0。文件以 gzip 包内分发，来源和压缩文件 SHA-256 锁定于 `scripts/ocr-resources.json`。启动 Worker 时明确指定本地 workerPath/corePath/langPath，关闭 Blob Worker URL 和语言缓存下载回退。

开发实现核对了官方资料和已安装源码/API：

- [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [MV3 CSP 与 WASM](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Tesseract API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md) / [本地资源路径](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)
- [PDF.js 示例](https://mozilla.github.io/pdf.js/examples/)
- [Mammoth](https://github.com/mwilliamson/mammoth.js)；文档树 transformDocument 用于保留表格行，生成 HTML 不注入页面。
- [Chrome CDP Extensions](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/)；用于全新测试配置真实安装和触发工具栏 action。
- [Microsoft Edge 扩展移植](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension) / [本地安装](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)；共享 MV3/API，支持范围经真实 Edge 单独验收。

本项目源码的对外授权由所有者决定；此交付不代表公开发布或自动授予第三方使用许可。
