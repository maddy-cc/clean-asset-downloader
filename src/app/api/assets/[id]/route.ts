import path from "node:path";
import { NextResponse } from "next/server";
import {
  DOUYIN_WEB_REFERER,
  DOUYIN_WEB_USER_AGENT,
  resolveDouyinCdnUrl
} from "@/server/adapters/douyin-media";
import { fetchWithTimeout } from "@/server/core/http";
import { parseSharedInput } from "@/server/core/parse";
import {
  assertContentLengthWithinLimit,
  limitReadableStream,
  parseByteLimit
} from "@/server/core/stream";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime"
};
const MAX_DOWNLOAD_BYTES = parseByteLimit(process.env.MAX_DOWNLOAD_BYTES, 300 * 1024 * 1024);

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const params = await context.params;
    const body = (await request.json()) as { input?: string };

    if (!body.input?.trim()) {
      return NextResponse.json({ error: "请输入分享文本或链接" }, { status: 400 });
    }

    const post = await parseSharedInput(body.input);
    const asset = post.assets.find((item) => item.id === params.id);

    if (!asset) {
      return NextResponse.json({ error: "没有找到对应素材" }, { status: 404 });
    }

    let downloadUrl = asset.url;

    if (post.platform === "douyin" && asset.type === "video") {
      const hints = asset.downloadHints;
      const resolved = await resolveDouyinCdnUrl(asset.url, {
        awemeId: hints?.douyinAwemeId ?? post.resolvedUrl.match(/\/(?:video|note)\/(\d+)/)?.[1],
        videoId: hints?.douyinVideoId,
        height: hints?.douyinHeight,
        width: hints?.douyinWidth
      });

      if (resolved) {
        downloadUrl = resolved.url;
      }
    }

    const response = await fetchWithTimeout(downloadUrl, {
      headers:
        post.platform === "douyin"
          ? {
              referer: DOUYIN_WEB_REFERER,
              "user-agent": DOUYIN_WEB_USER_AGENT
            }
          : post.platform === "xiaohongshu"
            ? {
                referer: "https://www.xiaohongshu.com/",
                "user-agent": DOUYIN_WEB_USER_AGENT
              }
            : {
                referer: post.resolvedUrl
              }
    });

    if (!response.ok) {
      return NextResponse.json({ error: `素材下载失败：HTTP ${response.status}` }, { status: 502 });
    }

    const ext = path.extname(asset.filename).toLowerCase();
    const contentType =
      asset.mimeType ?? response.headers.get("content-type") ?? MIME_BY_EXT[ext] ?? "application/octet-stream";
    assertContentLengthWithinLimit(response, MAX_DOWNLOAD_BYTES);
    const headers = new Headers({
      "content-type": contentType,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename)}`
    });
    const contentLength = response.headers.get("content-length");

    if (contentLength) {
      headers.set("content-length", contentLength);
    }

    return new Response(limitReadableStream(response.body, MAX_DOWNLOAD_BYTES), { headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "素材下载失败" },
      { status: 400 }
    );
  }
}
