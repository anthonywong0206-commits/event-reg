import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";
import { eventSchema } from "@/lib/validators";
import { hashInviteCode } from "@/lib/invite-access";
function hongKongDateFromIso(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function validateSessionDates(sessions: Array<{ session_date: string; start_at: string; end_at: string }>) {
  return sessions.find((session) => hongKongDateFromIso(session.start_at) !== session.session_date || hongKongDateFromIso(session.end_at) !== session.session_date);
}


export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const { id } = await params;
    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "活動資料不完整" }, { status: 400 });
    const admin = createAdminClient();
    const { data: existing } = await admin.from("events").select("confirmed_count,is_multi_session,invite_code_hash").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    const { sessions, invite_code, ...eventPayload } = parsed.data;
    const mismatchedSession = validateSessionDates(sessions);
    if (mismatchedSession) return NextResponse.json({ error: `活動時段日期與時間不一致：${mismatchedSession.session_date}。請重新選擇該日的開始及結束時間。` }, { status: 400 });
    if (eventPayload.registration_visibility === "private" && !invite_code && !existing.invite_code_hash) {
      return NextResponse.json({ error: "非公開報名活動必須設定邀請碼" }, { status: 400 });
    }
    const firstStart = sessions.length ? sessions.map((item) => item.start_at).sort()[0] : eventPayload.start_at;
    const lastEnd = sessions.length ? sessions.map((item) => item.end_at).sort().at(-1)! : eventPayload.end_at;
    const totalCapacity = eventPayload.is_multi_session ? sessions.reduce((sum, item) => sum + item.capacity, 0) : eventPayload.capacity;
    if (totalCapacity < existing.confirmed_count) return NextResponse.json({ error: `總名額不可低於目前已確認人數 ${existing.confirmed_count}` }, { status: 409 });

    if (eventPayload.is_multi_session) {
      const currentResult = await admin.from("event_sessions").select("id,confirmed_count").eq("event_id", id);
      if (currentResult.error) throw currentResult.error;
      const keepIds = sessions.flatMap((item) => item.id ? [item.id] : []);
      for (const old of currentResult.data || []) {
        if (!keepIds.includes(old.id) && old.confirmed_count > 0) return NextResponse.json({ error: "已有參加者的時段不可刪除；請先將參加者移至其他時段" }, { status: 409 });
      }
      for (const [index, session] of sessions.entries()) {
        const payload = { event_id: id, session_date: session.session_date, start_at: session.start_at, end_at: session.end_at, capacity: session.capacity, sort_order: index, is_active: session.is_active };
        if (session.id) {
          const old = (currentResult.data || []).find((item) => item.id === session.id);
          if (old && session.capacity < old.confirmed_count) return NextResponse.json({ error: "時段名額不可低於該時段已確認人數" }, { status: 409 });
          const result = await admin.from("event_sessions").update(payload).eq("id", session.id).eq("event_id", id);
          if (result.error) throw result.error;
        } else {
          const result = await admin.from("event_sessions").insert(payload);
          if (result.error) throw result.error;
        }
      }
      const removable = (currentResult.data || []).filter((item) => !keepIds.includes(item.id) && item.confirmed_count === 0).map((item) => item.id);
      if (removable.length) {
        const result = await admin.from("event_sessions").delete().in("id", removable);
        if (result.error) throw result.error;
      }
    } else if (existing.is_multi_session) {
      const assigned = await admin.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", id).not("session_id", "is", null);
      if ((assigned.count || 0) > 0) return NextResponse.json({ error: "活動已有多時段參加者，不可改回單一時段" }, { status: 409 });
      await admin.from("event_sessions").delete().eq("event_id", id);
    }

    const updatePayload = {
      ...eventPayload,
      ...(invite_code ? { invite_code_hash: hashInviteCode(invite_code) } : {}),
      start_at: firstStart,
      end_at: lastEnd,
      capacity: totalCapacity,
    };
    const { data, error } = await admin.from("events").update(updatePayload).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error("Update event failed", error);
    return NextResponse.json({ error: error instanceof Error ? `未能更新活動：${error.message}` : "未能更新活動" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const { id } = await params;
    const admin = createAdminClient();
    const { error } = await admin.from("events").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") return NextResponse.json({ error: "活動已有報名紀錄，請改為取消狀態" }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    return NextResponse.json({ error: "未能刪除活動" }, { status: 500 });
  }
}
