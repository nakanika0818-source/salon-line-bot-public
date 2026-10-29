# セットアップ手順

## 1 デモで起動

READMEの手順で `npm ci` → `npm run dev`。Next.jsはNode.js 20.9以上が必要ですが、この成果物はNode.js 24で検証しています。WindowsではVS CodeのPowerShellでも実行できます。

プロジェクト直下の `.env.example` を `.env.local` へコピーします。PowerShellなら `Copy-Item .env.example .env.local`。最初は `NEXT_PUBLIC_DEMO_MODE=true` のまま動作を確認してください。

## 2 Supabaseを作る

1. 店舗が管理する新規Supabaseプロジェクトを作成します。既存データのあるプロジェクトに初期SQLを流さないでください。
2. SQL Editorで `supabase/migrations/001_initial.sql` を一度実行します。
3. Authenticationでオーナー1名のメール・パスワード利用者を作成し、発行されたUUIDを控えます。一般のお客様の登録は不要です。公開サインアップを無効にします。
4. SQL Editorで以下を実行します。UUIDは実際のオーナーのものへ置き換えます。

```sql
insert into public.admin_users(user_id)
values ('ここをオーナーのUUIDへ置き換える');
```

5. 練習用なら `supabase/seed.sql` を一度実行します。営業時間、金額、駐車場等はすべてサンプルです。実顧客が使う前に正式情報へ修正します。
6. プロジェクトURL・公開anonキー・service_roleキーを取得し `.env.local` に登録します。公開キーは `NEXT_PUBLIC_SUPABASE_ANON_KEY`、管理用の秘密キーは `SUPABASE_SERVICE_ROLE_KEY` にだけ設定します。新しい種類のsecret keyを使う場合も、サーバー専用の同変数で扱います。
7. `.env.local` の `NEXT_PUBLIC_DEMO_MODE=false` に変更して再起動します。オーナーのアカウントでログインし、FAQが表示・編集できるか確認します。設定が足りないときはログイン画面にエラーを表示し、デモへ自動切替しません。

## 3 LINEのテスト用アカウントを用意

1. まずテスト用のLINE公式アカウントを用意し、公式アカウント管理画面からMessaging APIを有効化します。LINE Developersで関連付いたチャネルを開きます。
2. Channel secretとChannel access tokenを、それぞれ `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN` に設定します。
3. 開発者本人のテストLINEユーザーIDを `TEST_LINE_USER_ID` に設定します。Developersに表示されるYour user ID、またはテスト用の友だち追加イベントから、本人のIDを確認します。顧客IDを流用しません。
4. オーナーの個人LINEでこの公式アカウントを友だち追加し、同じproviderに属する本人のユーザーIDを `LINE_OWNER_USER_ID` に設定します。bot側アカウントのIDではありません。値をGit・スクリーンショット・公開文書へ残しません。
5. `BOT_MODE=echo` に設定します。Echoでは `TEST_LINE_USER_ID` 以外に返信しません。

このコードからLINE Developersのチャネルを自動作成する機能はありません。

## 4 Claude API

1. 店舗が管理するClaude Consoleで利用可能残高・請求設定を確認し、APIキーを作成します。
2. `ANTHROPIC_API_KEY` に設定。現状の実装は `ANTHROPIC_MODEL=claude-sonnet-4-6` を前提にしています。提供状況は着手時にConsoleで確認します。対応外モデルへ変えると、安全のため有人対応に切り替えます。
3. `AI_MONTHLY_LIMIT=500`、`AI_USER_DAILY_LIMIT=20`、`AI_MONTHLY_BUDGET_USD=7` を初期値とします。コードはAPI呼び出し前に費用を多めに予約し、成功後に実使用量へ精算します。エラー時の予約は残し、上限を過小評価しません。
4. モデルを変更する場合は、`src/lib/ai.ts` の対応モデル・単価・費用予約の式も更新して検証します。7ドルはAIのみの上限です。LINE・サーバー料金は各サービスの請求画面で別に管理します。

## 5 Vercelへ公開して本人テスト

公開は講座のStep 4で行う想定です。プラン条件は2026年10月22日にVercel公式資料で確認しました（末尾の公式資料を参照）。

### プランの選び方

- **練習課題はHobby（0円）で公開します。** Hobbyは個人・非商用に限られ、Cronは1日1回まで（実行時刻は最大59分ずれる）です。1日1回より頻繁な式はデプロイ時に失敗します。
- `vercel.json` のCronは1日1回（`0 18 * * *`、日本時間の午前3時ごろ）です。
- **店舗の商用本番はPro**（月20ドル税別、デプロイ席1つと月20ドル分の利用クレジットを含む）を使います。報酬を受け取って納品・運用する場合はHobbyを使えません。Proでは障害時の通知を早めるため、`vercel.json` を1分ごと（`* * * * *`）に戻すことを推奨します。
- Pro Trial（14日間、アカウントにつき1回、支払い方法を登録しなければ課金なし）でもProの条件を試せます。

### 1日1回のCronで変わること

| 処理 | 動き |
|---|---|
| 通常のFAQ応答・最初の引き継ぎ通知 | 受信直後に処理。Cronの間隔に影響されない |
| 送信前の処理失敗 | その場で引き継ぎとオーナー通知を行う |
| 処理中にサーバーが停止した受信 | 次の受信時（最大3件、今回の返信の後）か1日1回のCronで拾い直し、返信期限を過ぎていればAIを呼ばずに引き継ぐ |
| 失敗した通知の再送 | 次の受信時・1日1回のCron・管理画面の「再試行」で行う。数分ごとの自動再送ではない |
| 古いデータの削除 | 30日を超えたデータを1日1回削除する。通常は31日程度残る場合がある |

### 手順

1. ソースを非公開のGitリポジトリに保存します。`.gitignore` が `.env*` を除外しているので、`.env.local` はコミットされません。コミット前に `git status` で確認します。Gitを使わずVercel CLIで公開する方法もあります。
2. VercelでProjectを作り、Frameworkは自動検出のNext.js、Node.jsは `package.json` の `engines`（24.x）に従います。
3. 関数のリージョンは `vercel.json` の `regions` で指定します（Hobbyは1リージョンのみ）。練習用のSupabaseはシドニー（ap-southeast-2）のため `syd1` にしています。Supabaseを別の地域に作った場合は、近いリージョン（東京なら `hnd1`）に変えます。未指定だと米国東部（`iad1`）で動き、DBとの往復で返信が遅くなります。
4. Production環境だけに次を登録します。Previewにはコピーしません（Previewはデモモードのまま動きます）。値はVercelの入力欄に直接貼り、チャット・スクリーンショットに残しません。

| 変数 | 値の目安 |
|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `false`（ビルド時に埋め込まれるため、変更後は再デプロイ） |
| `NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` と同じ |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` と同じ。Sensitiveとして登録 |
| `LINE_CHANNEL_SECRET`・`LINE_CHANNEL_ACCESS_TOKEN` | `.env.local` と同じ。Sensitive |
| `LINE_OWNER_USER_ID`・`TEST_LINE_USER_ID` | `.env.local` と同じ |
| `ANTHROPIC_API_KEY` | `.env.local` と同じ。Sensitive |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
| `APP_URL` | 本番の `https://〜.vercel.app`（Project作成後に確定。httpsでないと通知を送らない） |
| `CRON_SECRET` | 新しく作る十分長いランダム文字列。Sensitive |
| `BOT_MODE`・`TEST_USER_ONLY` | 本人テスト中は `faq`・`true` |
| `AI_MONTHLY_LIMIT`・`AI_USER_DAILY_LIMIT`・`AI_MONTHLY_BUDGET_USD` | `500`・`20`・`7` |

5. `APP_URL` を本番URLに直したら再デプロイします。Deployment Protectionで本番ドメインが保護されていないこと（LINEとCronが届くこと）を確認します。
6. Vercelの「Cron Jobs」で `/api/maintenance` を手動実行して成功することを確認し、翌日に自動実行の成功も確認します。AuthorizationはVercelが `CRON_SECRET` から付与します。URLのクエリに秘密値を入れません。
   - 自動実行の確認方法：SupabaseのLogs（API Gateway、URLは `https://supabase.com/dashboard/project/<プロジェクトID>/logs/edge-logs`）で期間を前日1日分にし、**Pathnameのフィルター**に `/rest/v1/rpc/retain_recent_data` を完全一致で入れて検索します。日本時間3時台に `POST`・ステータス204の行があれば、定期処理が動いています（この関数を呼ぶのは定期処理だけです）。Event messageの「Like」検索は、`%` を付けないと完全一致になり、見つからないことがあります。
   - 30日を超えたデータがまだない間は、削除処理が動いても削除される行はありません。「処理が成功したこと」と「データが削除されたこと」は分けて確認します。
7. LINE DevelopersのWebhook URLを `https://本番ドメイン/api/line/webhook` にし、検証が成功してからWebhookの利用をオンにします。公式LINEの既存自動応答と二重に返信しないよう応答設定を見直します。
8. テスト用の個人LINEから送信して確認します。`TEST_USER_ONLY=true` の間は `TEST_LINE_USER_ID` 以外を処理しません。

## 6 FAQへ切り替える

1. 管理画面で正式なFAQ・メニューを登録。既存の価格FAQに古い数字を書かず、金額はメニュー欄を正本にします。
2. `BOT_MODE=faq` に変更し、再デプロイします。実顧客へ切り替える前の本人確認では `TEST_USER_ONLY=true` を併用し、`TEST_LINE_USER_ID` 以外を処理しないようにします。実顧客へ切り替えるときに削除します。
3. FAQ各分類3件ずつの言い換え、予約希望、不明質問、スタンプ、長文、有人停止・再開を実際のテストLINEで確認します。
4. `/privacy` の店舗名・連絡先を正式なものに編集し、自動応答でAIを使う旨と利用案内URLをLINEプロフィール・あいさつ文等に掲載します。
5. サンプルの文言・料金が残っていないか確認し、店舗の承認後に実顧客へ切り替えます。

## 7 定期処理と失敗時

Webhookは受信イベントをDBへ保存してから受付を返し、`after` で処理します。受付の速度とお客様への最終返信の速度は別です。ネットワークやAI応答に依存するため3秒以内の最終返信は保証しません。実接続で両方の時間を測定してください。

送信前に処理が失敗した場合は、その場で有人引き継ぎに切り替えてオーナーへ通知します。処理中にサーバー自体が停止した場合は、90秒のリース経過後、次の受信時または定期処理で拾い直します。Reply tokenの期限（受信から55秒で判定）を過ぎていればAIを呼ばずに手動確認へ回し、無条件のPush返信へ切り替えません。拾い直しは1件ずつ行い、同じお客様の2件目以降は有人対応中として扱うため、オーナー通知が重なりません。送信開始後に結果が不明になったReplyは自動再送しません。管理画面の「返信を確認してください」と公式LINEの実際の履歴を照合してください。

通知は同じretry keyで最大5回まで再試行します。送信前に通知ごとに処理権を取得するため、受信時・定期処理・再試行ボタンが同時に動いても同じ通知を二重に送りません。通知先・友だち追加・配信通数・APP_URLを確認後、管理画面の設定から再試行できます。

保持期限の削除は、30日を超えたデータを定期処理で1日1回削除します。このため通常は31日程度残る場合があります。定期処理が失敗・停止した日は削除されず、次に成功するまでさらに長く残ります。VercelのCron Jobs画面で失敗を確認してください。

## 8 バックアップと復旧

毎月・料金変更時に管理画面の「FAQ・メニューを書き出す」でJSONを店舗の安全な保存先へ保管します。顧客の会話ログはこの書き出しに含みません。復旧は稼働を停止してDBを復旧し、FAQ・メニューをJSONと照合して管理画面で再登録します。認証利用者とadmin_users権限も確認します。自動インポート機能は実装していません。

## 公式資料

- Next.js https://nextjs.org/docs/app/getting-started/installation
- afterの動作 https://nextjs.org/docs/app/api-reference/functions/after
- LINE受信 https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- LINE署名 https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- LINE料金 https://developers.line.biz/ja/docs/messaging-api/pricing/
- Supabase RLS https://supabase.com/docs/guides/database/postgres/row-level-security
- Claude API https://platform.claude.com/docs/en/api/messages
- Vercel Cronのプラン別条件 https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel Hobby・商用利用 https://vercel.com/docs/plans/hobby
- Vercel Pro・Pro Trial https://vercel.com/docs/plans/pro-plan https://vercel.com/docs/plans/pro-plan/trials
- Vercel Functions料金 https://vercel.com/docs/functions/usage-and-pricing
