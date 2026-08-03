import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminRegistrationSchema } from "@/lib/validators";
import type { RegistrationMethod } from "@/lib/types";

export const runtime = "nodejs";

function registrationNumber() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()).replaceAll("-", "");
  return `ER${date}${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function databaseError(error: { code?: string; message: string }) {
  if (error.code === "23505") {
    return NextResponse.json({ error: "此電郵已有有效報名紀錄" }, { status: 409 });
  }
  if (error.message.includes("EVENT_FULL")) {
    return NextResponse.json({ error: "活動名額已滿，不能新增已確認報名" }, { status: 409 });
  }
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();

    const { id } = await params;
    const parsed = adminRegistrationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "報名資料不完整" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, registration_methods")
      .eq("id", id)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    if (!(event.registration_methods as RegistrationMethod[]).includes(parsed.data.method)) {
      return NextResponse.json({ error: "此活動不支援所選報名方式" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("registrations")
      .insert({
        event_id: id,
        registration_no: registrationNumber(),
        full_name: parsed.data.fullName,
        email: parsed.data.email.toLowerCase(),
        phone: parsed.data.phone,
        method: parsed.data.method,
        status: parsed.data.status,
        attended_at: parsed.data.attendedAt,
        notes: parsed.data.notes || null,
      })
      .select("*")
      .single();
    if (error) {
      const response = databaseError(error);
      if (response) return response;
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "未能新增報名資料" }, { status: 500 });
  }
}
