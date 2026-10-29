import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export function validSignature(
  body: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !secret || !/^[-A-Za-z0-9+/=]+$/.test(signature))
    return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature, "base64");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const eventSchema = z
  .object({
    type: z.string(),
    webhookEventId: z.string().max(200),
    timestamp: z.number(),
    source: z.object({
      type: z.string(),
      userId: z.string().max(100).optional(),
    }),
    replyToken: z.string().max(200).optional(),
    message: z
      .object({ type: z.string(), text: z.string().max(10000).optional() })
      .passthrough()
      .optional(),
    unsend: z.object({ messageId: z.string().max(200) }).optional(),
  })
  .passthrough();
export type LineEvent = z.infer<typeof eventSchema>;
export async function lineSend(
  endpoint: "reply" | "push",
  body: object,
  retryKey?: string,
) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE token missing");
  return fetch(`https://api.line.me/v2/bot/message/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}
