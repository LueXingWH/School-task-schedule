# 用 MCP 让 agent 添加日程

适用版本：1.5.0，Windows Edge / Chrome。校事笺提供标准本地 stdio MCP 服务，包含 `add_schedule` 和 `list_schedules` 两个工具。

## 三步连接

1. 运行 `xiaoshijian-1.5.0-setup.exe`，在原安装位置更新，并按原步骤在浏览器确认加载 / 重新加载扩展。助手会把 MCP 桥接程序放到扩展的 `bridge` 目录，并为所选浏览器注册当前用户的原生通信入口。
2. 保持浏览器运行，打开校事笺 → 设置与备份 → **MCP 接入**，勾选“启用本地 MCP”。看到“已连接”后点击“生成 MCP 配置”，再点击“复制 MCP 配置”。
3. 把生成的配置加入你选择的本机 MCP 客户端并重新加载其 MCP 服务。生成的内容采用常见的 `mcpServers` 格式。不同客户端的位置和配置结构可能不同，按其要求填入相同的 `command`、`args`、`env` 三项，使用 stdio / 本地命令接入。校事笺不会自动修改其他应用的配置。

之后可以对 agent 说：“帮我在校事笺添加一条 2026 年 11 月 9 日下午 3 点的答辩准备，备注带上原型。”实际创建必须以用户给出的日期为准。日程保存后出现在个人任务中，当天会进入首页今日清单；备注和 agent 来源可在原文中回看。

配置中包含实际 EXE 路径、浏览器配置标识和连接口令。直接复制设置页生成的内容，无需自行猜路径或填写服务器地址。普通用户不需要 Node、Python 或额外启动终端。此服务由 MCP 客户端作为子进程启动，本地原生桥接由浏览器启动。

## 工具参数

`add_schedule`：

| 参数 | 要求 |
| --- | --- |
| `request_id` | 必填，1–128 个英文字母、数字或 `._:-`；每条新日程使用新 ID，重试必须使用原 ID 和原参数 |
| `title` | 必填，1–200 字符 |
| `date` | 必填，有效 `YYYY-MM-DD`；不接受“明天”等未转换文字 |
| `time` | 可选，24 小时制 `HH:MM`；未提供时不补零点 |
| `notes` | 可选，最多 4000 字符 |

日期与时刻按目标浏览器的本地时区解释。工具结果返回实际保存的任务 ID、通知 ID、时区及 `created`；`created: false` 表示请求已处理过，返回当前保存的任务，不覆盖人工修改和勾选。

`list_schedules`：可传 `date_from` / `date_to`（含首尾）、`include_done`（默认 false）、`limit`（默认 50，1–100）。查询返回个人任务，默认排除已完成/归档项；不会返回通知全文或附件。长备注仅返回前 500 字符并标记 `notes_truncated`。超过数量限制时返回 `has_more: true`，可缩小日期范围查询。

这两个工具不提供删除、批量清空、文件读取或浏览器控制。日程是个人计划，不会自动把时间设为通知主截止日。

## ZIP 安装

ZIP 中同样包含 `bridge/Xiaoshijian.Mcp.exe`。将扩展解压到固定目录并加载后，复制扩展管理页显示的 32 位扩展 ID，在 PowerShell 运行（替换实际目录和 ID）：

```powershell
& 'D:\校事笺\bridge\Xiaoshijian.Mcp.exe' --register --extension-id '替换为扩展管理页中的ID' --browser both
```

成功后回到设置启用或重新连接 MCP。`--browser` 可选 `edge`、`chrome` 或 `both`。注册只写当前用户的原生通信入口，无需管理员权限。更改扩展目录后需要重新注册；不同安装目录对应不同扩展 ID，同一浏览器使用最后注册的安装位置。

## 关闭、迁移与排错

- 工作台页面可以关闭，浏览器必须保持运行。浏览器关闭、扩展停用或接入关闭时，MCP 会返回连接错误，不会假装已经添加，也不会在稍后偷偷补写。
- 若连接断开，先确认浏览器和扩展正常运行，再在设置点“重新连接 MCP”。桥接未注册时先运行安装助手；ZIP 用户按上面的注册步骤处理。
- 关闭接入后重新启用会更换连接标识和口令，旧配置失效，需要重新复制配置。配置只交给你选择的本机客户端。
- 日程调用直接生效，客户端可自行提供工具调用确认。校事笺默认关闭 MCP，开启前会说明其可添加和查询日程。
- 请求超时可能已经落库，使用相同 `request_id` 和相同参数重试；同一客户端中，同 ID 不同内容会被拒绝。已经手动删除的日程不会被旧请求复活，如需新建请换 ID。“清除全部数据”同时清除请求记录。
- 任务、agent 来源和备注随完整备份保存，MCP 接入开关和连接口令不进入备份。恢复后仍能识别原请求身份；不同浏览器需要各自启用接入并生成配置。
- 更新已开启 MCP 的旧安装时，如 Windows 提示文件正在使用，先关闭浏览器和客户端的校事笺 MCP 服务再更新；原安装和浏览器数据会保留。

协议依据：[MCP stdio 传输](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[工具协议](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)、[Edge Native Messaging](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging)。
