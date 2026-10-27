# 从这里开始

这份交付包包含可安装扩展、完整源码和实际测试证据。产品无需 Node、Python、服务器、账号或 API 密钥。

1. 将整个 ZIP 解压到固定目录。
2. Chrome 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本包 **extension** 文件夹（里面有 `manifest.json`）。
4. 固定工具栏“校事笺”图标，点击打开工作台。

不要把 `source` 文件夹当作扩展安装；`source` 是开发源码，需构建后才可加载。本包已提供构建好的 `extension`，普通使用无需构建。

- 使用指南：`source/docs/user-guide.md`
- 真实验收：`source/docs/acceptance.md`，原始日志和截图在 `evidence`
- 支持边界：`source/docs/known-limitations.md`
- 演示与 PPT 内容：`source/docs/demo.md`、`source/docs/ppt-outline.md`
- 第三方许可：`extension/THIRD-PARTY-NOTICES.md`、`extension/licenses`

未上架商店，不能双击 ZIP 安装。保留扩展文件夹。卸载或升级前在设置页导出完整备份。候选日期和 OCR 请对照原通知核对。
