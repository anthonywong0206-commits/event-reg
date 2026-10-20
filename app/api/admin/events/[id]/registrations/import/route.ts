import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { sendRegistrationEmail } from "@/lib/email";
import { isServiceRoleConfigured } from "@/lib/env";
import { createRegistrationNumber, registrationAdminError } from "@/lib/registration-admin";
import { parseRegistrationWorkbook } from "@/lib/registration-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewRegistration } from "@/lib/telegram";
import type { EventRecord, EventSessionRecord, RegistrationRecord } from "@/lib/types";

export const runtime = "nodejs";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 500;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const { id: eventId } = await params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "請選擇 Excel 檔案" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "只支援 .xlsx Excel 檔案" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Excel 檔案不可超過 5MB" }, { status: 400 });

    const admin = createAdminClient();
    const { data: eventData, error: eventError } = await admin.from("events").select("*").eq("id", eventId).maybeSingle();
    if (eventError) throw eventError;
    if (!eventData) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    const event = eventData as EventRecord;
    const isSubActivity = event.event_mode === "sub_activity" || event.sub_activity_mode;
    if (isSubActivity) {
      const { data: activities, error: activitiesError } = await admin.from("event_sub_activities").select("id,name,sort_order,is_active,sessions:event_sub_activity_sessions(*)").eq("event_id", eventId).order("sort_order");
      if (activitiesError) throw activitiesError;
      event.sub_activity_mode = true;
      event.sessions = (activities || []).flatMap((activity) => (activity.sessions || []).map((session: EventSessionRecord) => ({ ...session, sub_activity_name: activity.name, sub_activity_key: activity.id }))) as EventSessionRecord[];
    } else if (event.is_multi_session) {
      const { data: sessions, error: sessionsError } = await admin.from("event_sessions").select("*").eq("event_id", eventId).order("start_at");
      if (sessionsError) throw sessionsError;
      event.sessions = (sessions ?? []) as EventSessionRecord[];
    }

    const parsed = parseRegistrationWorkbook(await file.arrayBuffer(), event);
    if (parsed.rows.length > MAX_ROWS) return NextResponse.json({ error: `每次最多匯入 ${MAX_ROWS} 位參加者` }, { status: 400 });
    if (parsed.errors.length) return NextResponse.json({ error: "Excel 資料未能通過檢查", errors: parsed.errors.slice(0, 100), validRows: parsed.rows.length }, { status: 400 });
    if (!parsed.rows.length) return NextResponse.json({ error: "Excel 沒有可匯入的參加者資料" }, { status: 400 });

    const imported: RegistrationRecord[] = [];
    const failures: string[] = [];
    let emailsSent = 0;

    for (const row of parsed.rows) {
      const attendedAt = row.status === "confirmed" && row.attended ? new Date().toISOString() : null;
      let registration: RegistrationRecord | null = null;
      let lastError: { code?: string | null; message?: string | null; constraint?: string | null } | null = null;
      for (let attempt = 0; attempt < 2 && !registration; attempt += 1) {
        const selectedSyntheticSession = isSubActivity ? event.sessions?.find((session) => session.id === row.sessionId) : null;
        const { data, error } = await admin.from("registrations").insert({
          event_id: eventId,
          session_id: event.is_multi_session ? row.sessionId : null,
          sub_activity_id: isSubActivity ? (selectedSyntheticSession?.sub_activity_key || null) : null,
          sub_activity_session_id: isSubActivity ? row.sessionId : null,
          registration_no: createRegistrationNumber(),
          full_name: row.fullName,
          email: row.email?.toLowerCase() ?? null,
          phone: row.phone,
          method: row.method,
          status: row.status,
          notes: row.notes || null,
          attended_at: attendedAt,
        }).select("*").single();
        if (!error) registration = data as RegistrationRecord;
        else {
          lastError = error;
          if (error.code !== "23505" || error.message?.includes("one_active_registration_per_email")) break;
        }
      }
      if (!registration) {
        const known = lastError ? registrationAdminError(lastError) : null;
        failures.push(`第 ${row.rowNumber} 行（${row.fullName}）：${known?.message || lastError?.message || "未能匯入"}`);
        continue;
      }

      if (row.sendEmail && row.email && row.status === "confirmed") {
        registration.session = event.sessions?.find((session) => session.id === (registration?.sub_activity_session_id || registration?.session_id)) || null;
        registration.event = event;
        const emailResult = await sendRegistrationEmail(registration, event);
        delete registration.event;
        if (emailResult.sent) emailsSent += 1;
        await admin.from("registrations").update({ email_sent: emailResult.sent, email_error: emailResult.error || null }).eq("id", registration.id);
      }
      await notifyNewRegistration(registration.id);
      imported.push(registration);
    }

    revalidatePath(`/admin/events/${eventId}/registrations`);
    revalidatePath("/admin");
    const status = failures.length ? 207 : 201;
    return NextResponse.json({ importedCount: imported.length, failedCount: failures.length, emailsSent, failures, registrations: imported }, { status });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error("Bulk registration import failed", error);
    return NextResponse.json({ error: error instanceof Error ? `未能匯入 Excel：${error.message}` : "未能匯入 Excel" }, { status: 500 });
  }
}
