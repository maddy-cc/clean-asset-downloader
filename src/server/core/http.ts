import { lookup } from "node:dns/promises";
import net from "node:net";

export const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};

const MAX_REDIRECTS = 5;
const safeHostnameChecks = new Map<string, Promise<void>>();

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("2001:db8:")
  ) {
    return true;
  }

  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
}

function isBlockedIp(address: string): boolean {
  const ipType = net.isIP(address);

  if (ipType === 4) {
    return isBlockedIpv4(address);
  }

  if (ipType === 6) {
    return isBlockedIpv6(address);
  }

  return true;
}

async function assertSafeRemoteUrl(rawUrl: string): Promise<void> {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("只允许访问 HTTP/HTTPS 链接");
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "0.0.0.0") {
    throw new Error("不允许访问本机或内网地址");
  }

  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error("不允许访问本机或内网地址");
    }

    return;
  }

  const cachedCheck =
    safeHostnameChecks.get(hostname) ??
    lookup(hostname, { all: true }).then((addresses) => {
      if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
        throw new Error("不允许访问本机或内网地址");
      }
    });

  safeHostnameChecks.set(hostname, cachedCheck);
  await cachedCheck;
}

function redirectStatus(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function redirectedInit(init: RequestInit, status: number): RequestInit {
  const method = init.method?.toUpperCase();

  if (status !== 303 && method !== "POST") {
    return init;
  }

  const { body: _body, ...nextInit } = init;
  return {
    ...nextInit,
    method: "GET"
  };
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
  redirects = 0
): Promise<Response> {
  await assertSafeRemoteUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...DEFAULT_HEADERS,
        ...(init.headers ?? {})
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual"
    });

    if (!redirectStatus(response.status) || init.redirect === "manual") {
      return response;
    }

    if (init.redirect === "error") {
      throw new Error("链接发生跳转");
    }

    if (redirects >= MAX_REDIRECTS) {
      throw new Error("链接跳转次数过多");
    }

    const location = response.headers.get("location");

    if (!location) {
      return response;
    }

    const nextUrl = new URL(location, url).toString();
    return fetchWithTimeout(nextUrl, redirectedInit(init, response.status), timeoutMs, redirects + 1);
  } finally {
    clearTimeout(timer);
  }
}
