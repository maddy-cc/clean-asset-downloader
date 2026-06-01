import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/server/core/http";
import {
  assertContentLengthWithinLimit,
  limitReadableStream,
  parseByteLimit
} from "@/server/core/stream";

const ALLOWED_HOST_SUFFIXES = [
  "sinaimg.cn",
  "douyinpic.com",
  "xhscdn.com",
  "xiaohongshu.com",
  "douyinstatic.com"
];
const MAX_PROXY_BYTES = parseByteLimit(process.env.MAX_PROXY_BYTES, 20 * 1024 * 1024);

function isAllowedUrl(value: string): boolean {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    return ALLOWED_HOST_SUFFIXES.some(
      (suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

function refererFor(url: string): string {
  const hostname = new URL(url).hostname;

  if (hostname.includes("sinaimg.cn")) {
    return "https://weibo.cn/";
  }

  if (
    hostname.includes("douyinpic.com") ||
    hostname.includes("douyinstatic.com")
  ) {
    return "https://www.douyin.com/";
  }

  if (hostname.includes("xhscdn.com") || hostname.includes("xiaohongshu.com")) {
    return "https://www.xiaohongshu.com/";
  }

  return "https://localhost/";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !isAllowedUrl(url)) {
    return NextResponse.json({ error: "不允许代理该资源地址" }, { status: 400 });
  }

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        referer: refererFor(url)
      }
    });

    if (!response.ok) {
      return NextResponse.json({ error: `资源读取失败：HTTP ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const normalizedContentType = contentType.split(";")[0].trim().toLowerCase();

    if (normalizedContentType.startsWith("video/")) {
      return NextResponse.json({ error: "预览代理不支持视频资源" }, { status: 400 });
    }

    assertContentLengthWithinLimit(response, MAX_PROXY_BYTES);

    const headers = new Headers({
      "content-type": contentType,
      "cache-control": "public, max-age=3600"
    });
    const contentLength = response.headers.get("content-length");

    if (contentLength) {
      headers.set("content-length", contentLength);
    }

    return new Response(limitReadableStream(response.body, MAX_PROXY_BYTES), { headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "资源代理失败" },
      { status: 400 }
    );
  }
}
