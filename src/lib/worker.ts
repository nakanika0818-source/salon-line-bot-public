import { db, check } from "./db";
import { answerQuestion, positiveEnv } from "./ai";
import { eventSchema, lineSend } from "./line";
import { unsupportedReply, testUserAllowed } from "./decision";
import type { Faq, Menu } from "./types";

export async function processEvent(id: string) {
  const client = db();
  const claimed = check(await client.rpc("claim_event", { event_key: id }));
  if (!Array.isArray(claimed) || !claimed.length) return;
  const job = claimed[0];
  const event = eventSchema.parse(job.payload);
  const uid = event.source.userId;
  if (event.type === "unsend" && uid && event.unsend) {
    check(
      await client
        .from("webhook_events")
        .delete()
        .eq("payload->message->>id", event.unsend.messageId)
        .eq("payload->source->>userId", uid),
    );
    check(
      await client
        .from("webhook_events")
        .update({ state: "completed", reply_status: "skipped" })
        .eq("id", id),
    );
    return;
  }
  if (
    event.type !== "message" ||
    event.source.type !== "user" ||
    !uid ||
    !event.replyToken
  ) {
    check(
      await client
        .from("webhook_events")
        .update({ state: "completed", reply_status: "skipped" })
        .eq("id", id),
    );
    return;
  }
  const text =
    event.message?.type === "text"
      ? event.message.text || ""
      : "[テキスト以外のメッセージ]";
  let conversationId: string | undefined;
  try {
    const conversation = check(
      await client
        .from("conversations")
        .upsert(
          { line_user_id: uid, updated_at: new Date().toISOString() },
          { onConflict: "line_user_id" },
        )
        .select("id,mode")
        .single(),
    );
    if (!conversation) throw new Error("Conversation unavailable");
    conversationId = conversation.id;
    check(
      await client.from("messages").upsert(
        {
          event_id: id,
          conversation_id: conversation.id,
          direction: "in",
          text: text.slice(0, 1000),
        },
        { onConflict: "event_id,direction", ignoreDuplicates: true },
      ),
    );
    if (conversation.mode === "human") {
      check(
        await client
          .from("webhook_events")
          .update({ state: "completed", reply_status: "skipped" })
          .eq("id", id),
      );
      return;
    }
    if (!testUserAllowed(uid)) {
      check(
        await client
          .from("webhook_events")
          .update({ state: "completed", reply_status: "skipped" })
          .eq("id", id),
      );
      return;
    }
    // Picked up after the reply token expired (recovery run): hand off without calling AI.
    if (replyWindowPassed(event.timestamp)) {
      await handOff(id, conversation.id, "返信期限超過：" + text.slice(0, 900));
      return;
    }
    let result = { text: unsupportedReply, handoff: false };
    if (process.env.BOT_MODE === "echo") {
      result = {
        text: text.slice(0, 1000) || unsupportedReply,
        handoff: false,
      };
    } else if (event.message?.type === "text") {
      const [faqs, menus] = await Promise.all([
        client.from("faqs").select("*").eq("enabled", true).limit(20),
        client.from("menus").select("*").order("name").limit(30),
      ]);
      result = await answerQuestion(
        text,
        uid,
        check(faqs) as Faq[],
        check(menus) as Menu[],
      );
    }
    if (result.handoff)
      check(
        await client.rpc("open_handoff", {
          event_key: id,
          conversation_key: conversation.id,
          question_text: text.slice(0, 1000),
        }),
      );
    if (!result.handoff) {
      const latest = check(
        await client
          .from("conversations")
          .select("mode")
          .eq("id", conversation.id)
          .single(),
      );
      if (!latest || latest.mode === "human") {
        check(
          await client
            .from("webhook_events")
            .update({ state: "completed", reply_status: "skipped" })
            .eq("id", id),
        );
        return;
      }
    }
    // Never automatically retry a reply after transmission starts: its result may be unknown.
    if (replyWindowPassed(event.timestamp)) {
      await handOff(id, conversation.id, "返信期限超過：" + text.slice(0, 900));
      return;
    }
    check(
      await client
        .from("webhook_events")
        .update({ reply_status: "sending" })
        .eq("id", id),
    );
    const response = await lineSend("reply", {
      replyToken: event.replyToken,
      messages: [{ type: "text", text: result.text }],
    });
    if (!response.ok) {
      check(
        await client.rpc("open_handoff", {
          event_key: id,
          conversation_key: conversation.id,
          question_text: "LINE返信エラー：" + text.slice(0, 900),
        }),
      );
      check(
        await client
          .from("webhook_events")
          .update({ state: "failed", reply_status: "unknown" })
          .eq("id", id),
      );
      return;
    }
    check(
      await client.from("messages").upsert(
        {
          event_id: id,
          conversation_id: conversation.id,
          direction: "out",
          text: result.text,
        },
        { onConflict: "event_id,direction", ignoreDuplicates: true },
      ),
    );
    check(
      await client
        .from("webhook_events")
        .update({ state: "completed", reply_status: "sent" })
        .eq("id", id),
    );
  } catch {
    const current = check(
      await client
        .from("webhook_events")
        .select("state,reply_status")
        .eq("id", id)
        .single(),
    );
    if (current?.reply_status === "sending")
      check(
        await client
          .from("webhook_events")
          .update({ state: "uncertain", reply_status: "unknown" })
          .eq("id", id),
      );
    else if (
      current?.state === "processing" &&
      current.reply_status === "pending"
    )
      // Failed before transmission. Recovery runs only daily or on the next message,
      // after the reply token expires, so hand off now. If this fails too, the lease remains.
      await handOffAfterError(id, uid, conversationId, text);
  }
}

const replyWindowPassed = (timestamp: number) =>
  Date.now() - timestamp > 55000;

// open_handoff is idempotent per event; only a still-unsent event is marked failed.
async function handOff(id: string, conversationId: string, question: string) {
  const client = db();
  check(
    await client.rpc("open_handoff", {
      event_key: id,
      conversation_key: conversationId,
      question_text: question,
    }),
  );
  check(
    await client
      .from("webhook_events")
      .update({ state: "failed", reply_status: "skipped" })
      .eq("id", id)
      .eq("reply_status", "pending"),
  );
}

async function handOffAfterError(
  id: string,
  uid: string,
  conversationId: string | undefined,
  text: string,
) {
  const client = db();
  const skip = async () =>
    check(
      await client
        .from("webhook_events")
        .update({ state: "completed", reply_status: "skipped" })
        .eq("id", id)
        .eq("reply_status", "pending"),
    );
  // Same rules as the normal path: never notify the owner about a non-test user or a human-mode chat.
  if (!testUserAllowed(uid)) return skip();
  const conversation = check(
    conversationId
      ? await client
          .from("conversations")
          .select("id,mode")
          .eq("id", conversationId)
          .single()
      : await client
          .from("conversations")
          .upsert({ line_user_id: uid }, { onConflict: "line_user_id" })
          .select("id,mode")
          .single(),
  );
  if (!conversation) throw new Error("Conversation unavailable");
  if (conversation.mode === "human") return skip();
  await handOff(id, conversation.id, "処理エラー：" + text.slice(0, 900));
}

// Shared by the daily cron and every webhook request: picks up events whose own request stopped.
export async function recoverStaleEvents(limit: number, pendingAgeMs: number) {
  const client = db();
  const now = new Date().toISOString();
  check(
    await client
      .from("webhook_events")
      .update({ state: "uncertain", reply_status: "unknown" })
      .eq("state", "processing")
      .eq("reply_status", "sending")
      .lt("lease_until", now),
  );
  const leased = check(
    await client
      .from("webhook_events")
      .select("id")
      .eq("state", "processing")
      .eq("reply_status", "pending")
      .lt("lease_until", now)
      .order("created_at")
      .limit(limit),
  );
  // Leave fresh pending events to the request that received them.
  const orphaned = check(
    await client
      .from("webhook_events")
      .select("id")
      .eq("state", "pending")
      .eq("reply_status", "pending")
      .lt("created_at", new Date(Date.now() - pendingAgeMs).toISOString())
      .order("created_at")
      .limit(limit),
  );
  const ids = [...(leased || []), ...(orphaned || [])]
    .slice(0, limit)
    .map((j) => j.id);
  // One at a time: after the first handoff, a user's later stale messages stop as human mode
  // instead of each notifying the owner.
  for (const id of ids) await processEvent(id).catch(() => undefined);
}

export async function processWebhookEvents(ids: string[]) {
  await Promise.allSettled(ids.map((id) => processEvent(id)));
  // Runs after this request's replies are sent, so it does not delay them.
  await recoverStaleEvents(3, 20000);
  await queueUsageAlert();
  await flushNotifications();
}

export async function flushNotifications() {
  const client = db();
  const pending = check(
    await client
      .from("notification_outbox")
      .select("*")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5)
      .lte("next_attempt_at", new Date().toISOString())
      .order("created_at")
      .limit(10),
  );
  for (const notice of pending || []) {
    // Claim before sending: concurrent flushes (webhook, cron, retry button) skip a claimed notice.
    const claimed = check(
      await client
        .from("notification_outbox")
        .update({
          next_attempt_at: new Date(Date.now() + 120000).toISOString(),
        })
        .eq("id", notice.id)
        .eq("next_attempt_at", notice.next_attempt_at)
        .in("status", ["pending", "failed"])
        .select("id"),
    );
    if (!claimed?.length) continue;
    let success = false;
    try {
      const owner = process.env.LINE_OWNER_USER_ID;
      const appUrl = new URL(process.env.APP_URL || "");
      if (!owner || appUrl.protocol !== "https:")
        throw new Error("Notification configuration missing");
      const message =
        notice.kind === "usage"
          ? "AI利用が上限の80％に近づいています。管理画面で確認してください。"
          : `確認が必要なお問い合わせがあります。管理画面で内容を確認し、公式LINEからご返信ください。`;
      const response = await lineSend(
        "push",
        {
          to: owner,
          messages: [{ type: "text", text: `${message}\n${appUrl.origin}` }],
        },
        notice.id,
      );
      success =
        response.ok ||
        (response.status === 409 &&
          !!response.headers.get("x-line-accepted-request-id"));
    } catch {
      /* Retry with the same LINE retry key. No customer content in logs. */
    }
    check(
      await client
        .from("notification_outbox")
        .update({
          status: success ? "sent" : "failed",
          attempts: notice.attempts + 1,
          next_attempt_at: new Date(
            Date.now() + 60000 * 2 ** notice.attempts,
          ).toISOString(),
        })
        .eq("id", notice.id),
    );
    if (notice.handoff_id)
      check(
        await client
          .from("handoffs")
          .update({ notification_status: success ? "sent" : "failed" })
          .eq("id", notice.handoff_id),
      );
  }
}

export async function queueUsageAlert() {
  const client = db();
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const start = `${month}-01T00:00:00+09:00`;
  const rows = check(
    await client
      .from("ai_requests")
      .select("cost_usd")
      .gte("created_at", start),
  );
  if (
    (rows?.length || 0) >= positiveEnv("AI_MONTHLY_LIMIT", 500) * 0.8 ||
    (rows || []).reduce((s, r) => s + Number(r.cost_usd), 0) >=
      positiveEnv("AI_MONTHLY_BUDGET_USD", 7) * 0.8
  )
    check(
      await client
        .from("notification_outbox")
        .upsert(
          { dedupe_key: `usage:${month}`, kind: "usage" },
          { onConflict: "dedupe_key", ignoreDuplicates: true },
        ),
    );
}

export async function maintenance() {
  // Bound worker duration; remaining jobs are picked up by the next webhook or scheduled run.
  await recoverStaleEvents(10, 0);
  await queueUsageAlert();
  await flushNotifications();
  check(await db().rpc("retain_recent_data"));
}
