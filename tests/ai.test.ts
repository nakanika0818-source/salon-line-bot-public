import test from "node:test";
import assert from "node:assert/strict";
import { answerQuestion } from "../src/lib/ai";
import { sampleState } from "../src/lib/sample";
test("AI：予算予約、根拠選択、実使用量記録、本文は承認済み回答を使用", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  process.env.ANTHROPIC_API_KEY = "unit-test-key";
  process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://unit-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-service";
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/rpc/reserve_ai"))
        return Response.json("99999999-9999-4999-8999-999999999999");
      if (url.includes("/ai_requests")) {
        assert.match(String(init?.body), /input_tokens/);
        return new Response(null, { status: 204 });
      }
      if (url.includes("api.anthropic.com"))
        return Response.json({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                confidence: "high",
                faqIds: [sampleState.faqs[0].id],
                handoff: false,
                answer: "営業時間は99時です",
              }),
            },
          ],
          usage: { input_tokens: 100, output_tokens: 40 },
        });
      throw new Error("Unexpected outbound request");
    };
    const result = await answerQuestion(
      "何時に開きますか",
      "Utest",
      sampleState.faqs,
      sampleState.menus,
    );
    assert.equal(result.handoff, false);
    assert.equal(result.text, sampleState.faqs[0].answer);
    assert.doesNotMatch(result.text, /99時/);
    assert.equal(
      calls.filter((c) => c.includes("api.anthropic.com")).length,
      1,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("AI：予算上限ではAPIを呼ばず有人へ", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      assert.match(String(input), /rpc\/reserve_ai/);
      return Response.json(null);
    };
    const result = await answerQuestion(
      "何時に開きますか",
      "Utest",
      sampleState.faqs,
      sampleState.menus,
    );
    assert.equal(result.handoff, true);
  } finally {
    globalThis.fetch = original;
  }
});
test("AI：障害や不正JSONでも顧客へ作り話を返さない", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (input) =>
      String(input).includes("/rpc/")
        ? Response.json("99999999-9999-4999-8999-999999999999")
        : Response.json({ error: "failure" }, { status: 503 });
    assert.equal(
      (
        await answerQuestion(
          "営業時間は",
          "Utest",
          sampleState.faqs,
          sampleState.menus,
        )
      ).handoff,
      true,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("AI：組み合わせの一般質問は注意事項FAQを原文で返し、本人の髪の判断は引き継ぐ", async () => {
  const original = globalThis.fetch;
  const combo = sampleState.faqs.find((f) => f.category === "combination")!;
  const systems: string[] = [];
  const reply = (choice: object) =>
    Response.json({
      content: [{ type: "text", text: JSON.stringify(choice) }],
      usage: { input_tokens: 100, output_tokens: 40 },
    });
  let next: object = {};
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/rpc/reserve_ai"))
        return Response.json("99999999-9999-4999-8999-999999999999");
      if (url.includes("/ai_requests"))
        return new Response(null, { status: 204 });
      if (url.includes("api.anthropic.com")) {
        systems.push(JSON.parse(String(init?.body)).system);
        return reply(next);
      }
      throw new Error("Unexpected outbound request");
    };
    next = { confidence: "high", faqIds: [combo.id], handoff: false };
    const general = await answerQuestion(
      "カラーとパーマは一緒にできますか？",
      "Utest",
      sampleState.faqs,
      sampleState.menus,
    );
    assert.equal(general.handoff, false);
    assert.equal(general.text, combo.answer);
    next = { confidence: "medium", faqIds: [combo.id], handoff: true };
    const personal = await answerQuestion(
      "先月縮毛矯正をしたばかりですが、パーマとカラーを一緒にできますか？",
      "Utest",
      sampleState.faqs,
      sampleState.menus,
    );
    assert.equal(personal.handoff, true);
    assert.equal(systems.length, 2);
    assert.match(systems[0], /一般的な方針や可否/);
    assert.match(systems[0], /自分の場合にできるか/);
    assert.match(systems[0], /単語が含まれるだけでは個別相談とみなさない/);
  } finally {
    globalThis.fetch = original;
  }
});
