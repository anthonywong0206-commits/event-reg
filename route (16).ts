import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkInSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "預覽模式未連接雲端資料庫" }, { status: 503 });
    }
    const parsed = checkInSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "憑證無效" }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("registrations")
      .select("id, registration_no, full_name, status, attended_at, event:events(title)")
      .eq("qr_token", parsed.data.token)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "找不到此 QR Code 對應的報名紀錄" }, { status: 404 });
    if (data.status !== "confirmed") return NextResponse.json({ error: "此報名已取消或未確認" }, { status: 409 });

    const eventRelation = data.event as unknown as { title: string } | { title: string }[] | null;
    const eventTitle = Array.isArray(eventRelation) ? eventRelation[0]?.title : eventRelation?.title;
    if (data.attended_at) {
      return NextResponse.json({ registration_no: data.registration_no, full_name: data.full_name, event_title: eventTitle || "活動", attended_at: data.attended_at, already_checked_in: true });
    }

    const attendedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("registrations")
      .update({ attended_at: attendedAt })
      .eq("id", data.id)
      .is("attended_at", null)
      .select("attended_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      const { data: latest, error: latestError } = await admin
        .from("registrations")
        .select("attended_at")
        .eq("id", data.id)
        .single();
      if (latestError) throw latestError;
      return NextResponse.json({
        registration_no: data.registration_no,
        full_name: data.full_name,
        event_title: eventTitle || "活動",
        attended_at: latest.attended_at,
        already_checked_in: true,
      });
    }
    return NextResponse.json({ registration_no: data.registration_no, full_name: data.full_name, event_title: eventTitle || "活動", attended_at: updated.attended_at });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "請先以管理員身分登入" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "未能完成出席登記" }, { status: 500 });
  }
}
