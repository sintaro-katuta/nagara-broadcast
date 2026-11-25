# 運用

本番とは別名の Worker `nagara-auth-staging` を使う。現在のデプロイトークンは既存 Worker 用に制限されているため、別 Worker を作成する権限を確保する必要がある。テスト専用 D1 の作成と 0001〜0017 の適用後、`PREVIEW_DATABASE_ID`、`PREVIEW_ORIGIN=https://nagara-auth-staging.sintaro-katuta.workers.dev`、24時間以内の Unix 秒 `PREVIEW_EXPIRES_AT` を指定し `node scripts/auth-preview-config.mjs` で機密値を含まない一時設定を作成する。本番 D1 の ID は拒否される。

静的ファイルをビルドしたうえでテスト用 Worker に設定を適用し、別途ランダムな `PREVIEW_ACCESS_TOKEN`、互いに異なる `AUTH_RATE_KEY`・`AUTH_LOOKUP_KEY`・`AUTH_ENCRYPTION_KEY`、テスト専用送信キー `RESEND_API_KEY` を secrets に設定する。入口トークンを含む `/#preview-access=...` を必要なテスターだけに共有し、チャット・ブラウザの履歴・メール等の取り扱いに注意する。入口トークンは64文字の小文字16進数とする。

期限切れでテスト環境は閉じる。テスト後はテスト用 Worker、D1、送信キーを確認して削除または無効化する。本番の Worker、D1、保存済み鍵は対象にしない。Cron が動かないため、復旧完了通知は別の方法で検証する。
