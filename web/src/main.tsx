import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App';
import { taskApi } from './api/placeholder-task-api';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App api={taskApi} /></StrictMode>);
