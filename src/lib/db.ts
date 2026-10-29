import { createClient } from "@supabase/supabase-js";
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Database operation failed");
  return result.data;
}
export const demoMode = () => process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
export async function requireOwner(request: Request) {
  if (demoMode())
    throw new Response("デモでは管理APIを使用できません", { status: 403 });
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer "))
    throw new Response("ログインしてください", { status: 401 });
  const client = db();
  const { data, error } = await client.auth.getUser(bearer.slice(7));
  if (error || !data.user)
    throw new Response("ログインし直してください", { status: 401 });
  const row = await client
    .from("admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (row.error || !row.data)
    throw new Response("管理権限がありません", { status: 403 });
  return client;
}
export function safeError(error: unknown) {
  return error instanceof Response
    ? error
    : Response.json(
        {
          error: "処理できませんでした。接続設定を確認して再度お試しください。",
        },
        { status: 500 },
      );
}
