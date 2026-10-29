import { after } from "next/server";
import { z } from "zod";
import { db, check, demoMode } from "@/lib/db";
import { validSignature, eventSchema } from "@/lib/line";
import { processWebhookEvents } from "@/lib/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (demoMode())
    return Response.json(
      { error: "Webhookは実接続モード専用です" },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length") || 0) > 256000)
    return new Response(null, { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 256000)
    return new Response(null, { status: 413 });
  if (
    !validSignature(
      body,
      request.headers.get("x-line-signature"),
      process.env.LINE_CHANNEL_SECRET || "",
    )
  )
    return new Response(null, { status: 401 });
  let events;
  try {
    events = z
      .object({ events: z.array(eventSchema).max(100) })
      .parse(JSON.parse(body)).events;
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    if (events.length)
      check(
        await db()
          .from("webhook_events")
          .upsert(
            events.map((e) => ({ id: e.webhookEventId, payload: e })),
            { onConflict: "id", ignoreDuplicates: true },
          ),
      );
    after(async () => {
      try {
        await processWebhookEvents(events.map((e) => e.webhookEventId));
      } catch {
        console.error(
          "Webhook background processing incomplete; next webhook or daily maintenance retries.",
        );
      }
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "受信保存に失敗しました" }, { status: 503 });
  }
}
