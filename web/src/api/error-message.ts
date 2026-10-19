import { HttpError, InvalidResponseError, NetworkError } from './errors.js';

export function toErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) return 'サーバーに接続できません。APIサーバーが起動しているか確認してください。';
  if (error instanceof HttpError) {
    if (error.code === 'VALIDATION_ERROR') return '入力内容が正しくありません。';
    if (error.code === 'NOT_FOUND' || error.status === 404) return 'タスクが見つかりません。一覧を再読み込みしてください。';
    if (error.status === 413) return '入力内容が大きすぎます。';
    if (error.status >= 500) return 'サーバーでエラーが発生しました。';
    return `リクエストに失敗しました（${error.status}）。`;
  }
  if (error instanceof InvalidResponseError) return 'サーバーから不正な応答を受け取りました。';
  return error instanceof Error ? error.message : '操作に失敗しました';
}
