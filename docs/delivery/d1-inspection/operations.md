# 運用

Cloudflare で D1 Read のみを付与し対象を可能な範囲で限定した API トークンを作り、GitHub Actions secret `CLOUDFLARE_D1_READ_TOKEN` に保存する。既存の `CLOUDFLARE_ACCOUNT_ID` を使用する。トークンをチャットやログに貼らない。

main マージ後に `Inspect D1 schema` を main 上で手動実行し、Actions ログを確認する。権限不足では HTTP 403 等で失敗する。トークンは不要になれば失効可能。これは接続・構造の確認であり、移行・バックアップ・実メールの検証やログインの有効化は実施しない。
