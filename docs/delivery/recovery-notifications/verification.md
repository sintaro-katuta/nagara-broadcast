# 検証

テスト用SQLiteとメール送信の代役で、復旧成功時の通知待ち作成、記録失敗時のロールバック、送信失敗と再試行、複数Workerの同時取得防止、通知機能が無効な場合の拒否を確認する。実際のD1、Cloudflare Email Service、宛先への配送とバウンスの確認は公開前に別途必要。

`npm test`：89件成功。`npm run build`、`node scripts/build-cloudflare.mjs`、`wrangler deploy --dry-run`：成功。dry-run時にsandboxによるWrangler自身のログ書き込み警告あり。
