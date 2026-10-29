import { timingSafeEqual } from "node:crypto";
import { demoMode, safeError } from "@/lib/db";
import { maintenance } from "@/lib/worker";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  const b = Buffer.from(`Bearer ${expected}`),
    a = Buffer.from(header);
  if (
    demoMode() ||
    !expected ||
    a.length !== b.length ||
    !timingSafeEqual(a, b)
  )
    return new Response(null, { status: 401 });
  try {
    await maintenance();
    return Response.json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
