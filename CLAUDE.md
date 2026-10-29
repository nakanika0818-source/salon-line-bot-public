# 美容室 LINE自動応答

## 作業ルール

- Next.js App Router、TypeScript strict、Tailwind CSS。npmを使う。
- 仕様の正本はdocs/requirements.md。予約確定・空き状況回答・独自一斉配信を追加しない。
- 店舗情報は初期サンプル。実店舗の承認前に本番配信しない。
- 秘密値は環境変数。NEXT_PUBLICに秘密値を置かない。ログにトークン・顧客の質問を出さない。
- 管理APIは毎回SupabaseのgetUserとadmin_usersを照合。画面を隠すだけで認可を済ませない。
- DB変更はsupabase/migrationsへ。RLSと権限を必ず設定する。
- LINE署名を生本文で検証してからJSONを解釈する。Webhookは永続化後に即時ACK。
- AIの自己申告の確信度だけで判断しない。高確信かつ承認済みFAQの根拠IDがある回答だけ使用。
- 出力本文は承認済み回答の原文を返す。AIが作った料金や日時をそのまま返さない。
- 送信結果不明のReplyは再送しない。通知Pushは同じretry keyで再試行する。
- 編集後はnpm test、npm run type-check、npm run buildを実行。

## 画面

日本語、白とアイボリー、深いオリーブ色。44px以上の操作領域、入力ラベル、読込・成功・失敗表示を設ける。
デモはブラウザ内のサンプル。実データと明確に分け、実モードの未接続をデモ成功で隠さない。

## 名前

コンポーネントはPascalCase、関数はcamelCase、DBはsnake_case。外部入力はZodで検証する。
