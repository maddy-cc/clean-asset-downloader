import type { Platform } from "./types";

export function detectPlatform(url: string): Platform {
  const hostname = new URL(url).hostname.replace(/^www\./, "");

  if (hostname.includes("douyin.com") || hostname.includes("iesdouyin.com")) {
    return "douyin";
  }

  if (hostname.includes("xiaohongshu.com") || hostname.includes("xhslink.com")) {
    return "xiaohongshu";
  }

  if (hostname.includes("weibo.com") || hostname.includes("weibo.cn")) {
    return "weibo";
  }

  return "generic";
}

export function platformLabel(platform: Platform): string {
  const labels: Record<Platform, string> = {
    douyin: "抖音",
    xiaohongshu: "小红书",
    weibo: "微博",
    generic: "通用链接"
  };

  return labels[platform];
}
