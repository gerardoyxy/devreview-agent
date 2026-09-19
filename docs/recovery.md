# Workspace snapshots, Apply and Undo

Starting a task captures the current tracked and untracked source through a private Git
index. This includes local edits without changing the user's index, branch, HEAD or
working files. Clean workspaces use HEAD directly. Dirty snapshots are Git commits
retained under local `refs/nudgethis/snapshots/` refs, outside branch history. They may
contain unpublished source; ordinary branch pushes do not include these refs.

Protected paths such as `.git`, `.devreview` and `.env` are refused. Changed symlinks
also require manual handling. Ignored files and dependency directories are not copied.
Review `[setup]` commands to prepare dependencies in each fresh worktree.

Apply requires the original branch and checks every affected file against the task's
snapshot. Unrelated local edits can remain. If an affected file changed, preserve your
edits and retry from the current workspace. NudgeThis rechecks file state immediately
before `git apply`; it does not commit or stage applied changes.

After a successful Apply, **Undo applied changes** uses the recorded before/after hashes
and mode. It refuses if affected files differ from the applied state, including later
edits, additions, removals or a changed branch. Successful Undo restores the previous
patch state while preserving unrelated files and the user's index. It does not undo
commits, database operations, package installs or effects outside the reviewed patch.
Legacy applied tasks without a complete Undo record require manual handling.

## Interrupted mutations

Before changing files, the server writes an `applying` or `undoing` state. If it stops
during that operation, restart marks the task **Recovery required**. An operation error
after writing the journal also retains that status. The record and patch remain available;
automatic retry, rejection and deletion are blocked to avoid losing recovery evidence.

1. Stop the server and any editor operation touching the affected files.
2. Preserve copies of your current work before editing it further.
3. Inspect the task's full API record or dashboard diff, its `undo.before`/`undo.after`
   state and the files listed in the patch. Compare with Git and your saved work.
4. Resolve the files manually, then create a new task from the resulting workspace.
   Keep the recovery record for reference. There is no automatic recovery replay or
   endpoint that guesses whether a partially completed operation should be repeated.

Git operations serialize within NudgeThis, but other processes can still edit files
concurrently; checks do not provide a filesystem transaction against external writers.
Regular reviewed files are limited to 16 MiB and command/patch output is bounded.

## Server shutdown and startup

Use Ctrl+C or `devreview stop` for an orderly shutdown. Process groups/jobs stop active
children before worktrees can be reused. Interrupted preparation, execution or validation
becomes failed on restart. Pending tasks can resume in normal mode; use
`devreview start --no-execution` to inspect the state without running them.

If a crash left `.devreview/server.lock`, verify that the old service and its children
have stopped before removing that lock. Never run two versions against the same state.
Back up `.devreview/` only while the service is stopped; do not mix unrelated SQLite WAL files.
