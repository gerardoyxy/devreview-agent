import { mkdir, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { run, assert, AppError, taskId, serial } from '../../shared/src/index.js';

export class Repository {
  constructor(root, stateDir) { this.root = root; this.stateDir = stateDir; this.mutate = serial(); }
  async git(args, cwd = this.root, input) {
    const result = await run('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, input });
    if (result.code) throw new AppError(result.stderr.trim() || 'Git operation failed', 409);
    return result.stdout;
  }
  async inspect() {
    const root = (await this.git(['rev-parse', '--show-toplevel'])).trim();
    assert(await realpath(root) === await realpath(this.root), 'Start NudgeThis at the repository root');
    const head = (await this.git(['rev-parse', 'HEAD'])).trim();
    const branch = (await this.git(['symbolic-ref', '--short', 'HEAD'])).trim();
    return { head, branch };
  }
  async snapshot() {
    const state = await this.inspect();
    assert(!(await this.git(['status', '--porcelain', '--untracked-files=all'])).trim(),
      'Commit or stash your changes before reporting a task. Each task starts from committed HEAD.', 409);
    return { baseCommit: state.head, baseBranch: state.branch };
  }
  worktree(id) { return path.join(this.stateDir, 'worktrees', taskId(id)); }
  async prepare(task) {
    return this.mutate(async () => {
      await mkdir(path.join(this.stateDir, 'worktrees'), { recursive: true });
      assert(await realpath(path.join(this.stateDir, 'worktrees')) === path.join(this.stateDir, 'worktrees'), 'Worktrees directory cannot be a symlink', 409);
      await this.git(['worktree', 'add', '--detach', this.worktree(task.id), task.baseCommit]);
      return this.worktree(task.id);
    });
  }
  async collect(task) {
    const cwd = this.worktree(task.id);
    assert(await realpath(cwd) === cwd, 'Worktree cannot be a symlink', 409);
    // Include new files without committing or changing the developer's index.
    await this.git(['add', '-A', '--', '.', ':!.nudgethis'], cwd);
    const raw = await this.git(['diff', '--cached', '--raw', '-z', '--no-renames', task.baseCommit, '--'], cwd);
    const parts = raw.split('\0');
    const files = [];
    for (let i = 0; i < parts.length - 1; i += 2) {
      const header = parts[i], file = parts[i + 1];
      if (!header) continue;
      const modes = header.split(' ').slice(0, 2).map(mode => mode.replace(':', ''));
      assert(modes.every(mode => ['000000', '100644', '100755'].includes(mode)), 'Symlink and submodule changes require manual review', 409);
      assert(file && !path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), 'Unsafe patch path', 409);
      assert(!file.split('/').some(segment => ['.git', '.nudgethis'].includes(segment)), 'Protected path in patch', 409);
      assert(!/(^|\/)\.env($|\.)/.test(file) || file.endsWith('.env.example'), 'Environment files cannot be applied automatically', 409);
      files.push(file);
    }
    const diff = await this.git(['diff', '--cached', '--binary', '--no-ext-diff', '--no-renames', task.baseCommit, '--'], cwd);
    return { files, diff };
  }
  async apply(task) {
    return this.mutate(async () => {
      const current = await this.inspect();
      assert(current.branch === task.baseBranch, 'Active branch changed. Return to the original branch or retry.', 409);
      assert(task.diff && task.files.length, 'Task has no patch', 409);
      // Never write through symlinks introduced while the agent was running.
      for (const file of task.files) {
        let target = this.root;
        for (const part of file.split('/')) {
          target = path.join(target, part);
          try { assert(!(await lstat(target)).isSymbolicLink(), 'Patch target contains a symlink', 409); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      const dirty = await this.git(['status', '--porcelain', '--untracked-files=all', '--', ...task.files]);
      assert(!dirty.trim(), 'A changed file has local edits. Commit or stash those edits before retrying.', 409);
      await this.git(['apply', '--check', '--binary', '-'], this.root, task.diff);
      await this.git(['apply', '--binary', '-'], this.root, task.diff);
    });
  }
  async cleanup(id) {
    return this.mutate(async () => {
      try { await lstat(this.worktree(id)); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
      await this.git(['worktree', 'remove', '--force', this.worktree(id)]);
    });
  }
}
