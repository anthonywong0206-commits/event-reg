import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ORDINARY_TEST_PASSWORD;
const appUrl = process.env.TEST_APP_URL || "http://127.0.0.1:3000";

if (!url || !publishableKey || !serviceKey || !password) {
  console.error("Missing environment variables for the Auth access test.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const email = `event-reg-access-test-${Date.now()}@users.noreply.github.com`;
let userId;

try {
  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !data.user) throw createError || new Error("Ordinary user was not created.");
  userId = data.user.id;

  const publicClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInError } = await publicClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signIn.user) throw signInError || new Error("Ordinary user could not sign in.");

  const response = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, next: "/admin" }),
  });
  const body = await response.json();
  if (response.status !== 403 || body.error !== "此帳戶沒有後台權限。") {
    throw new Error(`Expected ordinary-user rejection, received HTTP ${response.status}.`);
  }

  console.log(JSON.stringify({ ordinary_auth_login: true, admin_route_denied: true }));
} finally {
  if (userId) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) console.error("Temporary Auth user cleanup failed.");
  }
}
