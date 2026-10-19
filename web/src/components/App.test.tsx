import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { deferred, fakeTaskApi, sampleTask } from '../test/fake-task-api';
import type { Task } from '../api/types';

async function ready(api = fakeTaskApi([sampleTask])) {
  const user = userEvent.setup();
  render(<App api={api} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'タスクを追加' })).toBeEnabled());
  return { user, api };
}

describe('App', () => {
  it('shows loading then tasks', async () => {
    const result = deferred<Task[]>();
    const api = fakeTaskApi();
    api.getTasks.mockReturnValueOnce(result.promise);
    render(<App api={api} />);
    expect(screen.getByRole('status')).toHaveTextContent('読み込み中');
    expect(screen.getByRole('button', { name: 'タスクを追加' })).toBeDisabled();
    await act(async () => result.resolve([sampleTask]));
    expect(screen.getByRole('list', { name: 'タスク一覧' })).toHaveTextContent(sampleTask.title);
  });
  it('shows empty state and retries a failed load', async () => {
    const api = fakeTaskApi();
    api.getTasks.mockRejectedValueOnce(new Error('取得できません'));
    const user = userEvent.setup();
    render(<App api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('取得できません');
    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByText('タスクはまだありません')).toBeVisible();
  });
  it('validates whitespace and creates a task, resetting the form', async () => {
    const { user, api } = await ready(fakeTaskApi());
    const title = screen.getByRole('textbox', { name: /タイトル/ });
    await user.type(title, '   ');
    await user.click(screen.getByRole('button', { name: 'タスクを追加' }));
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(api.createTask).not.toHaveBeenCalled();
    await user.clear(title);
    await user.type(title, '  新しいタスク  ');
    await user.click(screen.getByRole('button', { name: 'タスクを追加' }));
    expect(await screen.findByRole('heading', { name: '新しいタスク', level: 3 })).toBeVisible();
    expect(title).toHaveValue('');
    expect(title).toHaveFocus();
    expect(api.createTask).toHaveBeenCalledWith({ title: '新しいタスク', description: '', status: 'todo' });
  });
  it('edits, cancels, toggles and deletes a task', async () => {
    const { user, api } = await ready();
    await user.click(screen.getByRole('button', { name: '「仕様を確認」を編集' }));
    const item = within(screen.getByRole('listitem'));
    await user.clear(item.getByRole('textbox', { name: /タイトル/ }));
    await user.type(item.getByRole('textbox', { name: /タイトル/ }), '確認済み');
    await user.click(item.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('heading', { name: '確認済み' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '「確認済み」を編集' }));
    await user.type(item.getByRole('textbox', { name: /タイトル/ }), 'キャンセル');
    await user.click(item.getByRole('button', { name: 'キャンセル' }));
    expect(screen.getByRole('heading', { name: '確認済み' })).toBeVisible();
    await user.click(screen.getByRole('checkbox'));
    expect(api.updateTask).toHaveBeenLastCalledWith('one', { status: 'done' });
    expect(screen.getByRole('checkbox')).toBeChecked();
    await user.click(screen.getByRole('checkbox'));
    expect(api.updateTask).toHaveBeenLastCalledWith('one', { status: 'todo' });
    await user.click(screen.getByRole('button', { name: '「確認済み」を削除' }));
    expect(await screen.findByText('タスクはまだありません')).toBeVisible();
  });
  it('keeps data and dismisses a failed mutation', async () => {
    const { user, api } = await ready();
    api.deleteTask.mockRejectedValueOnce(new Error('削除できません'));
    await user.click(screen.getByRole('button', { name: '「仕様を確認」を削除' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('削除できません');
    expect(screen.getByRole('heading', { name: sampleTask.title })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('locks the pending task but permits independent operations', async () => {
    const { user, api } = await ready();
    const result = deferred<Task>();
    api.updateTask.mockReturnValueOnce(result.promise);
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: '「仕様を確認」を編集' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '「仕様を確認」を削除' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'タスクを追加' })).toBeEnabled();
    await act(async () => result.resolve({ ...sampleTask, status: 'done' }));
    expect(screen.getByRole('checkbox')).toBeEnabled();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
  it('preserves failed create and edit values and unlocks controls', async () => {
    const { user, api } = await ready();
    api.createTask.mockRejectedValueOnce(new Error('追加できません'));
    await user.type(screen.getByRole('textbox', { name: /タイトル/ }), '下書き');
    await user.click(screen.getByRole('button', { name: 'タスクを追加' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('追加できません');
    expect(screen.getByRole('textbox', { name: /タイトル/ })).toHaveValue('下書き');
    expect(screen.getByRole('textbox', { name: /タイトル/ })).toHaveFocus();
    api.updateTask.mockRejectedValueOnce(new Error('保存できません'));
    await user.click(screen.getByRole('button', { name: '「仕様を確認」を編集' }));
    const item = within(screen.getByRole('listitem'));
    await user.type(item.getByRole('textbox', { name: /タイトル/ }), '変更');
    await user.click(item.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存できません');
    expect(item.getByRole('textbox', { name: /タイトル/ })).toHaveValue('仕様を確認変更');
    expect(item.getByRole('textbox', { name: /タイトル/ })).toHaveFocus();
    expect(item.getByRole('button', { name: '保存' })).toBeEnabled();
  });
  it('disables creation while pending and uses the server response', async () => {
    const { user, api } = await ready(fakeTaskApi());
    const result = deferred<Task>();
    api.createTask.mockReturnValueOnce(result.promise);
    await user.type(screen.getByRole('textbox', { name: /タイトル/ }), '下書き');
    await user.click(screen.getByRole('button', { name: 'タスクを追加' }));
    expect(screen.getByRole('button', { name: 'タスクを追加' })).toBeDisabled();
    await act(async () => result.resolve(sampleTask));
    expect(screen.getByRole('heading', { name: sampleTask.title })).toBeVisible();
  });
  it('ignores stale StrictMode loads', async () => {
    const stale = deferred<Task[]>();
    const api = fakeTaskApi();
    api.getTasks.mockReturnValueOnce(stale.promise);
    render(<StrictMode><App api={api} /></StrictMode>);
    expect(await screen.findByText('タスクはまだありません')).toBeVisible();
    await act(async () => stale.resolve([sampleTask]));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
