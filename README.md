# 横田裕市のAmazonセールおすすめポータル

写真家・横田裕市が実際に使って選んだ愛用品・おすすめ品のAmazonセール情報を自動更新でまとめる静的サイト。

公開URL: https://yokoichi.github.io/amazonsalematome/

## 仕組み

- `data/catalog.csv` に登録した商品（ASIN）を、GitHub Actions が [Amazon Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction) で6時間ごとに問い合わせ、`site/data/products.json` を再生成する
- サイト本体（`site/`）はビルド不要の静的HTML/CSS/JS。`products.json` を読み込んでブラウザ側でフィルタ・ソート・ページングする
- 詳しい仕様は [AGENTS.md](AGENTS.md) を参照

## 商品を追加する

1. `data/catalog.csv` に行を追加する（列: `asin,category,themes,title_override,note`）
   - `category` は AGENTS.md §3 記載の固定カテゴリから選ぶ
   - `themes` は `|` 区切り。`article`（記事で紹介済み）/ `favorite-brand`（愛用ブランド）を任意で付与
2. コミットして `main` に push する
3. 次回の自動更新（最大6時間後）、または `gh workflow run update-prices.yml` の手動実行で `products.json` に反映される

候補商品を探すときは `node --env-file=.env scripts/build-catalog.mjs` で `data/catalog-queries.json` の検索クエリ集から候補を収集できる（`data/candidates.csv` に出力、gitignore対象）。

## ローカル開発

```bash
node --test 'scripts/*.test.mjs'                  # テスト実行
node --env-file=.env scripts/update.mjs           # products.json をローカル生成
python3 -m http.server 8000 --directory site      # ローカルプレビュー
```

`.env` に `CREATORS_CLIENT_ID` / `CREATORS_CLIENT_SECRET` を設定する（このファイルはgit管理外）。

## カスタムドメインの設定手順

現在は `yokoichi.github.io/amazonsalematome` で公開中。独自ドメイン（または サブドメイン）を使う場合:

1. ドメイン管理側のDNSで、サブドメイン（例: `sale.example.com`）に対して `CNAME` レコードを `yokoichi.github.io` に向ける
   - ルートドメインを使う場合は `A` レコードを GitHub Pages の IP（185.199.108.153 等4つ）に向ける
2. リポジトリ設定 → Pages → Custom domain にドメインを入力し保存する（`site/CNAME` ファイルが自動生成される。既存の `site/CNAME` があれば手動で作成してコミットしてもよい）
3. DNS反映後、Pages設定画面で「Enforce HTTPS」を有効化する

## 運用上の注意

- 認証情報（`CREATORS_CLIENT_ID` / `CREATORS_CLIENT_SECRET`）はリポジトリの Secrets にのみ保存されている。ローカルでは `.env`（gitignore対象）を使う
- Amazon Creators API は PA-API の後継。PA-API は2026年5月15日に廃止済み
- 表示価格は取得時点のもの。最新価格は各商品ページで確認する旨をフッターに明記している（アソシエイト規約対応）
