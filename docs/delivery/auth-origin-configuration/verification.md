# 検証

`npm test` は105件成功し、`npm run build` と `node scripts/build-cloudflare.mjs` が成功した。`wrangler deploy --dry-run` は終了コード0で設定を確認できたが、sandbox が Wrangler 自身のログ書き込みを拒否した。実際のメール受信・スマホでのパスキー認証はこの変更には含まれず、公開前に別途確認する。
