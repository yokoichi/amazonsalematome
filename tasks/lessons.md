# tasks/lessons.md

- **Node 24.0/24.1 の `node --test <dir>` はリグレッションで動かない**（ディレクトリ引数が展開されない）。glob 形式 `node --test 'scripts/*.test.mjs'` を使う。検証コマンドをドキュメントに書くときは、その環境の Node バージョンで実際に通ることを確認してから書く。
- **Creators API の detailPageURL の linkCode は変動する**（osi/ogi）。URL は透過保存し、クエリパラメータの形に依存するロジックを書かない。
- **委任エージェントの完了報告に含まれるURL等は通知経路でHTMLエスケープされることがある**（`&` → `&amp;`）。報告の文字列を鵜呑みにせず、実ファイルを確認してから判断する。

- **AGENTS.mdの「日時はすべてJST形式」規約は、APIレスポンスをそのままpassthroughするフィールドにも及ぶことを明記すべきだった。** dealDetails.endTimeはAPIからISO8601 UTCで来るが、フロント側はJST整形済み文字列を前提にパースしており不整合が発生した。委任先レビュー時、個々のフィールドが「新規生成された値」か「APIから素通しされた値」かを区別し、後者は特にAGENTS.mdの共通規約（日時形式など）に反していないか確認する。

- **チップ（カテゴリ/テーマ絞り込みボタン）の`.is-active`表示が更新されないバグが、タスク4完了時のレビューをすり抜けていた。** 原因は`renderFacetChips()`内のonToggleコールバックが`render()`のみ呼び、チップ自体を再構築する`renderFacetChips()`を呼んでいなかったこと。フィルタ処理（グリッドの中身）は正しく動いていたため、スクリーンショット目視レビューでは気づけなかった。教訓: state変更を伴うUIのレビューでは、スクリーンショット比較だけでなく実際にクリックして`classList`等のDOM状態を`preview_eval`で読み取り、視覚的フィードバック（ハイライト等）が状態と一致しているかを確認する。

- **`preview_*`ツールのブラウザタブは既定で`document.hidden: true`（バックグラウンドタブ）扱いになっており、`IntersectionObserver`や`requestAnimationFrame`がスロットリングされて発火しないことがある。** 無限スクロール実装（タスク10）のレビュー中、`window.scrollTo()`だけでは自動読み込みが一切発生せず（`document.hidden`が`true`）、`preview_screenshot`を1回呼ぶとその直後だけタブが`visible`扱いになり読み込みが進む、という挙動を確認した。教訓: スクロール連動・可視性検知（IntersectionObserver）系機能をこのプレビュー環境で検証する際は、`scrollTo`だけでなく都度`preview_screenshot`（またはタブをアクティブ化する操作）を挟む。ロジック自体は独立した純粋関数のテスト（`node --test`）で担保し、ブラウザ検証は「タブがバックグラウンド扱いだと発火しない」というツール制約を踏まえて解釈する（実ユーザーの前面タブでは問題なく動作するはず）。

- **`preview_stop`→`preview_start`でHTTPサーバを再起動しても、同一origin（同じポート）のブラウザタブはHTTPキャッシュされた古いJSファイルを使い続けることがある。** index.htmlからテーマ絞り込みチップ（`#theme-chips`）を削除した際、HTMLは最新版が読み込まれる一方でapp.jsはキャッシュされた旧版のままロードされ、旧app.jsが存在しない`els.themeChips`（`null`）に対して`buildChips`を呼び出して例外発生→`renderFacetChips()`が中断し、後続の`render()`が一度も実行されず商品グリッドが空になる、という「HTML/JSのバージョン不整合」による見せかけの不具合が発生した。しかも`preview_console_logs`は素通り（uncaught例外を拾わない）で原因究明が遅れた。教訓: UI変更後にグリッドが空になる等の異常を見たら、まず`fetch(url, {cache:'no-store'})`で実際に配信されているJSの中身をチェックし、HTML/JSの内容が一致しているか確認する。一致していなければツール側のキャッシュが原因なので、コード側のバグを疑って深追いしない（`preview_start`で新規serverIdを取得しても、ブラウザタブ自体は使い回されキャッシュが残る点に注意）。
