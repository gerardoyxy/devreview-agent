import { assert, serial } from '../../shared/src/index.js';
import { validate } from '../../validation/src/index.js';

export class TaskQueue {
  constructor({ store, repository, agent, maxConcurrent = 2, commands = [], validationTimeout = 120000 }) {
    Object.assign(this, { store, repository, agent, maxConcurrent, commands, validationTimeout });
    this.active = new Map(); this.control = serial(); this.stopped = false;
  }
  async submit(input) {
    return this.control(async () => {
      assert(!this.stopped, 'Server is stopping', 503);
      const snapshot = await this.repository.snapshot();
      const task = this.store.create({ ...input, ...snapshot, agent: this.agent.name });
      this.pump(); return task;
    });
  }
  pump() {
    if (this.stopped) return;
    for (const task of this.store.list().reverse()) {
      if (this.active.size >= this.maxConcurrent) break;
      if (task.status !== 'pending' || this.active.has(task.id)) continue;
      const controller = new AbortController();
      const entry = { controller };
      this.active.set(task.id, entry);
      entry.promise = this.execute(task, controller.signal).finally(() => {
        this.active.delete(task.id); this.pump();
      });
    }
  }
  async execute(task, signal) {
    try {
      this.store.update(task.id, { status: 'analyzing' });
      const cwd = await this.repository.prepare(task);
      signal.throwIfAborted();
      this.store.update(task.id, { status: 'working' });
      const result = await this.agent.run({ task, cwd, signal });
      signal.throwIfAborted();
      this.store.update(task.id, { output: result.output || '', agentErrors: result.stderr || '' });
      const patch = await this.repository.collect(task);
      assert(patch.diff, 'The agent produced no changes', 409);
      this.store.update(task.id, { ...patch, status: 'validating' });
      const validation = await validate(this.commands, cwd, {
        signal, timeout: this.validationTimeout,
        onResult: results => this.store.update(task.id, { validation: results })
      });
      signal.throwIfAborted();
      assert(validation.every(result => result.passed), 'Validation failed. Review the command output and retry.', 409);
      const after = await this.repository.collect(task);
      assert(after.diff === patch.diff, 'Validation changed source files. Inspect the worktree before retrying.', 409);
      this.store.update(task.id, { status: 'ready', validation });
    } catch (error) {
      this.store.update(task.id, {
        status: signal.aborted ? 'cancelled' : 'failed', error: signal.aborted ? 'Task cancelled' : error.message,
        ...(error.result ? { output: error.result.stdout, agentErrors: error.result.stderr } : {})
      });
    }
  }
  async action(id, action) {
    return this.control(async () => {
      const task = this.store.get(id);
      const active = this.active.get(id);
      if (action === 'cancel') {
        assert(['pending', 'analyzing', 'working', 'validating'].includes(task.status), 'Task cannot be cancelled in its current state', 409);
        if (active) { active.controller.abort(); await active.promise; }
        else this.store.update(id, { status: 'cancelled', error: 'Task cancelled' });
        return this.store.get(id);
      }
      assert(!active, 'Wait for the running task to stop', 409);
      if (action === 'apply') {
        assert(task.status === 'ready', 'Only ready tasks can be applied', 409);
        this.store.update(id, { status: 'applying' });
        try { await this.repository.apply(task); }
        catch (error) { this.store.update(id, { status: 'conflict', error: error.message }); throw error; }
        this.store.update(id, { status: 'applied', error: null });
        // The patch is already applied. A cleanup failure must not claim otherwise.
        try { await this.repository.cleanup(id); }
        catch (error) { this.store.update(id, { cleanupWarning: error.message }); }
      } else if (action === 'retry') {
        assert(['failed', 'conflict', 'cancelled', 'rejected', 'ready'].includes(task.status), 'Task cannot be retried in its current state', 409);
        const snapshot = await this.repository.snapshot();
        await this.repository.cleanup(id);
        this.store.update(id, { ...snapshot, status: 'pending', attempt: task.attempt + 1, error: null, diff: '', files: [], validation: [], output: '', agentErrors: '', cleanupWarning: null });
        this.pump();
      } else if (action === 'reject' || action === 'delete') {
        assert(!['applied', 'applying'].includes(task.status), 'An applied task cannot be rejected or deleted', 409);
        await this.repository.cleanup(id);
        if (action === 'delete') { this.store.delete(id); return { id, deleted: true }; }
        this.store.update(id, { status: 'rejected' });
      } else assert(false, 'Unknown action', 404);
      return this.store.get(id);
    });
  }
  async close() {
    this.stopped = true;
    for (const { controller } of this.active.values()) controller.abort();
    await Promise.all([...this.active.values()].map(entry => entry.promise));
    await this.control(async () => {});
  }
}
