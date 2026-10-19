import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { TaskForm } from './TaskForm';

it('associates labels, limits lengths and submits selected values', async () => {
  const submit = vi.fn(async () => true);
  const cancel = vi.fn();
  const user = userEvent.setup();
  render(<TaskForm submitLabel="保存" onSubmit={submit} onCancel={cancel} submitting={false} />);
  const title = screen.getByLabelText(/タイトル/);
  expect(title).toBeRequired();
  expect(title).toHaveAttribute('maxlength', '200');
  expect(screen.getByLabelText('説明')).toHaveAttribute('maxlength', '2000');
  await user.type(title, '  作業  ');
  await user.type(screen.getByLabelText('説明'), '内容');
  await user.selectOptions(screen.getByLabelText('ステータス'), 'in_progress');
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(submit).toHaveBeenCalledWith({ title: '作業', description: '内容', status: 'in_progress' });
  await user.click(screen.getByRole('button', { name: 'キャンセル' }));
  expect(cancel).toHaveBeenCalledOnce();
});
