# AI単語帳の設定手順（Windows）

実装は完了していますが、あなたのCloudflareアカウントへの公開と、OpenAI APIの契約・キー設定はまだです。
読み方モードは従来どおり動きます。単語帳は、以下の設定が終わると利用できます。
APIキーをこのチャットに送る必要はありません。

## 1. ファイルを入れる

ZIPを右クリック →「すべて展開」。中の `korean-dopa-drill` の内容を、
`C:\Users\01sii\korean-dopa-drill` にコピーします。
`app` は上書き、`worker` とこの `AI_SETUP.md` も同じプロジェクトに置きます。
自分の `.git` フォルダは消さないでください。

## 2. アカウントとNode.jsを用意する

1. https://dash.cloudflare.com/ でCloudflareアカウントを作ります。
2. https://platform.openai.com/ でAPI用の料金設定とAPIキーを用意します。
   ChatGPTのプランとは別のAPI利用料がかかります。まず少額の残高で始めることをおすすめします。
   APIキーはあとでターミナルの秘密設定に入力します。GitHubやJavaScriptに貼り付けません。
3. https://nodejs.org/ からLTS版をWindowsにインストールします。
   インストール後、ターミナルを一度閉じて開き直します。

## 3. 公開サイトのアドレスを設定する

メモ帳で `worker\wrangler.toml` を開きます。
`YOUR-GITHUB-USERNAME` を自分のGitHubユーザー名に変えて保存します。

例：ゲームのURLが `https://example.github.io/korean-dopa-drill/` なら、許可するアドレスは
`https://example.github.io` です。リポジトリ名や最後の `/` は入れません。
独自ドメインの場合は、その `https://ドメイン名` を使います。
ローカル用の `http://localhost:8000` と `http://127.0.0.1:8000` はそのままで大丈夫です。

`OPENAI_MODEL` は初期設定で `gpt-4.1-mini`。
`DAILY_GENERATION_LIMIT` は1日20回（日本時間）です。失敗した生成も回数に含みます。
通常の利用にAPI以外のCloudflare料金が発生するかは、契約プランと使用量によります。

## 4. Workerを公開する

Windowsのターミナル（PowerShell）を開き、次を1行ずつ実行します。
`npm.cmd` / `npx.cmd` はPowerShellの実行ポリシーで止まりにくい書き方です。

```powershell
cd C:\Users\01sii\korean-dopa-drill\worker
npm.cmd install
npx.cmd wrangler login
```

ブラウザが開いたらCloudflareへログインし、表示された許可を確認して承認します。
ターミナルへ戻り、実行します。

```powershell
npx.cmd wrangler deploy
```

初回はWorkersのサブドメイン登録を求められる場合があります。
表示された `https://korean-drill-ai.あなたのサブドメイン.workers.dev` を控えます。
Workerはまだ秘密設定がないので、この時点では問題生成できません。

## 5. APIキーと自分用パスワードを秘密設定に入れる

同じターミナルで、次を実行します。

```powershell
npx.cmd wrangler secret put OPENAI_API_KEY
```

入力を求められたところにOpenAI APIキーを貼り付け、Enterを押します。
次を実行します。

```powershell
npx.cmd wrangler secret put APP_PASSWORD
```

ここにはAPIキーではなく、自分で決めた単語帳用の長いパスワードを入力します。
他のサービスで使っていない、英数字を混ぜた32文字程度がおすすめです。
このパスワードはプレイ時に入力するので、パスワード管理アプリ等に控えます。

キーとパスワードはCloudflareの秘密設定に保存されます。
`.env`、`ai-config.js`、GitHubのファイルへ書かないでください。
パスワードを知っている人は生成できます。自分用として共有しないでください。

## 6. ゲームとWorkerをつなぐ

メモ帳で `app\js\ai-config.js` を開きます。
空欄を、手順4で控えたURLに `/questions` を付けたアドレスに変えます。

```javascript
export const AI_ENDPOINT = 'https://korean-drill-ai.あなたのサブドメイン.workers.dev/questions';
```

ここに書くのは公開URLだけです。APIキーとパスワードは書きません。
保存して、いつもの方法でGitHubに `app` の変更を反映し、Pagesの更新を待ちます。
`worker` のコードや `wrangler.toml` は公開しても秘密は含みませんが、
`node_modules`、`.wrangler`、`.dev.vars` は公開しません（`.gitignore` に設定済みです）。

## 7. 試す

公開したゲームを開き、必要なら `Ctrl + F5` で更新します。
「単語帳」を押し、手順5の単語帳用パスワードを入力します。
開始前にAIが通常パートとエクストラ用の問題を一括生成します。
大量の予備問題を含むため、生成完了まで待ち時間があります。
完了したら、今までと同じ操作で4択を選びます。数字キー1〜4でも選択できます。
パスワードはそのページを開いている間だけメモリで保持し、端末の保存領域には保存しません。

## よくある表示

- 「接続設定がまだ」：手順6を確認します。
- 「このサイトからは利用できません」：手順3のアドレスが一致するか確認し、Workerを再公開します。
- 「パスワードが違います」：手順5で設定した単語帳用パスワードを入力します。
- 「サーバー設定がまだ」：2つの秘密設定が同じWorkerに登録されているか確認します。
- 「AI側の利用上限」：OpenAIのAPI残高・料金設定・利用制限を確認します。
- 「生成回数の上限」：15秒以上空けます。1日分を使い切った場合は日本時間の翌日まで待ちます。
- 「正常に生成できませんでした」：AIの問題数不足や重複、タイムアウトも考えられます。
  戻って再度開始できますが、再生成には追加のAPI利用料がかかる場合があります。

## 実装内容と確認範囲

- 固定の単語集はありません。通常・エクストラ用を1回のAI呼び出しで生成します。
- 問題数選択UIは追加していません。既存のゲーム設定を利用します（初期値10問）。
- 通常採点・初回正解率80%以上の条件・コンボ・エクストラ90秒・追加点は既存処理を利用します。
- エクストラの必須待ち時間520msから上限を計算し、90秒で問題が尽きない量を先に作ります。
  初期設定なら通常10問＋予備176問。未使用の予備も生成料金の対象です。
- 最近表示した100語を端末に保存し、AIに避けるよう伝えます。セッション内の重複は拒否します。
  過去の語を完全に排除する保証はありません。端末やブラウザが違うと履歴も別です。
- 間違えた問題は既存の復習機能に保存します。復習は保存した問題を使うため追加の生成はありません。
- AIの回答はサーバーとブラウザで検査します。訳の正確さは完全には保証できません。
- パスワード認証＋永続的な生成回数制限。CORS制限だけに依存しません。
- 問題生成失敗時にはゲーム開始前に止まります。プレイ中の追加API呼び出し・固定データへの置き換えはありません。
- 実際のAPIキーやCloudflareアカウントは未設定。実AI生成・Cloudflareへのデプロイ・画面での音や演出は未確認です。
- 自動テストはAI応答を模したデータで生成API、検査、認証、回数制限、開始待ち・キャンセルを検証しています。

開発用テスト：プロジェクト直下で `node --test tests/app_vocabulary.test.mjs tests/app_korean.test.mjs tests/app_scoring.test.mjs tests/app_store.test.mjs`。
元の算数専用テストには、アップロード時から失敗していたものが16件あります。

参考資料：
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/wrangler/install-and-update/
- https://developers.openai.com/api/docs/guides/structured-outputs
