# 点検と検証結果

2026-11-26 に実装者がコードと既存テストを点検した。認証ルートの Origin・レート制限、WebAuthn の署名と本人確認、セッションの保存と失効、メール復旧、管理者の権限・復旧、本人確認付きのアカウント削除と関連データの外部キーを確認した。

公開画面に埋め込みを制限するヘッダーがなかったため追加した。既存サイトの HEAD 応答には当該ヘッダーがなく、変更後は Wrangler のローカル静的アセット応答で CSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy を確認した。Cloudflare が Worker 生成応答と静的アセットのヘッダーを分ける点は [公式資料](https://developers.cloudflare.com/workers/static-assets/headers/) を参照。

- `npm test`: 145件成功。`npm run build` と `node scripts/build-cloudflare.mjs`: 成功。
- `npm audit --omit=dev`: 既知の脆弱性 0 件（調査時点、実行時依存）。
- Wrangler ローカル環境で `/` に HEAD: 200 と4つの設定済みヘッダーを確認。ローカル Wrangler は指定より古い互換日で実行されたため、本番でのヘッダー確認は別途必要。
- マージ後の [自動デプロイ](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45798937208) は成功。2026-11-26 に公開サイト `/` の HEAD で HTTP 200 と4つのヘッダーを確認した。ブラウザでの埋め込み拒否の実機確認は未実施。

本点検は網羅性や無脆弱性を保証せず、独立レビューではない。メール復旧の実機完了、管理者復旧と通知の実メール検証、公開環境での確認は未実施。本番認証は無効のまま。
