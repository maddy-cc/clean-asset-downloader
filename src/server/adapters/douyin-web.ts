import { createRequire } from "node:module";
import { fetchWithTimeout } from "../core/http";
import { DOUYIN_WEB_REFERER, DOUYIN_WEB_USER_AGENT } from "./douyin-media";

const require = createRequire(import.meta.url);
const { sign } = require("./douyin-sign.js") as {
  sign: (query: string, userAgent: string) => string;
};

export type DouyinWebBitRate = {
  gear_name?: string;
  bit_rate?: number;
  play_addr?: {
    url_list?: string[];
  };
};

export type DouyinWebAwemeDetail = {
  aweme_detail?: {
    desc?: string;
    video?: {
      width?: number;
      height?: number;
      bit_rate?: DouyinWebBitRate[];
      play_addr?: {
        url_list?: string[];
      };
    };
  };
  status_code?: number;
  status_msg?: string;
};

function randomMsToken(length = 107): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";

  for (let index = 0; index < length; index += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return token;
}

async function registerTtwid(): Promise<string> {
  const response = await fetchWithTimeout("https://ttwid.bytedance.com/ttwid/union/register/", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      aid: 1768,
      union: true,
      needFid: false,
      region: "cn",
      cbUrlProtocol: "https",
      service: "www.ixigua.com",
      migrate_info: {
        ticket: "",
        source: "node"
      }
    })
  });

  const cookieHeader = response.headers.get("set-cookie") ?? "";
  const match = cookieHeader.match(/ttwid=([^;]+)/);

  return match ? `ttwid=${match[1]}` : "";
}

export async function buildDouyinRequestCookie(extraCookie?: string): Promise<string> {
  const generated = `msToken=${randomMsToken()}; ${await registerTtwid()};`;
  const trimmed = extraCookie?.trim();

  if (!trimmed) {
    return generated;
  }

  return `${generated} ${trimmed.endsWith(";") ? trimmed : `${trimmed};`}`;
}

export async function fetchDouyinWebAwemeDetail(
  awemeId: string,
  extraCookie?: string
): Promise<DouyinWebAwemeDetail | undefined> {
  const params = new URLSearchParams({
    device_platform: "webapp",
    aid: "6383",
    channel: "channel_pc_web",
    aweme_id: awemeId,
    update_version_code: "170400",
    pc_client_type: "1",
    version_code: "190500",
    version_name: "19.5.0",
    cookie_enabled: "true",
    screen_width: "1920",
    screen_height: "1080",
    browser_language: "zh-CN",
    browser_platform: "MacIntel",
    browser_name: "Chrome",
    browser_version: "125.0.0.0",
    browser_online: "true",
    engine_name: "Blink",
    engine_version: "125.0.0.0",
    os_name: "Mac OS",
    os_version: "10.15.7",
    cpu_core_num: "8",
    device_memory: "8",
    platform: "PC",
    downlink: "10",
    effective_type: "4g",
    round_trip_time: "50"
  });
  const query = params.toString();
  const api = `https://www.douyin.com/aweme/v1/web/aweme/detail/?${query}&X-Bogus=${sign(query, DOUYIN_WEB_USER_AGENT)}`;

  const response = await fetchWithTimeout(api, {
    headers: {
      accept: "application/json",
      referer: DOUYIN_WEB_REFERER,
      "user-agent": DOUYIN_WEB_USER_AGENT,
      cookie: await buildDouyinRequestCookie(extraCookie)
    }
  });

  if (!response.ok) {
    return undefined;
  }

  const text = await response.text();

  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as DouyinWebAwemeDetail;
  } catch {
    return undefined;
  }
}

export function collectDouyinPlayApiCandidates(detail: DouyinWebAwemeDetail): string[] {
  const video = detail.aweme_detail?.video;
  const candidates = new Set<string>();

  for (const entry of video?.bit_rate ?? []) {
    for (const url of entry.play_addr?.url_list ?? []) {
      if (url.startsWith("http")) {
        candidates.add(url.replace(/playwm/g, "play"));
      }
    }
  }

  for (const url of video?.play_addr?.url_list ?? []) {
    if (url.startsWith("http")) {
      candidates.add(url.replace(/playwm/g, "play"));
    }
  }

  return [...candidates];
}
