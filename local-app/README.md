# 食光本地应用开发说明

这是 [Foodlight Light](../README.md) 中的可编辑应用目录。Windows 启动、下载和部署步骤见 [根目录说明](../Windows下载与部署说明.md)。

前端使用 Expo / React Native / TypeScript，后端使用 Node.js 的 `node:sqlite` 和标准库。默认 API 为 `http://127.0.0.1:54321`，示例配置见 `.env.example`。

## 目录

| 目录 | 用途 |
| --- | --- |
| `src/app/` | 路由与页面 |
| `src/components/`、`src/lib/` | 组件与应用逻辑 |
| `src/client/supabase.ts` | 本地 API 客户端 |
| `local-server/server.mjs`、`schema.sql` | SQLite 后端与表结构 |
| `local-server/ai.mjs`、`ai-config.json` | 本地 AI 适配和配置 |
| `local-server/media_server.py` | 本地音效与图片服务 |
| `supabase/` | 原始云函数和 SQL，供对照 |
| `web/` | 已编译网页 |

## 开发

在仓库根目录运行 `安装开发依赖.cmd`，再按根目录说明启动开发模式。使用手动配置的开发环境时可在本目录执行 `pnpm local`；本地 AI 和媒体服务的准备方式见 `local-server/AI-CONFIG.md` 与 `local-server/MEDIA-README.md`。

开源版不带历史数据库或预设账号。首次启动会自动建库，在页面注册新账号后即可使用；数据库、上传图片、生成媒体和备份均保存到 `local-server/data/`，已被 Git 忽略。

## 验证

```powershell
pnpm exec tsc --noEmit
pnpm test:local
py -3.11 -m unittest discover -s local-server -p test_media_server.py
```

测试覆盖本地账号与会话、数据 CRUD、存储、数据导入、素材镜像、营养查询、AI 和媒体协议。真实模型推理需自行准备模型后另外验证。

`build-light.mjs`、`build-portable.mjs`、`verify-portable.mjs` 用于包含用户数据的私人迁移包制作与验证；制作公开版本时应继续排除 `local-server/data/`。开源版的完整性清单位于仓库根目录。

## 许可证

应用源码采用根目录 [MIT License](../LICENSE)；第三方依赖与模型保留各自许可。
