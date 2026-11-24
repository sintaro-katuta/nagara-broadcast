# 検証（実装中）

`npm test`：Node.js 26.11.0で67件成功。実際の署名を持つWebAuthn形式の登録・ログイン・復旧をWorker経由で実行し、D1を模したSQLiteとメール送信の代役で確認した。復旧と通常ログイン・新規登録が重なる際、古いセッションが後から有効にならないことも確認。送信制限、同一オリジン、トークンの期限と再使用拒否をテストした。

`wrangler deploy --dry-run --outdir /private/tmp/nagara-passkey-dry-run`：Workerのバンドル成功。sandbox内でWranglerログへの書き込みは拒否されたがdry-run終了コードは0。実ブラウザ、実D1、Cloudflare Email Service、利用者向け画面、通知、アカウント削除は未検証または未実装。公開前にセキュリティレビューが必要。
