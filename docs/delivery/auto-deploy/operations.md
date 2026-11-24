# 運用

## 初期設定

1. Cloudflareで対象アカウント・既存Worker `nagara-broadcast` のデプロイに必要な権限に限定したAPIトークンを作成する。対象WorkerのEditorが基本。ルートやドメインを変更する場合は別権限が必要。APIトークンの値をチャットやソースに貼らない。
2. GitHubリポジトリの Settings → Secrets and variables → Actions → Repository secrets に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を設定する。トークン値はSecretに保存する。
3. このワークフローをmainに反映すると、そのpushが最初の実行になる。GitHub Actionsでテスト・公開の結果を確認し、CloudflareのWorkerデプロイ履歴と公開サイトを確認する。

## 障害対応

GitHub Actionsの失敗したジョブを確認する。認証エラーはトークンの対象アカウント・権限と2つのSecretを確認し、ビルドやテストの失敗は該当コミットを修正してmainに反映する。トークン値をログに出さない。

## 復旧

問題のコミットをmainでrevertすると、テスト成功後にその状態が自動デプロイされる。緊急時はCloudflareのデプロイ履歴から直前のWorkerバージョンを復元し、その後mainも修正する。古いワークフローを再実行しても、mainのHEADでなければ古いコードはデプロイされない。D1スキーマとデータの復元はこのワークフローの対象外。
