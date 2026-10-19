import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { TaskItem } from './TaskItem';
import { sampleTask } from '../test/fake-task-api';

it('names actions and moves focus into editing and back on cancel/save', async () => {
  const user = userEvent.setup();
  render(<ul><TaskItem task={sampleTask} pending={false} onUpdate={vi.fn(async () => true)}
    onToggle={vi.fn(async () => true)} onRemove={vi.fn(async () => true)} /></ul>);
  expect(screen.getByRole('checkbox', { name: '「仕様を確認」を完了にする' })).not.toBeChecked();
  expect(screen.getByText('未着手')).toBeVisible();
  expect(screen.getByText('中')).toHaveTextContent('優先度: 中');
  expect(screen.getByRole('button', { name: '「仕様を確認」を削除' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '「仕様を確認」を編集' }));
  expect(screen.getByRole('textbox', { name: /タイトル/ })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'キャンセル' }));
  expect(screen.getByRole('button', { name: '「仕様を確認」を編集' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: '「仕様を確認」を編集' }));
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(screen.getByRole('button', { name: '「仕様を確認」を編集' })).toHaveFocus();
});
