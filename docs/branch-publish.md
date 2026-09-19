# Branches, local history and GitHub

Open **Branch & publish** in the dashboard, or the branch button in the overlay. The same
guide works with agent execution disabled. No step in this guide invokes an agent or model.

## Start without Git or a repository

You can start NudgeThis in a project folder and keep drafts, instructions and documents
before creating a repository. Agent changes require Git, an initial commit and a branch
because their isolated workspaces depend on that history. GitHub is optional.

| Your folder | The guide offers |
| --- | --- |
| Git is not installed | An installation link and instructions to restart NudgeThis. Drafts and context remain available. |
| No Git repository | **Enable version history**, with an initial branch name. This explicitly initializes local Git only. |
| Git exists but has no commits | Select source files, inspect their diff, choose a version name and author, then **Save first version**. |
| Existing branch | Continue, create a working branch or choose another local branch. |
| Detached commit | Create or select a branch before running changes. |
| Folder inside another repository | Open the repository root; the app will not initialize a nested repository. |
| Unreadable Git metadata | Inspect Git in your Git client, then refresh. The app will not replace that metadata. |

The first-version review excludes protected paths, common credential filenames, generated
folders, linked paths and files over 16 MiB. This is a filename policy, not a content secret
scanner: inspect the source before saving. Review up to 200 files and 512 KiB of patch at
a time; folders with more than 200 eligible initial files require a Git client for setup.
Existing staged files and active commit hooks require your Git client. The first
save uses the same private-index review, explicit author, signing and interruption journal
as [Saved versions](saved-versions.md). It creates no remote repository and uploads nothing.
The app ignores `.nudgethis/` before writing its local session token.

## Choose where to work

The guide explains **Branch**, **Commit**, **Publish**, **Pull request**, **Merge** and
**Deploy**. A nonblocking welcome identifies the current branch and remembers the choice
for that workspace/branch during the browser session. The branch indicator refreshes
on focus, local notifications and every five seconds while the page is visible. The default
branch comes from local `origin/HEAD` when available; `main`/`master` name inference is
explicitly described as a convention. GitHub publishing reads its actual default branch.

Creating a branch can carry existing editor changes only after explicit acknowledgement.
Save or undo applied NudgeThis corrections first so they remain associated with their
original branch. Switching to an existing branch requires a clean working tree. The app
does not discard changes, stash automatically or force a checkout. Active tasks, recovery
records, Git operations and checkout hooks require attention first. Other programs can
still edit files, so the server rechecks the expected branch and commit before switching.

Conversations retain their original branch; changing branches does not relocate them.
Return to the original branch to apply or undo their patches. Ordinary external Git commits
remain visible in Git; Saved versions lists only versions saved through NudgeThis.

## Publish when ready

1. **Save version** creates a local checkpoint. Work can remain entirely on this computer.
2. In **GitHub**, explicitly choose a username. Use an account already signed in to GitHub
   CLI, or provide a token for this session. Both methods currently require the `gh` executable.
3. Connect an existing `owner/repository`, or review a new personal repository's name and
   visibility before creating it. Private is the default. Creation starts empty and does
   not upload files. The suggested `origin` is never connected automatically.
4. **Review publishing** shows the account, repository, visibility, branch, exact commits
   and diff. **Publish to GitHub** uploads that reviewed commit. Uncommitted edits stay local.
   For an empty remote, first publish its configured default branch, then create working branches.
5. From a published working branch, **Propose changes** prepares an editable title and
   description from saved commit titles. Creating the pull request does not integrate it.
6. **Review & merge** fetches the proposal diff, check results, commit status and required
   review decision. Choose an allowed merge method and explicitly confirm **Merge on GitHub**.

Publishing sends commit history, including content changed or removed in earlier commits.
It uses an explicit GitHub HTTPS destination, selected-account credentials and a normal
push of the reviewed SHA to one branch. It does not change `origin`, force push, upload
tags/submodules, switch the active GitHub CLI account or modify global Git settings.
Pre-push/reference-transaction hooks and URL rewrite rules require a Git client.
Review at most 100 unpublished commits and 512 KiB of net diff in the app. A new branch
is compared with the remote default branch; existing remote changes must be ancestors
of the reviewed local commit. Unrelated histories and divergent branches need a Git client.

Credentials stay in server memory until disconnect or shutdown. They are not stored in
SQLite, Git configuration, browser storage or agent context. Reconnect after a restart.
Repository metadata and publishing receipts remain in the local database. GitHub CLI's
existing account credentials retain its normal storage behavior; NudgeThis only reads
the explicitly selected account. See [GitHub CLI account token selection](https://cli.github.com/manual/gh_auth_token).
Tokens need access to the chosen repository, content writes for publishing, pull-request
writes for proposals/merges, and access to checks/review metadata. Organization rules,
SSO and workflow changes may require additional permissions. The app does not grant them.

## Checks, recovery and completion

Publication reviews expire after ten minutes. A changed local head, account, repository,
visibility or remote branch requires another review. Successful upload receipts support
idempotent retries. If a request times out, **Refresh GitHub status** before retrying:
the remote operation may have completed. After restart, reconnect and refresh rather than
reuse an expired in-memory review. An interrupted repository creation can likewise have
succeeded; connect the existing repository instead of creating it again.

Merge is conservative: the proposal must be open, not a draft, conflict-free, reported
clean by GitHub, satisfy its required review decision, and have successful completed
checks/statuses. More than 100 checks, unresolved mergeability, a merge queue or unsupported
rules require completing the merge on GitHub. The server rereads these conditions and
the reviewed base/head before merging; GitHub enforces its own current repository rules.
There is no administrator bypass or automatic merge. Existing open proposals are reused.
See [GitHub pull-request operations](https://docs.github.com/en/rest/pulls/pulls).

Merging changes the repository on GitHub. Your local branch and files remain unchanged;
update local main in your Git client when ready. Website deployment runs only when the
repository has a corresponding deployment workflow. The guide distinguishes local saves,
remote publication, merge readiness and completed merges, with a timestamp for remote data.

Application tests use real temporary Git repositories, local bare remotes and a simulated
GitHub API. Chromium exercises onboarding, external branch changes, mobile layout, reviewed
publishing and merge gating. These checks do not certify every token, organization policy,
live GitHub integration, agent or deployed application.
