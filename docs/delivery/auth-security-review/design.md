# 対応

Cloudflare Workers の静的アセット用 `_headers` に `frame-ancestors 'none'` と `X-Frame-Options: DENY` を設定し、画面の埋め込みを防ぐ。あわせて MIME 判定の抑制と参照元の送信抑制を設定する。これらは Worker が生成する API 応答には適用されない。API のアクセス制御は既存のセッション、Origin、権限確認を使う。
