import { writeFile } from "node:fs/promises";
import { sampleState } from "../src/lib/sample";
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
let sql =
  "-- PRACTICE DATA ONLY. Replace with approved salon facts before live use.\n";
for (const f of sampleState.faqs)
  sql += `insert into public.faqs(id,category,question,answer,enabled) values(${q(f.id)},${q(f.category)},${q(f.question)},${q(f.answer)},${f.enabled}) on conflict(id) do nothing;\n`;
for (const m of sampleState.menus)
  sql += `insert into public.menus(id,name,price_yen,duration_minutes,notes) values(${q(m.id)},${q(m.name)},${m.price_yen},${m.duration_minutes},${q(m.notes)}) on conflict(id) do nothing;\n`;
writeFile(new URL("../supabase/seed.sql", import.meta.url), sql);
