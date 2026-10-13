# 私人完整迁移包说明

> 本文档描述 `build-portable.mjs` 生成的完整私人迁移包。GitHub 开源仓库没有用户数据库、账号文件、上传图片、运行环境和模型；开源部署请优先阅读根目录 `README.md` 和 `Windows下载与部署说明.md`。

# 食光 CalorieAI — Windows 离线迁移包

适用于 Windows 10/11 64 位（Intel/AMD x64）。本包包含网页运行版、完整源码、SQLite 账号与业务数据、图片、Qwen 文字/视觉模型、SD-Turbo 图片模型、Ollama、Node.js、Python 和离线开发依赖。

## 在另一台电脑运行

1. 将整个 ZIP 复制到另一台电脑，完整解压到可写的短路径，例如 `D:\Foodlight\`。不要直接在压缩软件内运行。
2. 双击 `启动项目.cmd`。运行环境全部在包内，无需安装 Node.js、Python、Ollama、Docker 或下载模型。
3. 浏览器会打开 `http://localhost:19006/home`。首次使用需重新登录，本地账号密码见 `local-app/local-server/data/local-accounts.txt`。已有账号和历史数据保留。
4. 保留启动窗口。退出时运行 `停止项目.cmd`，或者在启动窗口按 Ctrl+C。启动器只停止自己启动的进程；如果其他项目占用 19006、54321、54322、11434，会明确报错，需要先关闭原项目。

建议使用最新的 Edge 或 Chrome。运行包解压约 11 GB；保存压缩包、解压目录和开发依赖后，建议预留至少 25 GB 磁盘空间。

## 电脑配置与模型速度

建议 32 GB 内存；普通页面和数据库对电脑要求较低。Qwen 可使用 CPU，支持的显卡会自动加速。图片服务自动检测 Vulkan 显卡并优先选择独立显卡，显卡推理失败时尝试 CPU。建议使用具有 8 GB 或更多显存的显卡并安装其官方驱动。CPU 模型推理会明显慢于显卡，图片和复杂 AI 请求最多等待 15 分钟；低内存或不支持的旧处理器可能无法完成模型推理。

此包针对 Windows x64，不包含 macOS、Linux 或 Windows ARM 原生运行程序。已在原电脑的独立迁移目录以及另一盘符验证运行，并完成包内离线依赖恢复、源码重新编译和真实模型推理；不同电脑的显卡驱动和性能仍需在目标电脑确认。

## 后续编程

源码位于 `local-app/src/`，后端位于 `local-app/local-server/`。双击 `开发模式.cmd`，第一次会从包内 ZIP 解压离线依赖并建立本电脑的目录链接，无需联网，也不要求开启 Windows 开发者模式。依赖中没有原电脑的绝对路径链接。

开发模式与运行模式使用同一份数据和端口，请先停止运行模式。开发模式使用 Expo 热更新；停止开发模式请在其启动窗口按 Ctrl+C。

前端修改完成后，停止开发模式并运行 `重新构建网页.cmd`，再运行 `启动项目.cmd` 使用更新后的网页。新增或更新第三方依赖时需要联网；包内 `runtime/node/npm.cmd` 可用于安装，已有代码的编辑和构建不需要联网。

## 数据、校验与备份

- 数据库：`local-app/local-server/data/foodlight.sqlite`，使用一致性 SQLite 快照创建并通过完整性校验；原浏览器临时登录会话已清除。
- 上传图片：`local-app/local-server/data/images/`。
- 已生成媒体：`local-app/local-server/data/generated-media/`。
- 文字/视觉模型：`local-models/models/`。
- 图片模型和引擎：`local-app/local-models/image-runtime/`。
- `PACKAGE-INFO.json` 记录版本、数据表数量和排除项；`PACKAGE-MANIFEST.json` 记录交付文件的 SHA256。

首次使用前可运行 `检查完整性.cmd` 检测复制损坏。该检查针对交付时的文件；使用后的数据库修改、重新构建网页等会改变原始校验值。运行 `备份数据库.cmd` 可生成数据库快照；完整备份还应保存图片、已生成媒体和账号文件。

没有打包缓存、原 APK/提取目录、重复下载压缩包、下载分片、旧 Python 虚拟环境、日志、历史备份、重复 CSV 和测试产物。源码测试和模型许可保留，便于维护。

模型和程序来源及许可证随包保留。图片模型：Powered by Stability AI，详见 `local-app/local-models/image-runtime/LICENSE.sd-turbo.md` 与 `NOTICE.txt`。Python 来自 https://www.python.org/downloads/release/python-3119/；Node.js 来自 https://nodejs.org/；Ollama 来源见 `local-app/local-server/AI-CONFIG.md`。

此前已知的原云存储空图片无法恢复；迁移包保留原业务数据并继续显示缺图占位，详情见 `local-app/local-server/data/storage-recovery-report.json`。
