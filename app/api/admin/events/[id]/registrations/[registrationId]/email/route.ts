import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { sendRegistrationEmail } from "@/lib/email";
import type { EventRecord, RegistrationRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const { id: eventId, registrationId } = await params;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("registrations")
      .select("*, event:events(*), session:event_sessions(*)")
      .eq("id", registrationId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "找不到參加者" }, { status: 404 });
    const registration = data as RegistrationRecord;
    if (!registration.email) return NextResponse.json({ error: "參加者未有提供電郵地址" }, { status: 400 });
    if (registration.status !== "confirmed") return NextResponse.json({ error: "只可向已確認參加者發送確認電郵" }, { status: 400 });
    const event = registration.event as EventRecord;
    const result = await sendRegistrationEmail(registration, event, { idempotencyKey: `registration/${registration.id}/resend/${Date.now()}` });
    await admin.from("registrations").update({ email_sent: result.sent, email_error: result.error || null }).eq("id", registration.id);
    if (!result.sent) return NextResponse.json({ error: result.error === "RESEND_NOT_CONFIGURED" ? "Vercel 尚未設定 RESEND_API_KEY 或 RESEND_FROM_EMAIL" : result.error || "未能發送確認電郵" }, { status: 502 });
    return NextResponse.json({ sent: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error("Resend registration email failed", error);
    return NextResponse.json({ error: error instanceof Error ? `未能發送確認電郵：${error.message}` : "未能發送確認電郵" }, { status: 500 });
  }
}
