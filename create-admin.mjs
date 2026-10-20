import { createClient } from "@supabase/supabase-js";

const [email, password, displayName = "管理員"] = process.argv.slice(2);
if (!email || !password) {
  console.error('用法：npm run create-admin -- admin@example.com "StrongPassword" "顯示名稱"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("請先在 .env.local 設定 NEXT_PUBLIC_SUPABASE_URL 及 SUPABASE_SERVICE_ROLE_KEY。");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: "admin" },
});
if (error || !data.user) {
  console.error("建立 Auth 帳戶失敗：", error?.message || "Unknown error");
  process.exit(1);
}

const { error: profileError } = await supabase.from("admin_profiles").insert({
  user_id: data.user.id,
  display_name: displayName,
  role: "admin",
});
if (profileError) {
  await supabase.auth.admin.deleteUser(data.user.id);
  console.error("建立管理員資料失敗，已移除 Auth 帳戶：", profileError.message);
  process.exit(1);
}

console.log(`管理員已建立：${email}（${displayName}）`);
