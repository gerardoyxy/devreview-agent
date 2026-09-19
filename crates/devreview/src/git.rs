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
        let mut args = [
            vec!["-c".into(), "core.hooksPath=/dev/null".into()],
            args.iter().map(|s| (*s).into()).collect(),
        ]
        .concat();
        if args.iter().any(|arg| arg == "--") {
            args.insert(0, "--literal-pathspecs".into());
        }
        let result = process::run(
            "git",
            &args,
            cwd,
            input.as_bytes(),
            120_000,
            &CancellationToken::new(),
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
        let state = self.inspect().await?;
        check(
            self.git(
                &["status", "--porcelain", "--untracked-files=all"],
                &self.root,
                "",
            )
            .await?
            .trim()
            .is_empty(),
            409,
            "Commit or stash your changes before reporting a task. Each task starts from committed HEAD.",
        )?;
        Ok(json!({"baseCommit":state["head"],"baseBranch":state["branch"]}))
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
    pub async fn apply(&self, task: &Value) -> Result<()> {
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
        let mut args = vec!["status", "--porcelain", "--untracked-files=all", "--"];
        for file in files {
            let file = file.as_str().unwrap();
            safe_path(file)?;
            args.push(file);
            let mut path = self.root.clone();
            for part in file.split('/') {
                path.push(part);
                match std::fs::symlink_metadata(&path) {
                    Ok(meta) => check(
                        !meta.file_type().is_symlink(),
                        409,
                        "Patch target contains a symlink",
                    )?,
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                    Err(e) => return Err(e.into()),
                }
            }
        }
        check(
            self.git(&args, &self.root, "").await?.trim().is_empty(),
            409,
            "A changed file has local edits. Commit or stash those edits before retrying.",
        )?;
        self.git(&["apply", "--check", "--binary", "-"], &self.root, diff)
            .await?;
        self.git(&["apply", "--binary", "-"], &self.root, diff)
            .await?;
        Ok(())
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
fn safe_path(file: &str) -> Result<()> {
    check(
        !file.is_empty()
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
