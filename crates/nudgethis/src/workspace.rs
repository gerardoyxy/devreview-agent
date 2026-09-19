//! Local Git onboarding and explicit, non-destructive branch changes.
use crate::{
    core::Core,
    error::check,
    git::{Repository, safe_path},
    process, project,
};
use anyhow::Result;
use serde_json::{Value, json};
use std::{
    fs,
    hash::{Hash, Hasher},
    io::Write,
};
use tokio_util::sync::CancellationToken;

pub(crate) fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}
pub(crate) async fn raw(repo: &Repository, args: &[&str]) -> Result<process::Output> {
    process::run(
        "git",
        &args.iter().map(|a| (*a).to_owned()).collect::<Vec<_>>(),
        &repo.root,
        b"",
        15000,
        &CancellationToken::new(),
    )
    .await
}
/// Ignore state before creating a token, including when the folder is not a repository yet.
pub fn ignore_state(root: &std::path::Path) -> Result<()> {
    let path = root.join(".gitignore");
    if let Ok(meta) = fs::symlink_metadata(&path) {
        check(
            meta.is_file() && !meta.file_type().is_symlink(),
            409,
            ".gitignore must be a regular file",
        )?;
    }
    let existing = match fs::read_to_string(&path) {
        Ok(value) => value,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.into()),
    };
    if !existing
        .lines()
        .any(|line| matches!(line.trim(), ".nudgethis/" | "/.nudgethis/"))
    {
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?
            .write_all(b"\n.nudgethis/\n")?;
    }
    Ok(())
}
pub(crate) async fn probe(repo: &Repository) -> Result<Value> {
    let mut result = json!({"kind":"missing_git","branch":"","head":"","ready":false,"defaultBranch":"","defaultSource":"unknown","branches":[],"dirty":{"staged":0,"unstaged":0,"untracked":0},"operation":"","rootHint":""});
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    repo.root.hash(&mut hasher);
    result["id"] = format!("{:016x}", hasher.finish()).into();
    if !project::executable("git") {
        return Ok(result);
    }
    let root = raw(repo, &["rev-parse", "--show-toplevel"]).await?;
    if root.code != 0 {
        result["kind"] = if fs::symlink_metadata(repo.root.join(".git")).is_ok() {
            "unavailable"
        } else {
            "no_repository"
        }
        .into();
        return Ok(result);
    }
    if dunce::canonicalize(root.stdout.trim())? != repo.root {
        result["kind"] = "nested_folder".into();
        result["rootHint"] = root.stdout.trim().into();
        return Ok(result);
    }
    let head = raw(repo, &["rev-parse", "--verify", "HEAD"]).await?;
    let branch = raw(repo, &["symbolic-ref", "--quiet", "--short", "HEAD"]).await?;
    result["head"] = if head.code == 0 {
        head.stdout.trim()
    } else {
        ""
    }
    .into();
    result["branch"] = if branch.code == 0 {
        branch.stdout.trim()
    } else {
        ""
    }
    .into();
    let kind = if head.code != 0 {
        "unborn"
    } else if branch.code != 0 {
        "detached"
    } else {
        "ready"
    };
    result["kind"] = kind.into();
    result["ready"] = (kind == "ready").into();
    let branches = repo
        .git(
            &["for-each-ref", "--format=%(refname:short)", "refs/heads/"],
            &repo.root,
            "",
        )
        .await?;
    result["branches"] = json!(branches.lines().take(500).collect::<Vec<_>>());
    let remote = raw(
        repo,
        &["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
    )
    .await?;
    if remote.code == 0 {
        result["defaultBranch"] = remote
            .stdout
            .trim()
            .strip_prefix("refs/remotes/origin/")
            .unwrap_or("")
            .into();
        result["defaultSource"] = "remote".into();
    } else if let Some(name) = ["main", "master"]
        .into_iter()
        .find(|name| branches.lines().any(|b| b == *name) || text(&result, "branch") == *name)
    {
        result["defaultBranch"] = name.into();
        result["defaultSource"] = "conventional_name".into();
    }
    let status = repo
        .git_env(
            &["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
            &repo.root,
            "",
            &[("GIT_OPTIONAL_LOCKS", "0")],
        )
        .await?;
    let entries: Vec<_> = status.split('\0').filter(|s| !s.is_empty()).collect();
    let (mut staged, mut unstaged, mut untracked, mut i) = (0, 0, 0, 0);
    while i < entries.len() {
        let code = entries[i].as_bytes();
        if code.len() >= 3 {
            if &code[..2] == b"??" {
                untracked += 1;
            } else {
                staged += usize::from(code[0] != b' ');
                unstaged += usize::from(code[1] != b' ');
            }
            if code[0] == b'R' || code[0] == b'C' {
                i += 1;
            }
        }
        i += 1;
    }
    result["dirty"] = json!({"staged":staged,"unstaged":unstaged,"untracked":untracked});
    let index = crate::versions::git_path(repo, "index").await?;
    for name in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
        "BISECT_START",
    ] {
        let path = index.parent().unwrap().join(name);
        if path.exists() {
            result["operation"] = name.into();
            break;
        }
    }
    Ok(result)
}
pub(crate) async fn state(repo: &Repository) -> Result<Value> {
    let workspace = probe(repo).await?;
    check(
        matches!(text(&workspace, "kind"), "ready" | "unborn"),
        409,
        "Open Branch & publish to set up version history or return to a branch",
    )?;
    Ok(json!({"branch":workspace["branch"],"head":workspace["head"]}))
}
pub(crate) fn dirty(workspace: &Value) -> bool {
    ["staged", "unstaged", "untracked"]
        .iter()
        .any(|k| workspace["dirty"][k].as_u64().unwrap_or(0) > 0)
}
pub(crate) async fn valid_branch(repo: &Repository, name: &str) -> Result<()> {
    check(
        !name.is_empty()
            && name.len() <= 120
            && !name.starts_with('-')
            && !name.contains('@')
            && !name.chars().any(char::is_control),
        400,
        "Choose a branch name such as improve-checkout",
    )?;
    check(
        raw(repo, &["check-ref-format", "--branch", name])
            .await?
            .code
            == 0,
        400,
        "Choose a valid branch name, without spaces or special Git syntax",
    )
}
pub(crate) fn source_file(name: &str) -> bool {
    if safe_path(name).is_err() {
        return false;
    }
    let lower = name.to_ascii_lowercase();
    !lower.split('/').any(|s| {
        matches!(
            s,
            "node_modules"
                | "target"
                | "dist"
                | "build"
                | ".next"
                | ".venv"
                | "venv"
                | ".ssh"
                | ".aws"
                | ".npmrc"
                | ".pypirc"
                | ".netrc"
                | ".git-credentials"
                | "credentials.json"
                | "id_rsa"
                | "id_ed25519"
        )
    }) && ![".pem", ".key", ".p12", ".pfx"]
        .iter()
        .any(|suffix| lower.ends_with(suffix))
}
impl Core {
    pub async fn workspace(&self) -> Result<Value> {
        probe(&self.repository).await
    }
    pub(crate) fn idle_workspace(&self) -> Result<()> {
        check(!self.stop.is_cancelled(), 503, "Server is stopping")?;
        check(
            !self.store.list()?.iter().any(|t| {
                matches!(
                    text(t, "status"),
                    "pending"
                        | "analyzing"
                        | "preparing"
                        | "working"
                        | "validating"
                        | "applying"
                        | "undoing"
                        | "recovery_required"
                )
            }),
            409,
            "Finish or cancel active changes and resolve recovery records before changing the workspace",
        )?;
        check(
            !self
                .store
                .saved_versions()?
                .iter()
                .any(|v| v["status"] == "saving"),
            409,
            "Resolve the interrupted version save before changing the workspace",
        )
    }
    pub async fn initialize_workspace(&self, input: Value) -> Result<Value> {
        let _control = self.control.lock().await;
        let _mutation = self.repository.mutation.lock().await;
        self.idle_workspace()?;
        let workspace = probe(&self.repository).await?;
        check(
            workspace["kind"] == "no_repository",
            409,
            "This folder already belongs to Git, or Git is unavailable. Refresh the workspace",
        )?;
        check(
            input["confirm"] == true,
            400,
            "Confirm enabling local version history",
        )?;
        let branch = text(&input, "branch");
        valid_branch(&self.repository, branch).await?;
        self.repository
            .git(&["init", "-b", branch], &self.repository.root, "")
            .await?;
        // These exclusions apply only to a newly initialized repository, never existing projects.
        let ignore = self.repository.root.join(".gitignore");
        let existing = fs::read_to_string(&ignore)?;
        let patterns = [
            ".env",
            ".env.*",
            "!.env.example",
            "node_modules/",
            "target/",
            "dist/",
            "build/",
            ".next/",
            ".venv/",
            "venv/",
            ".ssh/",
            ".aws/",
            "*.pem",
            "*.key",
            "*.p12",
            "*.pfx",
            ".npmrc",
            ".pypirc",
            ".netrc",
            ".git-credentials",
            "credentials.json",
            "id_rsa",
            "id_ed25519",
        ];
        let mut file = fs::OpenOptions::new().append(true).open(ignore)?;
        file.write_all(b"\n# Local credentials and generated files\n")?;
        for pattern in patterns {
            if !existing.lines().any(|line| line == pattern) {
                writeln!(file, "{pattern}")?;
            }
        }
        let result = probe(&self.repository).await?;
        self.store.emit("workspace", json!({"changed":true}));
        Ok(result)
    }
    pub async fn initial_files(&self) -> Result<Value> {
        let _control = self.control.lock().await;
        let workspace = probe(&self.repository).await?;
        check(
            workspace["kind"] == "unborn",
            409,
            "The first version is already saved, or Git needs setup",
        )?;
        let raw = self
            .repository
            .git(
                &["ls-files", "--others", "--exclude-standard", "-z"],
                &self.repository.root,
                "",
            )
            .await?;
        let mut files = vec![];
        let mut excluded = 0;
        for path in raw.split('\0').filter(|s| !s.is_empty()) {
            if !source_file(path) || self.repository.file_states(&json!([path])).await.is_err() {
                excluded += 1;
                continue;
            }
            check(
                files.len() < 200,
                409,
                "This project has more than 200 initial files. Set up its first commit in your Git client, then refresh",
            )?;
            files.push(path);
        }
        Ok(
            json!({"files":files,"excluded":excluded,"identity":crate::versions::identity(&self.repository).await?,"repository":{"branch":workspace["branch"],"head":""}}),
        )
    }
    pub async fn change_branch(&self, input: Value) -> Result<Value> {
        let _control = self.control.lock().await;
        let _mutation = self.repository.mutation.lock().await;
        self.idle_workspace()?;
        let workspace = probe(&self.repository).await?;
        check(
            matches!(text(&workspace, "kind"), "ready" | "detached"),
            409,
            "Save the first version before choosing a working branch",
        )?;
        check(
            input["expected"]["head"] == workspace["head"]
                && input["expected"]["branch"] == workspace["branch"],
            409,
            "The current branch changed. Refresh before choosing a branch",
        )?;
        check(
            text(&workspace, "operation").is_empty(),
            409,
            "Finish the current Git operation before changing branches",
        )?;
        let name = text(&input, "name");
        valid_branch(&self.repository, name).await?;
        let create = input["action"] == "create";
        check(
            create || input["action"] == "switch",
            400,
            "Choose create or switch",
        )?;
        if dirty(&workspace) {
            check(
                create,
                409,
                "Save your current files before switching branches. Your changes have been kept in this branch",
            )?;
            check(
                input["carryChanges"] == true,
                409,
                "Confirm that the existing local edits will stay with the new branch",
            )?;
            let base = json!({"head":workspace["head"],"branch":workspace["branch"]});
            check(
                crate::versions::pending(&self.repository, &self.store, &base)
                    .await?
                    .is_empty(),
                409,
                "Save or undo the applied NudgeThis corrections before creating a branch. Other editor changes can be carried with your confirmation",
            )?;
        }
        crate::versions::no_hooks(&self.repository, &["post-checkout"]).await?;
        let latest = probe(&self.repository).await?;
        check(
            latest["head"] == workspace["head"]
                && latest["branch"] == workspace["branch"]
                && latest["dirty"] == workspace["dirty"]
                && text(&latest, "operation").is_empty(),
            409,
            "Your workspace changed while preparing the switch. Refresh and try again",
        )?;
        if create {
            self.repository
                .git(
                    &["checkout", "--no-overwrite-ignore", "-b", name, "HEAD"],
                    &self.repository.root,
                    "",
                )
                .await?;
        } else {
            check(
                raw(
                    &self.repository,
                    &[
                        "show-ref",
                        "--verify",
                        "--quiet",
                        &format!("refs/heads/{name}"),
                    ],
                )
                .await?
                .code
                    == 0,
                409,
                "Choose an existing local branch",
            )?;
            self.repository
                .git(
                    &[
                        "checkout",
                        "--no-guess",
                        "--no-overwrite-ignore",
                        name,
                        "--",
                    ],
                    &self.repository.root,
                    "",
                )
                .await?;
        }
        let result = probe(&self.repository).await?;
        self.store.emit("workspace", json!({"changed":true}));
        Ok(result)
    }
}
