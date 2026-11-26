# 運用

`POSITION_CURSOR_CLEANUP_ENABLED=false` が既定。分離環境の実 D1 と Cron で動作確認するまでは有効化しない。既存の認証情報の期限切れ清掃とは独立して停止できる。有効化には既存の `AUTH_CLEANUP_ENABLED=true` も必要。削除数は Cron ログの `Expired position cursors` で確認する。問題時はフラグを false に戻す。削除済みの管理データは復元されないが、再生履歴自体は削除しない。
