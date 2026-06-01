# Clean Asset Downloader

移动优先的 H5 授权素材解析与下载工具。当前版本实现了：

- 分享文本链接提取
- 短链跳转解析
- 平台识别：抖音 / 小红书 / 微博 / 通用链接
- 公开页面 metadata 素材解析
- 小红书公开 SSR 图片解析
- 图片预览、单张下载和批量下载
- Docker Compose 部署


## 本地开发

```bash
npm install
npm run dev
```

访问：

```txt
http://localhost:3000
```

## Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

可选环境变量：

- `MAX_PROXY_BYTES`：预览代理最大体积，默认 20MB
- `MAX_DOWNLOAD_BYTES`：单个下载最大体积，默认 300MB
- `DOUYIN_COOKIE`：可选 Cookie，仅放在服务器 `.env` 中，不要提交到 Git

## 抖音最高清（可选）

默认会枚举 `play` 接口并选取体积最大的无水印 CDN 直链。若要与浏览器 Network 完全一致（如 `qs=15`、更高 `br`），在 `.env` 配置登录后的 `DOUYIN_COOKIE`（见 `.env.example`）。

## 后续建议

- 为每个平台补充官方 API 或授权导出 Adapter
- 增加登录用户和下载限流
- 增加下载历史记录和批量打包 ZIP
