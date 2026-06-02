import { parseDouyinResource } from "../adapters/douyin";
import { parseGenericResource } from "../adapters/generic";
import { buildWeiboLegacyUrl, parseWeiboLegacyResource } from "../adapters/weibo";
import { parseXiaohongshuResource } from "../adapters/xiaohongshu";
import { fetchWithTimeout } from "./http";
import { detectPlatform } from "./platform";
import { extractFirstUrl } from "./extract-url";
import { resolveUrl } from "./resolve-url";
import type { ParsedPost } from "./types";

const XHS_DESKTOP_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};

export async function parseSharedInput(input: string): Promise<ParsedPost> {
  const sourceUrl = extractFirstUrl(input);
  const resolved = await resolveUrl(sourceUrl);
  const platform = detectPlatform(resolved.resolvedUrl);

  if (platform === "weibo") {
    const legacyUrl = buildWeiboLegacyUrl(sourceUrl);

    if (legacyUrl) {
      const legacyResponse = await fetchWithTimeout(legacyUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (legacyResponse.ok) {
        const legacyParsed = parseWeiboLegacyResource({
          sourceUrl,
          resolvedUrl: legacyUrl,
          html: await legacyResponse.text()
        });

        if (legacyParsed) {
          return legacyParsed;
        }
      }
    }
  }

  if (platform === "douyin") {
    const parsed = await parseDouyinResource({
      sourceUrl,
      resolvedUrl: resolved.resolvedUrl,
      html: resolved.html
    });

    if (parsed) {
      return parsed;
    }
  }

  if (platform === "xiaohongshu") {
    const desktopResponse = await fetchWithTimeout(sourceUrl, {
      headers: XHS_DESKTOP_HEADERS
    });

    if (desktopResponse.ok) {
      const desktopHtml = await desktopResponse.text();
      const desktopParsed = await parseXiaohongshuResource({
        sourceUrl,
        resolvedUrl: desktopResponse.url || resolved.resolvedUrl,
        html: desktopHtml
      });

      if (desktopParsed) {
        return desktopParsed;
      }
    }

    const parsed = await parseXiaohongshuResource({
      sourceUrl,
      resolvedUrl: resolved.resolvedUrl,
      html: resolved.html
    });

    if (parsed) {
      return parsed;
    }
  }

  const parsed = parseGenericResource({
    platform,
    sourceUrl,
    resolvedUrl: resolved.resolvedUrl,
    contentType: resolved.contentType,
    html: resolved.html
  });

  if (platform !== "generic") {
    parsed.warnings = [
      ...parsed.warnings,
      "当前版本只解析页面合法暴露的公开 metadata，不包含绕过水印、登录限制或平台风控的逻辑。"
    ];
  }

  return parsed;
}
