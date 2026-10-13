# 本地图片与烹饪音效

`media_server.py` 仅监听 `127.0.0.1:54322`。程序音效使用 Python 标准库；图片功能已使用便携 stable-diffusion.cpp Vulkan 引擎接通本机 SD-Turbo，无需 PyTorch。2026-09-22 已在“健康数字分身”页面生成并显示真实模型输出。

默认随 `pnpm local` 自动启动。运行程序与模型位于 `local-models/image-runtime/`：Windows 引擎约32MB，原始模型约5.21GB。已按 GitHub 发布资产和原作者 Hugging Face 文件页的 SHA256 完整校验，证据在 `provenance.json`。模型经 HF 镜像下载主体、ModelScope 补齐断点，均与同一原始哈希一致。

当前机器选择 `Vulkan1`（RTX 5070 Ti Laptop），可通过 `MEDIA_IMAGE_BACKEND` 更改；先用 `local-models/image-runtime/bin/sd-cli.exe --list-devices` 查看设备。首次驱动编译和模型加载较慢；每次推理启动独立进程，结束即释放显存。原 PyTorch 实现保留供后续对照，默认不启用。

```powershell
# 在项目 local-app 目录执行；使用独立 Python 3.11 环境。
py -3.11 -m venv local-models/media-venv
local-models/media-venv/Scripts/python.exe local-server/media_server.py

# 在另一台Windows电脑补装便携Vulkan程序及5.21GB模型（本机已装好，无需重跑）。
./local-server/install-media.ps1
```

媒体接口可配置到现有 AI 适配器：

```dotenv
LOCAL_IMAGE_GENERATION_URL=http://127.0.0.1:54322/v1/images/generations
LOCAL_IMAGE_EDIT_URL=http://127.0.0.1:54322/v1/images/edits
LOCAL_SOUND_URL=http://127.0.0.1:54322/v1/audio/sound
```

`GET /health` 分别显示图片模型和程序音效的准备状态。音效返回 `data[0].url` 和 `mode: procedural`，属于信号合成，可模拟煎炒、切菜、水流和厨房环境声，不使用神经网络或可灵服务。默认3秒，WAV保存在 `local-server/data/generated-media/audio`。

图片返回 `data[0].b64_json`，实际大小始终为512×512；即使请求1024×1024，响应也明确标注 `native_size: 512x512` 和实际宽高，不将放大图标为原生高清图。图生图每次支持一张参考图，属于参考图重绘，不能保证精确指令编辑或人物身份保持。

中文图片描述经本机 Ollama 的 `qwen3-vl:4b-instruct` 翻译后生成；该请求完成时释放对应 Ollama 模型显存。图片推理每次只运行一个任务，以便与12GB显卡上的文字模型共享显存。服务不会把图片或提示词发送到远程生成平台。

`download-image-runtime.mjs` 支持断点续传、范围校验与整文件 SHA256 校验，保留 TLS 校验，不更改系统代理或 DNS。安装器采用 GitHub 官方发布程序和可校验的模型镜像。许可保存在 `local-models/image-runtime/LICENSE.sd-turbo.md` 与 `NOTICE.txt`；运行库许可在 `bin/`。若迁移工程，应一并保留这些文件。

图片模型归属：Powered by Stability AI。SD-Turbo采用[Stability AI Community License](https://huggingface.co/stabilityai/sd-turbo/blob/main/LICENSE.md)；使用或分发时应遵循该许可的条件与署名要求。[模型说明](https://huggingface.co/stabilityai/sd-turbo)

验证：`py -3.11 -m unittest discover -s local-server -p "test_media_server.py"`。此测试验证媒体HTTP协议、生成WAV、请求校验和缺失模型的真实错误；真实 GPU 生图已经通过 CLI 与 APP 页面两条路径验收。首次 CLI 测试图片在 `local-models/image-runtime/avatar-test.png`。

参考图重绘另通过 `node local-server/verify-image-runtime.mjs` 验收，约7.9秒返回有效512×512 PNG；报告为 `image-runtime/image-edit-verification.json`。本次颜色修改提示未被精确执行，因此该功能只应理解为参考图重绘，不能承诺精确修改指定部位或颜色。

程序来源：[stable-diffusion.cpp 发布](https://github.com/leejet/stable-diffusion.cpp/releases/tag/master-890-74988b2)。模型原始校验信息：[sd_turbo.safetensors](https://huggingface.co/stabilityai/sd-turbo/blob/b261bac6fd2cf515557d5d0707481eafa0485ec2/sd_turbo.safetensors)。
