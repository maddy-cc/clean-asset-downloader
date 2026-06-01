import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clean Asset Downloader",
  description: "移动优先的授权素材解析与下载工具"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0D9488"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
