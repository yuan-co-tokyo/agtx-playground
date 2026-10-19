import { expect, it } from 'vitest';
import { toErrorMessage } from '../../src/api/error-message.js';
import { HttpError, InvalidResponseError, NetworkError } from '../../src/api/errors.js';

it.each([
  [new NetworkError('network'), 'サーバーに接続できません。APIサーバーが起動しているか確認してください。'],
  [new HttpError(400, 'VALIDATION_ERROR', 'invalid'), '入力内容が正しくありません。'],
  [new HttpError(400, 'NOT_FOUND', 'missing'), 'タスクが見つかりません。一覧を再読み込みしてください。'],
  [new HttpError(404, 'HTTP_ERROR', 'missing'), 'タスクが見つかりません。一覧を再読み込みしてください。'],
  [new HttpError(413, 'HTTP_ERROR', 'large'), '入力内容が大きすぎます。'],
  [new HttpError(500, 'INTERNAL_ERROR', 'server'), 'サーバーでエラーが発生しました。'],
  [new HttpError(503, 'HTTP_ERROR', 'unavailable'), 'サーバーでエラーが発生しました。'],
  [new HttpError(403, 'HTTP_ERROR', 'forbidden'), 'リクエストに失敗しました（403）。'],
  [new InvalidResponseError('invalid'), 'サーバーから不正な応答を受け取りました。'],
  [new Error('独自エラー'), '独自エラー'],
  [null, '操作に失敗しました'],
])('maps %s to a display message', (error, expected) => {
  expect(toErrorMessage(error)).toBe(expected);
});
