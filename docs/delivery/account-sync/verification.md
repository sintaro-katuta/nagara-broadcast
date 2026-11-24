# 検証（実装中）

`npm test`：Node.js 26.11.0で67件成功。実際の署名を持つWebAuthn形式の登録・ログイン・復旧をWorker経由で実行し、D1を模したSQLiteとメール送信の代役で確認した。復旧と通常ログイン・新規登録が重なる際、古いセッションが後から有効にならないことも確認。送信制限、同一オリジン、トークンの期限と再使用拒否をテストした。

`wrangler deploy --dry-run --outdir /private/tmp/nagara-passkey-dry-run`：Workerのバンドル成功。sandbox内でWranglerログへの書き込みは拒否されたがdry-run終了コードは0。実ブラウザ、実D1、Cloudflare Email Service、利用者向け画面、通知、アカウント削除は未検証または未実装。公開前にセキュリティレビューが必要。

画面追加後の `npm test`：Node.js 26.11.0で71件成功。メールリンクのtokenが履歴から消え、利用者が確認を押すまでAPIに送られないこと、途中画面の再表示、セッション変更時の画面の破棄とサーバー側の拒否、終了時keepaliveの送信、再生位置の古い書き込みの拒否をDOMとSQLiteの代役で検証。`npm run build` と `wrangler deploy --dry-run --outdir /private/tmp/nagara-passkey-ui-dry-run` は成功（Wranglerのsandbox内ログ書き込み警告あり）。ブラウザ操作が無効な環境のため、実ブラウザでの表示・画面操作、実パスキー・メール配送・複数端末同期は未確認。

`node --test tests/account-ui.test.mjs tests/auth-routes.test.mjs tests/server.test.mjs` はsandbox内のローカル待受が `EPERM` となりサーバーテストが失敗した。続けて実行した `npm test` ではサーバーテストを含む全件が成功した。

追加レビュー対応後の `npm test`：72件成功。アカウント情報の遅延、未ログイン、通信エラー時の確定状態と、履歴読み込み前の位置復元の保留を検証。`npm run build` も成功。実ブラウザでの確認は引き続き未実施。

今回のレビュー対応後の `npm test`：75件成功。一時的な初期照会の失敗からの再試行と、お気に入りの保存前に始まった古い取得結果の破棄を検証。`npm run build` も成功。実ブラウザでの確認は引き続き未実施。

WebAuthnライブラリの読み込み失敗後、ページ再読込なしで再試行しログインできることをDOMの代役で検証。`npm test` は76件成功、`npm run build` は成功。実ブラウザでの確認は未実施。

再生位置の通信が保留中でも次の一時停止位置を即時送信することを確認。D1を模したSQLiteでの順序逆転・セッション照合テストを含む `npm test` は77件成功、`npm run build` は成功。実ブラウザでの確認は未実施。

再照会中の一時停止位置が旧セッション識別子で送信され、古い取得結果で表示が戻らないこと、別セッションでは旧識別子による保存が拒否されることを検証。`npm test` は79件成功、`npm run build` は成功。実ブラウザでの確認は未実施。

保存と再照会の開始・完了の順序を変えるテストを追加し、保存前の履歴が画面に渡らないことを確認。既存の別セッション拒否、順序逆転、終了時の送信テストを含む `npm test` は80件成功、`npm run build` は成功。実ブラウザでの確認は未実施。
