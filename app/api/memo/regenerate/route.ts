import { NextResponse } from "next/server";
import { regenerateAtlasMemo } from "@/lib/memo-service";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = regenerateAtlasMemo(body);
  return NextResponse.json(result.body, { status: result.status });
}
