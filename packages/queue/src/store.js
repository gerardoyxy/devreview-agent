import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { AppError, assert, taskId } from '../../shared/src/index.js';

export class TaskStore extends EventEmitter {
  constructor(file) {
    super();
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, task_id TEXT, action TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, attempt INTEGER NOT NULL, at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_task ON messages(task_id, id);
      CREATE TABLE IF NOT EXISTS revisions (task_id TEXT NOT NULL, attempt INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(task_id, attempt));
      INSERT INTO messages(task_id, role, content, attempt, at)
        SELECT 'QA-' || id, 'user', json_extract(data, '$.request'), 1, json_extract(data, '$.createdAt') FROM tasks
        WHERE NOT EXISTS (SELECT 1 FROM messages WHERE task_id = 'QA-' || tasks.id);`);
    for (const task of this.list()) {
      if (['ready', 'awaiting_feedback', 'failed', 'conflict', 'applied', 'rejected', 'cancelled'].includes(task.status)
        && !this.db.prepare('SELECT 1 FROM revisions WHERE task_id = ? AND attempt = ?').get(task.id, task.attempt)) this.archive(task);
    }
  }
  audit(id, action) { this.db.prepare('INSERT INTO audit(at, task_id, action) VALUES (?, ?, ?)').run(new Date().toISOString(), id, action); }
  create(input) {
    const now = new Date().toISOString();
    const data = { ...input, status: 'pending', attempt: 1, createdAt: now, updatedAt: now, diff: '', files: [], validation: [], output: '', error: null };
    const { lastInsertRowid } = this.db.prepare('INSERT INTO tasks(data) VALUES (?)').run(JSON.stringify(data));
    const task = this.update(`QA-${lastInsertRowid}`, {});
    this.audit(task.id, 'created');
    this.addMessage(task.id, 'user', task.request);
    return task;
  }
  get(id) {
    taskId(id);
    const row = this.db.prepare('SELECT data FROM tasks WHERE id = ?').get(Number(id.slice(3)));
    if (!row) throw new AppError('Task not found', 404);
    return { ...JSON.parse(row.data), id };
  }
  list() { return this.db.prepare('SELECT id, data FROM tasks ORDER BY id DESC').all().map(row => ({ ...JSON.parse(row.data), id: `QA-${row.id}` })); }
  messages(id) { return this.db.prepare('SELECT id, role, content, attempt, at FROM messages WHERE task_id = ? ORDER BY id').all(taskId(id)); }
  addMessage(id, role, content) {
    const task = this.get(id);
    assert(['user', 'assistant'].includes(role) && typeof content === 'string' && content.trim(), 'Invalid message');
    this.db.prepare('INSERT INTO messages(task_id, role, content, attempt, at) VALUES (?, ?, ?, ?, ?)').run(id, role, content, task.attempt, new Date().toISOString());
    this.emit('change', task);
  }
  archive(task) {
    const { id, attempt, status, diff, files, validation, baseCommit, baseBranch, updatedAt, error } = task;
    this.db.prepare('INSERT INTO revisions(task_id, attempt, data) VALUES (?, ?, ?) ON CONFLICT(task_id, attempt) DO UPDATE SET data = excluded.data')
      .run(id, attempt, JSON.stringify({ attempt, status, diff, files, validation, baseCommit, baseBranch, updatedAt, error }));
  }
  details(id) {
    const task = this.get(id);
    return { ...task, messages: this.messages(id),
      history: this.db.prepare('SELECT id, at, action FROM audit WHERE task_id = ? ORDER BY id').all(id),
      revisions: this.db.prepare('SELECT data FROM revisions WHERE task_id = ? ORDER BY attempt DESC').all(id).map(row => {
        const { diff, validation, ...revision } = JSON.parse(row.data);
        return { ...revision, checks: validation.length, passed: validation.every(check => check.passed) };
      })
    };
  }
  revision(id, attempt) {
    this.get(id);
    assert(Number.isInteger(attempt) && attempt > 0, 'Invalid revision');
    const row = this.db.prepare('SELECT data FROM revisions WHERE task_id = ? AND attempt = ?').get(id, attempt);
    if (!row) throw new AppError('Revision not found', 404);
    return JSON.parse(row.data);
  }
  update(id, patch) {
    const task = { ...this.get(id), ...patch, updatedAt: new Date().toISOString() };
    this.db.prepare('UPDATE tasks SET data = ? WHERE id = ?').run(JSON.stringify(task), Number(id.slice(3)));
    if (patch.status) this.audit(id, patch.status);
    if (['ready', 'awaiting_feedback', 'failed', 'conflict', 'applied', 'rejected', 'cancelled'].includes(patch.status)) this.archive(task);
    this.emit('change', task);
    return task;
  }
  delete(id) {
    this.get(id);
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(id.slice(3)));
    this.db.prepare('DELETE FROM messages WHERE task_id = ?').run(id);
    this.db.prepare('DELETE FROM revisions WHERE task_id = ?').run(id);
    this.audit(id, 'deleted'); this.emit('change', { id, deleted: true });
  }
  recover() {
    for (const task of this.list()) {
      if (['analyzing', 'working', 'validating', 'applying'].includes(task.status)) {
        this.update(task.id, { status: 'failed', error: 'Server stopped during execution. Inspect the worktree / active files, then retry.' });
      }
    }
  }
  close() { this.db.close(); }
}
