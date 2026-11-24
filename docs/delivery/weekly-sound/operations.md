# 運用

毎朝の自動制作は `scripts/weekly-run.mjs` が `--weekly-sound YYYY-MM-DD` を付けて合成する。音声は `data/weekly/YYYY-MM-DD/episode.mp3`、音素材と選曲情報は `episode.mp3.sound/` に保存する。

BGM ライブラリの用意と確認は [ACE-Step BGM](ace-bgm.md) を参照する。音源がない曜日は従来の合成音を使う。音編集に失敗した回は公開しない。途中で中断され `episode.mp3.sound/` や未検証音声、ロックが残った場合は、同日の処理が動いていないことを確かめ、内容を保全してから再試行する。
