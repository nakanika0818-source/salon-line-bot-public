import type { State } from "./types";
export const sampleState: State = {
  faqs: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      category: "hours",
      question: "営業時間と定休日を教えてください",
      answer:
        "【練習用】営業時間は10:00〜19:00、定休日は毎週火曜日です。臨時休業は公式LINEのお知らせをご確認ください。",
      enabled: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      category: "price",
      question: "カットなどの料金はいくらですか",
      answer:
        "メニュー欄の税込料金をご案内します。髪の長さなどによる追加料金は、オーナーへご確認ください。",
      enabled: true,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      category: "booking",
      question: "予約はどのようにすればよいですか",
      answer:
        "ご予約のご相談は、このLINEに希望日時とメニューをお送りください。オーナーからの返信をもって確定します。自動応答では空き状況の確認や予約確定はできません。",
      enabled: true,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      category: "combination",
      question: "パーマとカラーを同じ日にできますか",
      answer:
        "【練習用】パーマとカラーの同日施術の可否は、髪の状態や施術内容によって異なります。この自動応答では個別の施術可否は判断できません。ご自身の場合については、このLINEに髪の状態とご希望をお送りいただき、オーナーへご相談ください。",
      enabled: true,
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      category: "parking",
      question: "駐車場はありますか",
      answer:
        "【練習用】店舗前に1台分の駐車スペースがあります。ご利用希望は事前にLINEでお知らせください。",
      enabled: true,
    },
  ],
  menus: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      name: "カット",
      price_yen: 5500,
      duration_minutes: 60,
      notes: "練習用・シャンプーとブロー込み",
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      name: "カラー",
      price_yen: 7700,
      duration_minutes: 90,
      notes: "練習用・髪の長さにより追加あり",
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      name: "パーマ",
      price_yen: 8800,
      duration_minutes: 120,
      notes: "練習用・髪の状態を確認",
    },
  ],
  conversations: [],
  messages: [],
  handoffs: [],
  issues: [],
  aiCount: 0,
};
