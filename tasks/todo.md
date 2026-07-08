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
- [x] 10. UI変更: ページ番号方式 → 無限スクロール（500件毎に「さらに表示する」ゲート） — Sonnet 5委任
- [x] 11. セール商品自動発見: discover-deals.mjs新設・update.mjs統合・ワークフロー組込・ユーザー指定3商品追加 — Sonnet 5（本人実装）
- [x] 12. UI修正: ジャンルパートの「愛用ブランド」「記事で紹介」テーマ絞り込みチップを削除 — Sonnet 5（本人実装）
- [x] 13. UI刷新: 参照元類似の解消（モダンECアプリ風: グラデーションヒーロー・stickyツールバー・脱罫線カード） — Sonnet 5委任

## レビュー記録

- タスク13（Sonnet 5委任）: **合格**。参照元（ちもろぐ価格トラッカー）と構造・見た目が酷似していたUIを「モダンECアプリ風」に全面刷新。実際に参照元のHTML/CSSを取得して類似点（ページ構造の並び・フッター逐語一致・枠線カード）を特定した上でデザイン仕様を確定し、ディスパッチプロンプトに全文埋め込んで委任。変更は`site/index.html`（検索バーをヒーロー内へ移動・統計オーバーラップカード化・.filters→sticky .toolbar+.category-nav分割・フッター3行書き直し+運営者名追記）/`site/assets/style.css`（トークン全面改訂・--grad-hero・radius 16px・レイヤードシャドウ・チップ塗りピル化・.card-mediaダークでも白固定・color-mix fallback付きblurツールバー）/`site/privacy.html`（.site-header--compactで統一）の3ファイルのみ、app.jsは無変更（全12参照ID維持を確認）。テスト107/107 green。ブラウザ実機確認: ライト/ダーク・デスクトップ/モバイル(2列維持)・sticky追従+blur・チップ絞り込み・ヒーロー内検索・無限スクロール回帰(20→40)・privacy統一・コンソールエラー0。**委任トラブル1件**: 1回目の委任先が検証後のクリーンアップとして`git checkout -- site/`を実行し未コミット変更を全消去→報告と実態の乖離をレビューゲート（git status照合）で検出→follow-up差し戻しで再適用させ解決（詳細はlessons.md）。逸脱2点（--color-bg-subtleのフッター統合先を--color-surfaceに/--shadow-card-restingトークン新設）はいずれも妥当として承認。

- タスク12（Sonnet 5・本人実装）: **完了**。カテゴリチップ群の下にあった「❤️愛用ブランド」「📝記事で紹介」のテーマ絞り込みチップ行をUIから削除。`site/index.html`の`#theme-chips`div、`site/assets/app.js`の`state.themes`/`els.themeChips`/`renderFacetChips()`内のテーマchip生成ブロック/`render()`の`themes`フィルタ引数/`resetFilters()`の`state.themes`リセットを削除。商品カード個別のテーマバッジ表示（`createThemeBadges`、`THEME_LABELS`）とAPI/ソートロジック（`app-logic.mjs`の`matchesThemes`・`groupRankDefault`・`extractFacets`）はスコープ外として変更せず維持（記事で紹介/愛用ブランド商品は引き続きおすすめ順で優先表示される）。テスト107/107（app-logic.mjs無変更のため件数不変）。ブラウザ実機確認でカテゴリ行のみになったこと・カテゴリチップのフィルタ動作（クリックで絞り込み+アクティブ表示）が正常なことを確認。検証中、`preview_stop`→`preview_start`でサーバを再起動してもブラウザタブ側にHTTPキャッシュされた旧app.jsが残り、削除済みDOM要素への参照で例外が起き商品グリッドが空になる現象に遭遇（コード自体は正常。`fetch(..., {cache:'no-store'})`で実配信内容を確認して切り分けた。詳細はlessons.md）。逸脱なし。

- タスク11（Sonnet 5・本人実装）: **完了**。プライムデーに向けてセール商品を自動発見する仕組みを新設。(a) `data/discovery-queries.json`: 既存12カテゴリに対しブランド非依存の汎用キーワード85件（各`maxPages`付き、最大187リクエスト相当）を新規作成。(b) `scripts/discover-deals.mjs`新設: `searchItems`をページネーションしつつ`dealDetails`存在または`savings.percentage>=5%`を満たすアイテムのみ抽出（`lib.mjs`に`itemHasActiveDeal`/`dealRateOf`/`searchItemsToDealRows`/`dedupeRowsByAsin`/`catalogRowToCsvRow`を追加、TDD:テスト先行20件）。既存`data/catalog.csv`のASINは除外。(c) 初回フル実行で1179件ヒット（想定500件の2.3倍、プライムデー最盛期のため）→ユーザーに確認し「割引率上位500件に絞る」を採用。`dealRateOf`（`itemToProduct`と同じ計算式）でソートし上位500件のみ`data/catalog-auto.csv`へ出力するキャップを追加（テスト4件追加）。(d) `scripts/update.mjs`改修: `catalog.csv`+`catalog-auto.csv`をマージする`mergeRows`追加（ASIN重複時はcatalog.csv優先、TDD:テスト4件）。catalog-auto.csv不在時も既存動作を破壊しないことを確認（ENOENTハンドリング）。(e) `.github/workflows/update-prices.yml`に`discover-deals.mjs`実行ステップを追加、コミット対象に`data/catalog-auto.csv`を追加。(f) ユーザー指定3商品（AirPods 4 / Lenovoモニター / Sony WF-C700N、amzn.toリンクをcurlで解決しASIN特定）を`catalog.csv`に手動追加。テスト83→107（discover-deals 20件+mergeRows 4件などの純増）全green。実API検証: discover-deals.mjsフル実行（85クエリ・187リクエスト・約3分）で1179件検出→上位500件採用（割引率24.5%〜100%、100%は無料Kindle公開作品で正当なデータと確認）、update.mjs実行で335(catalog.csv)+500(catalog-auto.csv)=835件生成を確認。ブラウザ実機確認（835件表示・無限スクロールで20→40→60と正常増加・純粋関数`getInfiniteScrollWindow`で500件ゲート後に手動クリックし835件到達まで検証）。逸脱: プランでは「catalog-auto.csvも読んでexclude対象にする」としていたが、catalog-auto.csvは毎回完全上書きのため不要と判断し省略（catalog.csvのみexclude対象、動作に影響なし）。未検証: 本番ワークフロー（update-prices.yml）でのdiscover-deals.mjs実行はローカルのみで確認、GitHub Actions上での実行時間・Secrets経由の動作は次回本番デプロイ後に要確認。

- タスク10（Sonnet 5）: **合格**。`paginate()`を削除し`getInfiniteScrollWindow(items, visibleCount, batchSize)`に置換（CHUNK_SIZE=20刻みでスクロール自動読み込み、batchSize=500の倍数かつ残りありの時だけ`requiresManualLoad`）。委任先が実機検証中に「IntersectionObserverはセンチネルが交差状態のまま変化しないと再発火しない」バグを自ら発見し、`render()`末尾で`unobserve`→`observe`し直す対策を追加（妥当な逸脱として承認）。テスト83/83green（`paginate`6件削除+`getInfiniteScrollWindow`6件追加で相殺）。自己レビューで332件（カメラ〜Kindle全カテゴリ混在データ）をスクロールのみで全件到達することを実機確認（20→40→60→...→332、20刻みで安定増加、ボタンは終始非表示）。検証中、プレビューブラウザのタブが`document.hidden:true`扱いでIntersectionObserverがスロットリングされる現象に遭遇し、`preview_screenshot`を挟むことで一時的に発火させて検証を完遂した（詳細はlessons.md）。逸脱は上記1点のみ、テストへの影響なし。
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
