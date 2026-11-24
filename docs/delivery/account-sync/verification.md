# 検証（実装中）

- `npm test`：Node.js 26.11.0 で44件成功。SQLiteを使い利用者間の分離、重複保存、履歴の更新・削除、不正な再生位置と存在しない音声の拒否を確認。容量集計と未設定の上限も確認。
- `node --check cloudflare/account-data.mjs` と `node --check cloudflare/storage-summary.mjs`：成功。
- `node --test tests/account-api.test.mjs tests/account-data.test.mjs tests/storage-summary.test.mjs`：3件成功。認証なし、権限なし、異なるOrigin、別利用者IDを指定した操作も確認。ただし認証はテスト用の代役。
- `node --test tests/oauth.test.mjs`：3件成功。署名付きテストトークンと代役の通信先でGoogle・Appleのフローを確認。
- `npm audit --omit=dev`：本番依存の既知の脆弱性0件。依存追加時の全依存監査では5件（中2、高3）が報告されており、開発依存の内容は未精査。
- 実プロバイダー、実D1、画面、複数端末での同期は未検証。実サービスへの接続設定と画面接続が必要。
