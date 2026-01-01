# lifelog

短いログ（見た記事や本、気づきなど）を日付やタグで振り返るための個人用アプリです。

使ってみる（自分で動かす場合）
1) `npm install`
2) `wrangler login`
3) `npm run db:migrate:local`
4) `npm run dev`

Cloudflare Pages に置く場合の最低限
1) `npm run build`
2) `npm run deploy`

Cloudflare D1
- ダッシュボードで D1 を作成して `wrangler.toml` の `database_id` を更新します
- 反映後に `npm run db:migrate:remote`

Cloudflare Access（任意）
- Pages のドメインに Access ポリシーを設定して自分だけ許可します
- これとは別にアプリ側の `ALLOWED_ORIGIN` で書き込みの Origin を絞れます

環境変数（任意）
- `ALLOWED_ORIGIN` : 書き込み時の Origin チェック用
- `AUDIT_WEBHOOK_URL` : 監査ログを Discord に送る場合

Optional: AIにデプロイを任せるときのプロンプト
「このリポジトリを Cloudflare Pages + D1 にデプロイしたい。wrangler.toml の d1_databases を自分のDBに合わせて更新して、D1 の migrations を適用し、build と deploy を実行して。必要な環境変数は ALLOWED_ORIGIN と AUDIT_WEBHOOK_URL。手順を短く箇条書きで教えて。」
