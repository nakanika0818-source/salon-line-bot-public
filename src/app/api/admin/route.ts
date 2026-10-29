import { z } from "zod";
import { requireOwner, check, safeError } from "@/lib/db";
import { flushNotifications } from "@/lib/worker";
export const dynamic = "force-dynamic";
const category = z.enum([
  "hours",
  "price",
  "booking",
  "combination",
  "parking",
]);
const faq = z
  .object({
    id: z.uuid().optional(),
    category,
    question: z.string().trim().min(1).max(200),
    answer: z.string().trim().min(1).max(1000),
    enabled: z.boolean(),
  })
  .strict();
const menu = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(80),
    price_yen: z.number().int().min(0).max(1000000),
    duration_minutes: z.number().int().min(1).max(1440),
    notes: z.string().trim().max(300),
  })
  .strict();
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("faq_save"), value: faq }),
  z.object({ action: z.literal("menu_save"), value: menu }),
  z.object({
    action: z.enum(["faq_delete", "menu_delete", "resume", "close"]),
    id: z.uuid(),
  }),
  z.object({ action: z.literal("retry_notifications") }),
]);
export async function GET(request: Request) {
  try {
    const client = await requireOwner(request);
    const month = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    const results = await Promise.all([
      client
        .from("faqs")
        .select("id,category,question,answer,enabled")
        .order("category"),
      client
        .from("menus")
        .select("id,name,price_yen,duration_minutes,notes")
        .order("name"),
      client
        .from("conversations")
        .select("id,mode,updated_at")
        .order("updated_at", { ascending: false })
        .limit(100),
      client
        .from("messages")
        .select("id,conversation_id,direction,text,created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      client
        .from("handoffs")
        .select(
          "id,conversation_id,question,status,notification_status,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      client
        .from("webhook_events")
        .select("id,state,reply_status,created_at")
        .in("state", ["failed", "uncertain"])
        .order("created_at", { ascending: false })
        .limit(30),
      client
        .from("ai_requests")
        .select("id", { count: "exact", head: true })
        .gte("created_at", `${month}-01T00:00:00+09:00`),
    ]);
    results.forEach(check);
    return Response.json(
      {
        faqs: results[0].data,
        menus: results[1].data,
        conversations: results[2].data,
        messages: results[3].data,
        handoffs: results[4].data,
        issues: results[5].data,
        aiCount: results[6].count || 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(request: Request) {
  try {
    const client = await requireOwner(request);
    const raw = await request.text();
    if (raw.length > 20000) return new Response(null, { status: 413 });
    const parsed = action.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return Response.json(
        { error: "入力内容を確認してください" },
        { status: 400 },
      );
    const a = parsed.data;
    switch (a.action) {
      case "faq_save":
      case "menu_save": {
        const table = a.action === "faq_save" ? "faqs" : "menus";
        if (!a.value.id) {
          const counted = await client
            .from(table)
            .select("id", { count: "exact", head: true });
          check(counted);
          if ((counted.count || 0) >= (table === "faqs" ? 20 : 30))
            return Response.json(
              { error: "登録上限です。既存の項目を整理してください。" },
              { status: 400 },
            );
        }
        check(
          await client
            .from(table)
            .upsert({ ...a.value, updated_at: new Date().toISOString() }),
        );
        break;
      }
      case "faq_delete":
        check(await client.from("faqs").delete().eq("id", a.id));
        break;
      case "menu_delete":
        check(await client.from("menus").delete().eq("id", a.id));
        break;
      case "close":
        check(
          await client
            .from("handoffs")
            .update({ status: "closed" })
            .eq("id", a.id),
        );
        break;
      case "resume":
        check(
          await client.rpc("resume_conversation", { conversation_key: a.id }),
        );
        break;
      case "retry_notifications":
        check(
          await client
            .from("notification_outbox")
            .update({ attempts: 0, next_attempt_at: new Date().toISOString() })
            .eq("status", "failed"),
        );
        await flushNotifications();
        break;
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof SyntaxError)
      return Response.json({ error: "入力形式が不正です" }, { status: 400 });
    return safeError(e);
  }
}
