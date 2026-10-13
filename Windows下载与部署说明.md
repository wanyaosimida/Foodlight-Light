# 食光 APP：Windows 10/11 轻量迁移包

本开源包保留可编辑的前后端源码、编译好的网页和应用素材。私人账号、数据库、上传图片和已生成媒体未包含；首次启动后端时自动创建空 SQLite 数据库，请在页面注册自己的账号。Qwen、SD-Turbo、Node.js、Python、Ollama、图片推理引擎、node_modules 和离线依赖 ZIP 均不在包内，改为在新电脑下载。

以下说明仅适用于 Windows 10/11 的 Intel/AMD 64 位电脑。Ollama 当前 Windows 文档要求 Windows 10 22H2 或更新版本。下载链接于 2026-10-09 核对，固定版本与原项目保持一致。

这能减少迁移文件的磁盘占用与传输体积。模型真正运行时仍会使用内存和显存；需要降低运行占用时，可先使用“仅启动基础功能.cmd”。

## 1. 解压项目

将轻量 ZIP 完整解压到可写的短路径，例如 `D:\Foodlight\`。下文把其中的 `Foodlight-Light` 文件夹称为“项目根目录”。不要直接在压缩软件中运行。

项目已包含网页成品，不需要安装前端开发依赖即可运行现有网页。数据库是单个 SQLite 文件，无需安装 MySQL、PostgreSQL、Supabase 或 Docker。

## 2. 下载地址与放置位置

全部选择 Windows x64 / amd64，不要选择 ARM64 或 32 位版本。

| 资源 | 下载链接 | 解压或保存到项目根目录下 |
| --- | --- | --- |
| Node.js 24.18.0 | [官方 Windows x64 ZIP](https://nodejs.org/download/release/v24.18.0/node-v24.18.0-win-x64.zip) | `runtime\node\` |
| Python 3.11.9 | [官方 Windows x64 嵌入式 ZIP](https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip) | `runtime\python\` |
| Ollama 0.34.2 | [官方 Windows x64 ZIP](https://github.com/ollama/ollama/releases/download/v0.34.2/ollama-windows-amd64.zip) | `local-models\ollama\` |
| Qwen3-VL 4B Instruct | [官方模型页面](https://ollama.com/library/qwen3-vl:4b-instruct) | 运行“下载Qwen模型.cmd”保存到 `local-models\models\` |
| 图片推理引擎 | [stable-diffusion.cpp Windows Vulkan x64 ZIP](https://github.com/leejet/stable-diffusion.cpp/releases/download/master-890-74988b2/sd-master-74988b2-bin-win-vulkan-x64.zip) | `local-app\local-models\image-runtime\bin\` |
| SD-Turbo 图片模型 | [Stability AI 官方单文件下载](https://huggingface.co/stabilityai/sd-turbo/resolve/b261bac6fd2cf515557d5d0707481eafa0485ec2/sd_turbo.safetensors?download=true) | `local-app\local-models\image-runtime\sd_turbo.safetensors` |

Node ZIP 有一个 `node-v24.18.0-win-x64` 外层目录。请把该目录里面的全部文件复制到 `runtime\node\`，确保 `runtime\node\node.exe` 直接存在，同时保留 `node_modules\npm`。Python ZIP 的全部文件直接解压到 `runtime\python\`，确保 `runtime\python\python.exe` 直接存在；保留 `python311.zip`、DLL 和 `_pth` 等文件。

Ollama ZIP 的全部内容放到 `local-models\ollama\`，确保 `local-models\ollama\ollama.exe` 存在，`lib` 等子目录也要保留。这里使用 ZIP 便携版，无需安装会自动后台运行的 OllamaSetup.exe，也无需修改系统 PATH。若以前安装过 Ollama，请先从系统托盘退出它，避免占用 11434 端口。

图片引擎的 ZIP 必须完整解压，确保 `local-app\local-models\image-runtime\bin\sd-cli.exe` 和同一压缩包的 DLL 都存在。不要换用最新版本的引擎：不同版本命令行参数可能变化，这里固定使用已验证的 `74988b2` 构建。

SD-Turbo 只需下载一个 `sd_turbo.safetensors` 文件，大小为 5,214,561,328 字节（网页显示约 5.21 GB）。不要下载整个 Hugging Face 仓库，也不要下载 SDXL-Turbo 或单独的 unet 权重。文件名不要变成 `.safetensors.txt`。

Qwen 约 3.3 GB，同时负责文字和图片识别，不需要再下载第二个视觉模型。它不能替代 SD-Turbo 的图片生成功能。Python 嵌入式包约 10.7 MB，图片引擎约 32 MB，Ollama ZIP 约 1.46 GB；下载后解压还需要额外空间。

若 Hugging Face 不可访问，可使用 [ModelScope 同名模型文件](https://modelscope.cn/models/AI-ModelScope/sd-turbo/resolve/master/sd_turbo.safetensors)。这是第三方镜像；下载后应核对 SHA256，避免下载到网页或不完整文件：

```powershell
Get-FileHash -LiteralPath '.\local-app\local-models\image-runtime\sd_turbo.safetensors' -Algorithm SHA256
```

正确结果为：`3f067a1b943cf162f2b8f8588f6cf5824bd5b4c7d1d88d87164b9ca123616549`。

以上链接、SHA256 和位置也保存在 `下载资源.json`。Node 校验来源：[官方 SHA256 清单](https://nodejs.org/download/release/v24.18.0/SHASUMS256.txt)；Python 来源：[3.11.9 官方发布页](https://www.python.org/downloads/release/python-3119/)；Ollama 来源：[0.34.2 发布页](https://github.com/ollama/ollama/releases/tag/v0.34.2)与 [Windows 文档](https://docs.ollama.com/windows)；图片引擎来源：[固定版本发布页](https://github.com/leejet/stable-diffusion.cpp/releases/tag/master-890-74988b2)。

## 3. 下载 Qwen

先完成 Node.js 与 Ollama 的下载和放置，然后双击项目根目录的 `下载Qwen模型.cmd`，保持窗口打开，等待出现“Qwen 下载完成”。脚本只在运行时联网下载模型，轻量 ZIP 中没有模型文件。网络中断后重新运行可续传。

该脚本会临时启动本项目的 Ollama，执行 `ollama pull qwen3-vl:4b-instruct`，并将 `OLLAMA_MODELS` 设置为本项目的 `local-models\models`。下载结束后停止自己启动的服务。这样不会把模型误下载到用户目录而导致 APP 找不到。

无需 Ollama 登录或云端 API Key。不要改成带 `-cloud` 的模型。若 11434 被占用，先退出以前安装的 Ollama或停止正在运行的本项目，再下载。

## 4. 检查并启动

全部下载完成后运行 `检查运行环境.cmd`，确认 Python、Ollama、Qwen、SD-Turbo、图片引擎和网页路径均已找到。开源版首次启动前尚无数据库，环境检查可能提示缺少数据库；启动后端会自动建库。该检查用于发现缺文件；真实推理与驱动兼容性以启动和实际请求为准。

双击 `启动项目.cmd`，浏览器会打开 `http://localhost:19006/home`。保持启动窗口打开。首次使用请在登录页面切换到注册，创建自己的本地账号。开源版没有预设账号或历史记录。

退出时运行 `停止项目.cmd`，或在启动窗口按 Ctrl+C。启动器只停止自己启动的进程；不会关闭原来正在运行的另一份项目。

如果暂时只下载了 Node.js，可双击 `仅启动基础功能.cmd`：登录、用户资料、饮食记录、体重记录、统计、社区和食谱的普通数据管理可运行；AI 图片识别、生成食谱、生图与音效在基础模式中未启用。之后停止基础模式，补齐模型，再运行完整启动脚本。

## 5. 后续编程

前端源码在 `local-app\src\`，后端在 `local-app\local-server\`。不用重建前端也能直接编辑后端后重启。

要编辑前端，先停止运行模式，双击 `安装开发依赖.cmd`。脚本通过 Node ZIP 自带的 npm 联网安装 pnpm 11.19.0，再按 `pnpm-lock.yaml` 执行 `pnpm install --frozen-lockfile`。工具保存在项目的 `tools\`，开发依赖在 `local-app\node_modules\`；这些环境均没有预装到轻量 ZIP 中。首次安装依赖需要网络并可能下载数百 MB。

依赖安装成功后双击 `开发模式.cmd`，可使用 Expo 热更新。开发模式目前使用完整模型启动流程，因此需要先完成第 2、3 步。停止开发模式请在其窗口按 Ctrl+C。

前端修改完成后，停止开发模式，双击 `重新构建网页.cmd`；构建成功后再运行 `启动项目.cmd` 或 `仅启动基础功能.cmd` 使用新的网页。安装开发依赖失败时请保留错误文字，检查网络后重试，不要删除数据库。

## 6. 数据、备份与故障处理

- 数据库：`local-app\local-server\data\foodlight.sqlite`。首次启动时自动创建，之后保存自己的账号与业务数据。
- 图片：`local-app\local-server\data\images\`；已生成媒体：`local-app\local-server\data\generated-media\`。
- 双击 `备份数据库.cmd` 生成一致性 SQLite 快照。完整备份还要保留图片、已生成媒体。
- `检查完整性.cmd` 校验本开源包发布时的源码、网页和文档；后来下载的模型与环境不在该清单内。使用后的数据库或源码修改会使交付校验值变化，这是正常现象。
- “缺少文件”：检查是否多套了一层解压目录。`node.exe`、`python.exe`、`ollama.exe`、`sd-cli.exe` 必须出现在第 2 步列出的精确位置。
- “端口被占用”：先关闭原项目或系统 Ollama。默认端口为 19006、54321、54322、11434。
- 普通页面正常但图片生成失败：检查 SD-Turbo 文件大小、图片引擎全部 DLL、显卡驱动。可在该 `bin` 目录运行 `sd-cli.exe --list-devices` 查看设备。引擎自动选择 Vulkan 显卡，推理失败时尝试 CPU。
- 不需要安装 PyTorch、CUDA Toolkit、Diffusers 等大型 Python 库；本版本使用 stable-diffusion.cpp 和 Python 标准库。显卡加速仍需要显卡官方驱动。

普通功能只需较少内存；完整 AI 建议 32 GB 内存和 8 GB 或以上显存。CPU 推理更慢，复杂请求最多等待 15 分钟。按需启动基础模式可以减少运行时模型占用。完成全部资源下载、解压及开发依赖安装，建议至少预留 25 GB 磁盘空间。

原电脑已验证文字、视觉、图片生成和音效，本次另外验证轻量包的基础启动及联网依赖恢复。目标电脑的模型运行速度、旧处理器支持情况和驱动仍以实际运行结果为准。

开源版不包含原云存储数据或私人图片。模型许可和程序许可证随下载资源提供，SD-Turbo 许可说明同时保留在源码的 `local-server\licenses\` 中。
