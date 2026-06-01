const URL_PATTERN = /https?:\/\/[^\s"'<>，。；、)）\]}]+/i;

export function extractFirstUrl(input: string): string {
  const match = input.match(URL_PATTERN);

  if (!match?.[0]) {
    throw new Error("没有在文本中找到有效链接");
  }

  return match[0].trim();
}
