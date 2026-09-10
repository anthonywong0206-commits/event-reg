import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "請選擇圖片" }, { status: 400 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "只支援 JPG、PNG 或 WebP" }, { status: 415 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "圖片不可大於 8MB" }, { status: 413 });

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `events/${new Date().getUTCFullYear()}/${randomUUID()}.${extension}`;
    const admin = createAdminClient();
    const { error } = await admin.storage.from("event-media").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = admin.storage.from("event-media").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    console.error(error);
    return NextResponse.json({ error: "圖片上載失敗" }, { status: 500 });
  }
}
