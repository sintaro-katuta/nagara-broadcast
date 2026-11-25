# 検証

`npm test` は107件成功、`npm run build` と `node scripts/build-cloudflare.mjs` は成功。固定した一時 D1 ID を使った設定を生成し、Wrangler 4.168.0 の `deploy --dry-run` で分離した Worker 名、DB、環境変数を確認した。

実際のデプロイ、スマホ上の画面、受信箱、複数端末、通知 Cron、プレビュー用証明書は未検証。公開前に独立したセキュリティレビューが必要。
