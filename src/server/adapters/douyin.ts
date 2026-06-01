import { buildAssetFilename } from "../core/filename";
import type { Asset, ParsedPost } from "../core/types";
import {
  formatDouyinQualityWarning,
  isDouyinPlayApiUrl,
  resolveDouyinCdnUrl,
  toDouyinPlayApiUrl
} from "./douyin-media";

type DouyinUrlList = {
  url_list?: string[];
};

type DouyinBitRate = {
  bit_rate?: number;
  gear_name?: string;
  play_addr?: DouyinUrlList;
};

type DouyinVideo = {
  play_addr?: DouyinUrlList;
  play_addr_h264?: DouyinUrlList;
  download_addr?: DouyinUrlList;
  download_suffix_logo_addr?: DouyinUrlList;
  bit_rate?: DouyinBitRate[];
  cover?: DouyinUrlList;
  height?: number;
  width?: number;
};

type DouyinItem = {
  aweme_id?: string;
  desc?: string;
  author?: {
    nickname?: string;
  };
  video?: DouyinVideo;
};

type DouyinRouteData = {
  loaderData?: Record<
    string,
    {
      videoInfoRes?: {
        item_list?: DouyinItem[];
      };
    } | null
  >;
};

function extractRouterData(html: string): DouyinRouteData | undefined {
  const match = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})<\/script>/);

  if (!match?.[1]) {
    return undefined;
  }

  try {
    return JSON.parse(match[1]) as DouyinRouteData;
  } catch {
    return undefined;
  }
}

function findVideoItem(data: DouyinRouteData): DouyinItem | undefined {
  const loaderValues = Object.values(data.loaderData ?? {});

  for (const value of loaderValues) {
    const item = value?.videoInfoRes?.item_list?.[0];

    if (item) {
      return item;
    }
  }

  return undefined;
}

function firstHttpUrl(urlList?: string[]): string | undefined {
  return urlList?.find((url) => url.startsWith("http"));
}

type DouyinVideoUrlPick = {
  url: string;
  source:
    | "download_suffix_logo_addr"
    | "download_addr"
    | "bit_rate"
    | "play_addr_h264"
    | "play_addr";
};

function selectDouyinVideoUrl(video: DouyinVideo): DouyinVideoUrlPick | undefined {
  const logoFreeUrl = firstHttpUrl(video.download_suffix_logo_addr?.url_list);

  if (logoFreeUrl) {
    return { url: logoFreeUrl, source: "download_suffix_logo_addr" };
  }

  const downloadUrl = firstHttpUrl(video.download_addr?.url_list);

  if (downloadUrl) {
    return { url: downloadUrl, source: "download_addr" };
  }

  const bitRates = [...(video.bit_rate ?? [])].sort(
    (left, right) => (right.bit_rate ?? 0) - (left.bit_rate ?? 0)
  );

  for (const entry of bitRates) {
    const bitRateUrl = firstHttpUrl(entry.play_addr?.url_list);

    if (bitRateUrl) {
      return { url: bitRateUrl, source: "bit_rate" };
    }
  }

  const h264Url = firstHttpUrl(video.play_addr_h264?.url_list);

  if (h264Url) {
    return { url: h264Url, source: "play_addr_h264" };
  }

  const playUrl = firstHttpUrl(video.play_addr?.url_list);

  if (playUrl) {
    return { url: playUrl, source: "play_addr" };
  }

  return undefined;
}

function extractAwemeId(resolvedUrl: string, item?: DouyinItem): string | undefined {
  if (item?.aweme_id) {
    return item.aweme_id;
  }

  const match = resolvedUrl.match(/\/(?:video|note)\/(\d+)/);
  return match?.[1];
}

function extractVideoIdFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get("video_id") ?? undefined;
  } catch {
    return undefined;
  }
}

export async function parseDouyinResource(params: {
  sourceUrl: string;
  resolvedUrl: string;
  html?: string;
}): Promise<ParsedPost | undefined> {
  if (!params.html) {
    return undefined;
  }

  const data = extractRouterData(params.html);
  const item = data ? findVideoItem(data) : undefined;
  const video = item?.video;
  const picked = video ? selectDouyinVideoUrl(video) : undefined;
  const previewUrl = firstHttpUrl(video?.cover?.url_list);

  if (!item || !picked) {
    return undefined;
  }

  let videoUrl = picked.url;

  if (isDouyinPlayApiUrl(videoUrl) || videoUrl.includes("playwm")) {
    videoUrl = toDouyinPlayApiUrl(videoUrl);
  }

  const resolved = await resolveDouyinCdnUrl(videoUrl, {
    awemeId: extractAwemeId(params.resolvedUrl, item),
    videoId: extractVideoIdFromUrl(videoUrl),
    height: video?.height,
    width: video?.width
  });

  if (resolved) {
    videoUrl = resolved.url;
  }

  const title = item.desc?.trim() || item.aweme_id || "抖音视频";
  const assets: Asset[] = [
    {
      id: "asset_1",
      type: "video",
      url: videoUrl,
      previewUrl,
      filename: buildAssetFilename(title, 0, "video", videoUrl, "video/mp4"),
      mimeType: "video/mp4"
    }
  ];

  return {
    platform: "douyin",
    title,
    author: item.author?.nickname,
    sourceUrl: params.sourceUrl,
    resolvedUrl: params.resolvedUrl,
    assets,
    warnings: [
      resolved
        ? formatDouyinQualityWarning(resolved)
        : "未能解析无水印 CDN 直链，请稍后重试或配置 DOUYIN_COOKIE。"
    ]
  };
}
