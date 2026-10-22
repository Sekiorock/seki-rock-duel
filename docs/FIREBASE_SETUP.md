# みんなで対戦（ライブ対戦）の準備：Firebase の設定手順

みんなで対戦は、Google の無料サービス **Firebase**（Realtime Database と匿名ログイン）を使って、スマホどうしをつなぎます。
最初に1回だけ、次の手順で設定してください（20分ほど）。生徒はアカウントを作る必要はありません。

必要なもの：Google アカウント（先生のもの）、パソコン

---

## 1. プロジェクトをつくる

1. パソコンで https://console.firebase.google.com/ を開き、Google アカウントでログインする。
2. 「プロジェクトを作成」（または「Firebase プロジェクトを始める」）を押す。
3. プロジェクト名に `seki-rock-duel` と入れて「続行」。
4. 「Google アナリティクス」は **オフ** にして「プロジェクトを作成」。
5. できあがったら「続行」。料金プランは無料の **Spark** のままでよい。

## 2. 匿名ログインを有効にする

1. 左のメニューの「構築」→「Authentication」→「始める」。
2. 「Sign-in method」のタブで「匿名」を選び、「有効にする」をオンにして「保存」。
3. 同じ画面の「設定」タブ →「承認済みドメイン」→「ドメインを追加」で、`sekiorock.github.io` を追加する。
   （これを忘れると、公開ページからログインできません）

## 3. データベースをつくる

1. 左のメニューの「構築」→「Realtime Database」→「データベースを作成」。
2. 場所は **米国（us-central1）** を選ぶ（仕様書 7.7）。
3. 「ロックモードで開始」を選んで「有効にする」。
4. できたら「ルール」のタブを開き、中身をすべて消してから、このフォルダの `docs/database.rules.json` の中身をすべて貼り付けて「公開」を押す。
   （ログインした人だけが読み書きでき、値の範囲も確かめるルールです）

## 4. 設定値をコピーする

1. 左上の歯車 →「プロジェクトの設定」→「全般」タブ。
2. 下の方の「マイアプリ」で、`</>`（ウェブ）のマークを押す。
3. アプリのニックネームに `seki-rock-duel` と入れて「アプリを登録」（「Firebase Hosting も設定」はチェックしない）。
4. 次のような数行が表示されるので、`{` から `}` までをコピーする。

```js
const firebaseConfig = {
  apiKey: "AIza……",
  authDomain: "seki-rock-duel.firebaseapp.com",
  databaseURL: "https://seki-rock-duel-default-rtdb.firebaseio.com",
  projectId: "seki-rock-duel",
  storageBucket: "……",
  messagingSenderId: "……",
  appId: "1:……:web:……"
};
```

- `databaseURL` の行がないときは、「Realtime Database」の画面の上に出ている `https://……firebaseio.com` を `databaseURL: "……",` として足してください。
- この値は秘密のパスワードではありません（ウェブページに書いて公開するものです）。安全はルール（手順3）で守ります。

## 5. ゲームに設定値を入れる

どちらかの方法で。

- **A. AI に渡す**：コピーした数行を、次の版の依頼のときに貼り付けてください。`src/net.js` に入れて納品します。
- **B. 自分で入れる**：GitHub のリポジトリで `src/net.js` を開き、鉛筆のマーク（編集）を押す。
  `export const FIREBASE_CONFIG = null;` の行を、次のように書き換えて「Commit changes」。

```js
export const FIREBASE_CONFIG = {
  apiKey: "AIza……",
  authDomain: "seki-rock-duel.firebaseapp.com",
  databaseURL: "https://seki-rock-duel-default-rtdb.firebaseio.com",
  projectId: "seki-rock-duel",
  storageBucket: "……",
  messagingSenderId: "……",
  appId: "1:……:web:……"
};
```

（`null` を消して `{ … };` に置きかえるだけです。最後の `;` を忘れずに）

## 6. 確かめる

1. 2〜3分待ってから、**校内 Wi-Fi につないだスマホ** で
   https://sekiorock.github.io/seki-rock-duel/test.html を開き、「テストを始める」を押す。
2. 「合格」と出れば準備完了。「失敗」のときは、表示された英語のメッセージを次の依頼に貼り付けてください。
   - `auth/operation-not-allowed` → 手順2の匿名ログインがオフ
   - `auth/unauthorized-domain` → 手順2の3（承認済みドメイン）が抜けている
   - `permission_denied` → 手順3のルールが貼られていない
   - なかなか終わらない → 校内のフィルタで `firebaseio.com` や `googleapis.com` が止められている可能性（情報担当の先生に相談）
3. ゲームのホームで「みんなで対戦」→ 1台で「部屋をつくる」、ほかの2台で番号を入れて（または QR を読んで）入る →「スタート」。

## 無料プランで足りるか

Spark プランは同時接続 100 人まで・データ 1GB まで。1クラス40人が同時に遊んでも足ります。
部屋のデータは試合が終わると小さくなり、3時間たった部屋は次に部屋を作る人が自動で消します。
