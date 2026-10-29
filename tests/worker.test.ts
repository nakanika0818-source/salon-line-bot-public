import test from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "./fakePostgrest";
import {
  flushNotifications,
  processWebhookEvents,
  recoverStaleEvents,
} from "../src/lib/worker";

const testUser = "Utest";
const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://unit-test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "unit-test-service",
  LINE_CHANNEL_ACCESS_TOKEN: "unit-test-line",
  LINE_OWNER_USER_ID: "Uowner",
  APP_URL: "https://salon.example.test",
  TEST_LINE_USER_ID: testUser,
  TEST_USER_ONLY: "true",
  BOT_MODE: "echo",
  ANTHROPIC_API_KEY: "unit-test-key",
  ANTHROPIC_MODEL: "claude-sonnet-4-6",
};

async function setup(t: test.TestContext, overrides: Record<string, string> = {}) {
  const saved = { ...process.env };
  const original = globalThis.fetch;
  Object.assign(process.env, env, overrides);
  const fake = await createFakeSupabase();
  globalThis.fetch = fake.fetch;
  t.after(() => {
    globalThis.fetch = original;
    process.env = saved;
  });
  const addEvent = async (
    id: string,
    o: {
      text?: string;
      user?: string;
      ageMs?: number;
      state?: string;
      reply?: string;
      leaseExpired?: boolean;
    } = {},
  ) => {
    const ts = Date.now() - (o.ageMs ?? 0);
    const payload = {
      type: "message",
      webhookEventId: id,
      timestamp: ts,
      source: { type: "user", userId: o.user ?? testUser },
      replyToken: `rt-${id}`,
      message: { type: "text", text: o.text ?? "こんにちは" },
    };
    await fake.db.query(
      `insert into webhook_events(id,payload,state,reply_status,lease_until,created_at)
       values($1,$2,$3,$4,$5,$6)`,
      [
        id,
        JSON.stringify(payload),
        o.state ?? "pending",
        o.reply ?? "pending",
        o.leaseExpired ? new Date(Date.now() - 60000).toISOString() : null,
        new Date(ts).toISOString(),
      ],
    );
  };
  const one = async <T>(sql: string, params: unknown[] = []) =>
    (await fake.db.query<T>(sql, params)).rows;
  const replies = () => fake.line.filter((c) => c.url.endsWith("/reply"));
  const pushes = () => fake.line.filter((c) => c.url.endsWith("/push"));
  const event = async (id: string) =>
    (
      await one<{ state: string; reply_status: string }>(
        `select state,reply_status from webhook_events where id=$1`,
        [id],
      )
    )[0];
  return { fake, addEvent, one, replies, pushes, event };
}

test("拾い直し：返信済み・送信中・有人対応中の受信へ追加の返信や引き継ぎをしない", async (t) => {
  const s = await setup(t, { BOT_MODE: "faq" });
  await s.addEvent("sent", { ageMs: 300000, state: "completed", reply: "sent" });
  await s.addEvent("sending", {
    ageMs: 300000,
    state: "processing",
    reply: "sending",
    leaseExpired: true,
  });
  await s.addEvent("skipped", { ageMs: 300000, state: "completed", reply: "skipped" });
  const cid = (
    await s.one<{ id: string }>(
      `insert into conversations(line_user_id,mode) values($1,'human') returning id`,
      [testUser],
    )
  )[0].id;
  await s.addEvent("human", {
    ageMs: 300000,
    state: "processing",
    leaseExpired: true,
    text: "予約したい",
  });
  await Promise.all([recoverStaleEvents(10, 0), recoverStaleEvents(10, 0)]);
  await flushNotifications();
  assert.equal(s.replies().length, 0);
  assert.equal(s.pushes().length, 0);
  assert.equal(s.fake.anthropic.length, 0);
  assert.equal((await s.one(`select * from handoffs`)).length, 0);
  assert.deepEqual(await s.event("sent"), { state: "completed", reply_status: "sent" });
  assert.deepEqual(await s.event("sending"), { state: "uncertain", reply_status: "unknown" });
  assert.deepEqual(await s.event("skipped"), { state: "completed", reply_status: "skipped" });
  assert.deepEqual(await s.event("human"), { state: "completed", reply_status: "skipped" });
  assert.equal(
    (await s.one<{ mode: string }>(`select mode from conversations where id=$1`, [cid]))[0].mode,
    "human",
  );
});

test("同時処理：同じ受信を同時に処理しても返信は1回", async (t) => {
  const s = await setup(t);
  await s.addEvent("fresh");
  await Promise.all([
    processWebhookEvents(["fresh"]),
    processWebhookEvents(["fresh"]),
    recoverStaleEvents(3, 0),
  ]);
  assert.equal(s.replies().length, 1);
  assert.equal((await s.one(`select * from handoffs`)).length, 0);
  assert.deepEqual(await s.event("fresh"), { state: "completed", reply_status: "sent" });
});

test("同時処理：期限切れの受信はAIを呼ばず、引き継ぎと通知を1回だけ行う", async (t) => {
  const s = await setup(t, { BOT_MODE: "faq" });
  await s.addEvent("stale", {
    ageMs: 300000,
    state: "processing",
    leaseExpired: true,
    text: "パーマとカラーは同時にできますか",
  });
  await Promise.all([
    processWebhookEvents([]),
    processWebhookEvents([]),
    recoverStaleEvents(10, 0),
  ]);
  await Promise.all([flushNotifications(), flushNotifications()]);
  assert.equal(s.fake.anthropic.length, 0);
  assert.equal(s.replies().length, 0);
  const handoffs = await s.one<{ question: string }>(`select question from handoffs`);
  assert.equal(handoffs.length, 1);
  assert.match(handoffs[0].question, /^返信期限超過：/);
  assert.equal((await s.one(`select * from notification_outbox`)).length, 1);
  assert.equal(s.pushes().length, 1);
  assert.deepEqual(await s.event("stale"), { state: "failed", reply_status: "skipped" });
});

test("通知：同時に再送処理が走っても同じ通知を二重に送らない", async (t) => {
  const s = await setup(t);
  await s.addEvent("h1", { text: "予約したい" });
  const cid = (
    await s.one<{ id: string }>(
      `insert into conversations(line_user_id) values($1) returning id`,
      [testUser],
    )
  )[0].id;
  await s.one(`select open_handoff('h1',$1,'予約したい')`, [cid]);
  await Promise.all([flushNotifications(), flushNotifications(), flushNotifications()]);
  assert.equal(s.pushes().length, 1);
  const [notice] = await s.one<{ status: string; attempts: number }>(
    `select status,attempts from notification_outbox`,
  );
  assert.deepEqual(notice, { status: "sent", attempts: 1 });
});

test("失敗時：送信前の失敗はその場で引き継ぎ、通知する", async (t) => {
  const s = await setup(t);
  await s.addEvent("err");
  s.fake.failOnce((m, p) => m === "POST" && p === "messages");
  await processWebhookEvents(["err"]);
  assert.equal(s.replies().length, 0);
  const handoffs = await s.one<{ question: string }>(`select question from handoffs`);
  assert.equal(handoffs.length, 1);
  assert.match(handoffs[0].question, /^処理エラー：/);
  assert.equal(s.pushes().length, 1);
  assert.deepEqual(await s.event("err"), { state: "failed", reply_status: "skipped" });
  // A later recovery run neither replies nor hands off again.
  await recoverStaleEvents(10, 0);
  await flushNotifications();
  assert.equal(s.replies().length, 0);
  assert.equal((await s.one(`select * from handoffs`)).length, 1);
  assert.equal(s.pushes().length, 1);
});

test("失敗時：テスト対象外のユーザーは失敗しても引き継ぎ・通知しない", async (t) => {
  const s = await setup(t, { BOT_MODE: "faq" });
  await s.addEvent("stranger", { user: "Ustranger" });
  s.fake.failOnce((m, p) => m === "POST" && p === "messages");
  await processWebhookEvents(["stranger"]);
  assert.equal(s.replies().length, 0);
  assert.equal(s.pushes().length, 0);
  assert.equal((await s.one(`select * from handoffs`)).length, 0);
  assert.deepEqual(await s.event("stranger"), { state: "completed", reply_status: "skipped" });
});

test("失敗時：送信開始後の失敗は再送も引き継ぎもせず確認待ちにする", async (t) => {
  const s = await setup(t);
  await s.addEvent("lost");
  s.fake.setLineReply(() => {
    throw new Error("network");
  });
  await processWebhookEvents(["lost"]);
  await recoverStaleEvents(10, 0);
  assert.equal(s.replies().length, 1);
  assert.equal((await s.one(`select * from handoffs`)).length, 0);
  assert.deepEqual(await s.event("lost"), { state: "uncertain", reply_status: "unknown" });
});

test("受信時の拾い直し：今回の返信の後に行い、件数を制限し、他の受信を横取りしない", async (t) => {
  const s = await setup(t);
  for (const id of ["old1", "old2", "old3", "old4", "old5"])
    await s.addEvent(id, { ageMs: 300000, state: "processing", leaseExpired: true });
  await s.addEvent("other");
  await s.addEvent("mine");
  await processWebhookEvents(["mine"]);
  const firstReply = s.fake.log.indexOf("line reply");
  const firstRecovery = s.fake.log.findIndex((l) => l.startsWith("rpc claim_event old"));
  assert.ok(firstReply >= 0 && firstRecovery > firstReply);
  assert.equal(s.replies().length, 1);
  // Bounded to 3 per webhook. Same user: the first hands off, the rest stop as human mode.
  assert.equal(
    (await s.one(`select id from webhook_events where id like 'old%' and state<>'processing'`))
      .length,
    3,
  );
  assert.equal((await s.one(`select * from handoffs`)).length, 1);
  assert.deepEqual(await s.event("other"), { state: "pending", reply_status: "pending" });
  assert.deepEqual(await s.event("mine"), { state: "completed", reply_status: "sent" });
});
