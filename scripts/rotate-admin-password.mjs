import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!url || !serviceKey || !email || !password) {
  console.error("Missing Supabase or admin password environment variables.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) {
  console.error("Unable to list Auth users:", error.message);
  process.exit(1);
}

const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error("Admin Auth user was not found.");
  process.exit(1);
}

const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password });
if (updateError) {
  console.error("Unable to rotate admin password:", updateError.message);
  process.exit(1);
}

console.log("管理員密碼已安全更新。");
