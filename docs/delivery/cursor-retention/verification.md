# 検証

SQLite を用いた自動テストで、履歴・他アカウントの保持、旧世代の拒否、新しい世代の書き込み、処理件数の上限、削除失敗時の世代更新のロールバックを確認。[使い捨ての実 D1](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45750216597) でも同様の基本動作を確認した。[使い捨て Worker の実 Cron](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45751704322) が古いカーソルを削除し、履歴と新しいカーソルを保持することを確認。試験用 Worker と DB は削除済み。
