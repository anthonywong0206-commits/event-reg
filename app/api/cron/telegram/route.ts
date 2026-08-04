import { NextResponse } from "next/server";
import { processTelegramNotificationQueue } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processTelegramNotificationQueue();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    console.error("Telegram cron processing failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Telegram cron processing failed" },
      { status: 500 },
    );
  }
}
