# 確認結果

- 分離環境で、実機による確認メールの受信・パスキー登録・ログインと、お気に入り・再生履歴の D1 保存を確認。メールによる復旧はリンクを開くところまで確認し、別の保存先でのパスキー登録・復旧完了は未確認。
- 管理者の情報取得 API は、分離環境で未認証と一般ユーザーを拒否し、テスト用管理者を許可した。[実行結果](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45718510450)
- 復旧通知は使い捨て D1 で成功・429 再試行・403 停止を検証し、別途 Resend 公式シミュレーターで配信済みを確認。[処理検証](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45718838320)、[配送検証](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45719658644)。Cloudflare の本番 Cron からの実配送ではない。
- 認証データの削除処理を使い捨ての実 D1 で呼び出し、期限切れ8種類が削除され、有効な情報とお気に入り・履歴等が残ることを確認。[実行結果](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45721687183)。
- 一時的な Worker と D1 で Cloudflare Cron を実際に実行し、期限切れの試験データを削除し、有効な試験データを保持することを確認。[実行結果](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45723320829)。
- 本番を読み取り専用で確認し、アカウントと管理者がともに0、認証と期限切れ清掃が無効、Resend 使用量キーが未設定であることを確認。[実行結果](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45722145199)。
- `DELETE /api/account/history` は履歴と `position_write_cursors` を同時に消し、古い履歴世代の更新を拒否する。0018の本番適用と実 D1 での確認は別途実施する。
- 復旧開始のアカウント照合・配送を `waitUntil` に移し、応答が照合や配送の完了を待たないことをテストした。使い捨て Worker で応答後も処理が完了することを検証したが、照合と配送は代役であり、実メール配送や時間差攻撃の完全な防止は確認していない。[実行結果](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45725114495)
- 変更後の処理を使い捨ての実 D1 とテスト用 WebAuthn 署名で検証し、登録・ログイン・復旧・お気に入り・履歴・削除が完了した。配送は代役であり、実機と実メールの組み合わせではない。[実行結果](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45725404177)
- `npm test`: 115件成功。`npm run build`: 成功。
- 作業担当者による確認であり、独立した安全性レビューは未実施。
