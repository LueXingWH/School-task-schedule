# Microsoft Edge 安装、升级与迁移

校事笺 1.6.0 已在 Windows Microsoft Edge **156.0.4314.58** 实际加载验证。使用本机安装的 Edge，测试没有用 Chromium 或 Chrome 代替。核心处理仍在本地，无需模型 API、密钥、Python 或单独部署的服务器。

## 第一次安装

推荐双击 `xiaoshijian-1.6.0-setup.exe`，助手自动放置文件、创建入口，并打开新 Edge 窗口。点“复制网址”粘贴到地址栏回车进入扩展管理页；打开左下角的“开发人员模式”开关，点“加载解压缩的扩展”后用“复制扩展路径”在文件夹窗口按 Ctrl+V 粘贴。首次仍在 Edge 确认加载，随后默认设置和欢迎页自动就绪，见 `install-assistant.md`。从旧目录切换请先导出备份。

原 ZIP 手动方式仍保留：

1. 解压 `xiaoshijian-1.6.0-edge.zip` 到固定目录；完整交付包则使用其中的 `extension` 文件夹。
2. Edge 地址栏输入 `edge://extensions`。
3. 开启“开发人员模式”，点击“加载解压缩的扩展”（Load unpacked）。
4. 选择包含 `manifest.json` 的文件夹。不要选择 ZIP 本身或源码目录。
5. 从工具栏的扩展菜单找到“校事笺”，显示到工具栏；点击图标打开工作台。

尚未上架 Microsoft Edge Add-ons，无需安装 Chrome。普通使用不需要运行命令。请保留加载的文件夹，不要随意改名、移动或删除。

## 从 Chrome 迁移

1. 在 Chrome 的校事笺工作台打开设置，导出完整备份 ZIP。
2. 在 Edge 安装校事笺，进入设置，选择该备份。
3. 校验完成后点击“确认合并恢复”。通知、原文、日期、材料勾选、个人任务、处理记录和原文件一起迁移。

Chrome 和 Edge 的数据库分别位于各自的浏览器配置中，不会自动同步。恢复按新 ID 副本合并，已有数据不覆盖；重复恢复会产生副本。显示偏好留在各自浏览器中。

## 更新已安装的 Edge 版本

先导出备份，再将新版扩展文件放回原来加载的目录，在 `edge://extensions` 中对校事笺点击“重新加载”。保持原目录和扩展 ID，可继续使用原来的数据。若改用新目录导致扩展 ID 改变，请用备份恢复。

更新后刷新已打开的网页，再点击工具栏采集。浏览器内部页、扩展管理页等受保护页面不能读取，请用普通网页或粘贴文字/截图。

## 已验证与边界

- Edge 中实际验证了文字、工具栏主动网页采集、重复来源和受限页提示。
- 断网验证了真实中文/英文 OCR、图片上传与 Ctrl+V、文本/扫描/混合 PDF、DOCX 段落表格、本地 Worker/WASM 与 CSP。
- 验证了跨页面保存、材料/任务、候选及人工修改保护、取消和中断继续、完整备份恢复、新配置安装、整个浏览器重启后保留。
- Chrome 导出的备份在 Edge 恢复，并核对原文件 SHA-256。详细结果见 `acceptance.md` 和交付包 `evidence/edge`。
- 本轮实测 Edge 156 与 Chrome 156；更旧版本不作为已验证支持。Linux、macOS、移动端 Edge、企业策略禁止扩展的环境不在本轮验证范围。

安装方式参考微软官方的[本地加载扩展说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)。共享 MV3/API 的选择参考[将 Chrome 扩展移植到 Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension)，最终支持结论以真实测试为依据。
