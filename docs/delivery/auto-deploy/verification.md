# 検証

- `npm test`：Node.js 26.11.0で45件成功。
- `npm run build` と `node scripts/build-cloudflare.mjs`：成功。
- `wrangler deploy --dry-run --outdir /private/tmp/nagara-deploy-dry-run`：既存のD1/R2/静的アセットのバインディングを含むビルド成功。sandbox内でWranglerログへの書き込みは拒否されたが、dry-runの終了コードは0。
- Ruby YAMLパーサーでワークフローファイルを読み込めることを確認。
- GitHub Actions上のPR検証、本番へのデプロイ、GitHub Secretsの有効性は未検証。Secretsの登録およびmain反映後に確認する。
