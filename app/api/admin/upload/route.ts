import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAdminForApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadRequest = {
  name?: unknown;
  type?: unknown;
  size?: unknown;
};

export async function POST(request: Request) {
  try {
    await assertAdminForApi();
    if (!isServiceRoleConfigured()) {
      return NextResponse.json({ error: "Supabase 尚未完成設定" }, { status: 503 });
    }

    // Important: only metadata passes through the Vercel Function. The browser
    // uploads the actual file directly to Supabase using the signed token below,
    // avoiding Vercel request-body limits.
    const body = (await request.json().catch(() => null)) as UploadRequest | null;
    const fileType = typeof body?.type === "string" ? body.type : "";
    const fileSize = typeof body?.size === "number" ? body.size : Number(body?.size);

    if (!body || !fileType || !Number.isFinite(fileSize)) {
      return NextResponse.json({ error: "圖片資料不完整" }, { status: 400 });
    }
    if (!allowedTypes.has(fileType)) {
      return NextResponse.json({ error: "只支援 JPG、PNG 或 WebP" }, { status: 415 });
    }
    if (fileSize <= 0 || fileSize > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "圖片不可大於 8MB" }, { status: 413 });
    }

    const extension = fileType === "image/png" ? "png" : fileType === "image/webp" ? "webp" : "jpg";
    const path = `events/${new Date().getUTCFullYear()}/${randomUUID()}.${extension}`;
    const admin = createAdminClient();

    const { data: signedUpload, error: signedUploadError } = await admin.storage
      .from("event-media")
      .createSignedUploadUrl(path);
    if (signedUploadError) throw signedUploadError;

    const { data: publicData } = admin.storage.from("event-media").getPublicUrl(path);

    return NextResponse.json({
      path,
      token: signedUpload.token,
      url: publicData.publicUrl,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "未獲授權" }, { status: 401 });
    }
    console.error("Create signed upload failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? `圖片上載初始化失敗：${error.message}` : "圖片上載初始化失敗" },
      { status: 500 },
    );
  }
}
