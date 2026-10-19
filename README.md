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
| GET | `/tasks` | 200: 作成順のタスク配列 |
| GET | `/tasks/:id` | 200: タスク |
| POST | `/tasks` | 201: 作成したタスク |
| PATCH | `/tasks/:id` | 200: 更新したタスク |
| DELETE | `/tasks/:id` | 204: 本文なし |

POST / PATCH は `Content-Type: application/json` を指定します。

```sh
curl -i http://localhost:3000/tasks
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
- PATCH は上記のうち最低 1 フィールドが必要です。省略したフィールドは保持します。
- 未定義のフィールド（`id` や日時など）を入力すると 400 になります。
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

## フロントエンド用APIクライアント

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

`web/.env.example` を参考に、Vite の `VITE_API_BASE_URL` を設定してください。未設定・空文字なら同一オリジンです。現状のサーバーは CORS に対応していないため、開発時は Vite 設定の `server.proxy` で `/tasks` を `http://localhost:3000` へ転送してください。Vite 設定と UI は別タスクで導入します。別オリジンの URL を直接指定する場合は、API 側の CORS 対応が必要です。

| エラー | 用途 |
| --- | --- |
| `ApiError` | クライアントエラーの基底クラス |
| `HttpError` | HTTP エラー。`status` / `code` / `details`、`isNotFound` / `isValidationError` を参照可能 |
| `NetworkError` | 接続・CORS などの fetch 失敗。元の例外は `cause` |
| `InvalidResponseError` | 成功レスポンスの JSON またはタスク形式が不正 |

`signal` による中断（`AbortError`・`TimeoutError`・`abort(reason)` の理由）はラップせずそのまま伝播します。`AbortError` / `TimeoutError` は `isAbortError(error)` で判定できます。組み込みタイムアウトはなく、必要なら各メソッドに `{ signal: AbortSignal.timeout(5000) }` を渡してください。
## フロントエンド

React + TypeScript の画面は `web/` にあります。開発時は別々のターミナルで起動します。

```sh
npm run dev
npm run dev:web
```

Vite の開発サーバーは `/tasks` を `http://localhost:3000` に転送します。API のポートを変更した場合は `web/vite.config.ts` の転送先も変更してください。

画面は一覧・追加・編集・完了切り替え・削除、読み込み表示、エラー表示と再試行に対応しています。`web/src/components/` に画面、`hooks/use-tasks.ts` に状態管理、`api/task-api.ts` に UI が利用する `TaskApi` インターフェースを配置しています。

**API クライアントは別タスクで実装するため、現時点のエントリは仮実装です。** 起動すると「APIクライアントが未接続です」と表示されます。統合時に `web/src/main.tsx` の `placeholder-task-api` の import を、`TaskApi` を満たす実クライアントの `taskApi` に差し替えてください。各メソッドは表示可能な `message` を持つ `Error` で失敗を通知します。画面テストはメモリ上の fake を使うためクライアントに依存しません。

`npm run typecheck` で API と画面の型を確認し、`npm test` で両方のテストを実行します。`npm run build` は API を `dist/`、画面を `dist/web/` に出力します。`npm run preview:web` はビルド済み画面の確認用です。本番での静的配信・API へのルーティングは別途設定が必要です。
