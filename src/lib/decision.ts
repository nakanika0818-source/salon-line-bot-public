import { z } from "zod";
import type { Faq, Menu } from "./types";
export const handoffReply =
  "お問い合わせありがとうございます。内容をオーナーに引き継ぎました。確認後、このLINEでご返信します。ご予約はまだ確定していません。";
export const unsupportedReply =
  "テキストでご質問をお送りください。営業時間・料金・予約方法・施術の組み合わせ・駐車場についてご案内します。";
export const choiceSchema = z.object({
  confidence: z.enum(["high", "medium", "low"]),
  faqIds: z.array(z.string()).max(3),
  handoff: z.boolean(),
});
export type Choice = z.infer<typeof choiceSchema>;
// Echo is always, and FAQ with TEST_USER_ONLY=true is, limited to TEST_LINE_USER_ID.
export function testUserAllowed(
  uid: string,
  env: Record<string, string | undefined> = process.env,
) {
  const restricted = env.BOT_MODE === "echo" || env.TEST_USER_ONLY === "true";
  return (
    !restricted || (!!env.TEST_LINE_USER_ID && uid === env.TEST_LINE_USER_ID)
  );
}
export function needsHuman(text: string) {
  return /予約.{0,12}(取|とれ|取れ|空|あき|した|お願い|希望|変更|キャンセル|確定)|空き|空い|空いて|空席|本日|今日|明日|\d{1,2}[月/日:時]|アレルギー|かぶれ|痛み|返金|苦情|ブリーチ.*(髪|傷)|私の髪/.test(
    text,
  );
}
export function renderChoice(
  choice: Choice,
  faqs: Faq[],
  menus: Menu[],
): { text: string; handoff: boolean } {
  const ids = [...new Set(choice.faqIds)];
  const matches = ids.map((id) => faqs.find((f) => f.id === id && f.enabled));
  if (
    choice.handoff ||
    choice.confidence !== "high" ||
    !ids.length ||
    matches.some((f) => !f)
  )
    return { text: handoffReply, handoff: true };
  const answers = matches.map((f) => {
    if (f!.category === "price")
      return `${f!.answer}\n${menus.map((m) => `${m.name}：${m.price_yen.toLocaleString("ja-JP")}円（税込）${m.notes ? "／" + m.notes : ""}`).join("\n")}`;
    return f!.answer;
  });
  return { text: answers.join("\n\n").slice(0, 4500), handoff: false };
}
export function demoAnswer(text: string, faqs: Faq[], menus: Menu[]) {
  if (!text.trim() || !/[\p{L}\p{N}]/u.test(text))
    return { text: unsupportedReply, handoff: false };
  if (text.length > 1000 || needsHuman(text))
    return { text: handoffReply, handoff: true };
  const categories: string[] = [];
  if (/営業|何時|定休|休み|開店|閉店/.test(text)) categories.push("hours");
  if (/料金|値段|いくら|価格|メニュー|カット代/.test(text))
    categories.push("price");
  if (/予約.*(方法|どう|仕方)|予約するには|どう.*予約/.test(text))
    categories.push("booking");
  if (/パーマ|カラー.*同|同.*カラー|併用/.test(text))
    categories.push("combination");
  if (/駐車|車|アクセス|住所|場所/.test(text)) categories.push("parking");
  const ids = faqs
    .filter((f) => f.enabled && categories.includes(f.category))
    .map((f) => f.id);
  return renderChoice(
    {
      confidence: ids.length ? "high" : "low",
      faqIds: ids.slice(0, 3),
      handoff: false,
    },
    faqs,
    menus,
  );
}
