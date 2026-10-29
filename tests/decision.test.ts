import test from "node:test";
import assert from "node:assert/strict";
import {
  demoAnswer,
  renderChoice,
  needsHuman,
  unsupportedReply,
  testUserAllowed,
} from "../src/lib/decision";
import { sampleState } from "../src/lib/sample";
const faq = sampleState.faqs,
  menus = sampleState.menus;
const cases = [
  ["営業時間は？", "hours"],
  ["何時までやっていますか？", "hours"],
  ["定休日はいつ？", "hours"],
  ["カットの値段は？", "price"],
  ["メニューはいくら？", "price"],
  ["料金を知りたい", "price"],
  ["予約の方法を教えて", "booking"],
  ["どうやって予約するの？", "booking"],
  ["予約するには？", "booking"],
  ["パーマとカラーは同時にできますか", "combination"],
  ["カラーとパーマの併用は？", "combination"],
  ["パーマについて教えて", "combination"],
  ["駐車場はある？", "parking"],
  ["車で行きたいです", "parking"],
  ["アクセスを教えて", "parking"],
];
for (const [text, category] of cases)
  test(`FAQサンプル：${text}`, () => {
    const r = demoAnswer(text, faq, menus);
    assert.equal(r.handoff, false);
    assert.ok(
      r.text.includes(faq.find((f) => f.category === category)!.answer),
    );
  });
for (const text of [
  "明日の予約を取りたい",
  "空きはありますか？",
  "返金してほしい",
  "私の髪にブリーチできる？",
  "おすすめのレストランは？",
])
  test(`範囲外を引き継ぐ：${text}`, () =>
    assert.equal(demoAnswer(text, faq, menus).handoff, true));
test("予約方法の説明と予約確定を区別する", () => {
  assert.equal(needsHuman("予約方法を教えて"), false);
  assert.equal(needsHuman("予約をお願いします"), true);
  assert.equal(needsHuman("予約変更したい"), true);
});
test("メニュー更新後の価格を使う", () => {
  const changed = menus.map((m) => ({
    ...m,
    price_yen: m.name === "カット" ? 6600 : m.price_yen,
  }));
  const r = demoAnswer("カットの値段", faq, changed);
  assert.match(r.text, /6,600円/);
  assert.doesNotMatch(r.text, /5,500円/);
});
test("非公開の根拠や存在しないIDでは回答しない", () => {
  assert.equal(
    renderChoice(
      { confidence: "high", handoff: false, faqIds: ["unknown"] },
      faq,
      menus,
    ).handoff,
    true,
  );
  assert.equal(
    renderChoice(
      { confidence: "high", handoff: false, faqIds: [faq[0].id] },
      faq.map((f) => ({ ...f, enabled: false })),
      menus,
    ).handoff,
    true,
  );
});
test("中・低確信の回答は引き継ぐ", () => {
  for (const confidence of ["medium", "low"] as const)
    assert.equal(
      renderChoice(
        { confidence, handoff: false, faqIds: [faq[0].id] },
        faq,
        menus,
      ).handoff,
      true,
    );
});
test("空文と絵文字のみは使い方を案内し、長文は引き継ぐ", () => {
  for (const text of ["", "   ", "💇‍♀️✨"])
    assert.equal(demoAnswer(text, faq, menus).text, unsupportedReply);
  assert.equal(demoAnswer("あ".repeat(1001), faq, menus).handoff, true);
});
test("承認された複数FAQの回答をまとめる", () => {
  const r = demoAnswer("営業時間と駐車場を教えて", faq, menus);
  assert.equal(r.handoff, false);
  assert.ok(r.text.includes(faq[0].answer));
  assert.ok(r.text.includes(faq[4].answer));
});
test("テスト利用者限定：Echoは常に、FAQはTEST_USER_ONLY=trueで本人のみ", () => {
  const me = "U" + "a".repeat(32),
    other = "U" + "b".repeat(32);
  const echo = { BOT_MODE: "echo", TEST_LINE_USER_ID: me };
  assert.equal(testUserAllowed(me, echo), true);
  assert.equal(testUserAllowed(other, echo), false);
  const faqTest = {
    BOT_MODE: "faq",
    TEST_USER_ONLY: "true",
    TEST_LINE_USER_ID: me,
  };
  assert.equal(testUserAllowed(me, faqTest), true);
  assert.equal(testUserAllowed(other, faqTest), false);
  assert.equal(
    testUserAllowed(me, { BOT_MODE: "faq", TEST_USER_ONLY: "true" }),
    false,
  );
  assert.equal(
    testUserAllowed(other, { BOT_MODE: "faq", TEST_LINE_USER_ID: me }),
    true,
  );
});
test("施術名や「前回」だけでは一律に引き継がない", () => {
  for (const text of [
    "縮毛矯正とカラーは同じ日にできますか？",
    "前回と同じメニューの予約方法を教えて",
    "パーマとカラーを同時に受けられますか？",
  ])
    assert.equal(needsHuman(text), false, text);
});
