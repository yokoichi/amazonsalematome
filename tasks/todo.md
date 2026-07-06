# tasks/todo.md — 横田裕市のAmazonセールおすすめポータル

プラン: ~/.claude/plans/url-amazon-githubpage-web-fable5-https-rippling-puzzle.md

## タスク

- [x] 0. プロジェクト初期化（git init / .gitignore / .env / AGENTS.md / tasks/todo.md）— Fable
- [x] 1. scripts/creators-api.mjs + scripts/update.mjs（テスト含む）— Sonnet 5委任
- [x] 2. scripts/build-catalog.mjs — Sonnet 5委任
- [x] 3. 検索クエリ設計・候補収集・選別 → data/catalog.csv（332件）— Fable
- [x] 4. フロントエンド site/（index.html / style.css / app.js）— Sonnet 5委任
- [x] 5. .github/workflows/update-prices.yml — Sonnet 5委任
- [x] 6. 公開（repo作成・Secrets・Pages・本番確認・README）— Fable
- [x] 7. UI修正: バッジ位置変更・フォントサイズ調整・グリッド列数コントロール — Sonnet 5委任
- [x] 8. UI修正: 割引率を赤背景・白抜き文字のバッジ化（Amazon公式風） — Sonnet 5委任
- [x] 9. バグ修正: 複数カテゴリ選択時にカテゴリ順でグループ化されない — Sonnet 5委任

## レビュー記録

- タスク9（Sonnet 5）: **合格**。複数カテゴリチップ選択時、「おすすめ順」ソートがカテゴリを考慮せず混在表示していた不具合。ユーザー確認の結果「選択カテゴリごとにグループ化（クリック順）」を採用。`app-logic.mjs`に`groupByCategoryOrder`を追加し、`sortProducts`の第3引数（`categoryOrder`、デフォルト空配列）で`'default'`ソート時のみ適用（`discount_desc`/`price_asc`/`price_desc`は無視、既存回帰テストは第3引数省略で従来どおり）。テスト77→83（+6）green。自己レビューで独立に`import()`した関数を直接呼び出し、カメラ76/ストレージ21/充電39が完全分離（混在ゼロ）することを確認。UI実クリックでも全ページ巡回して同結果を確認（検証中`preview_click`のタイミング起因の誤検知が1件あったが、`.click()`直接呼び出しで問題なしと切り分け済み）。逸脱なし。
- タスク8（Sonnet 5）: **合格**。ユーザー提示のAmazon公式アプリスクリーンショットを参考に、割引率テキストを`.price-discount-rate`（プレーンな色付きテキスト）から赤背景・白文字・角丸のバッジに変更（`align-self: flex-start`で親のflexストレッチを打ち消し、テキスト内容分の幅に）。`site/assets/style.css`の1クラスのみの変更で、テスト77/77・スコープ一致を自己確認。ブラウザ実機確認（ライト/ダーク、バッジ幅76px実測でカード幅より明らかに小さいこと、コンソールエラー無し）まで実施。逸脱なし。
- タスク7（Sonnet 5）: **合格**。公開後のユーザー実機確認を受けた修正。(a) 割引率・セールバッジを画像オーバーレイから価格ブロック内（割引率→現在価格→参考価格→セール行→ポイントの順）に移動、Amazon公式UIの価格優先レイアウトに合わせた。(b) 割引率・セール行のフォントサイズを0.7rem系の極小表示から1rem/0.95rem（現在価格1.15remよりわずかに小さい程度）に引き上げ視認性改善。(c) グリッド列数を3〜6列で切替可能にし、localStorageで永続化するコントロールを追加。テスト77/77自己再実行、git status差分がスコープ3ファイルと一致、全hunkレビュー、ブラウザ実機確認（ライト/ダーク/モバイル2列固定/列数切替/リロード後の永続化/コンソールエラー無し）まで実施。死んだCSS（`.card-badges`等）も削除確認。逸脱・発見した別問題なし。
- タスク6（Fable）: **完了**。`gh repo create yokoichi/amazonsalematome --public` → push → Secrets登録（CREATORS_CLIENT_ID/SECRET）→ Pages有効化（build_type: workflow）→ update-prices.yml手動実行（332商品取得、232件セール中）→ deploy-pages.ymlが自動dispatchで連鎖実行され成功（タスク5で追加した明示dispatchの実効性を本番で確認）→ 公開URL https://yokoichi.github.io/amazonsalematome/ で200・実データ配信を確認。README追加。push前にgit全履歴から認証情報の混入がないことを確認済み。
- タスク5（Sonnet 5）: **合格**。YAML構文OK。レビューで2点補強: (a) permissions に `actions: write` 追加、(b) GITHUB_TOKENでのpushは他workflowのpushイベントを再トリガーしない仕様のため、update-prices.yml末尾に `gh workflow run deploy-pages.yml` の明示dispatchステップを追加（元実装はpushで自動連鎖すると誤認していた）。
- タスク4（Sonnet 5）: **合格**。テスト77/77（既存28＋app-logic新規49）自己再実行、構文チェック・HTTPサーバ200確認、ブラウザ実機能確認（フィルタ・ソート・ページング・ライト/ダーク・モバイル）すべて正常。レビュー中に発見したバグ1件を自分で修正: `deal.end_time`がAPI生ISO8601のままpassthroughされ、フロント側はJST「YYYY/MM/DD HH:mm」形式を前提にパースしていたため不整合（AGENTS.md §3の日時規約違反）。scripts/lib.mjsのitemToProductでformatJst変換するよう修正し、既存テストのアサーションも更新（77/77green維持）。
- タスク3（Fable）: 候補547件（build-catalog.mjs全105クエリ実行）から332件を選別。data/curate.mjsで機械的に選別・テーマ付与（記事掲載品にarticle、愛用ブランドにfavorite-brand）。カテゴリ分布は嗜好分析どおり（カメラ76、充電39、コーヒー34など）。実データ生成で332件中231件がプライムデー先行セール中と判明。
- タスク2（Sonnet 5）: **合格**。テスト28/28（既存14無変更＋新規14）を自己再実行で確認、lib.mjsは追加のみ、--limit 3の実API実行でCSVエスケープ実データ確認。逸脱なし。candidates.csvは中間生成物なのでgitignoreに追加。
- タスク1（Sonnet 5）: **合格**。テスト14/14を自己再実行で確認、スコープ逸脱なし、全hunkレビュー済み。逸脱4件はすべて妥当（Node 24.1のtest runnerバグ回避、欠落ASINのurl/image_url null化、バッチ失敗時の全体中断、JSON数値表現）。報告された「発見した別問題」2件をAGENTS.mdに反映済み。

## Lessons

→ tasks/lessons.md
