use crate::{error::check, process, store::task_number};
use anyhow::Result;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use tokio_util::sync::CancellationToken;

pub struct Repository {
    pub root: PathBuf,
    pub state: PathBuf,
    mutation: tokio::sync::Mutex<()>,
}
impl Repository {
    pub fn new(root: PathBuf, state: PathBuf) -> Self {
        Self {
            root,
            state,
            mutation: tokio::sync::Mutex::new(()),
        }
    }
    pub async fn git(&self, args: &[&str], cwd: &Path, input: &str) -> Result<String> {
        self.git_env(args, cwd, input, &[]).await
    }
    async fn git_env(
        &self,
        args: &[&str],
        cwd: &Path,
        input: &str,
        environment: &[(&str, &str)],
    ) -> Result<String> {
        let mut args = [
            vec!["-c".into(), "core.hooksPath=/dev/null".into()],
            args.iter().map(|s| (*s).into()).collect(),
        ]
        .concat();
        if args.iter().any(|arg| arg == "--") {
            args.insert(0, "--literal-pathspecs".into());
        }
        let result = process::run_env(
            "git",
            &args,
            cwd,
            input.as_bytes(),
            120_000,
            &CancellationToken::new(),
            environment,
        )
        .await?;
        check(result.code == 0, 409, result.stderr.trim())?;
        Ok(result.stdout)
    }
    pub async fn inspect(&self) -> Result<Value> {
        let root = self
            .git(&["rev-parse", "--show-toplevel"], &self.root, "")
            .await?;
        check(
            dunce::canonicalize(root.trim())? == self.root,
            400,
            "Start DevReview at the repository root",
        )?;
        let head = self.git(&["rev-parse", "HEAD"], &self.root, "").await?;
        let branch = self
            .git(&["symbolic-ref", "--short", "HEAD"], &self.root, "")
            .await?;
        Ok(json!({"head":head.trim(),"branch":branch.trim()}))
    }
    pub async fn snapshot(&self) -> Result<Value> {
        let _lock = self.mutation.lock().await;
        let state = self.inspect().await?;
        // A private index captures tracked and untracked source without changing the user's index or files.
        let changed = self
            .git(&["diff", "--name-only", "-z", "HEAD", "--"], &self.root, "")
            .await?;
        let untracked = self
            .git(
                &["ls-files", "--others", "--exclude-standard", "-z"],
                &self.root,
                "",
            )
            .await?;
        if changed.is_empty() && untracked.is_empty() {
            return Ok(
                json!({"baseCommit":state["head"],"baseBranch":state["branch"],"snapshotIncludesLocalChanges":false}),
            );
        }
        for path in changed
            .split('\0')
            .chain(untracked.split('\0'))
            .filter(|p| !p.is_empty())
        {
            safe_path(path)?;
            self.check_path(path)?;
        }
        let dir = self
            .state
            .join(format!("snapshot-{}", rand::random::<u64>()));
        std::fs::create_dir(&dir)?;
        let index = dir.join("index");
        let index = index
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid index path"))?;
        let env = [
            ("GIT_INDEX_FILE", index),
            ("GIT_AUTHOR_NAME", "NudgeThis Snapshot"),
            ("GIT_AUTHOR_EMAIL", "snapshot@example.invalid"),
            ("GIT_COMMITTER_NAME", "NudgeThis Snapshot"),
            ("GIT_COMMITTER_EMAIL", "snapshot@example.invalid"),
        ];
        let result = async {
            self.git_env(&["read-tree", state["head"].as_str().unwrap()], &self.root, "", &env).await?;
            self.git_env(&["add", "-A", "--", "."], &self.root, "", &env).await?;
            self.git_env(&["diff-files", "--quiet", "--"], &self.root, "", &env).await.map_err(|_| anyhow::anyhow!("Files changed during snapshot. Try again after saving your edits."))?;
            let tree = self.git_env(&["write-tree"], &self.root, "", &env).await?;
            check(self.inspect().await? == state, 409, "Branch or HEAD changed during snapshot. Try again.")?;
            check(self.git_env(&["ls-files", "--others", "--exclude-standard", "-z"], &self.root, "", &env).await?.is_empty(), 409, "New files appeared during snapshot. Save your edits and try again.")?;
            let commit = self.git_env(&["-c", "commit.gpgSign=false", "commit-tree", tree.trim(), "-p", state["head"].as_str().unwrap()], &self.root, "NudgeThis local snapshot (no branch changes)\n", &env).await?;
            let commit = commit.trim();
            self.git(&["update-ref", &format!("refs/nudgethis/snapshots/{commit}"), commit], &self.root, "").await?;
            Ok(json!({"baseCommit":commit,"baseBranch":state["branch"],"snapshotIncludesLocalChanges":true}))
        }.await;
        let _ = std::fs::remove_dir_all(dir);
        result
    }
    pub fn worktree(&self, id: &str) -> Result<PathBuf> {
        task_number(id)?;
        Ok(self.state.join("worktrees").join(id))
    }
    pub async fn prepare(&self, task: &Value) -> Result<PathBuf> {
        let _lock = self.mutation.lock().await;
        let parent = self.state.join("worktrees");
        std::fs::create_dir_all(&parent)?;
        check(
            dunce::canonicalize(&parent)? == parent,
            409,
            "Worktrees directory cannot be a symlink",
        )?;
        let path = self.worktree(task["id"].as_str().unwrap())?;
        self.git(
            &[
                "worktree",
                "add",
                "--detach",
                path.to_str().unwrap(),
                task["baseCommit"].as_str().unwrap(),
            ],
            &self.root,
            "",
        )
        .await?;
        Ok(path)
    }
    pub async fn continued(&self, task: &Value) -> Result<PathBuf> {
        let path = self.worktree(task["id"].as_str().unwrap())?;
        check(
            dunce::canonicalize(&path)? == path,
            409,
            "Worktree cannot be a symlink",
        )?;
        let head = self.git(&["rev-parse", "HEAD"], &path, "").await?;
        check(
            head.trim() == task["baseCommit"].as_str().unwrap(),
            409,
            "Worktree base commit changed. Retry from HEAD.",
        )?;
        Ok(path)
    }
    pub async fn collect(&self, task: &Value) -> Result<Value> {
        let cwd = self.continued(task).await?;
        let base = task["baseCommit"].as_str().unwrap();
        // .devreview is ignored by the repository, and protected paths are checked below.
        self.git(&["add", "-A", "--", "."], &cwd, "").await?;
        let raw = self
            .git(
                &[
                    "diff",
                    "--cached",
                    "--raw",
                    "-z",
                    "--no-renames",
                    base,
                    "--",
                ],
                &cwd,
                "",
            )
            .await?;
        let parts: Vec<_> = raw.split('\0').collect();
        let mut files = vec![];
        for pair in parts[..parts.len().saturating_sub(1)].chunks(2) {
            check(pair.len() == 2, 409, "Invalid Git diff")?;
            let modes: Vec<_> = pair[0].trim_start_matches(':').split(' ').take(2).collect();
            check(
                modes
                    .iter()
                    .all(|m| matches!(*m, "000000" | "100644" | "100755")),
                409,
                "Symlink and submodule changes require manual review",
            )?;
            safe_path(pair[1])?;
            files.push(pair[1]);
        }
        let diff = self
            .git(
                &[
                    "diff",
                    "--cached",
                    "--binary",
                    "--no-ext-diff",
                    "--no-renames",
                    base,
                    "--",
                ],
                &cwd,
                "",
            )
            .await?;
        Ok(json!({"files":files,"diff":diff}))
    }
    pub async fn check_apply(&self, task: &Value) -> Result<Value> {
        let _lock = self.mutation.lock().await;
        check(
            self.inspect().await?["branch"] == task["baseBranch"],
            409,
            "Active branch changed. Return to the original branch or retry.",
        )?;
        let diff = task["diff"].as_str().unwrap_or("");
        let files = task["files"].as_array().unwrap();
        check(
            !diff.is_empty() && !files.is_empty(),
            409,
            "Task has no patch",
        )?;
        let mut before = json!({});
        for file in files {
            let file = file.as_str().unwrap();
            let actual = self.file_state(file).await?;
            let base = self
                .git(
                    &["ls-tree", task["baseCommit"].as_str().unwrap(), "--", file],
                    &self.root,
                    "",
                )
                .await?;
            let fields: Vec<_> = base.split_whitespace().take(3).collect();
            let matches = if fields.is_empty() {
                actual.is_null()
            } else {
                fields.len() == 3
                    && actual["gitHash"] == fields[2]
                    && (actual["mode"].is_null() || actual["mode"] == fields[0])
            };
            check(
                matches,
                409,
                &format!(
                    "{file} changed since this task's snapshot. Preserve your edits and retry from the current workspace."
                ),
            )?;
            before[file] = actual;
        }
        self.git(&["apply", "--check", "--binary", "-"], &self.root, diff)
            .await?;
        Ok(before)
    }
    pub async fn apply(&self, task: &Value, before: &Value) -> Result<Value> {
        let _lock = self.mutation.lock().await;
        check(
            self.inspect().await?["branch"] == task["baseBranch"],
            409,
            "Active branch changed",
        )?;
        check(
            self.file_states(&task["files"]).await? == *before,
            409,
            "Files changed while preparing Apply. Review and try again.",
        )?;
        let diff = task["diff"].as_str().unwrap_or("");
        self.git(&["apply", "--check", "--binary", "-"], &self.root, diff)
            .await?;
        self.git(&["apply", "--binary", "-"], &self.root, diff)
            .await?;
        self.file_states(&task["files"]).await
    }
    pub async fn check_undo(&self, task: &Value) -> Result<()> {
        check(
            self.inspect().await?["branch"] == task["baseBranch"],
            409,
            "Return to the original branch before undoing",
        )?;
        let undo = &task["undo"];
        check(
            undo["after"].is_object() && undo["before"].is_object(),
            409,
            "This change has no complete Undo record. Inspect its diff manually.",
        )?;
        check(
            self.file_states(&task["files"]).await? == undo["after"],
            409,
            "Files changed after Apply. Undo would overwrite newer work; no files were changed.",
        )?;
        let diff = task["diff"].as_str().unwrap_or("");
        check(!diff.is_empty(), 409, "No patch to undo")?;
        self.git(
            &["apply", "--reverse", "--check", "--binary", "-"],
            &self.root,
            diff,
        )
        .await?;
        Ok(())
    }
    pub async fn undo(&self, task: &Value) -> Result<()> {
        let _lock = self.mutation.lock().await;
        self.check_undo(task).await?;
        let undo = &task["undo"];
        let diff = task["diff"].as_str().unwrap_or("");
        self.git(&["apply", "--reverse", "--binary", "-"], &self.root, diff)
            .await?;
        check(
            self.file_states(&task["files"]).await? == undo["before"],
            409,
            "Undo finished with unexpected file state. Inspect the affected files.",
        )?;
        Ok(())
    }
    fn check_path(&self, file: &str) -> Result<()> {
        safe_path(file)?;
        let mut path = self.root.clone();
        for part in file.split('/') {
            path.push(part);
            match std::fs::symlink_metadata(&path) {
                Ok(m) => check(
                    !m.file_type().is_symlink(),
                    409,
                    "Source path contains a symlink",
                )?,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
        Ok(())
    }
    pub async fn file_states(&self, files: &Value) -> Result<Value> {
        let mut states = json!({});
        for file in files
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Invalid file list"))?
        {
            let name = file
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("Invalid file name"))?;
            states[name] = self.file_state(name).await?;
        }
        Ok(states)
    }
    async fn file_state(&self, file: &str) -> Result<Value> {
        self.check_path(file)?;
        let path = self.root.join(file);
        if !path.exists() {
            return Ok(Value::Null);
        }
        let metadata = std::fs::metadata(&path)?;
        check(
            metadata.is_file() && metadata.len() <= 16_777_216,
            409,
            "Review files must be regular files up to 16 MiB",
        )?;
        let bytes = std::fs::read(path)?;
        let mut hashes = vec![];
        for args in [
            vec![
                "hash-object".into(),
                "--no-filters".into(),
                "--stdin".into(),
            ],
            vec![
                "hash-object".into(),
                format!("--path={file}"),
                "--stdin".into(),
            ],
        ] {
            let result = process::run(
                "git",
                &args,
                &self.root,
                &bytes,
                120_000,
                &CancellationToken::new(),
            )
            .await?;
            check(result.code == 0, 409, &result.stderr)?;
            hashes.push(result.stdout.trim().to_owned());
        }
        #[cfg(unix)]
        let mode = {
            use std::os::unix::fs::PermissionsExt;
            json!(if metadata.permissions().mode() & 0o111 != 0 {
                "100755"
            } else {
                "100644"
            })
        };
        #[cfg(not(unix))]
        let mode = Value::Null;
        Ok(json!({"hash":hashes[0],"gitHash":hashes[1],"mode":mode}))
    }
    pub async fn cleanup(&self, id: &str) -> Result<()> {
        let _lock = self.mutation.lock().await;
        let path = self.worktree(id)?;
        if std::fs::symlink_metadata(&path).is_ok() {
            self.git(
                &["worktree", "remove", "--force", path.to_str().unwrap()],
                &self.root,
                "",
            )
            .await?;
        }
        Ok(())
    }
}
pub fn safe_path(file: &str) -> Result<()> {
    check(
        !file.is_empty()
            && !file.chars().any(char::is_control)
            && !Path::new(file).is_absolute()
            && !file.contains('\\')
            && !file.contains(':')
            && !file.split('/').any(|part| {
                let lower = part.to_ascii_lowercase();
                let s = lower.trim_end_matches([' ', '.']);
                part == ".."
                    || matches!(s, ".git" | ".devreview")
                    || (s.starts_with(".env.") || s == ".env") && s != ".env.example"
            }),
        409,
        "Protected or unsafe path in patch",
    )
}
