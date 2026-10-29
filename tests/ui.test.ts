import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createElement } from "react";
test("管理画面：料金編集→応答反映→有人引き継ぎ→再開→FAQ追加と削除", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost:3000",
  });
  Object.defineProperty(globalThis, "window", {
    value: dom.window,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: dom.window.document,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: dom.window.localStorage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    value: dom.window.HTMLElement,
    configurable: true,
  });
  Object.defineProperty(globalThis, "confirm", {
    value: () => true,
    configurable: true,
  });
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  const { render, screen, within, waitFor, cleanup } =
    await import("@testing-library/react");
  const { default: userEvent } = await import("@testing-library/user-event");
  const { default: Dashboard } = await import("../src/components/Dashboard");
  const user = userEvent.setup({ document: dom.window.document });
  const view = render(createElement(Dashboard));
  await screen.findByRole("heading", {
    name: "お店のやりとりを、もっと軽やかに。",
  });
  await user.click(screen.getByRole("button", { name: "メニュー・料金" }));
  await user.click(screen.getAllByRole("button", { name: "編集" })[0]);
  let dialog = within(screen.getByRole("dialog"));
  await user.clear(dialog.getByLabelText("税込料金（円）"));
  await user.type(dialog.getByLabelText("税込料金（円）"), "6600");
  await user.click(dialog.getByRole("button", { name: "保存する" }));
  await screen.findByText("¥6,600");
  await user.click(screen.getByRole("button", { name: "ホーム" }));
  await user.type(
    screen.getByLabelText("お試しメッセージ"),
    "カットの値段は？",
  );
  await user.click(screen.getByRole("button", { name: "メッセージを送る" }));
  await screen.findByText(/カット：6,600円/);
  await user.type(
    screen.getByLabelText("お試しメッセージ"),
    "明日予約したいです",
  );
  await user.click(screen.getByRole("button", { name: "メッセージを送る" }));
  await screen.findByText("オーナーへ引き継ぎ中");
  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: /^お問い合わせ/,
    }),
  );
  await screen.findByText("明日予約したいです", { selector: "h3" });
  await user.click(screen.getByRole("button", { name: "対応済みにする" }));
  await screen.findByText("確認待ちのご相談はありません。");
  await user.click(screen.getByRole("button", { name: "自動応答を再開" }));
  await screen.findByText("有人対応中 0 件");
  await user.click(screen.getByRole("button", { name: "よくある質問" }));
  await user.click(screen.getByRole("button", { name: "質問を追加" }));
  dialog = within(screen.getByRole("dialog"));
  await user.type(
    dialog.getByLabelText("お客様からの質問"),
    "持ち物はありますか",
  );
  await user.type(dialog.getByLabelText("ご案内する回答"), "特にありません。");
  await user.click(dialog.getByRole("button", { name: "保存する" }));
  const heading = await screen.findByRole("heading", {
    name: "持ち物はありますか",
  });
  const card = heading.closest("article")!;
  await user.click(within(card).getByRole("button", { name: "内容を編集" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "削除する",
    }),
  );
  await waitFor(() =>
    assert.equal(
      screen.queryByRole("heading", { name: "持ち物はありますか" }),
      null,
    ),
  );
  const saved = JSON.parse(localStorage.getItem("salon-note-demo-v1")!);
  assert.equal(saved.menus[0].price_yen, 6600);
  assert.equal(saved.handoffs[0].status, "closed");
  view.unmount();
  cleanup();
  dom.window.close();
});
