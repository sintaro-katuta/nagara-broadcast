# 検証（実装中）

`npm test`：Node.js 26.11.0で67件成功。実際の署名を持つWebAuthn形式の登録・ログイン・復旧をWorker経由で実行し、D1を模したSQLiteとメール送信の代役で確認した。復旧と通常ログイン・新規登録が重なる際、古いセッションが後から有効にならないことも確認。送信制限、同一オリジン、トークンの期限と再使用拒否をテストした。

`wrangler deploy --dry-run --outdir /private/tmp/nagara-passkey-dry-run`：Workerのバンドル成功。sandbox内でWranglerログへの書き込みは拒否されたがdry-run終了コードは0。実ブラウザ、実D1、Cloudflare Email Service、利用者向け画面、通知、アカウント削除は未検証または未実装。公開前にセキュリティレビューが必要。

画面追加後の `npm test`：Node.js 26.11.0で69件成功。メールリンクのtokenが履歴から消え、利用者が確認を押すまでAPIに送られないことと、セッション失効時に画面上のアカウントデータを消すことをDOMの代役で検証。`npm run build` と `wrangler deploy --dry-run --outdir /private/tmp/nagara-passkey-ui-dry-run` は成功（Wranglerのsandbox内ログ書き込み警告あり）。ブラウザ操作が無効な環境のため、実ブラウザでの表示・画面操作、実パスキー・メール配送・複数端末同期は未確認。

`node --test tests/account-ui.test.mjs tests/auth-routes.test.mjs tests/server.test.mjs` はsandbox内のローカル待受が `EPERM` となりサーバーテストが失敗した。続けて実行した `npm test` ではサーバーテストを含む69件すべてが成功した。
