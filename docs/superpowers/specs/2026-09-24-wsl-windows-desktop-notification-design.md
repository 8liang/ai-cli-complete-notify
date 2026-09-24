# WSL 调用 Windows 桌面通知设计

## 目标

发布 `2.18.0`，让运行在 WSL 中的 CLI 和 Claude Code Hook 可以直接调用 Windows PowerShell，在宿主 Windows 桌面显示通知，不依赖外网、Webhook、MCP 或额外常驻服务。

## 范围

- Windows 与 macOS 现有桌面通知行为保持不变。
- WSL 新增 Windows toast/balloon 通知。
- 纯 Linux 继续不启用桌面通知。
- WSL 声音、Webhook、Telegram、邮件等现有通道保持不变。
- 不实现远程 Linux 到 Windows 的跨机器通知。

## 实现

复用 `src/notifiers/sound.js` 已有的 WSL 检测和 Windows PowerShell 定位逻辑，不增加依赖或后台服务。

`src/notifiers/desktop.js` 将桌面通知支持范围扩展为 Windows、macOS 和 WSL。在 WSL 中直接调用 Windows PowerShell 的现有 toast/balloon 脚本；不使用依赖临时脚本路径的自定义 WPF popup，避免 Linux 路径无法被 Windows PowerShell 直接读取。

`src/engine.js` 使用桌面通知模块提供的统一能力判断，避免入口允许 WSL 后又被通知器内部拒绝。

## 错误处理

- WSL Interop 或 Windows PowerShell 不可用时，desktop 通道返回明确失败结果。
- desktop 失败不阻断其他通知通道。
- 不静默回退到联网服务。

## 版本与文档

- 将应用版本从 `2.17.0` 更新为 `2.18.0`，同步 Node、Cargo 和 Tauri 版本文件。
- 五份 README 的当前版本和更新日志同步到 `2.18.0`。
- WSL 文档改为说明桌面通知和声音均通过 Windows PowerShell 工作。
- 保留历史 `2.17.0` 更新记录及 `home-v2.17.0.png` 截图文件名。

## 验证

- 新增最小回归测试，覆盖纯 Linux 仍拒绝桌面通知、WSL 被识别为受支持平台、WSL 使用 Windows PowerShell 路径。
- 运行完整 Node 测试、前端构建和 Rust `cargo check`。
- 当前 macOS 环境无法验证真实 WSL 弹窗；最终真实弹窗需在用户的 WSL/Windows 环境验收。
