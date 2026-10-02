# 歌詞の追加

1. 曲ごとの JSON をこのフォルダーに追加します。
2. `app/js/lyrics.js` の `SONGS` に id と file を追加します。
3. JSON は `id`, `title`, `artist`, `lines` を持ちます。各行は `id`, `korean`, `japanese`, `tokens` で構成します。
4. `tokens` は単語または自然な文節の配列です。半角スペースで連結した値を `korean` と一致させてください。

Wonderland はユーザー提供の対訳を使用。英語のみの行、1枚だけになる行、繰り返しの同一行は出題から除外しています。混在する英語は元データを維持しています。
