import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { sendRegistrationEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import type { EventRecord, RegistrationRecord } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string; registrationId: string }> };

export const runtime = "nodejs";

export async function POST(_: Request, { params }: RouteParams) {
  try {
    await assertAdminForApi();
    const { id, registrationId } = await params;
    const supabase = await createClient();

    const [{ data: event, error: eventError }, { data: registration, error: registrationError }] = await Promise.all([
      supabase.from("events").select("*").eq("id", id).maybeSingle(),
      supabase.from("registrations").select("*").eq("id", registrationId).eq("event_id", id).maybeSingle(),
    ]);

    if (eventError) throw eventError;
    if (registrationError) throw registrationError;
    if (!event) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    if (!registration) return NextResponse.json({ error: "找不到報名資料" }, { status: 404 });

    const result = await sendRegistrationEmail(
      registration as RegistrationRecord,
      event as EventRecord,
      { idempotencyKey: `registration/${registrationId}/resend/${randomUUID()}` },
    );

    const { error: updateError } = await supabase
      .from("registrations")
      .update({ email_sent: result.sent, email_error: result.error || null })
      .eq("id", registrationId)
      .eq("event_id", id);
    if (updateError) throw updateError;

    if (!result.sent) {
      return NextResponse.json(
        { error: result.error || "未能發送確認電郵" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "未能發送確認電郵" }, { status: 500 });
  }
}
