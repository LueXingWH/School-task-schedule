# 校事笺 1.0.0

本地校园通知管理扩展。把群消息、网页、截图、PDF 与 DOCX 收进工作台，核对截止日，安排个人任务，逐项准备材料。

普通用户直接安装生产扩展，无需 Node、Python、服务器、账号或 API 密钥。OCR 使用随包提供的中英文 Tesseract 识别数据，核心功能可断网运行。

## 安装

1. 将 `release/xiaoshijian-1.0.0-chrome.zip` 解压到固定文件夹，或直接使用本项目 `dist`。
2. Chrome 地址栏输入 `chrome://extensions`，打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择包含 `manifest.json` 的文件夹（本项目为 `dist`）。
4. 在工具栏“扩展程序”里固定“校事笺”，点击图标，打开工作台。

尚未上架商店，不能双击 ZIP 安装。请保留扩展文件夹，不要把它放在会自动清理的临时目录。升级前先导出备份。

详细操作见 [中文使用指南](docs/user-guide.md)，真实验收见 [验收记录](docs/acceptance.md)。

## 开发与验证

使用 Node 24+，在本目录运行：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run build
npm.cmd run fixtures
npm.cmd run test:e2e
node tests/install.mjs
```

`build` 首次从固定 Git 提交下载 OCR 语言文件并核对 SHA-256；后续缓存于 `public/vendor`。依赖和资源下载只发生在开发构建期间。构建产物 `dist` 已包含 Worker、WASM、语言数据、PDF 字体/CMap/ICC 与许可。

`npm.cmd run dev` 只用于界面预览，不是产品运行方式；网页采集、生产 CSP 和离线解析以实际加载 `dist` 的 MV3 验收为准。

真实 Chrome 自动化使用独立配置文件和 CDP 的 `Extensions.loadUnpacked/triggerAction`，不会更改你的日常 Chrome 数据。测试所需 Chrome 安装在标准位置，测试文件生成于 `tests/fixtures`，结果在 `test-results`。测试脚本不返回预设 OCR 或附件解析结果。

## 目录

- `src/ui`：工作台、导入、通知详情、设置；`popup.tsx` / `background.ts`：工具栏与事件。
- `src/db.ts`：IndexedDB schema v1、事务、关联删除；`model.ts`：模型及限额。
- `src/rules` / `schedule.ts`：可解释候选、日期规则和任务排序。
- `src/parsers.ts` / `docx.worker.ts` / `jobs.ts`：真实解析器、本地 OCR、跨窗口串行任务及取消。
- `src/backup.ts` / `zip.ts`：完整 ZIP 备份、格式/关系/大小/校验检查、新 ID 副本合并恢复。
- `scripts`：离线资源、构建打包、清洁目录构建验证。
- `docs`：需求、验收、指南、演示、PPT 内容及限制。

原始完整规格保留在根目录，优先于需求摘要。项目尚无公开发布、运营或推广数据；勿将测试样例当作用户使用成效。
