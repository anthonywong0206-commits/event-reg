import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminRegistrationSchema } from "@/lib/validators";
import type { RegistrationMethod } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string; registrationId: string }> };

function databaseError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return NextResponse.json({ error: "此電郵已有有效報名紀錄" }, { status: 409 });
  }
  if (error.message.includes("EVENT_FULL")) {
    return NextResponse.json({ error: "活動名額已滿，不能將此報名改為已確認" }, { status: 409 });
  }
  return null;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await assertAdminForApi();

    const { id, registrationId } = await params;
    const parsed = adminRegistrationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "報名資料不完整" }, { status: 400 });
    }

    const supabase = await createClient();
    const [{ data: event, error: eventError }, { data: registration, error: registrationError }] = await Promise.all([
      supabase.from("events").select("id, registration_methods").eq("id", id).maybeSingle(),
      supabase.from("registrations").select("id").eq("id", registrationId).eq("event_id", id).maybeSingle(),
    ]);
    if (eventError) throw eventError;
    if (registrationError) throw registrationError;
    if (!event) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    if (!registration) return NextResponse.json({ error: "找不到報名資料" }, { status: 404 });
    if (!(event.registration_methods as RegistrationMethod[]).includes(parsed.data.method)) {
      return NextResponse.json({ error: "此活動不支援所選報名方式" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("registrations")
      .update({
        full_name: parsed.data.fullName,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone,
        method: parsed.data.method,
        status: parsed.data.status,
        attended_at: parsed.data.attendedAt,
        notes: parsed.data.notes || null,
      })
      .eq("id", registrationId)
      .eq("event_id", id)
      .select("*")
      .single();
    if (error) {
      const response = databaseError(error);
      if (response) return response;
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "未能更新報名資料" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  try {
    await assertAdminForApi();

    const { id, registrationId } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("registrations")
      .delete()
      .eq("id", registrationId)
      .eq("event_id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "找不到報名資料" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "未能刪除報名資料" }, { status: 500 });
  }
}
