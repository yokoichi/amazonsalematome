# AGENTS.md — amazonsalematome

Amazonセール商品を自動収集・表示する静的サイト「横田裕市のAmazonセールおすすめポータル」。
GitHub Pages で公開し、GitHub Actions が Amazon Creators API で価格を定期取得して `site/data/products.json` を再生成する。

このファイルは委任実装エージェントの必読仕様書。**ここに書かれたAPI仕様・データ契約は実機検証済み**。推測で変えないこと。不明点があれば作業を止めて質問すること。

## 1. 構成

```
site/                     # GitHub Pages 公開ルート（静的サイト本体）
├── index.html
├── assets/style.css      # ライト基調＋ダークモード（CSS変数 + prefers-color-scheme）
├── assets/app.js         # フィルタ・ソート・ページング（vanilla JS、依存ゼロ）
└── data/products.json    # scripts/update.mjs が生成（手編集禁止）
scripts/
├── creators-api.mjs      # Creators API クライアント（token取得＋getItems/searchItems）
├── update.mjs            # data/catalog.csv → site/data/products.json
├── build-catalog.mjs     # searchItems で候補商品を収集し CSV 出力（初期構築用ツール）
└── *.test.mjs            # node --test 用テスト（fixture ベース）
data/catalog.csv          # 商品マスタ（人間が編集する。エージェントは行の増減禁止）
.github/workflows/update-prices.yml
```

## 2. Amazon Creators API 仕様（実機検証済み・2026-07-06）

### 認証トークン取得

```
POST https://api.amazon.co.jp/auth/o2/token
Content-Type: application/json

{"grant_type":"client_credentials",
 "client_id":   process.env.CREATORS_CLIENT_ID,
 "client_secret":process.env.CREATORS_CLIENT_SECRET,
 "scope":"creatorsapi::default"}
```

レスポンス: `{"access_token":"Atc|...","scope":"creatorsapi::default","token_type":"bearer","expires_in":3600}`
トークンは1時間有効。プロセス内でキャッシュし、リクエストごとに再取得しない。

### 商品情報取得（getItems / searchItems）

```
POST https://creatorsapi.amazon/catalog/v1/getItems
POST https://creatorsapi.amazon/catalog/v1/searchItems
Authorization: Bearer <access_token>
Content-Type: application/json
x-marketplace: www.amazon.co.jp
```

共通bodyパラメータ: `"marketplace": "www.amazon.co.jp"`, `"partnerTag": "yokoichi-22"`, `"resources": [...]`

- getItems: `"itemIds": ["ASIN", ...]`（**最大10件/リクエスト**）, `"itemIdType": "ASIN"`
- searchItems: `"keywords": "..."` または `"brand": "..."`, `"itemCount": 1..10`, `"itemPage"` でページング
- リクエスト間は 1 秒スリープを入れる（レート制限対策。並列リクエスト禁止）

使用する resources:

```json
["itemInfo.title", "images.primary.medium",
 "offersV2.listings.price", "offersV2.listings.dealDetails",
 "offersV2.listings.loyaltyPoints"]
```

### レスポンス構造（検証済みの実形状）

```
getItems  → { "itemsResult":  { "items": [ <item> ] } }
searchItems→ { "searchResult": { "items": [ <item> ], "totalResultCount": N, "searchURL": "..." } }

<item> = {
  "asin": "B0CQX67KTW",
  "detailPageURL": "https://www.amazon.co.jp/dp/XXXX?tag=yokoichi-22&linkCode=osi&th=1&psc=1",  // タグ自動付与済み
  "images": { "primary": { "medium": { "url": "...", "height": 160, "width": 128 } } },
  "itemInfo": { "title": { "displayValue": "商品名", "label": "Title", "locale": "ja_JP" } },
  "offersV2": { "listings": [ {
      "isBuyBoxWinner": true,
      "price": {
        "money": { "amount": 3490, "currency": "JPY", "displayAmount": "￥3,490" },
        "savingBasis": { "money": { "amount": 4990, ... }, "savingBasisType": "...", "savingBasisTypeLabel": "..." },  // 参考価格。割引時のみ
        "savings":     { "money": { "amount": 1500, ... }, "percentage": 30 }                                          // 割引時のみ
      },
      "dealDetails": { "badge": "...", "startTime": "...", "endTime": "...", "accessType": "...", "percentClaimed": 0 },  // セール時のみ
      "loyaltyPoints": { "points": 35 }
  } ] }
}
```

注意（すべて実挙動）:
- 価格は `offersV2.listings[0].price.money.amount`。`money` の中間オブジェクトを飛ばさない
- `savingBasis` / `savings` / `dealDetails` / `loyaltyPoints` は**無いことがある**。全フィールドでoptional chainingを使い、欠損時は null 扱い
- 廃番・在庫切れASINは items に含まれない、または offersV2 が無い。エラーにせず price:null で出力する
- getItems のレスポンスにはリクエストしたASINが欠けることがある。**欠けたASINをエラーで落とさない**

## 3. データ契約

### data/catalog.csv（入力・人間が管理）

ヘッダ行あり。列: `asin,category,themes,title_override,note`

- `asin`: 必須。英数10桁
- `category`: 必須。以下の固定リストのいずれか:
  `カメラ・撮影機材` / `ストレージ・メモリ` / `充電・モバイル` / `デスク・PC周辺` / `オーディオ` / `スマートホーム・家電` / `コーヒー・キッチン` / `アウトドア` / `健康・生活` / `日用品・食品` / `Kindle本・マンガ` / `Amazonデバイス`
- `themes`: 任意。`|` 区切り（例: `article|favorite-brand`）。既知テーマ: `article`（記事で紹介済み）, `favorite-brand`（愛用ブランド）
- `title_override`: 任意。APIのtitleが長すぎる場合の短縮表示名
- `note`: 任意。管理用メモ（サイト非表示）
- フィールドにカンマ・改行を含む場合はダブルクォート囲み（RFC 4180準拠のパースを実装）

### site/data/products.json（出力）

```json
{
  "meta": {
    "site_name": "横田裕市のAmazonセールおすすめポータル",
    "total": 400, "discount_count": 25,
    "updated_at": "2026/07/07 06:00"
  },
  "products": [{
    "asin": "B0CQX67KTW",
    "title": "string（title_override優先、無ければAPI title）",
    "url": "detailPageURL をそのまま",
    "category": "充電・モバイル",
    "themes": ["article"],
    "image_url": "string | null",
    "price": 3490,
    "discount": { "ref_high": 4990, "rate_percent": 30.1 },
    "deal": { "badge": "string", "end_time": "string | null" },
    "points": { "total": 35, "rate_percent": 1.0 },
    "fetched_at": "2026/07/07 06:00"
  }]
}
```

- 型規約: `price` は整数円 or **null**（取得失敗時）。`discount` / `deal` / `points` はオブジェクト or **null**（キー省略ではなく明示的null）
- `discount.rate_percent` = `(ref_high - price) / ref_high * 100` を小数1桁に丸め。APIの `savings.percentage`（整数）より自前計算を優先
- `points.rate_percent` = `points / price * 100` 小数1桁
- 日時はすべて JST `YYYY/MM/DD HH:mm` 形式
- catalog.csv 全行を products に出力する（価格取得に失敗した行も price:null で残す。黙って間引かない）

## 4. コーディング規約

- **外部依存ゼロ**。Node 20+ 標準（`fetch`, `node:fs`, `node:test`, `node:assert`）と vanilla JS/CSS のみ。npm install するライブラリは一切追加しない
- ローカル実行は `node --env-file=.env scripts/update.mjs`（Actions上は環境変数直接注入）。dotenv系ライブラリ禁止
- コード・コメント・コミットメッセージは英語。UI表示文字列は日本語
- フロントエンド: JSON由来の文字列は **`textContent` でのみDOMに挿入**（innerHTML禁止。XSS対策）。URLは `https?:` スキームのみ `href` に設定
- CSS はカスタムプロパティでテーマ定義し、`@media (prefers-color-scheme: dark)` で切替。JSでのテーマ切替実装は不要
- 価格表示の近くに取得時刻（`fetched_at` または `meta.updated_at`）を必ず表示（アソシエイト規約要件）
- エラーハンドリング: 部分失敗（一部ASINの取得失敗）でスクリプト全体を落とさない。全体失敗（token不可等）は非0 exitで終了し、既存の products.json を上書きしない

## 5. 不可侵事項（違反したらレビューで差し戻し）

- `.env` の内容・認証情報を、コード・ログ出力・エラーメッセージ・テストfixture・コミットに**絶対に含めない**
- アソシエイトタグ `yokoichi-22` を変更・省略しない。`detailPageURL` を自前組み立てURLに置き換えない
- `data/catalog.csv` の商品行を追加・削除・並べ替えしない（スキーマ変更が必要な場合は質問）
- `site/data/products.json` を手書きで編集しない（必ず update.mjs 経由で生成）
- git commit / push をしない（コミットはレビュー後にメインが行う）

## 6. 検証コマンド

```bash
node --test scripts/                          # 全テスト。追加したテストが全緑であること
node --env-file=.env scripts/update.mjs       # products.json 生成（実API。数件のcatalogで確認）
python3 -m http.server 8000 --directory site  # フロントエンド手動確認用
```

## 7. 委任実装プロトコル

1. 作業前にこの AGENTS.md 全文と、ディスパッチプロンプトの受け入れ条件を読む
2. ディスパッチプロンプトに列挙された「変更してよいファイル」以外に触らない。「ついで修正」禁止。問題を見つけたら報告欄に書く
3. ロジック（CSVパース、レスポンス→JSON変換、ソート・フィルタ関数）は **テスト先行（TDD）**: 失敗するテストを書く→実装→緑。APIレスポンスは本物の形状のfixtureを使う（§2の実形状に準拠）
4. すべてフォアグラウンドで実行。バックグラウンド実行・サブエージェント起動禁止
5. 実APIを叩くのは動作確認の数リクエストのみ（レート節約。テストはfixtureで）
6. コミットしない
7. 作業を止める判断: 仕様の矛盾を見つけた／AGENTS.mdに無いAPI挙動に遭遇した／受け入れ条件が達成不能 → 推測で進めず、状況を報告して終了する
8. **完了報告フォーマット**（必須・省略不可）:
   - 変更ファイル: 絶対パスの一覧
   - テスト結果: `node --test scripts/` の pass/fail 実数と exit code
   - 動作確認: 実行したコマンドと観測した結果（実数・実出力を引用）
   - 逸脱: 指示と異なる実装をした点（無ければ「なし」）
   - 未検証: 確認できていない点（無ければ「なし」）
   - 発見した別問題: スコープ外で気づいた問題（無ければ「なし」）
