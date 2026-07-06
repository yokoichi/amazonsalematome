# tasks/todo.md — 横田裕市のAmazonセールおすすめポータル

プラン: ~/.claude/plans/url-amazon-githubpage-web-fable5-https-rippling-puzzle.md

## タスク

- [x] 0. プロジェクト初期化（git init / .gitignore / .env / AGENTS.md / tasks/todo.md）— Fable
- [x] 1. scripts/creators-api.mjs + scripts/update.mjs（テスト含む）— Sonnet 5委任
- [x] 2. scripts/build-catalog.mjs — Sonnet 5委任
- [ ] 3. 検索クエリ設計・候補収集・選別 → data/catalog.csv（350〜500件）— Fable
- [ ] 4. フロントエンド site/（index.html / style.css / app.js）— Sonnet 5委任
- [ ] 5. .github/workflows/update-prices.yml — Sonnet 5委任
- [ ] 6. 公開（repo作成・Secrets・Pages・本番確認・README）— Fable

## レビュー記録

- タスク2（Sonnet 5）: **合格**。テスト28/28（既存14無変更＋新規14）を自己再実行で確認、lib.mjsは追加のみ、--limit 3の実API実行でCSVエスケープ実データ確認。逸脱なし。candidates.csvは中間生成物なのでgitignoreに追加。
- タスク1（Sonnet 5）: **合格**。テスト14/14を自己再実行で確認、スコープ逸脱なし、全hunkレビュー済み。逸脱4件はすべて妥当（Node 24.1のtest runnerバグ回避、欠落ASINのurl/image_url null化、バッチ失敗時の全体中断、JSON数値表現）。報告された「発見した別問題」2件をAGENTS.mdに反映済み。

## Lessons

→ tasks/lessons.md
