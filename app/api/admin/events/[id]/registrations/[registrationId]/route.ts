import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { registrationAdminError } from "@/lib/registration-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRecord, RegistrationRecord } from "@/lib/types";
import { adminRegistrationUpdateSchema } from "@/lib/validators";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> },
) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    }

    const { id: eventId, registrationId } = await params;
    const parsed = adminRegistrationUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "參加者資料不完整" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const [{ data: eventData, error: eventError }, { data: existing, error: existingError }] = await Promise.all([
      admin.from("events").select("*").eq("id", eventId).maybeSingle(),
      admin.from("registrations").select("*").eq("id", registrationId).eq("event_id", eventId).maybeSingle(),
    ]);

    if (eventError) throw eventError;
    if (existingError) throw existingError;
    if (!eventData) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    if (!existing) return NextResponse.json({ error: "找不到參加者紀錄" }, { status: 404 });

    const event = eventData as EventRecord;
    const current = existing as RegistrationRecord;
    if (!event.registration_methods.includes(parsed.data.method) && parsed.data.method !== current.method) {
      return NextResponse.json({ error: "此活動不支援所選報名方式" }, { status: 400 });
    }

    const attendedAt = parsed.data.status === "confirmed" && parsed.data.attended
      ? current.attended_at || new Date().toISOString()
      : null;

    const { data, error } = await admin
      .from("registrations")
      .update({
        full_name: parsed.data.fullName,
        email: parsed.data.email?.toLowerCase() ?? null,
        phone: parsed.data.phone,
        method: parsed.data.method,
        status: parsed.data.status,
        notes: parsed.data.notes || null,
        attended_at: attendedAt,
      })
      .eq("id", registrationId)
      .eq("event_id", eventId)
      .select("*")
      .single();

    if (error) {
      const known = registrationAdminError(error);
      if (known) return NextResponse.json({ error: known.message }, { status: known.status });
      throw error;
    }

    revalidatePath(`/admin/events/${eventId}/registrations`);
    revalidatePath("/admin");
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error("Update registration by admin failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? `未能更新參加者：${error.message}` : "未能更新參加者" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> },
) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    }

    const { id: eventId, registrationId } = await params;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("registrations")
      .delete()
      .eq("id", registrationId)
      .eq("event_id", eventId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "找不到參加者紀錄" }, { status: 404 });

    revalidatePath(`/admin/events/${eventId}/registrations`);
    revalidatePath("/admin");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error("Delete registration by admin failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? `未能刪除參加者：${error.message}` : "未能刪除參加者" },
      { status: 500 },
    );
  }
}
