import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Minimal PostgREST stand-in over PGlite for worker tests. It covers only the
// query shapes used in src/lib/worker.ts and runs the real migration SQL, so
// claim_event / open_handoff / unique keys provide the actual concurrency rules.
export type OutboundCall = { url: string; body: string };
type Fault = (method: string, path: string) => boolean;

const ops: Record<string, string> = { eq: "=", lt: "<", lte: "<=", gte: ">=" };

export async function createFakeSupabase() {
  // Keep timestamps as Postgres text (microseconds), as PostgREST returns them.
  const db = new PGlite({ parsers: { 1184: (v) => v, 1114: (v) => v } });
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  const line: OutboundCall[] = [];
  const anthropic: OutboundCall[] = [];
  const log: string[] = [];
  const faults: Fault[] = [];
  let lineReply: (body: string) => Response | Promise<Response> = () =>
    Response.json({});

  async function rest(method: string, url: URL, headers: Headers, body: string) {
    const path = url.pathname.replace("/rest/v1/", "");
    const prefer = headers.get("prefer") || "";
    const single = (headers.get("accept") || "").includes("pgrst.object");
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
      return `$${params.length}`;
    };
    if (path.startsWith("rpc/")) {
      const fn = path.slice(4);
      const args = JSON.parse(body || "{}") as Record<string, unknown>;
      log.push(`rpc ${fn} ${Object.values(args)[0] ?? ""}`);
      const named = Object.entries(args).map(([k, v]) => `${k}=>${p(v)}`);
      const { rows } = await db.query<Record<string, unknown>>(
        `select * from public.${fn}(${named.join(",")})`,
        params,
      );
      return fn === "claim_event" ? rows : (rows[0]?.[fn] ?? null);
    }
    const where: string[] = [];
    let order = "",
      limit = "",
      select = "*",
      conflict = "";
    for (const [key, raw] of url.searchParams) {
      if (key === "select") select = raw;
      else if (key === "order") {
        const [col, dir] = raw.split(".");
        order = ` order by ${col} ${dir === "desc" ? "desc" : "asc"}`;
      } else if (key === "limit") limit = ` limit ${Number(raw)}`;
      else if (key === "on_conflict") conflict = raw;
      else {
        const [op, ...rest] = raw.split(".");
        const value = rest.join(".");
        if (!/^[a-z_]+$/.test(key)) throw new Error(`Unsupported filter ${key}`);
        if (op === "in") {
          const items = value
            .replace(/^\(|\)$/g, "")
            .split(",")
            .map((s) => s.replace(/^"|"$/g, ""));
          where.push(`${key}::text in (${items.map(p).join(",")})`);
        } else if (ops[op]) where.push(`${key} ${ops[op]} ${p(value)}`);
        else throw new Error(`Unsupported operator ${op}`);
      }
    }
    const w = where.length ? ` where ${where.join(" and ")}` : "";
    const returning = prefer.includes("return=representation")
      ? ` returning ${select}`
      : "";
    let sql: string;
    if (method === "GET") sql = `select ${select} from ${path}${w}${order}${limit}`;
    else if (method === "PATCH") {
      const data = JSON.parse(body) as Record<string, unknown>;
      const set = Object.entries(data).map(([k, v]) => `${k}=${p(v)}`);
      sql = `update ${path} set ${set.join(",")}${w}${returning}`;
    } else if (method === "POST") {
      const parsed = JSON.parse(body) as
        | Record<string, unknown>
        | Record<string, unknown>[];
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const cols = Object.keys(rows[0]);
      const values = rows.map((r) => `(${cols.map((c) => p(r[c])).join(",")})`);
      const onConflict = !conflict
        ? ""
        : prefer.includes("ignore-duplicates")
          ? ` on conflict(${conflict}) do nothing`
          : ` on conflict(${conflict}) do update set ${cols.map((c) => `${c}=excluded.${c}`).join(",")}`;
      sql = `insert into ${path}(${cols.join(",")}) values ${values.join(",")}${onConflict}${returning}`;
    } else if (method === "DELETE") sql = `delete from ${path}${w}${returning}`;
    else throw new Error(`Unsupported method ${method}`);
    log.push(`${method} ${path}`);
    const { rows } = await db.query<Record<string, unknown>>(sql, params);
    if (single) {
      if (rows.length !== 1) throw Object.assign(new Error("PGRST116"), { status: 406 });
      return rows[0];
    }
    return method === "GET" || returning ? rows : undefined;
  }

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method || "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.hostname === "api.line.me") {
      line.push({ url: url.pathname, body });
      log.push(`line ${url.pathname.split("/").pop()}`);
      return url.pathname.endsWith("/reply")
        ? lineReply(body)
        : Response.json({}, { headers: { "x-line-request-id": "t" } });
    }
    if (url.hostname === "api.anthropic.com") {
      anthropic.push({ url: url.pathname, body });
      throw new Error("AI must not be called in this test");
    }
    if (url.hostname !== "unit-test.supabase.co")
      throw new Error("Unexpected outbound request");
    const path = url.pathname.replace("/rest/v1/", "");
    const faultIndex = faults.findIndex((f) => f(method, path));
    if (faultIndex >= 0) {
      faults.splice(faultIndex, 1);
      return Response.json({ message: "injected" }, { status: 500 });
    }
    try {
      const result = await rest(method, url, new Headers(init?.headers), body);
      return result === undefined
        ? new Response(null, { status: method === "POST" ? 201 : 204 })
        : Response.json(result);
    } catch (e) {
      const status = (e as { status?: number }).status || 400;
      return Response.json({ message: (e as Error).message }, { status });
    }
  };

  return {
    db,
    fetch,
    line,
    anthropic,
    log,
    failOnce: (fault: Fault) => faults.push(fault),
    setLineReply: (fn: typeof lineReply) => (lineReply = fn),
  };
}
