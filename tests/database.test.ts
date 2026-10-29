import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("SQL：RLS、重複排除、排他取得、有人切替、費用上限、保持期間", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const stranger = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await db.exec(
    `insert into auth.users values('${owner}'),('${stranger}');insert into admin_users values('${owner}');insert into faqs(category,question,answer) values('hours','何時？','10時です');`,
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${stranger}',false);`,
  );
  assert.equal((await db.query("select * from faqs")).rows.length, 0);
  await assert.rejects(() =>
    db.exec(
      `insert into faqs(category,question,answer) values('hours','x','x')`,
    ),
  );
  await assert.rejects(() => db.query(`select * from claim_event('e1')`));
  await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false);`);
  assert.equal((await db.query("select * from faqs")).rows.length, 1);
  await db.exec(`update faqs set answer='11時です';reset role;`);
  await db.exec(
    `insert into webhook_events(id,payload) values('e1','{}');insert into webhook_events(id,payload) values('e1','{}') on conflict(id) do nothing;`,
  );
  assert.equal((await db.query("select * from webhook_events")).rows.length, 1);
  assert.equal(
    (await db.query(`select * from claim_event('e1')`)).rows.length,
    1,
  );
  assert.equal(
    (await db.query(`select * from claim_event('e1')`)).rows.length,
    0,
  );
  await db.exec(
    `update webhook_events set lease_until=now()-interval '1 minute' where id='e1'`,
  );
  assert.equal(
    (await db.query(`select * from claim_event('e1')`)).rows.length,
    1,
  );
  await db.exec(
    `update webhook_events set lease_until=now()-interval '1 minute',reply_status='sending' where id='e1'`,
  );
  assert.equal(
    (await db.query(`select * from claim_event('e1')`)).rows.length,
    0,
  );
  const cid = (
    await db.query<{ id: string }>(
      `insert into conversations(line_user_id) values('Utest') returning id`,
    )
  ).rows[0].id;
  await db.query(`select open_handoff('e1',$1,'予約したい')`, [cid]);
  await db.query(`select open_handoff('e1',$1,'予約したい')`, [cid]);
  assert.equal((await db.query(`select * from handoffs`)).rows.length, 1);
  assert.equal(
    (await db.query(`select * from notification_outbox`)).rows.length,
    1,
  );
  assert.equal(
    (await db.query<{ mode: string }>(`select mode from conversations`)).rows[0]
      .mode,
    "human",
  );
  await db.query(`select resume_conversation($1)`, [cid]);
  assert.equal(
    (await db.query<{ mode: string }>(`select mode from conversations`)).rows[0]
      .mode,
    "bot",
  );
  assert.equal(
    (await db.query<{ status: string }>(`select status from handoffs`)).rows[0]
      .status,
    "closed",
  );
  const reserve = () =>
    db.query<{ id: string | null }>(
      `select reserve_ai('Utest',0.04,500,20,0.07) as id`,
    );
  assert.ok((await reserve()).rows[0].id);
  assert.equal((await reserve()).rows[0].id, null);
  await db.exec(`delete from ai_requests`);
  assert.ok(
    (
      await db.query<{ id: string }>(
        `select reserve_ai('Utest',0.01,500,1,7) as id`,
      )
    ).rows[0].id,
  );
  assert.equal(
    (
      await db.query<{ id: string | null }>(
        `select reserve_ai('Utest',0.01,500,1,7) as id`,
      )
    ).rows[0].id,
    null,
  );
  await db.exec(
    `update webhook_events set created_at=now()-interval '31 days';update conversations set updated_at=now()-interval '31 days';select retain_recent_data();`,
  );
  assert.equal((await db.query("select * from webhook_events")).rows.length, 0);
  assert.equal((await db.query("select * from handoffs")).rows.length, 0);
  assert.equal((await db.query("select * from conversations")).rows.length, 0);
  const seed=await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8');
  await db.exec(seed);await db.exec(seed);
  assert.equal((await db.query('select * from faqs')).rows.length,6);
  assert.equal((await db.query('select * from menus')).rows.length,3);
  await db.close();
});
