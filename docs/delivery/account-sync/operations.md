# 運用（実装中）

マイグレーションはまだ本番D1に適用していない。Google Cloud側のOAuthクライアントとApple Developer側のSign in with Apple設定が必要。AppleはServices ID、Team ID、Key ID、署名用の秘密鍵が必要。GoogleとAppleの管理画面でそれぞれ `/api/auth/google/callback`、`/api/auth/apple/callback` を実際のHTTPSオリジンに登録する。

Workerには `AUTH_ORIGIN`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`APPLE_CLIENT_ID`、`APPLE_TEAM_ID`、`APPLE_KEY_ID`、`APPLE_PRIVATE_KEY` を設定する。秘密鍵とclient secretはWorker secretsに入れ、リポジトリやログへ記録しない。`AUTH_ENABLED=true` は画面接続、レート制限、実サービスによる認証・復旧テスト、管理者指定と個人データ削除手順の完成後まで設定しない。

SQLは既存の `schema.sql` の後に `cloudflare/migrations/` を番号順に適用する。ロールバック時にテーブルを削除すると利用者データが失われるため、バックアップ・復元を検証し、データを保持したままアプリの版を戻す手順を先に確定する。現状は認証が無効であり本番へのデプロイもしていない。
