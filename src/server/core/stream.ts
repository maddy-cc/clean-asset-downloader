export function parseByteLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function assertContentLengthWithinLimit(response: Response, maxBytes: number): void {
  const contentLength = Number(response.headers.get("content-length") ?? 0);

  if (contentLength > maxBytes) {
    throw new Error(`资源超过大小限制（最大 ${(maxBytes / (1024 * 1024)).toFixed(0)}MB）`);
  }
}

export function limitReadableStream(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): ReadableStream<Uint8Array> {
  if (!body) {
    throw new Error("远程资源没有可读取内容");
  }

  const reader = body.getReader();
  let loadedBytes = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();

      if (done) {
        controller.close();
        return;
      }

      loadedBytes += value.byteLength;

      if (loadedBytes > maxBytes) {
        await reader.cancel();
        controller.error(new Error("资源超过大小限制"));
        return;
      }

      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    }
  });
}
