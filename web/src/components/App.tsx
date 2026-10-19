import type { TaskApi } from '../api/task-api';
import { useTasks } from '../hooks/use-tasks';
import { ErrorMessage } from './ErrorMessage';
import { LoadingIndicator } from './LoadingIndicator';
import { TaskForm } from './TaskForm';
import { TaskList } from './TaskList';

export function App({ api }: { api: TaskApi }) {
  const state = useTasks(api);
  return <div className="app">
    <header><p className="eyebrow">MY WORKSPACE</p><h1>タスク管理</h1><p>やることを整理して、一つずつ進めましょう。</p></header>
    <main>
      <section className="create-panel" aria-labelledby="create-heading">
        <h2 id="create-heading">新しいタスク</h2>
        <TaskForm submitLabel="タスクを追加" onSubmit={state.create} submitting={state.creating || state.status !== 'ready'} />
      </section>
      <section className="list-panel" aria-labelledby="list-heading">
        <div className="section-heading"><h2 id="list-heading">タスク一覧</h2>{state.status === 'ready' && <span>{state.tasks.length} 件</span>}</div>
        {state.actionError && <ErrorMessage message={state.actionError} onDismiss={state.dismissError} />}
        {state.status === 'loading' && <LoadingIndicator />}
        {state.status === 'error' && <ErrorMessage message={state.loadError} onRetry={state.reload} />}
        {state.status === 'ready' && <TaskList tasks={state.tasks} pendingIds={state.pendingIds}
          onUpdate={state.update} onToggle={state.toggleDone} onRemove={state.remove} />}
      </section>
    </main>
  </div>;
}
