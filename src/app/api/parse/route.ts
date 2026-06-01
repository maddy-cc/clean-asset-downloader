import { NextResponse } from "next/server";
import { parseSharedInput } from "@/server/core/parse";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { input?: string };

    if (!body.input?.trim()) {
      return NextResponse.json({ error: "请输入分享文本或链接" }, { status: 400 });
    }

    const post = await parseSharedInput(body.input);

    return NextResponse.json({ post });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解析失败" },
      { status: 400 }
    );
  }
}
