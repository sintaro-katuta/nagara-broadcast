# 設計

`.github/workflows/cloudflare-deploy.yml` はPRとmain pushでNode 24の `npm ci`、`npm test`、ビルドを実施する。main pushのみ、テスト成功後にCloudflare公式Wrangler Actionで既存Worker `nagara-broadcast` を公開する。実行の並列数を1に制限し、開始前にmainのHEADが一致しなければ古いデプロイを飛ばす。競合チェックからデプロイ完了までに新しいコミットが到着する可能性はあるが、後続のmain実行で更新する。外部ActionsはコミットSHA、Wranglerは4.40.3に固定する。

公開用の `cloudflare/public` はgit管理外なので `npm run build`、`node scripts/build-cloudflare.mjs` で毎回生成する。D1/R2バインディングは既存の `cloudflare/wrangler.toml` を使用。マイグレーションは含まない。GitHub Secretsがない間はデプロイが失敗する。
