# 設計

本番 `cloudflare/wrangler.toml` の `AUTH_ENABLED`、`PASSKEY_API_ENABLED`、`PASSKEY_ADD_ENABLED`、`AUTH_NOTICES_ENABLED` を有効にする。既存の自動デプロイが main へのマージ後に更新する。通知処理は既存 Cron を使い、登録・復旧のメールは既存の Resend キーで送信する。`AUTH_CLEANUP_ENABLED` は既存どおり有効。管理者の初期設定・復旧は有効化しない。

本番のD1適用状態と、送信キーによる Resend シミュレーターへの配送は確認済み。通常復旧と再ログインは分離環境の実機で確認済み。本番の登録・ログイン一連、管理者・アカウント削除の実機確認、運営者情報と情報の取り扱いの残る確認は未完了。管理者がいないためアプリの管理画面はまだ使えず、Resend の使用状況は提供元画面で確認する。独立した外部セキュリティ監査は未実施。
