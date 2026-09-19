import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { AppError, taskId } from '../../shared/src/index.js';

export class TaskStore extends EventEmitter {
  constructor(file) {
    super();
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, task_id TEXT, action TEXT NOT NULL);`);
  }
  audit(id, action) { this.db.prepare('INSERT INTO audit(at, task_id, action) VALUES (?, ?, ?)').run(new Date().toISOString(), id, action); }
  create(input) {
    const now = new Date().toISOString();
    const data = { ...input, status: 'pending', attempt: 1, createdAt: now, updatedAt: now, diff: '', files: [], validation: [], output: '', error: null };
    const { lastInsertRowid } = this.db.prepare('INSERT INTO tasks(data) VALUES (?)').run(JSON.stringify(data));
    const task = this.update(`QA-${lastInsertRowid}`, {});
    this.audit(task.id, 'created');
    return task;
  }
  get(id) {
    taskId(id);
    const row = this.db.prepare('SELECT data FROM tasks WHERE id = ?').get(Number(id.slice(3)));
    if (!row) throw new AppError('Task not found', 404);
    return { ...JSON.parse(row.data), id };
  }
  list() { return this.db.prepare('SELECT id, data FROM tasks ORDER BY id DESC').all().map(row => ({ ...JSON.parse(row.data), id: `QA-${row.id}` })); }
  update(id, patch) {
    const task = { ...this.get(id), ...patch, updatedAt: new Date().toISOString() };
    this.db.prepare('UPDATE tasks SET data = ? WHERE id = ?').run(JSON.stringify(task), Number(id.slice(3)));
    if (patch.status) this.audit(id, patch.status);
    this.emit('change', task);
    return task;
  }
  delete(id) {
    this.get(id);
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(id.slice(3)));
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
