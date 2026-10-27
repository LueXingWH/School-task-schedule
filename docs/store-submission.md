# Edge 商店提交准备（未发布）

普通用户点击“获取 / 添加扩展”的分发渠道是 Microsoft Edge Add-ons。这个项目尚未上架，下面仅为可审阅的提交材料，不代表已经提交或通过审核。原需求未授权公开发布，本轮没有使用用户账号提交。

## 已准备的包与描述

上传包：`release/xiaoshijian-1.2.0-edge.zip`，根目录含真实 MV3 manifest 与全部本地 OCR/PDF/DOCX 资源。安装助手 EXE 不上传扩展商店。

名称：校事笺

简短描述：收好校园通知、截图与附件，核对截止日，安排任务，逐项准备材料。

详细描述：

校事笺帮助学生将群文字、主动打开的校园网页、截图、PDF 与现代 DOCX 整理到本机工作台。原始输入先保存，规则候选附依据，用户随时核对和修改。按截止日查看通知，用今日任务安排准备日期，逐项勾选材料，并通过完整备份保留原文件和状态。

截图用随包提供的 Tesseract 简中/英文数据在本地识别；PDF 抽取正文和页码，扫描页可选择本地 OCR；DOCX 保留段落与表格行。产品不调用大语言模型，不需要账号、模型密钥、Python 或本地服务器。首次加载即应用默认设置并打开工作台。

本地 OCR 和规则可能识别不准，请对照原通知核对关键日期与材料。不会接管微信/QQ，也不会绕过网页登录限制。无需复杂海报等普遍准确率的承诺。

## 权限及远程代码说明

- `activeTab`：仅在用户主动点击工具栏后临时访问当前网页。
- `scripting`：执行可见正文/选区采集，排除表单等内容。
- `storage`：保存少量显示/排序设置；通知、原文与附件保存在扩展自己的 IndexedDB。
- 本地 Worker、WASM、语言数据随包提供；`wasm-unsafe-eval` 仅用于本地 WASM。没有远程脚本、云 OCR 或运行时 CDN 下载。

## 隐私与审核测试说明

隐私正文见 `privacy-policy.md`。提交前需将该正文托管到所有者认可的公开 URL，在 Partner Center 填写真实支持联系方式、发布者身份、适用市场和语言。不要填虚构邮箱或把本地文件路径当作公开隐私 URL。

审核可直接加载扩展：首次出现已就绪欢迎页；点击导入，粘贴通知或使用交付源码中的非敏感 fixtures 测试真实 OCR、PDF/DOCX；核对日期和材料；设置页导出完整备份。核心可以断网运行，没有登录账号或测试密钥要求。

截图可选：交付包 `evidence/edge/dashboard.png`、`ocr-result.png`，均来自实际浏览器与测试数据。上传前按商店当时的尺寸要求重新导出，不能假定当前长截图直接符合商店要求。

## 仍需所有者完成的外部步骤

1. 登录自己的 Microsoft Edge 开发者账号，核对账号身份与发布协议。
2. 确认公开隐私 URL、真实支持联系信息、展示名称和商店截图。
3. 授权提交并等待商店审核，获批后使用真实商店链接分发。

本地安装助手负责减少解压、目录和配置步骤；首次仍保留浏览器确认。它不写强制安装策略、不修改浏览器配置文件，也不开放调试端口来代替商店安装。

依据：[微软商店发布流程](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)、[本地扩展安装](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)、[其他分发方式](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/alternate-distribution-options)。
