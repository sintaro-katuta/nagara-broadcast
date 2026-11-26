# ながら放送 認証機能：第三者レビュー用資料

## 目的と範囲

一般公開前に、パスキー登録・ログイン・追加、メールによる復旧、管理者権限、アカウント削除、お気に入り・再生履歴の分離を独立したレビュアーに確認してもらう。この資料はレビューの依頼を準備するものであり、レビューの実施や公開の承認を意味しない。

レビュー対象の基準: main のコミット `f3c4e2b10729df052326c9e0dca71194e39fb6fc`。以降の変更がある場合は差分も確認する。設定上、本番のログインと関連機能の公開フラグは無効。事前に許可を得た隔離環境と架空データのみで試験する。本番データ、実在利用者へのメール送信、本番フラグや秘密情報の変更は対象外。

## 構成と守る情報

- ブラウザから Cloudflare Worker に接続し、Cloudflare D1 にアカウント、パスキー公開鍵、セッション、復旧情報、お気に入り・再生履歴を保存する。パスキーの秘密鍵はサービス側に保存しない。
- 登録・復旧メールと通知は Resend を介して送信する。メールアドレスは復旧や通知のため必要で、D1 には暗号化した値と、照合用の HMAC を保存する。送信時には復号した宛先を Resend に渡す。
- セッションやメールリンクのランダムなトークンはハッシュを保存する。メール照合・暗号化・レート制限の鍵は別々の Worker secrets で管理する。IP アドレスとメールアドレスのレート制限用識別子は HMAC 化する。
- 登録・復旧にはメールの利用可能性、管理者復旧には加えて運用者の承認を使う。メールアカウントや運用者の GitHub／Cloudflare 権限が侵害された場合の影響も評価する。
- アカウント削除は本人確認したパスキーを要求し、管理者の削除は拒否する。関連データの削除は D1 の外部キーに依存する。バックアップや外部サービス側の保持は別途確認が必要。

## コードの入口

| 対象 | 主なファイル |
| --- | --- |
| ルーティング・公開フラグ | `cloudflare/worker.mjs`, `cloudflare/wrangler.toml`, `cloudflare/auth-routes.mjs` |
| WebAuthn・登録・ログイン・追加 | `cloudflare/passkeys.mjs`, `cloudflare/passkey-enrollment.mjs`, `cloudflare/passkey-login.mjs`, `cloudflare/passkey-registration.mjs` |
| 通常／管理者の復旧・初期設定 | `cloudflare/passkey-recovery.mjs`, `cloudflare/admin-recovery.mjs`, `cloudflare/admin-bootstrap.mjs`, `.github/workflows/approve-admin-recovery.yml`, `.github/workflows/bootstrap-first-admin.yml` |
| セッション・レート制限・鍵処理 | `cloudflare/sessions.mjs`, `cloudflare/auth-rate-limit.mjs`, `cloudflare/recovery-crypto.mjs`, `cloudflare/recovery-tokens.mjs` |
| お気に入り・履歴・削除 | `cloudflare/account-api.mjs`, `cloudflare/account-data.mjs`, `cloudflare/account-deletion.mjs`, `cloudflare/migrations/0001_account_data.sql`〜`0018_history_generations.sql` |
| 送信・通知・期限切れ清掃 | `cloudflare/resend-email.mjs`, `cloudflare/recovery-notices.mjs`, `cloudflare/auth-cleanup.mjs` |
| 画面と静的アセットの保護 | `public/account-ui.js`, `public/_headers` |

## 特に確認してほしいこと

1. **登録とログイン**：チャレンジの有効期限・使い回し防止、Origin／RP ID／ユーザー検証、署名カウンター、別セッションへのすり替え、同時リクエストと失効の競合。登録・復旧の応答からメールアドレスの登録有無が推測できないか、時間差も含めて確認する。
2. **通常復旧**：メールリンクの目的・期限・一回限りの使用、メールスキャナー対策、ブラウザへの紐付け、登録済みパスキーとセッションの扱い、通知失敗・同時実行時の整合性。メールを乗っ取られた場合の権限回復と利用者への通知が妥当か検討する。
3. **管理者**：管理者初期設定が一度だけ成立すること、一般利用者の管理API拒否、メール確認と運用者承認の両方、期限切れ・再試行・旧資格情報の失効。GitHub Actions の入力可視性、運用者権限と本人確認も評価する。
4. **データ分離と削除**：他アカウントへの参照・更新防止、CSRF、遅延した書き込みによる履歴復活、パスキーを用いた削除、セッション失効や管理者昇格と削除の競合。D1 のカスケード、期限切れ清掃、通知待ち・バックアップ・外部サービスに残るデータも確認する。
5. **運用・外部依存**：秘密鍵の権限・漏えい時の対応、送信枠・バウンス・通知の滞留と重複、公開フラグの組合せ、誤設定時の停止、無料枠を超えた場合の運用。管理画面の Resend 使用量表示は全権限 API キーを必要とするため、公開必須にせず権限を別途評価する。
6. **ブラウザ保護**：静的アセットの埋め込み制限と Worker 応答の境界、XSS・機密情報の URL／ログへの漏えい。`_headers` は Worker 生成応答には適用されない。

## 再現と証拠

Node.js 22 以降を使用し、リポジトリの対象コミットで `npm ci`、`npm test`、`npm run build`、`node scripts/build-cloudflare.mjs` を実行する。個別試験は `node --test tests/passkey-login.test.mjs tests/passkey-recovery.test.mjs tests/admin-recovery.test.mjs tests/account-deletion.test.mjs tests/account-api.test.mjs` で実行できる。依存関係はレビュー時点で `npm audit --omit=dev` を再確認する。

- 2026-11-26 の実装者点検では自動テスト145件、ビルド、実行時依存の npm audit が成功。範囲と限界は [点検記録](../auth-security-review/verification.md)。
- [使い捨て Worker と実 D1 の試験](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45776544096) は、架空の認証情報による管理者復旧の再試行とパスキー追加・通知記録を確認し、試験リソースを削除した。
- [使い捨て D1 と実 Cron の試験](https://github.com/sintaro-katuta/nagara-broadcast/actions/runs/45751704322) で古い順序管理データの清掃を確認した。
- メール受信と通常ログインは以前ステージングで確認したが、メール復旧の実機完了、管理者復旧・通知の実機／実メール一連試験、削除の実ブラウザ／実 D1 試験は未完了。これらを成功扱いしない。

## 依頼時に求める成果

対象コミット・範囲・実施日、使った検証方法、各指摘の影響と再現条件、推奨修正、未検証事項を記録してもらう。秘密鍵、実メールアドレス、ログインリンク、セッショントークン、実データを報告書や GitHub の公開コメントに含めない。指摘の対応と再検証後に公開可否を判断する。正式な連絡先・プライバシーポリシー、通知待ちの保持方針、バックアップと復旧手順も公開前に確認する。
