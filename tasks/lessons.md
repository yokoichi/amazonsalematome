# tasks/lessons.md

- **Node 24.0/24.1 の `node --test <dir>` はリグレッションで動かない**（ディレクトリ引数が展開されない）。glob 形式 `node --test 'scripts/*.test.mjs'` を使う。検証コマンドをドキュメントに書くときは、その環境の Node バージョンで実際に通ることを確認してから書く。
- **Creators API の detailPageURL の linkCode は変動する**（osi/ogi）。URL は透過保存し、クエリパラメータの形に依存するロジックを書かない。
- **委任エージェントの完了報告に含まれるURL等は通知経路でHTMLエスケープされることがある**（`&` → `&amp;`）。報告の文字列を鵜呑みにせず、実ファイルを確認してから判断する。
