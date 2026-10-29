import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validSignature, eventSchema } from "../src/lib/line";
import { POST as webhook } from "../src/app/api/line/webhook/route";
import { GET as admin, POST as edit } from "../src/app/api/admin/route";
import { GET as maintenance } from "../src/app/api/maintenance/route";
test("LINE署名：改ざん・欠落・長さ不正を拒否", () => {
  const body = '{"events":[]}',
    secret = "test-only-secret",
    sig = createHmac("sha256", secret).update(body).digest("base64");
  assert.equal(validSignature(body, sig, secret), true);
  assert.equal(validSignature(body + " ", sig, secret), false);
  assert.equal(validSignature(body, null, secret), false);
  assert.equal(validSignature(body, "a", secret), false);
  assert.equal(validSignature(body, sig, ""), false);
});
test("Webhook実モードでは不正な署名を401にする", async () => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.LINE_CHANNEL_SECRET = "test-only";
  const r = await webhook(
    new Request("http://localhost/api/line/webhook", {
      method: "POST",
      body: '{"events":[]}',
    }),
  );
  assert.equal(r.status, 401);
});
test("未認証では管理一覧・編集を使えない", async () => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  for (const handler of [admin, edit]) {
    const r = await handler(new Request("http://localhost/api/admin"));
    assert.equal(r.status, 401);
  }
});
test("デモモードで実管理APIを使えない", async () => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  assert.equal(
    (await admin(new Request("http://localhost/api/admin"))).status,
    403,
  );
  assert.equal(
    (
      await webhook(
        new Request("http://localhost/api/line/webhook", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
    503,
  );
});
test("定期処理は秘密値なし・不一致なら拒否する", async () => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.CRON_SECRET = "test-only-secret";
  assert.equal(
    (await maintenance(new Request("http://localhost/api/maintenance"))).status,
    401,
  );
});
test("Webhookの異常なイベントを拒否", () => {
  assert.equal(eventSchema.safeParse({ type: "message" }).success, false);
});
