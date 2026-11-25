# 検証

2026-11-26: 本番と分離された一時的な実 D1 で、定期処理を直接呼び出し、期限切れの認証データ8種類が削除され、有効な認証データ・お気に入り・履歴・復旧先・パスキーは保持されることを確認した。テスト DB は削除済み。[実行結果](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45721687183)

SQLiteでD1を模したテストにより、8種類の期限切れ行、有効な行、期限ちょうどの境界、各テーブルの件数制限、複数回の実行、関連する利用者データの保持、バッチ失敗時のロールバックを確認する。Cronハンドラーは初期状態でDBにアクセスしないことと、失敗を呼び出し元に伝えることを確認する。

実Cloudflare D1とCron Triggerの動作は本番公開前に別途確認する。

`npm test`：83件成功。`npm run build`、`node scripts/build-cloudflare.mjs`、`wrangler deploy --dry-run --outdir /private/tmp/nagara-auth-cleanup-dry-run`：成功。dry-runではsandboxによりWrangler自身のログファイル書き込みが拒否されたが、バンドルは終了コード0で完了した。
