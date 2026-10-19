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

it('creates, changes, displays and filters priority through the real API', async () => {
  const user = userEvent.setup();
  render(<App api={api} />);
  expect(await screen.findByText('タスクはまだありません')).toBeVisible();
  await user.type(screen.getByRole('textbox', { name: /タイトル/ }), 'タスクA');
  await user.click(screen.getByRole('radio', { name: '高' }));
  await user.click(screen.getByRole('button', { name: 'タスクを追加' }));
  expect(await screen.findByRole('heading', { name: 'タスクA' })).toBeVisible();
  expect(within(screen.getByRole('listitem')).getByText('高')).toHaveTextContent('優先度: 高');
  expect(screen.getByRole('radio', { name: '中' })).toBeChecked();
  await user.type(screen.getByRole('textbox', { name: /タイトル/ }), 'タスクB');
  await user.click(screen.getByRole('button', { name: 'タスクを追加' }));
  expect(await screen.findByRole('heading', { name: 'タスクB' })).toBeVisible();
  const item = within(screen.getAllByRole('listitem')[1]!);
  expect(item.getByText('中')).toHaveTextContent('優先度: 中');
  const tasks = await api.getTasks();
  expect(tasks).toMatchObject([
    { title: 'タスクA', priority: 'high' },
    { title: 'タスクB', priority: 'medium' },
  ]);
  const taskB = tasks[1]!;
  await user.click(item.getByRole('button', { name: '「タスクB」を編集' }));
  await user.click(item.getByRole('radio', { name: '低' }));
  await user.click(item.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(item.queryByRole('button', { name: '保存' })).not.toBeInTheDocument());
  expect(item.getByText('低')).toHaveTextContent('優先度: 低');
  expect(await api.getTask(taskB.id)).toMatchObject({ title: 'タスクB', priority: 'low' });

  const filter = screen.getByRole('combobox', { name: '優先度で絞り込み' });
  await user.selectOptions(filter, 'high');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'タスクA' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'タスクB' })).not.toBeInTheDocument();
  expect(screen.getByText('1 件（全 2 件）')).toBeVisible();
  await user.selectOptions(filter, 'medium');
  expect(screen.getByText('該当するタスクはありません')).toBeVisible();
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  await user.selectOptions(filter, 'all');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'タスクA' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'タスクB' })).toBeVisible();
  expect(screen.getByText('2 件')).toBeVisible();
});

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
