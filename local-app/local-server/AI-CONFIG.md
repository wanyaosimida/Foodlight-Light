# 本地 AI 配置

数据库、账户、饮食记录、社区和食谱管理不依赖 AI 模型。原项目的 13 个云函数接口已接入 `ai.mjs`，它们不会调用秒哒付费网关。AI 推理仍需要电脑上实际运行的模型服务；复制源码或创建 SQLite 文件不会复制模型。

未配置的功能返回 HTTP 503 和中文配置说明，不返回伪造的生成结果。已经恢复的原始 Supabase 源码保留作参考，其固定/随机兜底结果不会被本地适配器使用。

## 此项目的便携模型

项目使用 Ollama 0.34.2 和 `qwen3-vl:4b-instruct`。程序位于项目根目录 `local-models/ollama/ollama.exe`，模型放在 `local-models/models`，日志在 `local-models/logs`。程序 ZIP 下载量约 1.46GB，模型约 3.30GB；解压后的程序还需要额外磁盘空间。没有设置系统启动项或修改系统 PATH。

配置统一保存在 `local-server/ai-config.json`。文字与视觉使用同一个本地模型，开启结构化 JSON 输出，上下文为 8192 tokens，单请求并发，Ollama 云服务关闭。

本机为 RTX 5070 Ti Laptop 12GB 显卡。首次 CUDA 预热曾超过 180 秒，因此项目配置将 AI 超时设为 300 秒；预热后的完整测试中，文字请求约 0.2–8.4 秒，包装识别约 3.4 秒，实际耗时依输入和电脑负载变化。此聊天模型本身不提供图像生成、图像编辑、音效或联网营养检索能力，这些功能由各自配置的独立服务处理。

从 `local-app` 目录启动独立模型服务：

```powershell
node local-server/model-service.mjs
```

独立启动 API 时，先将模型配置加载到当前 PowerShell 进程：

```powershell
. .\local-server\ai-env.ps1
node local-server/server.mjs
```

`start-model.ps1` 是模型服务的 PowerShell 启动备用方案。Node 启动流程可导入 `model-service.mjs` 的 `getModelEnvironment()` 和 `startModelService()`，将返回的环境传给 API 进程。既有服务会复用，不会再启动第二个监听程序。

官方下载来源：[Ollama Windows 说明](https://docs.ollama.com/windows)、[Ollama 0.34.2 发布](https://github.com/ollama/ollama/releases/tag/v0.34.2)、[Qwen3-VL 4B Instruct 模型](https://ollama.com/library/qwen3-vl:4b-instruct)。ZIP 已按官方发布元数据校验 SHA256：`8f3fd071a2a2f9497b562f43502c77c2b701a99d1ee5dfda28da8c786373063b`。`download-ollama.mjs` 是本次下载所用的官方地址分段下载工具。

## 文本与图片识别

支持 OpenAI-compatible `POST /v1/chat/completions`，包括提供该接口的本地 Ollama/其他模型服务。适配器只依赖这个接口协议，并不依赖 OpenAI 云端。请使用已安装服务实际列出的模型名称；这里不自动下载或安装模型。

启动本地 API 服务前在 PowerShell 设置：

```powershell
$env:LOCAL_AI_BASE_URL = 'http://127.0.0.1:11434/v1'
$env:LOCAL_AI_MODEL = '替换为已安装的文本模型名称'
$env:LOCAL_AI_VISION_MODEL = '替换为已安装且支持图片的模型名称'
node local-server/server.mjs
```

必须从 `local-app` 目录运行。`LOCAL_AI_BASE_URL` 默认是上面的本机地址；模型名称没有默认值。文本模型不一定具有看图能力，所以必须单独设置 `LOCAL_AI_VISION_MODEL`。如果视觉模型在另一个服务上，设置 `LOCAL_AI_VISION_BASE_URL`。可选 `LOCAL_AI_API_KEY`、`LOCAL_AI_VISION_API_KEY` 只保存在服务端进程环境里，不应放入 `EXPO_PUBLIC_*` 或提交到仓库。

文本功能包括一日三餐方案、食材生成食谱、食物替代、冰箱清库、外卖建议、升糖科普、社区配文/快捷评论/内容审核。图片功能包括食物识别和包装解读。模型必须支持中文指令及完整 JSON 输出；格式不完整会明确报错。食物照片的营养结果属于估算，返回 `verified: false`，不会显示“已核验”。

响应超时默认 120 秒，可设置 `LOCAL_AI_TIMEOUT_MS`（1000–300000 毫秒）。应用开始请求前应先加载模型；首次加载很慢时可以增加超时。

## 图片生成、编辑、音效与营养资料检索

这些能力需要各自的本地服务，普通文字/视觉聊天模型不具备它们。支持显式配置以下完整 URL，均使用 JSON POST；无配置时保持不可用，不会扣费或自动访问云端。

| 环境变量 | 请求格式 | 要求的响应 |
| --- | --- | --- |
| `LOCAL_IMAGE_GENERATION_URL` | `{prompt,size,n:1,response_format:"b64_json",model?}` | `{data:[{b64_json:"图片base64"}]}` |
| `LOCAL_IMAGE_EDIT_URL` | 同上，加 `images:[{b64_json:"原图base64"}]` | 同上 |
| `LOCAL_SOUND_URL` | `{prompt,duration:3}` | 原音效接口所需的 JSON 对象 |
| `LOCAL_NUTRITION_SEARCH_URL` | `{query,enable_smart_mode:true}` | `{results:[...]}` 或 `{result:[...]}` |

图片生成接口可指向兼容 `/v1/images/generations` 的本地服务。图片编辑使用原项目的 JSON 契约，需本地服务或桥接器接受该格式；它不是 multipart 上传接口，也不是直接调用 ComfyUI 的工作流 API。图片服务必须返回 base64，适配器不下载远程图片 URL。可选 `LOCAL_IMAGE_MODEL` 指定图像模型，`LOCAL_IMAGE_API_KEY` / `LOCAL_SOUND_API_KEY` / `LOCAL_NUTRITION_SEARCH_API_KEY` 对应服务端鉴权。

营养检索应返回真实数据库/文献搜索结果，不能用聊天模型编造检索证据。前端原来的“百度营养”函数名仅为兼容入口，本地模式并不代表接入百度。

默认只连接 `localhost`、`127.0.0.1`、`::1`。若以后主动配置自己管理的局域网/外部服务，还须显式设置 `LOCAL_AI_ALLOW_REMOTE=true`；届时输入会发送到所配置服务，应自行确认服务及费用。本次部署不配置外部服务，不提供云端密钥。AI 请求本身不会自动下载模型。请求不跟随重定向，并拒绝秒哒域名。

## 接口与验证

服务端调用 `await handleAI(name, body)` 得到 `{status, body}`；`getAICapabilities()` 只报告哪些能力已配置，不代表服务已经启动或模型经过验证。

```powershell
node --test local-server/ai.test.mjs
```

测试使用本机临时 HTTP 服务器和明确的 fixture 返回值，只验证接口传输、结构转换和错误处理；不会被当作真实 AI 结果，也不会联系任何外部服务。

真实模型验证脚本 `verify-local-ai.mjs` 使用合成用户信息与测试营养标签，逐一请求文字/视觉功能，不向数据库插入记录。结果写入项目根目录 `local-models/test-results/real-inference.json`，包含状态、耗时和实际模型返回。测试标签可用 PowerShell 7 运行 `create-ai-test-label.ps1` 重新生成。

已完成 9 个接口的 11 次操作（社区含3种操作）。包装测试标签的 1506kJ 由代码换算为 359.9kcal，与标注的 360kcal 相符；适配器先提取能量原值、单位和份量，再计算，不让模型自行完成单位运算。食物识别负例测试确保仅有标签文字时返回空列表。少量修复后的复测记录在 `real-inference-recheck.json`。

另用 APP 现有 `assets/featured/f1.png` 完成食物图像正例，模型约 1.7 秒识别为“牛油果沙拉”，主要菜品与画面相符，营养返回 `verified:false`。详细结果在 `local-models/test-results/food-photo-positive.json`，可运行 `node local-server/verify-food-photo.mjs` 重现。测试没有写入用户饮食记录；单张测试图不代表完整识别准确率，重量和营养仍是可编辑估计值。
