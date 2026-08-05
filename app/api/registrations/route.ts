import { NextResponse } from "next/server";
import { registrationSchema } from "@/lib/validators";
import { isServiceRoleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_REGISTRATION } from "@/lib/demo-data";
import { sendRegistrationEmail } from "@/lib/email";
import { notifyNewRegistration } from "@/lib/telegram";
import type { EventRecord, RegistrationRecord } from "@/lib/types";

export const runtime = "nodejs";

const errorMessages: Record<string, string> = {
  EVENT_NOT_FOUND: "找不到活動。",
  EVENT_NOT_PUBLISHED: "此活動尚未公開接受報名。",
  REGISTRATION_NOT_STARTED: "活動尚未開始報名。",
  REGISTRATION_CLOSED: "活動報名已截止。",
  EVENT_FULL: "活動名額已滿。",
  SESSION_REQUIRED: "請選擇活動日期及時段。",
  SESSION_NOT_FOUND: "找不到所選活動時段。",
  SESSION_NOT_ACTIVE: "所選時段已停止報名。",
  SESSION_FULL: "所選時段名額已滿。",
  METHOD_NOT_ALLOWED: "此活動不支援所選報名方法。",
  ALREADY_REGISTERED: "此電郵已登記此活動。如需更改資料，請聯絡主辦單位。",
};

export async function POST(request: Request) {
  try {
    const parsed = registrationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "表格資料不完整" }, { status: 400 });
    }
    if (parsed.data.website) return NextResponse.json({ error: "未能處理申請" }, { status: 400 });

    if (!isServiceRoleConfigured()) {
      return NextResponse.json({
        id: DEMO_REGISTRATION.id,
        registration_no: DEMO_REGISTRATION.registration_no,
        qr_token: DEMO_REGISTRATION.qr_token,
        email_sent: false,
        demo: true,
      });
    }

    const admin = createAdminClient();
    const { data: eventData, error: eventError } = await admin
      .from("events")
      .select("*")
      .eq("id", parsed.data.eventId)
      .maybeSingle();
    if (eventError || !eventData) {
      return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    }
    const event = eventData as EventRecord;

    const { data, error } = await admin.rpc("register_for_event", {
      p_event_id: parsed.data.eventId,
      p_session_id: parsed.data.sessionId ?? null,
      p_full_name: parsed.data.fullName,
      p_email: parsed.data.email?.toLowerCase() ?? null,
      p_phone: parsed.data.phone,
      p_method: parsed.data.method,
      p_notes: parsed.data.notes || null,
    });

    if (error) {
      const known = Object.keys(errorMessages).find((code) => error.message.includes(code));
      return NextResponse.json({ error: known ? errorMessages[known] : "未能完成報名，請稍後再試。" }, { status: (known === "EVENT_FULL" || known === "SESSION_FULL") || known === "REGISTRATION_NOT_STARTED" || known === "REGISTRATION_CLOSED" ? 409 : 400 });
    }

    const registration = data as RegistrationRecord;
    registration.event = event;
    const emailResult = await sendRegistrationEmail(registration, event);

    await admin
      .from("registrations")
      .update({ email_sent: emailResult.sent, email_error: emailResult.error || null })
      .eq("id", registration.id);

    // Telegram delivery is best-effort and must never make a successful registration fail.
    await notifyNewRegistration(registration.id);

    return NextResponse.json({
      id: registration.id,
      registration_no: registration.registration_no,
      qr_token: registration.qr_token,
      email_sent: emailResult.sent,
    }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "伺服器暫時未能處理申請，請稍後再試。" }, { status: 500 });
  }
}
