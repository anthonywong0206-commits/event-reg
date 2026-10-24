import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { sendRegistrationEmail } from "@/lib/email";
import { notifyNewRegistration } from "@/lib/telegram";
import { isServiceRoleConfigured } from "@/lib/env";
import { createRegistrationNumber, registrationAdminError } from "@/lib/registration-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRecord, RegistrationRecord } from "@/lib/types";
import { adminRegistrationCreateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    }

    const { id: eventId } = await params;
    const parsed = adminRegistrationCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "參加者資料不完整" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: eventData, error: eventError } = await admin
      .from("events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) throw eventError;
    if (!eventData) return NextResponse.json({ error: "找不到活動" }, { status: 404 });

    const event = eventData as EventRecord;
    const isSubActivity = event.event_mode === "sub_activity" || event.sub_activity_mode;
    const structuredMode = event.is_multi_session || isSubActivity;
    let selectedSubActivityId: string | null = null;
    if (structuredMode) {
      if (!parsed.data.sessionId) return NextResponse.json({ error: "請選擇活動日期及時段" }, { status: 400 });
      if (isSubActivity) {
        const { data: selectedSession } = await admin.from("event_sub_activity_sessions").select("id,is_active,sub_activity_id").eq("id", parsed.data.sessionId).eq("event_id", eventId).maybeSingle();
        if (!selectedSession || !selectedSession.is_active) return NextResponse.json({ error: "所選子活動時段無效或已停止報名" }, { status: 400 });
        selectedSubActivityId = selectedSession.sub_activity_id;
      } else {
        const { data: selectedSession } = await admin.from("event_sessions").select("id,is_active").eq("id", parsed.data.sessionId).eq("event_id", eventId).maybeSingle();
        if (!selectedSession || !selectedSession.is_active) return NextResponse.json({ error: "所選活動時段無效或已停止報名" }, { status: 400 });
      }
    }
    if (!event.registration_methods.includes(parsed.data.method)) {
      return NextResponse.json({ error: "此活動不支援所選報名方式" }, { status: 400 });
    }

    const attendedAt = parsed.data.status === "confirmed" && parsed.data.attended
      ? new Date().toISOString()
      : null;

    let registration: RegistrationRecord | null = null;
    let insertError: { code?: string | null; message?: string | null; constraint?: string | null } | null = null;

    // Registration numbers are random, but retry once if an extremely unlikely collision occurs.
    for (let attempt = 0; attempt < 2 && !registration; attempt += 1) {
      const { data, error } = await admin
        .from("registrations")
        .insert({
          event_id: eventId,
          session_id: event.is_multi_session ? parsed.data.sessionId : null,
          sub_activity_id: isSubActivity ? selectedSubActivityId : null,
          sub_activity_session_id: isSubActivity ? parsed.data.sessionId : null,
          registration_no: createRegistrationNumber(),
          full_name: parsed.data.fullName,
          email: parsed.data.email?.toLowerCase() ?? null,
          phone: parsed.data.phone,
          method: parsed.data.method,
          status: parsed.data.status,
          notes: parsed.data.notes || null,
          attended_at: attendedAt,
        })
        .select("*")
        .single();

      if (!error) {
        registration = data as RegistrationRecord;
        break;
      }
      insertError = error;
      if (error.code !== "23505" || error.message?.includes("one_active_registration_per_email")) break;
    }

    if (!registration) {
      const known = insertError ? registrationAdminError(insertError) : null;
      if (known) return NextResponse.json({ error: known.message }, { status: known.status });
      throw insertError ?? new Error("Unable to create registration");
    }

    let emailSent = false;
    let emailError: string | null = null;
    if (parsed.data.sendEmail && registration.status === "confirmed" && registration.email) {
      if (registration.session_id) {
        const { data: session } = await admin.from("event_sessions").select("*").eq("id", registration.session_id).maybeSingle();
        registration.session = session || null;
      } else if (registration.sub_activity_session_id) {
        const [{ data: session }, { data: activity }] = await Promise.all([
          admin.from("event_sub_activity_sessions").select("*").eq("id", registration.sub_activity_session_id).maybeSingle(),
          admin.from("event_sub_activities").select("*").eq("id", registration.sub_activity_id).maybeSingle(),
        ]);
        registration.sub_activity_session = session || null;
        registration.sub_activity = activity || null;
        if (session) registration.session = { ...session, sub_activity_name: activity?.name || null, sub_activity_key: activity?.id || null };
      }
      registration.event = event;
      const emailResult = await sendRegistrationEmail(registration, event);
      delete registration.event;
      emailSent = emailResult.sent;
      emailError = emailResult.error || null;
      await admin
        .from("registrations")
        .update({ email_sent: emailSent, email_error: emailError })
        .eq("id", registration.id);
    }

    // Return the same joined shape used by the participant manager so V2 sub-activity
    // registrations appear in the correct child list immediately after a manual add.
    if (isSubActivity) {
      const { data: joined } = await admin.from("registrations")
        .select("*, sub_activity:event_sub_activities(*), sub_activity_session:event_sub_activity_sessions(*)")
        .eq("id", registration.id).maybeSingle();
      if (joined) {
        registration = joined as RegistrationRecord;
        if (registration.sub_activity_session) registration.session = {
          ...registration.sub_activity_session,
          sub_activity_name: registration.sub_activity?.name || null,
          sub_activity_key: registration.sub_activity?.id || registration.sub_activity_id || null,
          sub_activity_overlap_exempt: Boolean(registration.sub_activity?.overlap_exempt),
        };
      }
    }

    // Manual additions use the same Telegram notification queue as public registrations.
    await notifyNewRegistration(registration.id);

    revalidatePath(`/admin/events/${eventId}/registrations`);
    revalidatePath("/admin");
    return NextResponse.json({ ...registration, email_sent: emailSent, email_error: emailError }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error("Create registration by admin failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? `未能新增參加者：${error.message}` : "未能新增參加者" },
      { status: 500 },
    );
  }
}
