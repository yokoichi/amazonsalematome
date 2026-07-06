# tasks/todo.md — 横田裕市のAmazonセールおすすめポータル

プラン: ~/.claude/plans/url-amazon-githubpage-web-fable5-https-rippling-puzzle.md

## タスク

- [x] 0. プロジェクト初期化（git init / .gitignore / .env / AGENTS.md / tasks/todo.md）— Fable
- [x] 1. scripts/creators-api.mjs + scripts/update.mjs（テスト含む）— Sonnet 5委任
- [x] 2. scripts/build-catalog.mjs — Sonnet 5委任
- [x] 3. 検索クエリ設計・候補収集・選別 → data/catalog.csv（332件）— Fable
- [x] 4. フロントエンド site/（index.html / style.css / app.js）— Sonnet 5委任
- [x] 5. .github/workflows/update-prices.yml — Sonnet 5委任
- [ ] 6. 公開（repo作成・Secrets・Pages・本番確認・README）— Fable

## レビュー記録

- タスク6準備中: リポジトリ未作成。
- タスク5（Sonnet 5）: **合格**。YAML構文OK。レビューで2点補強: (a) permissions に `actions: write` 追加、(b) GITHUB_TOKENでのpushは他workflowのpushイベントを再トリガーしない仕様のため、update-prices.yml末尾に `gh workflow run deploy-pages.yml` の明示dispatchステップを追加（元実装はpushで自動連鎖すると誤認していた）。
- タスク4（Sonnet 5）: **合格**。テスト77/77（既存28＋app-logic新規49）自己再実行、構文チェック・HTTPサーバ200確認、ブラウザ実機能確認（フィルタ・ソート・ページング・ライト/ダーク・モバイル）すべて正常。レビュー中に発見したバグ1件を自分で修正: `deal.end_time`がAPI生ISO8601のままpassthroughされ、フロント側はJST「YYYY/MM/DD HH:mm」形式を前提にパースしていたため不整合（AGENTS.md §3の日時規約違反）。scripts/lib.mjsのitemToProductでformatJst変換するよう修正し、既存テストのアサーションも更新（77/77green維持）。
- タスク3（Fable）: 候補547件（build-catalog.mjs全105クエリ実行）から332件を選別。data/curate.mjsで機械的に選別・テーマ付与（記事掲載品にarticle、愛用ブランドにfavorite-brand）。カテゴリ分布は嗜好分析どおり（カメラ76、充電39、コーヒー34など）。実データ生成で332件中231件がプライムデー先行セール中と判明。
- タスク2（Sonnet 5）: **合格**。テスト28/28（既存14無変更＋新規14）を自己再実行で確認、lib.mjsは追加のみ、--limit 3の実API実行でCSVエスケープ実データ確認。逸脱なし。candidates.csvは中間生成物なのでgitignoreに追加。
- タスク1（Sonnet 5）: **合格**。テスト14/14を自己再実行で確認、スコープ逸脱なし、全hunkレビュー済み。逸脱4件はすべて妥当（Node 24.1のtest runnerバグ回避、欠落ASINのurl/image_url null化、バッチ失敗時の全体中断、JSON数値表現）。報告された「発見した別問題」2件をAGENTS.mdに反映済み。

## Lessons

→ tasks/lessons.md
