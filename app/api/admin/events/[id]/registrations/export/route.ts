import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    }
    const { id } = await params;
    const admin = createAdminClient();
    const [{ data: event, error: eventError }, { data: registrations, error: registrationError }] = await Promise.all([
      admin.from("events").select("title, slug").eq("id", id).maybeSingle(),
      admin.from("registrations").select("registration_no, full_name, email, phone, method, status, created_at, attended_at, notes").eq("event_id", id).order("created_at", { ascending: true }),
    ]);
    if (eventError || !event) return NextResponse.json({ error: "找不到活動" }, { status: 404 });
    if (registrationError) throw registrationError;

    const header = ["報名編號", "姓名", "電郵", "電話", "報名方式", "狀態", "申請時間", "出席時間", "備註"];
    const rows = (registrations ?? []).map((row) => [
      row.registration_no,
      row.full_name,
      row.email ?? "",
      row.phone,
      row.method === "online" ? "網上報名" : "親身報名",
      row.status,
      row.created_at,
      row.attended_at ?? "",
      row.notes ?? "",
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}-registrations.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "未能匯出報名名單" }, { status: 500 });
  }
}
