"use client";
import { useEffect, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  MessageCircle,
  BookOpen,
  Scissors,
  Send,
  Settings,
  ArrowUpRight,
  Plus,
  Check,
  Search,
  ChevronRight,
  LoaderCircle,
  LogOut,
  Menu as MenuIcon,
  X,
  Download,
  RotateCcw,
  Leaf,
} from "lucide-react";
import { sampleState } from "@/lib/sample";
import { demoAnswer } from "@/lib/decision";
import {
  categories,
  type State,
  type Faq,
  type Menu,
  type Category,
} from "@/lib/types";
const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
const tabs = [
  ["overview", "ホーム", LayoutDashboard],
  ["inbox", "お問い合わせ", MessageCircle],
  ["faq", "よくある質問", BookOpen],
  ["menus", "メニュー・料金", Scissors],
  ["broadcast", "お知らせ配信", Send],
  ["settings", "設定・使い方", Settings],
] as const;
type Tab = (typeof tabs)[number][0];
const key = "salon-note-demo-v1";
function fresh() {
  return structuredClone(sampleState);
}
const yen = (v: number) => new Intl.NumberFormat("ja-JP").format(v);
const date = (v: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(v));
let supabase: SupabaseClient | undefined;
function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !k)
    throw new Error(
      "Supabaseの接続設定がありません。セットアップ手順をご確認ください。",
    );
  return (supabase ??= createClient(url, k));
}
type Chat = { role: "user" | "bot"; text: string };
export default function Dashboard() {
  const [state, setState] = useState<State>(fresh),
    [tab, setTab] = useState<Tab>("overview"),
    [ready, setReady] = useState(false),
    [loggedIn, setLoggedIn] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [faqEdit, setFaqEdit] = useState<Partial<Faq> | null>(null),
    [menuEdit, setMenuEdit] = useState<Partial<Menu> | null>(null);
  const [chat, setChat] = useState<Chat[]>([
      {
        role: "bot",
        text: "こんにちは。営業時間やメニューなど、お気軽にご質問ください。",
      },
    ]),
    [input, setInput] = useState(""),
    [chatHuman, setChatHuman] = useState(false);
  async function api(body?: object) {
    const { data } = await authClient().auth.getSession();
    if (!data.session) throw new Error("ログインし直してください。");
    const response = await fetch("/api/admin", {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    if (!response.ok) {
      const raw = await response.text();
      try {
        throw new Error(JSON.parse(raw).error || "処理に失敗しました。");
      } catch (e) {
        if (e instanceof SyntaxError)
          throw new Error(raw || "処理に失敗しました。");
        throw e;
      }
    }
    return response.json();
  }
  async function reload() {
    const result = await api();
    setState(result);
    setLoggedIn(true);
  }
  useEffect(() => {
    if (isDemo) {
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const data = JSON.parse(saved);
          if (data?.faqs && data?.menus && data?.messages) {
            setState({ ...fresh(), ...data });
            setChatHuman(
              data.conversations?.some(
                (c: { id: string; mode: string }) =>
                  c.id === "demo-customer" && c.mode === "human",
              ) || false,
            );
          }
        }
      } catch {
        /* Start from sample if storage is unavailable. */
      }
      setReady(true);
      return;
    }
    try {
      authClient()
        .auth.getSession()
        .then(async ({ data }) => {
          if (data.session) await reload();
        })
        .catch((e) => setError(e.message))
        .finally(() => setReady(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続設定を確認してください。");
      setReady(true);
    }
    // Auth is read on mount; server verifies identity on every subsequent request.
  }, []);
  useEffect(() => {
    if (isDemo && ready) {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        setError("このブラウザではデモデータを保存できません。");
      }
    }
  }, [state, ready]);
  const modalOpen = Boolean(faqEdit || menuEdit);
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    const selectors =
      "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]";
    dialog?.querySelector<HTMLElement>("input,textarea,select")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setFaqEdit(null);
        setMenuEdit(null);
      }
      if (e.key !== "Tab" || !dialog) return;
      const elements = Array.from(
        dialog.querySelectorAll<HTMLElement>(selectors),
      );
      const first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modalOpen, busy]);
  const open = state.handoffs.filter((h) => h.status === "open");
  const human = state.conversations.filter((c) => c.mode === "human");
  const incoming = state.messages.filter((m) => m.direction === "in").length;
  const outgoing = state.messages.filter((m) => m.direction === "out").length;
  async function run(task: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました。");
    } finally {
      setBusy(false);
    }
  }
  function move(t: Tab) {
    setTab(t);
    setMobile(false);
    setSearch("");
    setNotice("");
    setError("");
  }
  async function mutate(action: string, value?: object, id?: string) {
    if (!isDemo) {
      await api({ action, ...(value ? { value } : {}), ...(id ? { id } : {}) });
      await reload();
      return;
    }
    setState((prev) => {
      const next = structuredClone(prev);
      if (action === "faq_save") {
        const row = {
          ...value,
          id: (value as Faq).id || crypto.randomUUID(),
        } as Faq;
        const index = next.faqs.findIndex((f) => f.id === row.id);
        if (index < 0) next.faqs.push(row);
        else next.faqs[index] = row;
      }
      if (action === "menu_save") {
        const row = {
          ...value,
          id: (value as Menu).id || crypto.randomUUID(),
        } as Menu;
        const index = next.menus.findIndex((m) => m.id === row.id);
        if (index < 0) next.menus.push(row);
        else next.menus[index] = row;
      }
      if (action === "faq_delete")
        next.faqs = next.faqs.filter((f) => f.id !== id);
      if (action === "menu_delete")
        next.menus = next.menus.filter((m) => m.id !== id);
      if (action === "close")
        next.handoffs = next.handoffs.map((h) =>
          h.id === id ? { ...h, status: "closed" } : h,
        );
      if (action === "resume") {
        next.conversations = next.conversations.map((c) =>
          c.id === id ? { ...c, mode: "bot" } : c,
        );
        next.handoffs = next.handoffs.map((h) =>
          h.conversation_id === id ? { ...h, status: "closed" } : h,
        );
      }
      return next;
    });
  }
  async function sendDemo(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await run(async () => {
      const now = new Date().toISOString(),
        id = "demo-customer";
      const result = chatHuman
        ? null
        : demoAnswer(text, state.faqs, state.menus);
      setChat((p) => [
        ...p,
        { role: "user", text },
        ...(result ? [{ role: "bot" as const, text: result.text }] : []),
      ]);
      if (result?.handoff) setChatHuman(true);
      setState((p) => ({
        ...p,
        conversations: [
          ...p.conversations.filter((c) => c.id !== id),
          {
            id,
            mode: !result || result.handoff ? "human" : "bot",
            updated_at: now,
          },
        ],
        messages: [
          {
            id: crypto.randomUUID(),
            conversation_id: id,
            direction: "in",
            text,
            created_at: now,
          },
          ...(result
            ? [
                {
                  id: crypto.randomUUID(),
                  conversation_id: id,
                  direction: "out" as const,
                  text: result.text,
                  created_at: now,
                },
              ]
            : []),
          ...p.messages,
        ],
        handoffs: result?.handoff
          ? [
              {
                id: crypto.randomUUID(),
                conversation_id: id,
                question: text,
                status: "open",
                notification_status: "pending",
                created_at: now,
              },
              ...p.handoffs,
            ]
          : p.handoffs,
      }));
    }, "");
  }
  function download() {
    const blob = new Blob(
      [JSON.stringify({ faqs: state.faqs, menus: state.menus }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "salon-faq-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!ready)
    return (
      <main className="centered">
        <LoaderCircle className="spin" />
        <p>準備しています…</p>
      </main>
    );
  if (!isDemo && !loggedIn)
    return (
      <main className="login">
        <div className="login-card">
          <div className="brand">
            <Leaf />
            <span>
              salon note<span className="brand-sub">LINE ASSISTANT</span>
            </span>
          </div>
          <h1>おかえりなさい</h1>
          <p className="muted">お店の管理アカウントでログインしてください。</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const result = await authClient().auth.signInWithPassword({
                  email,
                  password,
                });
                if (result.error)
                  throw new Error(
                    "メールアドレスとパスワードをご確認ください。",
                  );
                await reload();
                setPassword("");
              }, "ログインしました。");
            }}
          >
            <label>
              メールアドレス
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label>
              パスワード
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" /> : null}ログイン
            </button>
          </form>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <small>
            初回のアカウント発行は、セットアップ担当者へご依頼ください。
          </small>
        </div>
      </main>
    );
  return (
    <div className="shell">
      {mobile && (
        <button
          className="scrim"
          aria-label="メニューを閉じる"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "visible" : ""}`}>
        <a href="/" className="brand">
          <Leaf />
          <span>
            salon note<span className="brand-sub">LINE ASSISTANT</span>
          </span>
        </a>
        <div className="salon-label">
          <span className="salon-avatar">S</span>
          <span>
            サロン管理室
            <small>{isDemo ? "練習用サロン" : "オーナーアカウント"}</small>
          </span>
          <span className="tiny-dot" />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "nav active" : "nav"}
              onClick={() => move(id)}
            >
              <Icon size={19} />
              {label}
              {id === "inbox" && open.length > 0 ? (
                <span className="count">{open.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="tiny-dot" />
            <strong>
              {isDemo ? "操作を試してみましょう" : "お店の情報を最新に"}
            </strong>
            <p>
              {isDemo
                ? "デモデータで編集や問い合わせ対応を練習できます。"
                : "営業時間や価格を変えたら、FAQも更新しましょう。"}
            </p>
            <button onClick={() => move("settings")}>
              使い方を見る <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="owner">
            <span className="salon-avatar owner-avatar">O</span>
            <span>
              オーナー<small>{isDemo ? "デモモード" : "ログイン中"}</small>
            </span>
            {!isDemo && (
              <button
                aria-label="ログアウト"
                onClick={() =>
                  run(async () => {
                    await authClient().auth.signOut();
                    setLoggedIn(false);
                    setState(fresh());
                  }, "")
                }
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="メニューを開く"
            onClick={() => setMobile(true)}
          >
            <MenuIcon />
          </button>
          <span>
            ワークスペース <ChevronRight size={13} />{" "}
            {tabs.find((t) => t[0] === tab)?.[1]}
          </span>
          <span className={`mode-tag ${isDemo ? "demo" : ""}`}>
            <span className="tiny-dot" />
            {isDemo ? "練習用デモ" : "実接続モード"}
          </span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR SALON, A LITTLE SIMPLER.</p>
              <h1>
                {tab === "overview"
                  ? "お店のやりとりを、もっと軽やかに。"
                  : tabs.find((t) => t[0] === tab)?.[1]}
              </h1>
              <p className="muted">
                {tab === "overview"
                  ? "いつものご質問は自動応答に。大切なご相談には、あなたの言葉を。"
                  : tab === "faq"
                    ? "お客様へご案内する情報を、ここで整えましょう。"
                    : tab === "menus"
                      ? "料金は税込で登録してください。保存後の新しい質問に反映されます。"
                      : tab === "inbox"
                        ? "確認が必要なご相談と、最近のやりとりを確認できます。"
                        : tab === "broadcast"
                          ? "お知らせは、使い慣れた公式LINEから。"
                          : "接続・データ保存・日々の運用を確認します。"}
              </p>
            </div>
            {!isDemo && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => run(reload, "最新の情報に更新しました。")}
              >
                <RotateCcw size={16} />
                更新
              </button>
            )}
          </div>
          {isDemo && (
            <div className="demo-banner">
              <span className="demo-icon">i</span>
              <span>
                <strong>練習用デモ</strong>
                　店舗情報はサンプルです。LINE送信・AI課金は発生しません。変更はこのブラウザに保存されます。
              </span>
            </div>
          )}
          {notice && (
            <div role="status" className="success">
              <Check size={17} />
              {notice}
            </div>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {tab === "overview" && (
            <>
              <section className="stats">
                <div className="stat">
                  <span>
                    確認が必要なご相談 <MessageCircle size={17} />
                  </span>
                  <strong>
                    {open.length}
                    <small>件</small>
                  </strong>
                  <p>
                    {open.length
                      ? "お客様がお返事を待っています"
                      : "未対応のご相談はありません"}
                  </p>
                  <button onClick={() => move("inbox")}>
                    お問い合わせを見る <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="stat">
                  <span>
                    受信したメッセージ <Send size={17} />
                  </span>
                  <strong>
                    {incoming}
                    <small>件</small>
                  </strong>
                  <p>
                    {isDemo
                      ? "デモ開始からの受信数"
                      : "直近200件のログ内の受信数"}
                  </p>
                  <small className="stat-foot">
                    自動応答の送信記録 {outgoing} 件
                  </small>
                </div>
                <div className="stat">
                  <span>
                    公開中のよくある質問 <BookOpen size={17} />
                  </span>
                  <strong>
                    {state.faqs.filter((f) => f.enabled).length}
                    <small>件</small>
                  </strong>
                  <p>お店の情報をもとにご案内します</p>
                  <button onClick={() => move("faq")}>
                    質問を編集する <ArrowUpRight size={15} />
                  </button>
                </div>
              </section>
              <div className="overview-grid">
                <div>
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>お返事を待っているご相談</h2>
                        <p>自動で答えられなかったお問い合わせ</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => move("inbox")}
                      >
                        すべて見る <ChevronRight size={16} />
                      </button>
                    </div>
                    {open.length ? (
                      open.slice(0, 3).map((h) => (
                        <div className="inbox-row" key={h.id}>
                          <span className="customer-icon">
                            <MessageCircle size={19} />
                          </span>
                          <div>
                            <strong>{h.question}</strong>
                            <small>
                              {date(h.created_at)} ・ オーナーの確認待ち
                            </small>
                          </div>
                          <button
                            className="secondary"
                            onClick={() => move("inbox")}
                          >
                            確認
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="empty">
                        <div className="empty-icon">
                          <Check size={25} />
                        </div>
                        <strong>今のところ、すべて順調です</strong>
                        <p>
                          {isDemo
                            ? "右のチャットで「明日予約できますか？」と送ってみてください。"
                            : "確認が必要なご相談が届くと、ここに表示されます。"}
                        </p>
                      </div>
                    )}
                  </section>
                  <section className="note-panel">
                    <Leaf size={27} />
                    <div>
                      <p className="eyebrow">A SMALL ROUTINE</p>
                      <h2>お店の情報、変わっていませんか？</h2>
                      <p>
                        営業時間・メニュー・駐車場の情報を最新にしておくと、
                        <br className="desktop-break" />
                        お客様へのご案内がスムーズになります。
                      </p>
                      <button onClick={() => move("faq")}>
                        よくある質問を確認 <ArrowUpRight size={16} />
                      </button>
                    </div>
                  </section>
                  <section className="panel mini-guide">
                    <h2>今日の運用チェック</h2>
                    <p>
                      <Check size={17} /> 確認待ちのお問い合わせを確認する
                    </p>
                    <p>
                      <Check size={17} /> 公式LINEからお客様へ返信する
                    </p>
                    <p>
                      <Check size={17} /> 対応後に自動応答を再開する
                    </p>
                  </section>
                </div>
                <section className="panel chat-panel">
                  <div className="panel-head">
                    <div>
                      <h2>{isDemo ? "応答を試してみる" : "接続確認の手順"}</h2>
                      <p>
                        {isDemo
                          ? "実際の送信をしない、お試しチャット"
                          : "実際のLINEで動作を確認します"}
                      </p>
                    </div>
                    <MessageCircle size={21} />
                  </div>
                  {isDemo ? (
                    <>
                      <div className="chat-top">
                        <span className="tiny-dot" />
                        {chatHuman ? "オーナーへ引き継ぎ中" : "デモの自動応答"}
                      </div>
                      <div className="chat-messages" aria-live="polite">
                        {chat.map((m, i) => (
                          <div key={i} className={`bubble ${m.role}`}>
                            {m.text}
                          </div>
                        ))}
                      </div>
                      <div className="chat-suggestions">
                        {[
                          "何時まで営業？",
                          "カットの値段は？",
                          "明日予約できる？",
                        ].map((t) => (
                          <button key={t} onClick={() => setInput(t)}>
                            {t}
                          </button>
                        ))}
                      </div>
                      <form className="chat-input" onSubmit={sendDemo}>
                        <input
                          aria-label="お試しメッセージ"
                          value={input}
                          maxLength={1500}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder="質問を入力…"
                        />
                        <button
                          className="primary icon-button"
                          aria-label="メッセージを送る"
                          disabled={busy || !input.trim()}
                        >
                          <Send size={17} />
                        </button>
                      </form>
                      {chatHuman && (
                        <button
                          className="text-button reset-chat"
                          onClick={() => {
                            setChatHuman(false);
                            mutate("resume", undefined, "demo-customer");
                            setChat([
                              {
                                role: "bot",
                                text: "自動応答を再開しました。ご質問をどうぞ。",
                              },
                            ]);
                          }}
                        >
                          練習チャットの自動応答を再開
                        </button>
                      )}
                      <p className="chat-foot">
                        デモはキーワード判定です。Claude
                        APIの品質・速度は実接続後に確認します。
                      </p>
                    </>
                  ) : (
                    <div className="plain-body">
                      <ol>
                        <li>テスト用LINEから営業時間を質問します。</li>
                        <li>回答が最新のFAQと一致するか確認します。</li>
                        <li>
                          予約希望を送り、通知と自動応答の停止を確認します。
                        </li>
                      </ol>
                      <p className="muted">
                        接続先の設定手順は同梱の SETUP.md をご覧ください。
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
          {tab === "faq" && (
            <>
              <div className="toolbar">
                <label className="search">
                  <Search size={18} />
                  <input
                    placeholder="質問・回答を検索"
                    aria-label="質問を検索"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  onClick={() =>
                    setFaqEdit({
                      category: "hours",
                      question: "",
                      answer: "",
                      enabled: true,
                    })
                  }
                >
                  <Plus size={17} />
                  質問を追加
                </button>
              </div>
              <div className="chips">
                <button
                  className={filter === "all" ? "selected" : ""}
                  onClick={() => setFilter("all")}
                >
                  すべて
                </button>
                {Object.entries(categories).map(([id, label]) => (
                  <button
                    key={id}
                    className={filter === id ? "selected" : ""}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="faq-grid">
                {state.faqs
                  .filter(
                    (f) =>
                      (filter === "all" || f.category === filter) &&
                      (f.question + f.answer).includes(search),
                  )
                  .map((f) => (
                    <article key={f.id} className="panel faq-card">
                      <div className="faq-meta">
                        <span className="category">
                          {categories[f.category]}
                        </span>
                        <span className={f.enabled ? "status live" : "status"}>
                          {f.enabled ? "公開中" : "非公開"}
                        </span>
                      </div>
                      <h2>{f.question}</h2>
                      <p>{f.answer}</p>
                      <button
                        className="secondary"
                        onClick={() => setFaqEdit(f)}
                      >
                        内容を編集 <ArrowUpRight size={15} />
                      </button>
                    </article>
                  ))}
              </div>
              {!state.faqs.filter(
                (f) =>
                  (filter === "all" || f.category === filter) &&
                  (f.question + f.answer).includes(search),
              ).length && (
                <div className="empty panel">
                  <p>該当する質問がありません。</p>
                </div>
              )}
            </>
          )}
          {tab === "menus" && (
            <>
              <div className="toolbar">
                <p className="muted">登録済み {state.menus.length} メニュー</p>
                <button
                  className="primary"
                  onClick={() =>
                    setMenuEdit({
                      name: "",
                      price_yen: 0,
                      duration_minutes: 60,
                      notes: "",
                    })
                  }
                >
                  <Plus size={17} />
                  メニューを追加
                </button>
              </div>
              <section className="panel menu-list">
                {state.menus.map((m) => (
                  <article className="menu-row" key={m.id}>
                    <span className="menu-symbol">
                      <Scissors size={21} />
                    </span>
                    <div>
                      <h2>{m.name}</h2>
                      <p>
                        {m.duration_minutes}分目安 ・ {m.notes || "補足なし"}
                      </p>
                    </div>
                    <strong>
                      ¥{yen(m.price_yen)}
                      <small>税込</small>
                    </strong>
                    <button
                      className="secondary"
                      onClick={() => setMenuEdit(m)}
                    >
                      編集
                    </button>
                  </article>
                ))}
              </section>
            </>
          )}
          {tab === "inbox" && (
            <>
              <div className="section-label">
                <h2>
                  確認待ち <span className="count">{open.length}</span>
                </h2>
                <span className="muted">有人対応中 {human.length} 件</span>
              </div>
              <section className="panel">
                {!open.length ? (
                  <div className="empty">
                    <Check />
                    <p>確認待ちのご相談はありません。</p>
                  </div>
                ) : (
                  open.map((h) => (
                    <article key={h.id} className="handoff">
                      <div className="handoff-top">
                        <span className="status waiting">確認待ち</span>
                        <small>{date(h.created_at)}</small>
                      </div>
                      <h3>{h.question}</h3>
                      <p className="muted">
                        {isDemo
                          ? "デモではオーナーへの通知は送信しません。"
                          : h.notification_status === "sent"
                            ? "オーナーへ通知済み"
                            : h.notification_status === "failed"
                              ? "通知に失敗しました。公式LINEで内容をご確認ください。"
                              : "通知を送信待ちです。"}
                      </p>
                      <p className="muted">
                        会話ID {h.conversation_id.slice(0, 8)} ・
                        この会話の自動応答は停止中です。
                      </p>
                      <div className="actions">
                        <a
                          className="secondary"
                          href="https://manager.line.biz/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          公式LINEで返信 <ArrowUpRight size={15} />
                        </a>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => mutate("close", undefined, h.id),
                              "対応済みにしました。自動応答は停止したままです。",
                            )
                          }
                        >
                          対応済みにする
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </section>
              {human.length > 0 && (
                <section className="panel plain-body spaced">
                  <h2>自動応答を再開する</h2>
                  <p className="muted">
                    公式LINEで返信を終えた会話だけ、再開してください。関連する確認待ちも対応済みになります。
                  </p>
                  {human.map((c) => (
                    <div className="resume-row" key={c.id}>
                      <span>会話 {c.id.slice(0, 8)}</span>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await mutate("resume", undefined, c.id);
                            if (c.id === "demo-customer") setChatHuman(false);
                          }, "自動応答を再開しました。")
                        }
                      >
                        自動応答を再開
                      </button>
                    </div>
                  ))}
                </section>
              )}
              <section className="panel spaced">
                <div className="panel-head">
                  <div>
                    <h2>最近の会話ログ</h2>
                    <p>
                      最大200件。公式LINE上の手動返信はこの一覧には同期されません。
                    </p>
                  </div>
                </div>
                {!state.messages.length ? (
                  <div className="empty">
                    <p>まだ会話がありません。</p>
                  </div>
                ) : (
                  state.messages.map((m) => (
                    <div className="log-row" key={m.id}>
                      <span
                        className={
                          m.direction === "in"
                            ? "log-type"
                            : "log-type bot-label"
                        }
                      >
                        {m.direction === "in" ? "お客様" : "自動応答"}
                      </span>
                      <div>
                        <p>{m.text}</p>
                        <small>
                          {date(m.created_at)} ・ 会話{" "}
                          {m.conversation_id.slice(0, 8)}
                        </small>
                      </div>
                    </div>
                  ))
                )}
              </section>
              {state.issues.length > 0 && (
                <section className="panel plain-body spaced">
                  <h2>返信を確認してください</h2>
                  <p>
                    送信結果が不明、または返信できなかった受信記録です。重複送信を防ぐため自動再送していません。公式LINEで送信状況を確認してください。
                  </p>
                  {state.issues.map((i) => (
                    <p key={i.id}>
                      {date(i.created_at)} ／ {i.id.slice(0, 10)} ／ {i.state}
                    </p>
                  ))}
                </section>
              )}
            </>
          )}
          {tab === "broadcast" && (
            <section className="panel broadcast">
              <span className="big-icon">
                <Send size={32} />
              </span>
              <p className="eyebrow">KEEP IN TOUCH</p>
              <h2>お客様に、お店のお知らせを。</h2>
              <p>
                臨時休業や季節のご案内は、
                <br />
                LINE公式アカウントの配信機能を使います。
              </p>
              <div className="broadcast-facts">
                <div>
                  <small>配信の目安</small>
                  <strong>月2回</strong>
                </div>
                <div>
                  <small>友だち数の想定</small>
                  <strong>約300人</strong>
                </div>
                <div>
                  <small>操作する場所</small>
                  <strong>公式LINE</strong>
                </div>
              </div>
              <a
                className="primary"
                href="https://manager.line.biz/"
                target="_blank"
                rel="noreferrer"
              >
                公式LINEの管理画面を開く <ArrowUpRight size={17} />
              </a>
              <ol>
                <li>送信する公式アカウントを確認する</li>
                <li>お知らせ文を作り、少人数へテスト配信する</li>
                <li>宛先・日時・残りの配信通数を確認して送信する</li>
              </ol>
              <p className="fine-print">
                この画面からの一斉送信は行いません。月2回×300人＝約600通に、オーナー通知等の通数が加わります。
              </p>
            </section>
          )}
          {tab === "settings" && (
            <div className="settings-grid">
              <section className="panel plain-body">
                <h2>ご利用の状態</h2>
                <dl>
                  <div>
                    <dt>動作モード</dt>
                    <dd>{isDemo ? "練習用デモ" : "実接続モード"}</dd>
                  </div>
                  <div>
                    <dt>AI利用記録</dt>
                    <dd>
                      {isDemo
                        ? "API呼び出しなし"
                        : `${state.aiCount} 回（今月）`}
                    </dd>
                  </div>
                  <div>
                    <dt>会話の保存</dt>
                    <dd>
                      {isDemo ? "このブラウザ内" : "30日（定期処理で削除）"}
                    </dd>
                  </div>
                  <div>
                    <dt>月額上限の想定</dt>
                    <dd>12,000円（税込）</dd>
                  </div>
                </dl>
                <p className="muted">
                  実接続モードの表示だけでは、各サービスへの接続成功を保証しません。テスト用LINEで送受信を確認してください。
                </p>
                <a href="/privacy" className="text-button">
                  お客様向けの自動応答案内 <ArrowUpRight size={16} />
                </a>
              </section>
              <section className="panel plain-body">
                <h2>データと日々の運用</h2>
                <p>
                  料金を変更したら、お試し質問で新しい金額を確認してください。予約希望は公式LINEで返信し、対応後に自動応答を再開します。
                </p>
                <button className="secondary" onClick={download}>
                  <Download size={16} />
                  FAQ・メニューを書き出す
                </button>
                {!isDemo && (
                  <button
                    className="secondary spaced"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => mutate("retry_notifications"),
                        "再試行を実行しました。お問い合わせ欄で結果をご確認ください。",
                      )
                    }
                  >
                    <RotateCcw size={16} />
                    未送信通知を再試行
                  </button>
                )}
                {isDemo && (
                  <button
                    className="danger-text spaced"
                    onClick={() => {
                      if (
                        confirm("練習で編集したデータと会話を初期化しますか？")
                      ) {
                        setState(fresh());
                        setChatHuman(false);
                        setChat([
                          {
                            role: "bot",
                            text: "デモを初期化しました。質問をどうぞ。",
                          },
                        ]);
                        setNotice("デモを初期化しました。");
                      }
                    }}
                  >
                    デモデータを初期化する
                  </button>
                )}
              </section>
              <section className="panel plain-body">
                <h2>実接続を始めるとき</h2>
                <p>
                  同梱の SETUP.md に沿って、Supabase・LINE・Claude
                  APIを設定してください。秘密キーはチャットや画面に貼り付けず、環境変数へ登録します。
                </p>
                <p className="muted">
                  デモからの自動移行はしません。正式な店舗情報を確認してから、実環境へ登録してください。
                </p>
              </section>
            </div>
          )}
          <footer className="footer">
            <span>salon note</span>
            <span>お店の時間を、もっと大切に。</span>
          </footer>
        </main>
      </div>
      {(faqEdit || menuEdit) && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
          >
            <div className="modal-head">
              <h2 id="edit-title">
                {faqEdit ? "よくある質問を編集" : "メニューを編集"}
              </h2>
              <button
                aria-label="編集を閉じる"
                disabled={busy}
                onClick={() => {
                  setFaqEdit(null);
                  setMenuEdit(null);
                }}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await mutate(
                    faqEdit ? "faq_save" : "menu_save",
                    faqEdit || menuEdit || {},
                  );
                  setFaqEdit(null);
                  setMenuEdit(null);
                }, "保存しました。新しいお問い合わせから反映されます。");
              }}
            >
              {faqEdit ? (
                <>
                  <label>
                    分類
                    <select
                      value={faqEdit.category}
                      onChange={(e) =>
                        setFaqEdit({
                          ...faqEdit,
                          category: e.target.value as Category,
                        })
                      }
                    >
                      {Object.entries(categories).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    お客様からの質問
                    <input
                      required
                      maxLength={200}
                      value={faqEdit.question}
                      onChange={(e) =>
                        setFaqEdit({ ...faqEdit, question: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    ご案内する回答
                    <textarea
                      required
                      rows={6}
                      maxLength={1000}
                      value={faqEdit.answer}
                      onChange={(e) =>
                        setFaqEdit({ ...faqEdit, answer: e.target.value })
                      }
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={faqEdit.enabled}
                      onChange={(e) =>
                        setFaqEdit({ ...faqEdit, enabled: e.target.checked })
                      }
                    />
                    自動応答で使用する
                  </label>
                </>
              ) : (
                <>
                  <label>
                    メニュー名
                    <input
                      required
                      maxLength={80}
                      value={menuEdit?.name}
                      onChange={(e) =>
                        setMenuEdit({ ...menuEdit, name: e.target.value })
                      }
                    />
                  </label>
                  <div className="two-fields">
                    <label>
                      税込料金（円）
                      <input
                        type="number"
                        required
                        min={0}
                        max={1000000}
                        value={menuEdit?.price_yen}
                        onChange={(e) =>
                          setMenuEdit({
                            ...menuEdit,
                            price_yen: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      所要時間（分）
                      <input
                        type="number"
                        required
                        min={1}
                        max={1440}
                        value={menuEdit?.duration_minutes}
                        onChange={(e) =>
                          setMenuEdit({
                            ...menuEdit,
                            duration_minutes: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    補足
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={menuEdit?.notes}
                      onChange={(e) =>
                        setMenuEdit({ ...menuEdit, notes: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                {(faqEdit?.id || menuEdit?.id) && (
                  <button
                    type="button"
                    className="danger-text"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("この項目を削除しますか？"))
                        run(async () => {
                          await mutate(
                            faqEdit ? "faq_delete" : "menu_delete",
                            undefined,
                            faqEdit?.id || menuEdit?.id,
                          );
                          setFaqEdit(null);
                          setMenuEdit(null);
                        }, "削除しました。");
                    }}
                  >
                    削除する
                  </button>
                )}
                <button className="primary" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <Check size={17} />
                  )}
                  保存する
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
