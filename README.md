# 食光 Foodlight Light

食光 APP 的 Windows 轻量开源版：基于 Expo / React Native 的前端、Node.js + SQLite 的本地后端，以及可选的本地 AI。

本仓库整理自 2026-10-09 的 Windows 轻量迁移包，包含可编辑源码、已编译网页、应用素材、Windows 启动脚本和资源下载说明。

## 功能

- 本地账号注册、登录、资料管理。
- 饮食与体重记录、营养统计、食谱和社区功能。
- 可选 Ollama + Qwen3-VL：食物识别、配餐、食谱生成、食物替代及包装解读。
- 可选 SD-Turbo + stable-diffusion.cpp：本地插画生成与参考图重绘。
- 本地烹饪音效生成。

## Windows 快速开始

1. 下载仓库 ZIP 或克隆仓库，完整解压到可写目录，例如 `D:\Foodlight-Light`。
2. 按 [Windows 下载与部署说明](Windows下载与部署说明.md) 下载 Node.js 24 x64 的完整 ZIP，把内容放入 `runtime/node/`，确保 `runtime/node/node.exe` 存在。
3. 双击根目录的 **`仅启动基础功能.cmd`**。基础功能使用已编译网页，无需安装前端开发依赖或 AI 模型。
4. 浏览器打开 <http://localhost:19006/home>，首次使用在登录页切换到注册，创建自己的本地账号。用户名为 3–20 位字母、数字或下划线，密码至少 6 位。
5. 退出时双击 **`停止项目.cmd`**，或在启动窗口按 Ctrl+C。

完整 AI 功能需要按部署说明另行下载 Python、Ollama、Qwen、图片推理引擎及 SD-Turbo，再运行 `启动项目.cmd`。这些运行环境和模型没有打包进仓库。

## 数据保存

首次启动时后端自动创建 `local-app/local-server/data/foodlight.sqlite`。仓库不包含迁移包内的私人账号、密码文件、饮食记录、体重记录、上传图片和生成媒体。

使用中产生的数据只保存于本机，相关目录已加入 Git 忽略规则。备份可运行 `备份数据库.cmd`；完整备份还应包含自己生成的图片和媒体。

## 继续开发

先运行 `安装开发依赖.cmd`，根据锁文件恢复 pnpm 和前端依赖。之后可使用 `开发模式.cmd`；当前开发启动器按完整 AI 流程启动，需先准备相应模型与运行环境。

修改前端后运行 `重新构建网页.cmd`，再运行启动脚本。后端修改后重启服务即可。

| 路径 | 内容 |
| --- | --- |
| `local-app/src/` | Expo / React Native 页面、组件及应用逻辑 |
| `local-app/local-server/` | 本地 API、SQLite 表结构、AI 适配及打包脚本 |
| `local-app/web/` | 已编译的 Web 版本 |
| `local-app/assets/` | 应用图标、头像与首页配图 |
| `local-app/supabase/` | 原始云函数和 SQL，供开发对照 |
| `下载资源.json` | 固定资源版本、下载地址与校验信息 |

本地后端实现应用实际使用的 Supabase 接口子集。服务默认监听本机；本仓库提供 Windows Web 版本，未包含新构建的 Android APK。

## 检查

先安装开发依赖，再在 `local-app` 目录使用支持 `node:sqlite` 的 Node.js 运行已有后端测试：

```powershell
node --test local-server/server.test.mjs
```

完整依赖安装后的其他验证命令见 [开发说明](local-app/README.md)。`检查完整性.cmd` 按本开源包的 `PACKAGE-MANIFEST.json` 校验发布文件，需要先准备说明中的 Python 运行环境。

## 许可证

应用源码采用 [MIT License](LICENSE)。第三方依赖和模型使用各自许可证；SD-Turbo 许可说明保留在 [`local-app/local-server/licenses/`](local-app/local-server/licenses/)。模型权重和外部运行环境需另行下载。
