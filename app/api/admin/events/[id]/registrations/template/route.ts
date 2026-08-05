import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { createRegistrationTemplate } from "@/lib/registration-import";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRecord, EventSessionRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const { id } = await params;
    const admin = createAdminClient();
    const { data: eventData, error } = await admin.from("events").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!eventData) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    const event = eventData as EventRecord;
    if (event.is_multi_session) {
      const { data: sessions, error: sessionsError } = await admin.from("event_sessions").select("*").eq("event_id", id).order("start_at");
      if (sessionsError) throw sessionsError;
      event.sessions = (sessions ?? []) as EventSessionRecord[];
    }
    const file = createRegistrationTemplate(event);
    const safeTitle = event.slug || "event";
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeTitle}-participant-import-template.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error("Download registration template failed", error);
    return NextResponse.json({ error: "未能產生 Excel 範本" }, { status: 500 });
  }
}
