//! Filesystem, Git and persistence checks. No coding agents or models are executed.
use crate::{config::Config, core::validate_input, git::Repository, project, store::Store};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

pub(crate) struct Temp(pub(crate) PathBuf);
impl Temp {
    pub(crate) fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("nudgethis-application-{}", rand::random::<u64>()));
        fs::create_dir(&path).unwrap();
        Self(dunce::canonicalize(path).unwrap())
    }
    pub(crate) fn write(&self, name: &str, data: impl AsRef<[u8]>) {
        let path = self.0.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, data).unwrap();
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
pub(crate) async fn repo() -> (Temp, Repository) {
    let dir = Temp::new();
    let repository = Repository::new(dir.0.clone(), dir.0.join(".nudgethis"));
    repository
        .git(&["init", "-b", "main"], &dir.0, "")
        .await
        .unwrap();
    repository
        .git(&["config", "core.autocrlf", "false"], &dir.0, "")
        .await
        .unwrap();
    dir.write(".gitignore", ".nudgethis/\n");
    dir.write("example.txt", "original\n");
    dir.write("other.txt", "untouched\n");
    repository
        .git(&["add", "--", "."], &dir.0, "")
        .await
        .unwrap();
    repository
        .git(
            &[
                "-c",
                "user.name=Application Test",
                "-c",
                "user.email=test@example.invalid",
                "-c",
                "commit.gpgSign=false",
                "commit",
                "-m",
                "Initial source",
            ],
            &dir.0,
            "",
        )
        .await
        .unwrap();
    fs::create_dir(&repository.state).unwrap();
    (dir, repository)
}
async fn task(repository: &Repository) -> Value {
    let mut task = repository.snapshot().await.unwrap();
    task["id"] = "QA-1".into();
    task
}
async fn collect(repository: &Repository, task: &mut Value) {
    let patch = repository.collect(task).await.unwrap();
    task.as_object_mut()
        .unwrap()
        .extend(patch.as_object().unwrap().clone());
}

#[test]
fn detection_uses_metadata_and_respects_declared_manager() {
    let dir = Temp::new();
    dir.write("package.json", r#"{"packageManager":"bun@1.2.0","dependencies":{"vue":"3","@angular/core":"20","react":"19"},"scripts":{"test":"this-command-must-never-run","build":"also-never-run"}}"#);
    dir.write("bun.lock", "");
    dir.write("package-lock.json", "{}");
    dir.write("Cargo.toml", "");
    let report = project::inspect(&dir.0).unwrap();
    assert_eq!(report["packageManager"], "bun");
    assert_eq!(
        report["suggestedSetup"],
        json!(["bun install --frozen-lockfile"])
    );
    assert_eq!(
        report["suggestedValidation"],
        json!(["bun run test", "bun run build"])
    );
    assert_eq!(report["frameworks"], json!(["React", "Vue", "Angular"]));
    assert!(!report["warnings"].as_array().unwrap().is_empty());
    let doctor = project::doctor(&dir.0, &Config::default()).unwrap();
    assert_eq!(doctor["agents"][0]["authentication"], "not checked");
}

#[test]
fn general_requests_validate_paths_and_strip_url_secrets() {
    let input = validate_input(json!({"request":"Update the API","kind":"backend","draft":true,"references":["src/api.rs","src/api.rs"]})).unwrap();
    assert_eq!(input["context"]["selector"], "");
    assert_eq!(input["references"], json!(["src/api.rs"]));
    let input = validate_input(json!({"request":"Change","context":{"url":"https://user:pass@example.com/page?token=secret#secret","sourceVerified":true}})).unwrap();
    assert_eq!(input["context"]["url"], "https://example.com/page");
    assert_eq!(input["context"]["sourceVerified"], false);
    for path in [
        "../outside",
        ".git/config",
        ".env",
        "a/.env.local",
        "C:/outside",
        "a\\b",
        "a\nb",
    ] {
        assert!(
            validate_input(json!({"request":"Change","references":[path]})).is_err(),
            "{path}"
        );
    }
    assert!(validate_input(json!({"request":"x".repeat(8001)})).is_err());
    assert!(validate_input(json!({"request":"Change","kind":"invalid"})).is_err());
}

#[tokio::test]
async fn snapshot_preserves_index_branch_and_uncommitted_source() {
    let (dir, repository) = repo().await;
    dir.write("example.txt", "staged\n");
    repository
        .git(&["add", "--", "example.txt"], &dir.0, "")
        .await
        .unwrap();
    dir.write("example.txt", "unsaved-to-git\n");
    dir.write("new file.txt", "untracked\n");
    let index = fs::read(dir.0.join(".git/index")).unwrap();
    let original = repository.inspect().await.unwrap();
    let task = task(&repository).await;
    assert_eq!(task["snapshotIncludesLocalChanges"], true);
    assert_eq!(repository.inspect().await.unwrap(), original);
    assert_eq!(fs::read(dir.0.join(".git/index")).unwrap(), index);
    let worktree = repository.prepare(&task).await.unwrap();
    assert_eq!(
        fs::read_to_string(worktree.join("example.txt")).unwrap(),
        "unsaved-to-git\n"
    );
    assert_eq!(
        fs::read_to_string(worktree.join("new file.txt")).unwrap(),
        "untracked\n"
    );
    repository.cleanup("QA-1").await.unwrap();
}

#[tokio::test]
async fn apply_undo_preserve_local_edits_and_refuse_later_work() {
    let (dir, repository) = repo().await;
    dir.write("example.txt", "local baseline\n");
    let mut task = task(&repository).await;
    let worktree = repository.prepare(&task).await.unwrap();
    fs::write(worktree.join("example.txt"), "requested change\n").unwrap();
    collect(&repository, &mut task).await;
    dir.write("other.txt", "independent edit\n");
    let index = fs::read(dir.0.join(".git/index")).unwrap();
    let before = repository.check_apply(&task).await.unwrap();
    let after = repository.apply(&task, &before).await.unwrap();
    task["undo"] = json!({"before":before,"after":after});
    assert_eq!(
        fs::read_to_string(dir.0.join("example.txt")).unwrap(),
        "requested change\n"
    );
    dir.write("example.txt", "later work\n");
    assert!(
        repository
            .undo(&task)
            .await
            .unwrap_err()
            .to_string()
            .contains("newer work")
    );
    assert_eq!(
        fs::read_to_string(dir.0.join("example.txt")).unwrap(),
        "later work\n"
    );
    dir.write("example.txt", "requested change\n");
    repository.undo(&task).await.unwrap();
    assert_eq!(
        fs::read_to_string(dir.0.join("example.txt")).unwrap(),
        "local baseline\n"
    );
    assert_eq!(
        fs::read_to_string(dir.0.join("other.txt")).unwrap(),
        "independent edit\n"
    );
    assert_eq!(fs::read(dir.0.join(".git/index")).unwrap(), index);
    repository.cleanup("QA-1").await.unwrap();
}

#[tokio::test]
async fn apply_conflicts_do_not_write_files() {
    let (dir, repository) = repo().await;
    let mut task = task(&repository).await;
    let worktree = repository.prepare(&task).await.unwrap();
    fs::write(worktree.join("example.txt"), "patch\n").unwrap();
    collect(&repository, &mut task).await;
    dir.write("example.txt", "newer edit\n");
    assert!(repository.check_apply(&task).await.is_err());
    assert_eq!(
        fs::read_to_string(dir.0.join("example.txt")).unwrap(),
        "newer edit\n"
    );
    dir.write("example.txt", "original\n");
    let before = repository.check_apply(&task).await.unwrap();
    dir.write("example.txt", "changed between check and apply\n");
    assert!(repository.apply(&task, &before).await.is_err());
    repository
        .git(&["switch", "-c", "another"], &dir.0, "")
        .await
        .unwrap();
    assert!(
        repository
            .check_apply(&task)
            .await
            .unwrap_err()
            .to_string()
            .contains("branch")
    );
    repository.cleanup("QA-1").await.unwrap();
}

#[tokio::test]
async fn binary_add_delete_and_undo_round_trip() {
    let (dir, repository) = repo().await;
    let mut task = task(&repository).await;
    let worktree = repository.prepare(&task).await.unwrap();
    fs::write(worktree.join("new.bin"), [0, 255, 12, 0, 100]).unwrap();
    fs::remove_file(worktree.join("example.txt")).unwrap();
    collect(&repository, &mut task).await;
    let before = repository.check_apply(&task).await.unwrap();
    let after = repository.apply(&task, &before).await.unwrap();
    task["undo"] = json!({"before":before,"after":after});
    assert!(!dir.0.join("example.txt").exists());
    assert_eq!(
        fs::read(dir.0.join("new.bin")).unwrap(),
        [0, 255, 12, 0, 100]
    );
    repository.undo(&task).await.unwrap();
    assert!(!dir.0.join("new.bin").exists());
    assert_eq!(
        fs::read_to_string(dir.0.join("example.txt")).unwrap(),
        "original\n"
    );
    repository.cleanup("QA-1").await.unwrap();
}

#[tokio::test]
async fn snapshot_refuses_secrets_and_symlinks() {
    let (dir, repository) = repo().await;
    dir.write(".env", "not-a-real-secret\n");
    assert!(repository.snapshot().await.is_err());
    fs::remove_file(dir.0.join(".env")).unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink("other.txt", dir.0.join("link")).unwrap();
        assert!(repository.snapshot().await.is_err());
    }
}

#[tokio::test]
async fn apply_undo_preserve_crlf_working_files() {
    let (dir, repository) = repo().await;
    repository
        .git(&["config", "core.autocrlf", "true"], &dir.0, "")
        .await
        .unwrap();
    dir.write("example.txt", "original\r\n");
    let mut task = task(&repository).await;
    let worktree = repository.prepare(&task).await.unwrap();
    fs::write(worktree.join("example.txt"), "changed\r\n").unwrap();
    collect(&repository, &mut task).await;
    let before = repository.check_apply(&task).await.unwrap();
    let after = repository.apply(&task, &before).await.unwrap();
    task["undo"] = json!({"before":before,"after":after});
    assert_eq!(fs::read(dir.0.join("example.txt")).unwrap(), b"changed\r\n");
    repository.undo(&task).await.unwrap();
    assert_eq!(
        fs::read(dir.0.join("example.txt")).unwrap(),
        b"original\r\n"
    );
    repository.cleanup("QA-1").await.unwrap();
}

#[test]
fn persistence_keeps_drafts_and_marks_interrupted_mutations() {
    let dir = Temp::new();
    let path = dir.0.join("tasks.sqlite");
    let store = Store::open(&path).unwrap();
    let draft = store
        .create(validate_input(json!({"request":"Draft","draft":true})).unwrap())
        .unwrap();
    assert_eq!(draft["status"], "draft");
    for status in ["applying", "undoing", "preparing"] {
        let task = store
            .create(validate_input(json!({"request":status,"draft":true})).unwrap())
            .unwrap();
        store
            .update(
                task["id"].as_str().unwrap(),
                json!({"status":status,"undo":{"before":{"file":null}}}),
            )
            .unwrap();
    }
    drop(store);
    let store = Store::open(&path).unwrap();
    assert_eq!(store.get("QA-1").unwrap()["status"], "draft");
    assert_eq!(store.get("QA-2").unwrap()["status"], "recovery_required");
    assert_eq!(store.get("QA-3").unwrap()["status"], "recovery_required");
    assert_eq!(store.get("QA-4").unwrap()["status"], "failed");
    assert_eq!(
        store.get("QA-2").unwrap()["undo"]["before"],
        json!({"file":null})
    );
    drop(store);
}

#[tokio::test]
async fn process_environment_is_scoped_and_pre_cancelled_commands_do_not_start() {
    use tokio_util::sync::CancellationToken;
    let dir = Temp::new();
    let token = CancellationToken::new();
    let result = crate::process::run_env(
        "git",
        &["var".into(), "GIT_AUTHOR_IDENT".into()],
        &dir.0,
        &[],
        5000,
        &token,
        &[
            ("GIT_AUTHOR_NAME", "Scoped Test"),
            ("GIT_AUTHOR_EMAIL", "test@example.invalid"),
        ],
    )
    .await
    .unwrap();
    assert_eq!(result.code, 0);
    assert!(
        result
            .stdout
            .starts_with("Scoped Test <test@example.invalid>")
    );
    token.cancel();
    assert!(
        crate::process::run("this-must-not-start", &[], &dir.0, &[], 100, &token)
            .await
            .unwrap_err()
            .to_string()
            .contains("Cancelled")
    );
}
