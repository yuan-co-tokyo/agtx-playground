# agtx-playground

TypeScript / Express 5 によるタスク管理 API です。Node.js 22.12 以上と npm が必要です（検証環境: Node.js 26.5.0）。

```sh
npm install
npm run dev
```

既定のポートは `3000` です。`PORT=3001 npm run dev` で変更できます。

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm run test:watch` でテストを継続実行できます。

## API

| メソッド | パス | 成功時 |
| --- | --- | --- |
| GET | `/tasks` | 200: 作成順のタスク配列（`?priority=high` などで絞り込み可） |
| GET | `/tasks/:id` | 200: タスク |
| POST | `/tasks` | 201: 作成したタスク |
| PATCH | `/tasks/:id` | 200: 更新したタスク |
| DELETE | `/tasks/:id` | 204: 本文なし |

POST / PATCH は `Content-Type: application/json` を指定します。

```sh
curl -i http://localhost:3000/tasks
curl -i 'http://localhost:3000/tasks?priority=high'
curl -i -X POST http://localhost:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"APIを試す","description":"動作確認","status":"todo"}'
# <id> を作成レスポンスの id に置き換えます。
curl -i -X PATCH http://localhost:3000/tasks/<id> \
  -H 'Content-Type: application/json' -d '{"status":"done"}'
curl -i -X DELETE http://localhost:3000/tasks/<id>
```

- `title`: POST で必須。前後の空白を除去した後 1〜200 文字。
- `description`: 最大 2000 文字。POST で省略した場合は空文字列。
- `status`: `todo` / `in_progress` / `done`。POST で省略した場合は `todo`。
- `priority`: `high` / `medium` / `low`。POST で省略した場合は `medium`。優先度を持たない既存データも `medium` として返します。
- PATCH は上記のうち最低 1 フィールドが必要です。省略したフィールドは保持します。
- 未定義のフィールド（`id` や日時など）を入力すると 400 になります。
- `GET /tasks` の `priority` クエリに上記以外の値（空文字・複数指定を含む）を渡すと 400 `VALIDATION_ERROR` になります。その他のクエリパラメータは無視します。
- レスポンスには UUID の `id` と ISO 8601 形式の `createdAt` / `updatedAt` を含みます。更新時は `createdAt` を保持します。

エラーは `{ "error": { "code": "...", "message": "...", "details": [] } }` 形式です。`details` は入力検証の詳細がある場合のみ含みます。

| ステータス | code | 条件 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 入力が不正 |
| 400 | `INVALID_JSON` | JSON の構文が不正 |
| 404 | `NOT_FOUND` | 対象タスクまたはルートが存在しない |
| 413 | `PAYLOAD_TOO_LARGE` | JSON 本文が 100 KB を超える |
| 4xx | `BAD_REQUEST` | その他の不正なリクエスト（未対応の Content-Encoding など） |
| 500 | `INTERNAL_ERROR` | 予期しない内部エラー |

## 構成と制約

`routes` が HTTP と入力検証、`services` が ID・日時の付与と存在確認、`repositories` が保存を担当します。`createApp({ repository })` で保存先を差し替えられ、サービスの時計と ID 生成もテスト用に差し替えられます。

データはプロセス内のメモリに保存されます。再起動で消失し、複数プロセス間では共有されません。認証は実装していません。

`tests/` にはリポジトリ・サービスの単体テストと supertest による API 統合テストがあります。

## フロントエンド

React + TypeScript の画面は `web/` にあります。別々のターミナルで起動します。

```sh
npm run dev
npm run dev:web
```

画面は `web/src/api/index.ts` の `taskApi` を使い、一覧・追加・編集・完了切り替え・削除に対応しています。`components/` が画面、`hooks/use-tasks.ts` が状態管理を担当します。型は `api/types.ts`、共通の `TaskApi` インターフェースは `api/client.ts` にあります。

`api/error-message.ts` が通信・入力検証・未検出・サーバー・不正レスポンスのエラーを日本語に変換します。読み込み失敗時には再試行できます。API 停止時にプロキシが 500 を返す場合はサーバーエラーとして表示します。

Vite の開発・プレビューサーバーは `/tasks` を既定で `http://localhost:3000` に転送します。ポート変更時は `PORT=3001 npm run dev` と `PORT=3001 npm run dev:web` を使います。`API_PROXY_TARGET=http://localhost:3001 npm run dev:web` でも転送先を指定でき、`PORT` より優先します。プレビューにも同じ環境変数を利用できます。

`npm run typecheck` で API と画面の型を確認します。`npm test` は Vitest の `api`（サーバー）、`web-api`（クライアント・実サーバー契約・設定・エラーメッセージ）、`web`（jsdom の画面）の 3 プロジェクトを実行します。`web/src/integration/App.integration.test.tsx` は実サーバーと実クライアントを通して画面の CRUD とエラー表示を検証します。

`npm run build` は API を `dist/`、画面を `dist/web/` に出力します。`npm run preview:web` でビルド済み画面を確認できます。本番での静的配信・API へのルーティングは別途設定が必要です。

### API クライアント

`web/src/api/` は React に依存しない fetch ベースの TypeScript クライアントです。タスクの必須フィールドとステータスを実行時に検証し、追加フィールドは許容します。

```ts
import { taskApi, HttpError, isAbortError } from './api/index.js';

const controller = new AbortController();
try {
  const tasks = await taskApi.getTasks({ signal: controller.signal });
  const created = await taskApi.createTask({ title: '新しいタスク' });
  await taskApi.updateTask(created.id, { status: 'done' });
  await taskApi.deleteTask(created.id);
} catch (error) {
  if (isAbortError(error)) return;
  if (error instanceof HttpError && error.isValidationError) {
    console.error(error.message, error.details);
  } else {
    throw error;
  }
}
```

`getTasks` / `getTask` / `createTask` / `updateTask` / `deleteTask` は個別にも import できます。`createTaskApiClient({ baseUrl, fetch })` で接続先や fetch を差し替えられます。作成・更新は title / description / status の定義済みの値だけを送ります。空の更新は通信せず `RangeError` で reject します。

`web/.env.example` を参考に、Vite の `VITE_API_BASE_URL` を設定してください。未設定・空文字なら同一オリジンです。サーバーは CORS に対応していないため、開発時は設定済みの Vite プロキシを利用します。別オリジンの URL を直接指定する場合は、API 側の CORS 対応が必要です。

| エラー | 用途 |
| --- | --- |
| `ApiError` | クライアントエラーの基底クラス |
| `HttpError` | HTTP エラー。`status` / `code` / `details`、`isNotFound` / `isValidationError` を参照可能 |
| `NetworkError` | 接続・CORS などの fetch 失敗。元の例外は `cause` |
| `InvalidResponseError` | 成功レスポンスの JSON またはタスク形式が不正 |

`signal` による中断（`AbortError`・`TimeoutError`・`abort(reason)` の理由）はラップせずそのまま伝播します。`AbortError` / `TimeoutError` は `isAbortError(error)` で判定できます。組み込みタイムアウトはなく、必要なら各メソッドに `{ signal: AbortSignal.timeout(5000) }` を渡してください。

## agtx 連携の調査資料

- [agtx 外部連携仕様の調査](docs/agtx-research.md): タスク操作・Orchestrator・状態取得・イベント・拡張性の5項目と検証結果
- [Orchestrator 連携 A案・B案の比較](docs/agtx-orchestrator-options.md): Webコンソール構想の UI 案と進め方
