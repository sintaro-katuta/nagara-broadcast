# 運用

公開する場合は `npm run build` と `node scripts/build-cloudflare.mjs` の後、`cd cloudflare && wrangler deploy` を実行する。以後の週間制作では `episode.mp3.captions.json` が生成され、音声公開後に字幕を同じエピソードへ保存する。字幕 API が未対応の場合は音声公開を継続し、字幕は生成済みファイルに残してログに警告する。API 対応後に対象エピソードへ別途登録する。その他の失敗時は `data/weekly/logs/` と生成ファイルを確認し、既存の再実行手順に従う。すでに生成済みの音声には字幕が自動追加されない。公開後は字幕ボタン、シーク、字幕のない回を確認する。ロールバックは直前の Worker に戻し、必要なら字幕 API の書き込みを停止する。R2 の `captions/` は音声と独立している。
