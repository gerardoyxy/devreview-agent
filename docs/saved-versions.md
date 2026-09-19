# Save an approved version

Available in source on `main` after `0.4.0-alpha.1`; older downloaded executables do not
include this flow. Rebuild the application to use it until the next tagged preview.

Apply updates your project files. **Save version** records approved corrections as a
local Git commit: a checkpoint with a name, author and place in your branch's history.
It works without a GitHub account and with execution disabled.

1. Apply the corrections you approve.
2. Choose **Review & save** from the reminder or an applied conversation. **Saved versions**
   is also available in the dashboard and overlay toolbar.
3. Select the corrections that belong together, then choose **Review selected changes**.
4. Read their descriptions and, optionally, expand **View files and technical diff**.
   Edit the suggested version name. Check your author name and email.
5. Choose **Save version**. The confirmation shows the local commit ID. Open **View history**
   to see the versions created through NudgeThis, including their corrections and branch.

The suggested name comes from the selected requests; no model generates it. The author
form uses Git's configured identity, or your last saved identity when Git has none.
It does not edit repository or global Git settings. Commit names/emails become visible
when you publish; a GitHub private email is supported.

Saving does **not** push, open a pull request, run agents or run validation. Publishing
is a separate action in [Branch & publish](branch-publish.md) or your Git client. Missing/pending/failed checks stay clearly
marked during review. The history records saves made here, not every commit from other
tools or the remote's current publishing status.

## Which changes can be saved

Only applied revisions with complete before/after records are eligible. Unrelated staged,
unstaged and untracked files remain as they were. Choose up to 50 corrections, 200 files
and 512 KiB of combined patch per review. Reviews expire after ten minutes or a server restart.

Corrections touching the same file must form a continuous sequence from the current
branch's HEAD to the applied file. Select dependent corrections together. If the same
file includes earlier editor changes, later edits, or staging from another Git tool,
NudgeThis asks you to resolve/review it in that tool. It does not guess which hunks belong
to a correction. Legacy revisions missing before/after records require manual commits.
Exact applied states already present at HEAD no longer generate a reminder.

Before saving, the server rechecks the branch, HEAD, selected revisions, file bytes/modes
and Git index. A stale review is refused. An index lock prevents concurrent normal Git
index mutations; external processes can still write working files. Commit content comes
from the reviewed patches rather than whatever happens to be in the working tree.

Merges, rebases, conflicts, split indexes, symlinks and submodules require a Git client.
Repositories with active commit hooks also use their Git client so those checks can run;
NudgeThis refuses the save instead of bypassing hooks. Configured commit signing is
honored. If signing cannot complete, fix it in your Git client and retry.

After saving, **Undo applied changes** is unavailable for those revisions. Use your Git
client to revert a commit when needed; NudgeThis never resets or rewrites saved history.

## Interrupted saves

The server first prepares a reviewed tree using a private index, then journals the proposed
commit and index hashes in SQLite before updating the branch. It compares the branch with
the reviewed parent, installs the prepared index and marks the version saved. A repeated
request for the same successful review returns the same commit, including after restart.

An interruption can leave a **Needs attention** entry. Refreshing can recognize a completed
save when the branch and index match its journal, or a save that never changed either.
Ambiguous results block further saves. Do not repeat commits, reset the branch or remove
Git locks without inspecting the state first.

Stop NudgeThis and other Git operations, preserve the working files, Git index/lock and
`.nudgethis/`, then compare the journal's commit with branch history and staged changes.
The journal lives in `saved_versions` in `.nudgethis/tasks.sqlite`; private review indexes
live in `.nudgethis/version-<review-id>/`. Recovery deliberately requires manual inspection
when the outcome cannot be proven. There is no automatic destructive rollback or push.
