import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApp } from '../../../src/app.js';
import { createTaskApiClient, type TaskApi } from '../api/client';
import { App } from '../components/App';

let server: Server;
let api: TaskApi;
beforeEach(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  api = createTaskApiClient({
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    fetch: globalThis.fetch,
  });
});
async function closeServer() {
  if (server.listening) await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}
afterEach(async () => { cleanup(); await closeServer(); });

it('creates, edits, toggles and deletes through the real API', async () => {
  const user = userEvent.setup();
  render(<App api={api} />);
  expect(await screen.findByText('タスクはまだありません')).toBeVisible();
  await user.type(screen.getByRole('textbox', { name: /タイトル/ }), '統合テスト');
  await user.click(screen.getByRole('button', { name: 'タスクを追加' }));
  expect(await screen.findByRole('heading', { name: '統合テスト' })).toBeVisible();
  expect(screen.getByText('1 件')).toBeVisible();
  const [created] = await api.getTasks();
  if (!created) throw new Error('Created task was not persisted');
  await user.click(screen.getByRole('button', { name: '「統合テスト」を編集' }));
  const item = within(screen.getByRole('listitem'));
  await user.clear(item.getByRole('textbox', { name: /タイトル/ }));
  await user.type(item.getByRole('textbox', { name: /タイトル/ }), '編集済み');
  await user.type(item.getByRole('textbox', { name: '説明' }), '保存を確認');
  await user.selectOptions(item.getByRole('combobox'), 'in_progress');
  await user.click(item.getByRole('button', { name: '保存' }));
  expect(await screen.findByRole('heading', { name: '編集済み' })).toBeVisible();
  expect(await api.getTask(created.id)).toMatchObject({ title: '編集済み', description: '保存を確認', status: 'in_progress' });
  await user.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
  expect(await api.getTask(created.id)).toMatchObject({ status: 'done' });
  await user.click(screen.getByRole('button', { name: '「編集済み」を削除' }));
  expect(await screen.findByText('タスクはまだありません')).toBeVisible();
  expect(await api.getTasks()).toEqual([]);
});

it('displays a Japanese error when a task was deleted elsewhere', async () => {
  const task = await api.createTask({ title: '別画面で削除' });
  const user = userEvent.setup();
  render(<App api={api} />);
  await screen.findByRole('heading', { name: task.title });
  await api.deleteTask(task.id);
  await user.click(screen.getByRole('checkbox'));
  expect(await screen.findByRole('alert')).toHaveTextContent('タスクが見つかりません。一覧を再読み込みしてください。');
});

it('displays a Japanese connection error with retry when the server is offline', async () => {
  await closeServer();
  render(<App api={api} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('サーバーに接続できません。APIサーバーが起動しているか確認してください。');
  expect(screen.getByRole('button', { name: '再試行' })).toBeEnabled();
});
