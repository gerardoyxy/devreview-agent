import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import project from './project.json';
import './style.css';

function App() {
  const [tasks, setTasks] = useState([{ id: 1, text: 'Choose the first useful feature', done: false }, { id: 2, text: 'Make this screen your own', done: false }]);
  const [draft, setDraft] = useState('');
  return <><header><strong>{project.title}</strong><span>Interactive starter</span></header><main><section className="hero"><p className="eyebrow">A little progress, every day</p><h1>{project.title}</h1><p>{project.objective}</p><p className="note">Example interface · These items stay in memory and reset when you reload. Accounts, payments and shared storage are not connected.</p><form className="task-form" onSubmit={e => { e.preventDefault(); if (!draft.trim()) return; setTasks([...tasks, { id: Date.now(), text: draft.trim(), done: false }]); setDraft(''); }}><input aria-label="Next step" placeholder="What is your next step?" value={draft} maxLength={180} onChange={e => setDraft(e.target.value)} /><button>Add step</button></form><ul className="task-list">{tasks.map(task => <li key={task.id}><label className={task.done ? 'done' : ''}><input type="checkbox" checked={task.done} onChange={() => setTasks(tasks.map(t => t.id === task.id ? { ...t, done: !t.done } : t))} />{task.text}</label><button className="outline" aria-label={`Remove ${task.text}`} onClick={() => setTasks(tasks.filter(t => t.id !== task.id))}>Remove</button></li>)}</ul>{!tasks.length && <p className="empty">A fresh start. Add your next step above.</p>}</section></main><footer>For {project.audience}</footer></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
// Optional local review overlay. No token is embedded in the project or production build.
if (import.meta.env.DEV && import.meta.env.VITE_NUDGETHIS_SERVER) {
  const bridge = `${import.meta.env.VITE_NUDGETHIS_SERVER}/starter-bridge.js`;
  void import(/* @vite-ignore */ bridge);
}
