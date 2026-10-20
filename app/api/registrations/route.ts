import { NextResponse } from "next/server";
import { registrationSchema } from "@/lib/validators";
import { isServiceRoleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_REGISTRATION } from "@/lib/demo-data";
import { sendRegistrationEmail } from "@/lib/email";
import { notifyNewRegistration } from "@/lib/telegram";
import type { EventRecord, RegistrationRecord } from "@/lib/types";
import { verifyInvitePageAccessToken } from "@/lib/invite-access";

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
  ALREADY_REGISTERED: "此電郵已登記此活動／時段。如需更改資料，請聯絡主辦單位。",
  TOO_MANY_SUB_ACTIVITIES: "所選子活動數目超過此活動設定上限。",
  ONE_SESSION_PER_SUB_ACTIVITY: "同一子活動只可選擇一個時段。",
  SESSION_TIME_CONFLICT: "所選子活動時段互相重疊，請重新選擇。",
  SUB_ACTIVITY_NAME_REQUIRED: "部分時段未設定子活動名稱，請聯絡主辦單位。",
  SUB_ACTIVITY_MODE_REQUIRED: "此活動並非子活動報名模式。",
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
    const event = eventData as EventRecord & { invite_code_hash?: string | null };

    if (event.external_registration) {
      return NextResponse.json({ error: "此活動使用外部連結報名，請返回活動頁使用指定外部連結。" }, { status: 409 });
    }

    if (event.email_required && !parsed.data.email) {
      return NextResponse.json({ error: "請輸入電郵地址" }, { status: 400 });
    }
    if (event.notes_required && !parsed.data.notes.trim()) {
      return NextResponse.json({ error: "請輸入備註" }, { status: 400 });
    }
    const customAnswers: Record<string, string | string[]> = {};
    for (const field of event.custom_registration_fields || []) {
      const raw = parsed.data.customAnswers[field.id];
      const options = field.options || [];
      if (field.type === "multiple_choice") {
        const values = Array.isArray(raw) ? raw.map(String).filter((value) => options.includes(value)) : [];
        if (field.required && values.length === 0) return NextResponse.json({ error: `請填寫「${field.label}」` }, { status: 400 });
        customAnswers[field.id] = values;
      } else {
        const value = typeof raw === "string" ? raw.trim() : "";
        if (field.required && !value) return NextResponse.json({ error: `請填寫「${field.label}」` }, { status: 400 });
        if (["single_choice", "select"].includes(field.type) && value && !options.includes(value)) return NextResponse.json({ error: `「${field.label}」選項無效` }, { status: 400 });
        customAnswers[field.id] = value;
      }
    }

    if (event.registration_visibility === "private") {
      const inviteAccessToken = request.headers.get("x-event-invite-access");
      const accessGranted = verifyInvitePageAccessToken(
        inviteAccessToken,
        event.id,
        event.invite_code_hash,
      );
      if (!accessGranted) {
        return NextResponse.json({ error: "邀請碼驗證已失效或不正確，請重新進入報名頁並輸入邀請碼。" }, { status: 403 });
      }
    }

    const isSubActivity = event.event_mode === "sub_activity" || event.sub_activity_mode;
    const rpcName = isSubActivity ? "register_for_sub_activity_bundle_v2" : "register_for_event";
    const rpcArgs = isSubActivity ? {
      p_event_id: parsed.data.eventId,
      p_session_ids: parsed.data.sessionIds,
      p_full_name: parsed.data.fullName,
      p_email: parsed.data.email?.toLowerCase() ?? null,
      p_phone: parsed.data.phone,
      p_method: parsed.data.method,
      p_notes: parsed.data.notes || null,
      p_custom_answers: customAnswers,
    } : {
      p_event_id: parsed.data.eventId,
      p_session_id: parsed.data.sessionId ?? null,
      p_full_name: parsed.data.fullName,
      p_email: parsed.data.email?.toLowerCase() ?? null,
      p_phone: parsed.data.phone,
      p_method: parsed.data.method,
      p_notes: parsed.data.notes || null,
      p_custom_answers: customAnswers,
    };
    const { data, error } = await admin.rpc(rpcName, rpcArgs);

    if (error) {
      const known = Object.keys(errorMessages).find((code) => error.message.includes(code));
      return NextResponse.json({ error: known ? errorMessages[known] : "未能完成報名，請稍後再試。" }, { status: (known === "EVENT_FULL" || known === "SESSION_FULL" || known === "SESSION_TIME_CONFLICT" || known === "TOO_MANY_SUB_ACTIVITIES") || known === "REGISTRATION_NOT_STARTED" || known === "REGISTRATION_CLOSED" ? 409 : 400 });
    }

    const created = isSubActivity
      ? (((data as { registrations?: RegistrationRecord[] } | null)?.registrations) || [])
      : [data as RegistrationRecord];
    if (created.length === 0) return NextResponse.json({ error: "未能建立報名紀錄" }, { status: 500 });

    const completed: RegistrationRecord[] = [];
    for (const base of created) {
      let registration = base;
      const { data: fullRegistration } = await admin.from("registrations")
        .select("*, session:event_sessions(*), sub_activity:event_sub_activities(*), sub_activity_session:event_sub_activity_sessions(*)")
        .eq("id", base.id).maybeSingle();
      if (fullRegistration) {
        registration = fullRegistration as RegistrationRecord;
        if (!registration.session && registration.sub_activity_session) {
          registration.session = {
            id: registration.sub_activity_session.id,
            event_id: registration.sub_activity_session.event_id,
            session_date: registration.sub_activity_session.session_date,
            start_at: registration.sub_activity_session.start_at,
            end_at: registration.sub_activity_session.end_at,
            capacity: registration.sub_activity_session.capacity,
            confirmed_count: registration.sub_activity_session.confirmed_count,
            sort_order: registration.sub_activity_session.sort_order,
            is_active: registration.sub_activity_session.is_active,
            sub_activity_name: registration.sub_activity?.name || null,
            sub_activity_key: registration.sub_activity?.id || registration.sub_activity_id || null,
          };
        }
      }
      registration.event = event;
      const emailResult = registration.email && registration.status === "confirmed" ? await sendRegistrationEmail(registration, event) : { sent: false, skipped: true };
      await admin.from("registrations").update({ email_sent: emailResult.sent, email_error: emailResult.error || null }).eq("id", registration.id);
      await notifyNewRegistration(registration.id);
      completed.push({ ...registration, email_sent: emailResult.sent });
    }

    const primary = completed[0];
    return NextResponse.json({
      id: primary.id,
      registration_no: primary.registration_no,
      qr_token: primary.qr_token,
      email_sent: completed.some((item) => item.email_sent),
      status: primary.status,
      registration_count: completed.length,
    }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "伺服器暫時未能處理申請，請稍後再試。" }, { status: 500 });
  }
}
