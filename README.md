# 校事笺 1.5.0

本地校园通知管理扩展。把群消息、网页、截图、PDF 与 DOCX 收进工作台，核对截止日，安排个人任务，逐项准备材料。

1.5.0 新增本地 MCP 接入，让 agent 直接添加和查询日程。安装助手随包准备桥接，设置页可启用接入并复制配置，使用见 [MCP 指南](docs/mcp-guide.md)。保留标题/待办/时间自动提取、扫描 PDF OCR 和紧凑日程界面。

普通用户直接安装生产扩展，无需 Node、Python、单独部署的服务器、账号或模型 API 密钥。OCR 使用随包提供的中英文 Tesseract 识别数据，核心功能可断网运行。

## 安装

推荐直接双击 `release/xiaoshijian-1.5.0-setup.exe`，可点击“浏览…”选择安装位置或直接修改路径，然后点击“准备安装并打开浏览器”。助手自动放置资源、创建桌面入口并打开 Edge。点击“复制网址”后，在浏览器按 Ctrl+L、Ctrl+V、回车，开启开发人员模式、点击加载解压缩扩展；回到助手点“复制扩展加载目录”，在文件夹窗口粘贴并确认。加载后默认设置与欢迎页自动就绪。以后可从桌面一键打开。

详细步骤与迁移见 [安装助手指南](docs/install-assistant.md)。当前尚未上架商店，助手保留浏览器首次加载确认，不能称为无确认的静默安装。真正的商店“获取 / 添加”方式需要发布审核，已准备 [提交材料](docs/store-submission.md)。

仍可使用原 ZIP 方式：

1. 使用 Windows Microsoft Edge 或 Google Chrome，将 `release/xiaoshijian-1.5.0-edge.zip`（或 `-chrome.zip`）解压到固定文件夹，也可直接使用本项目 `dist`。本轮实测 Edge 156、Chrome 156。
2. Edge 地址栏输入 `edge://extensions`，开启“开发人员模式”；Chrome 输入 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的文件夹（本项目为 `dist`）。
4. 在工具栏“扩展程序”里固定“校事笺”，点击图标，打开工作台。

尚未上架商店，不能双击 ZIP 安装。请保留扩展文件夹，不要把它放在会自动清理的临时目录。升级前先导出备份。

Edge 安装与 Chrome 数据迁移见 [Edge 专用指南](docs/edge-guide.md)，日常操作见 [中文使用指南](docs/user-guide.md)，真实验收见 [验收记录](docs/acceptance.md)。Chrome 与 Edge 各自保存本地数据，可通过完整备份迁移。

## 开发与验证

使用 Windows、Node 24+ 和系统 .NET Framework C# 编译器，在本目录运行：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run build
npm.cmd run fixtures
npm.cmd run test:e2e
npm.cmd run test:matrix
$env:TEST_BROWSER='chrome'
npm.cmd run test:setup
$env:TEST_BROWSER='msedge'
npm.cmd run test:setup
npm.cmd run test:clean
npm.cmd run deliver
```

`build` 首次从固定 Git 提交下载 OCR 语言文件并核对 SHA-256；后续缓存于 `public/vendor`。依赖和资源下载只发生在开发构建期间。构建产物 `dist` 已包含 Worker、WASM、语言数据、PDF 字体/CMap/ICC 与许可。

`npm.cmd run dev` 只用于界面预览，不是产品运行方式；网页采集、生产 CSP 和离线解析以实际加载 `dist` 的 MV3 验收为准。

真实 Chrome / Edge 自动化使用独立配置文件和 CDP 的 `Extensions.loadUnpacked/triggerAction`，不会更改你的日常浏览器数据。`test:matrix` 依次在实际 Chrome 和 Edge 运行核心与 ZIP 安装测试；也可单独运行 `test:chrome` 或 `test:edge`。结果分别保存到 `test-results/chrome` 和 `test-results/edge`。Edge 的迁移验收使用 Chrome 测试生成的备份，因此首次请先运行完整 matrix。测试脚本不返回预设 OCR 或附件解析结果。

`npm.cmd run test:public:edge` 可额外在 Edge 验证公开校园通知页（此项需要该网站可访问）。`test:setup` 默认使用 Edge，也可通过 `TEST_BROWSER=chrome` 测试 Chrome；实际运行当前 EXE、检查文件/快捷方式、管理入口与剪贴板，验证默认配置和重复更新的数据保留。`deliver` 要求当前版本两个浏览器的业务验收和当前 EXE 在两个浏览器的按钮验收均通过后，生成安装助手 EXE、Edge/Chrome ZIP、源码 ZIP、完整交付 ZIP 和 SHA-256 清单。

## 目录

- `src/ui`：工作台、导入、通知详情、设置；`popup.tsx` / `background.ts`：工具栏与事件。
- `src/db.ts`：IndexedDB schema v2、事务、关联删除；`model.ts`：模型及限额。
- `src/rules` / `schedule.ts`：标题、时间、待办与材料候选、日期规则和任务排序。
- `src/parsers.ts` / `docx.worker.ts` / `jobs.ts`：真实解析器、本地 OCR、跨窗口串行任务及取消。
- `src/backup.ts` / `zip.ts`：完整 ZIP 备份、格式/关系/大小/校验检查、新 ID 副本合并恢复。
- `scripts`：离线资源、构建打包、清洁目录构建验证。
- `installer`：Windows 便捷安装助手源代码和无需管理员权限的应用清单。
- `docs`：需求、验收、指南、演示、PPT 内容及限制。

原始完整规格保留在根目录，优先于需求摘要。项目尚无公开发布、运营或推广数据；勿将测试样例当作用户使用成效。
