# 从这里开始

这份交付包包含可安装扩展、完整源码和实际测试证据。产品无需 Node、Python、单独部署的服务器、账号或模型 API 密钥。

最省步骤：使用单独提供的 `xiaoshijian-1.5.0-setup.exe`，无需先解压 ZIP。完整交付 ZIP 内也包含同名助手。

双击助手 → 点“复制网址”粘贴到浏览器地址栏回车，进入扩展管理页 → 打开开发人员模式（Edge 左下角 / Chrome 右上角）并点“加载解压缩的扩展” → 点“复制扩展路径”，在文件夹窗口按 Ctrl+V 粘贴并确认。加载后工作台与默认配置自动就绪；助手只在点复制按钮时写剪贴板。详细限制和已有数据迁移见 `source/docs/install-assistant.md`。

如果选择原 ZIP 手动方式：

1. 将整个 ZIP 解压到固定目录。
2. Edge 打开 `edge://extensions`，开启“开发人员模式”；Chrome 打开 `chrome://extensions`，开启“开发者模式”。本轮实测 Edge 156 / Chrome 154。
3. 点击“加载已解压的扩展程序”，选择本包 **extension** 文件夹（里面有 `manifest.json`）。
4. 固定工具栏“校事笺”图标，点击打开工作台。

不要把 `source` 文件夹当作扩展安装；`source` 是开发源码，需构建后才可加载。本包已提供构建好的 `extension`，普通使用无需构建。

- 使用指南：`source/docs/user-guide.md`
- 安装助手：`source/docs/install-assistant.md`
- 商店提交材料与隐私说明：`source/docs/store-submission.md`、`source/docs/privacy-policy.md`
- Edge 安装与 Chrome 数据迁移：`source/docs/edge-guide.md`
- 真实验收：`source/docs/acceptance.md`，原始日志和截图在 `evidence`
- 支持边界：`source/docs/known-limitations.md`
- 演示与 PPT 内容：`source/docs/demo.md`、`source/docs/ppt-outline.md`
- 第三方许可：`extension/THIRD-PARTY-NOTICES.md`、`extension/licenses`

Edge 与 Chrome 使用同一套经过实测的 MV3 产物。各自的数据库不自动同步，可用完整备份迁移。未上架商店，不能双击 ZIP 安装。保留扩展文件夹。卸载或升级前在设置页导出完整备份。候选日期和 OCR 请对照原通知核对。
