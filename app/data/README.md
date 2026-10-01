# 単語帳の辞書データ

著作者・出典：大韓民国 国立国語院 (National Institute of Korean Language)、
韓国語基礎辞典／韓国語-日本語学習辞典。

- 辞典：https://krdict.korean.go.kr/jpn/mainAction?nation=jpn
- 著作権ポリシー：https://krdict.korean.go.kr/kor/kboardPolicy/copyRightTermsInfo
- ライセンス：Creative Commons Attribution-ShareAlike 2.0 Korea (CC BY-SA 2.0 KR)
- ライセンス本文：https://creativecommons.org/licenses/by-sa/2.0/kr/legalcode
- 概要：https://creativecommons.org/licenses/by-sa/2.0/kr/

`krdict-beginner.json` は同じ CC BY-SA 2.0 KR で配布します。
辞書データのライセンスは、ゲームコードのライセンスとは別です。
音声・画像・動画などのマルチメディアは取り込んでいません。

## 取得・加工

2026年10月1日に公式「辞書全体のダウンロード」のJSON ZIPを取得。
配布ページ：https://krdict.korean.go.kr/download/downloadPopup
今回の取得URL：https://krdict.korean.go.kr/dicBatchDownload?seq=217
原本公開日：2026年9月19日。チェックサムはJSON内に記録。

初級（초급）の独立した語彙から、日本語訳がある2,211語を抽出。
日本語見出しの読み仮名・括弧・区切りを整理し、24文字以内の対訳を選択。
多義語には最初の語義の短い韓国語用例を付加。
同じハングル表記は統合し、別の語義や同音異義語の日本語対訳も
誤答除外用の aliases に保存。
各項目に原典の項目IDとリンクを残しています。

誤答は同じ辞書の別項目から作成します。文字列と辞書の別訳に基づいて
重複・類似を除外しますが、文脈上の意味の重なりを完全には判定できません。
不自然な出題が見つかった場合、sourceId を使って原典を確認して修正できます。

更新する場合は、新しい公式JSON ZIPを取得し、プロジェクト直下で次を実行：

```sh
python tools/import_krdict.py downloaded.zip
```

プレイ中にAPI通信やAI生成は行いません。日本語訳はAIで作成していません。

会話学習向けに「정말」「진짜」「조금」は副詞の項目を選択し、「바로」は「すぐに」に相当する語義を選択しています。元データの他の語義は誤答除外用の別訳として保持しています。
