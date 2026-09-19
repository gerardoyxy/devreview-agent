//! Explicit local commits of reviewed, applied revisions. Never stages unrelated work or pushes.
use crate::{
    core::Core,
    error::{Error, check},
    git::{Repository, safe_path},
    process,
    store::{Store, now},
};
use anyhow::Result;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::Instant,
};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub(crate) struct Plan {
    created: Instant,
    dir: PathBuf,
    data: Value,
    changes: Vec<Value>,
    after: Value,
    index_hash: String,
}
fn conflict(message: &str) -> anyhow::Error {
    Error {
        status: 409,
        message: message.into(),
    }
    .into()
}
fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or("")
}
fn key(v: &Value) -> String {
    format!("{}:{}", text(v, "id"), v["attempt"])
}
fn change_summary(v: &Value) -> Value {
    json!({"id":v["id"],"attempt":v["attempt"],"request":v["request"],"files":v["files"],"validationStatus":v["validationStatus"]})
}
fn public_record(mut record: Value) -> Value {
    for field in ["indexBefore", "indexAfter", "indexPath", "tree", "parent"] {
        record.as_object_mut().unwrap().remove(field);
    }
    record
}
impl Store {
    pub fn applied_revisions(&self) -> Result<Vec<Value>> {
        let db = self.db.lock().unwrap();
        let mut query = db.prepare("SELECT task_id,data FROM revisions WHERE json_extract(data,'$.status')='applied' ORDER BY json_extract(data,'$.undo.at'),task_id,attempt")?;
        query
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .map(|row| {
                let (id, data) = row?;
                let mut value: Value = serde_json::from_str(&data)?;
                value["id"] = id.into();
                Ok(value)
            })
            .collect()
    }
    pub fn saved_versions(&self) -> Result<Vec<Value>> {
        let db = self.db.lock().unwrap();
        let mut query = db.prepare(
            "SELECT data FROM saved_versions ORDER BY json_extract(data,'$.at') DESC,id",
        )?;
        query
            .query_map([], |r| r.get::<_, String>(0))?
            .map(|row| Ok(serde_json::from_str(&row?)?))
            .collect()
    }
    pub fn record_version(&self, value: &Value) -> Result<()> {
        self.db.lock().unwrap().execute("INSERT INTO saved_versions(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",rusqlite::params![text(value,"id"),value.to_string()])?;
        self.emit("versions", json!({"changed":true}));
        Ok(())
    }
    pub fn revision_saved(&self, id: &str, attempt: &Value) -> Result<bool> {
        Ok(self.revision_save_status(id, attempt)?.is_some())
    }
    pub fn revision_save_status(&self, id: &str, attempt: &Value) -> Result<Option<String>> {
        Ok(self
            .saved_versions()?
            .iter()
            .find(|v| {
                matches!(text(v, "status"), "saved" | "saving")
                    && v["changes"].as_array().is_some_and(|rows| {
                        rows.iter()
                            .any(|c| c["id"] == id && c["attempt"] == *attempt)
                    })
            })
            .map(|v| text(v, "status").to_owned()))
    }
}
async fn plain(repo: &Repository, args: &[&str]) -> Result<process::Output> {
    process::run(
        "git",
        &args.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>(),
        &repo.root,
        b"",
        15_000,
        &CancellationToken::new(),
    )
    .await
}
async fn config(repo: &Repository, key: &str) -> Result<String> {
    let result = plain(repo, &["config", "--get", key]).await?;
    check(
        result.code == 0 || result.code == 1,
        409,
        "Cannot read Git configuration",
    )?;
    Ok(result.stdout.trim().to_owned())
}
async fn identity(repo: &Repository) -> Result<Value> {
    Ok(json!({"name":config(repo,"user.name").await?,"email":config(repo,"user.email").await?}))
}
fn validate_identity(value: &Value) -> Result<()> {
    let name = text(value, "name").trim();
    let email = text(value, "email").trim();
    check(
        !name.is_empty()
            && name.len() <= 160
            && !name.chars().any(|c| c.is_control() || "<>".contains(c)),
        400,
        "Enter the name to show on this version",
    )?;
    check(
        email.len() <= 254
            && email.contains('@')
            && !email.starts_with('@')
            && !email.ends_with('@')
            && !email
                .chars()
                .any(|c| c.is_whitespace() || c.is_control() || "<>".contains(c)),
        400,
        "Enter a valid author email. A GitHub private email is also supported",
    )
}
async fn git_path(repo: &Repository, name: &str) -> Result<PathBuf> {
    let result = plain(repo, &["rev-parse", "--git-path", name]).await?;
    check(result.code == 0, 409, "Cannot locate Git metadata")?;
    let path = PathBuf::from(result.stdout.trim());
    Ok(if path.is_absolute() {
        path
    } else {
        repo.root.join(path)
    })
}
async fn index_hash(repo: &Repository, path: &Path) -> Result<String> {
    let meta = fs::symlink_metadata(path)?;
    check(
        meta.is_file() && !meta.file_type().is_symlink(),
        409,
        "Git index must be a regular file",
    )?;
    Ok(repo
        .git(
            &["hash-object", "--no-filters", path.to_str().unwrap()],
            &repo.root,
            "",
        )
        .await?
        .trim()
        .to_owned())
}
async fn ready(repo: &Repository) -> Result<()> {
    for name in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
        "BISECT_START",
    ] {
        check(
            !git_path(repo, name).await?.exists(),
            409,
            "Finish the current merge, rebase or other Git operation before saving a version",
        )?;
    }
    check(
        repo.git(&["ls-files", "--unmerged"], &repo.root, "")
            .await?
            .is_empty(),
        409,
        "Resolve the conflicting files before saving a version",
    )?;
    let hooks = git_path(repo, "hooks").await?;
    for name in [
        "pre-commit",
        "prepare-commit-msg",
        "commit-msg",
        "post-commit",
        "reference-transaction",
    ] {
        let path = hooks.join(name);
        if let Ok(meta) = fs::metadata(path) {
            #[cfg(unix)]
            let active = {
                use std::os::unix::fs::PermissionsExt;
                meta.is_file() && meta.permissions().mode() & 0o111 != 0
            };
            #[cfg(not(unix))]
            let active = meta.is_file();
            check(
                !active,
                409,
                "This repository uses commit hooks. Save through your Git client so those checks can run; NudgeThis will not bypass them",
            )?;
        }
    }
    // Custom hooksPath is resolved by rev-parse --git-path hooks, without our normal hooks override.
    let split = plain(repo, &["rev-parse", "--shared-index-path"]).await?;
    check(
        split.code == 0 && split.stdout.trim().is_empty(),
        409,
        "Turn off Git split index before using Save version",
    )
}
async fn entries(
    repo: &Repository,
    tree: &str,
    files: &[String],
) -> Result<BTreeMap<String, Value>> {
    let mut args = vec!["ls-tree", "-z", tree, "--"];
    args.extend(files.iter().map(String::as_str));
    let raw = repo.git(&args, &repo.root, "").await?;
    let mut result = BTreeMap::new();
    for entry in raw.split('\0').filter(|s| !s.is_empty()) {
        let (meta, path) = entry
            .split_once('\t')
            .ok_or_else(|| anyhow::anyhow!("Invalid tree entry"))?;
        let parts: Vec<_> = meta.split_whitespace().collect();
        check(
            parts.len() == 3 && matches!(parts[0], "100644" | "100755") && parts[1] == "blob",
            409,
            "Symlinks and submodules need manual review",
        )?;
        result.insert(path.into(), json!({"gitHash":parts[2],"mode":parts[0]}));
    }
    Ok(result)
}
fn matches_entry(entry: Option<&Value>, state: &Value) -> bool {
    match entry {
        None => state.is_null(),
        Some(e) => {
            !state.is_null()
                && e["gitHash"] == state["gitHash"]
                && (state["mode"].is_null() || e["mode"] == state["mode"])
        }
    }
}
async fn pending(repo: &Repository, store: &Store, state: &Value) -> Result<Vec<Value>> {
    let records = store.saved_versions()?;
    let saved: BTreeSet<_> = records
        .iter()
        .filter(|v| matches!(text(v, "status"), "saved" | "saving"))
        .flat_map(|v| v["changes"].as_array().into_iter().flatten().map(key))
        .collect();
    let changes: Vec<_> = store
        .applied_revisions()?
        .into_iter()
        .filter(|v| {
            v["baseBranch"] == state["branch"]
                && !saved.contains(&key(v))
                && v["undo"]["after"].is_object()
        })
        .collect();
    let files: BTreeSet<_> = changes
        .iter()
        .flat_map(|v| {
            v["files"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::to_owned)
        })
        .collect();
    if files.is_empty() {
        return Ok(vec![]);
    }
    let head = entries(
        repo,
        text(state, "head"),
        &files.into_iter().collect::<Vec<_>>(),
    )
    .await?;
    // Revisions already included by an external commit no longer need a reminder.
    let mut covered = BTreeMap::new();
    for (i, change) in changes.iter().enumerate() {
        for (path, after) in change["undo"]["after"].as_object().unwrap() {
            if matches_entry(head.get(path), after) {
                covered.insert(path.clone(), i);
            }
        }
    }
    Ok(changes
        .into_iter()
        .enumerate()
        .filter(|(i, c)| {
            c["files"]
                .as_array()
                .unwrap()
                .iter()
                .any(|p| covered.get(p.as_str().unwrap()).is_none_or(|n| n < i))
        })
        .map(|(_, c)| c)
        .collect())
}
async fn apply_to_index(repo: &Repository, index: &Path, changes: &[Value]) -> Result<String> {
    let env = [("GIT_INDEX_FILE", index.to_str().unwrap())];
    for change in changes {
        repo.git_env(&["apply","--cached","--binary","--whitespace=nowarn","-"],&repo.root,text(change,"diff"),&env).await
            .map_err(|_|conflict("These corrections depend on other changes. Select their earlier applied corrections together, then review again"))?;
    }
    Ok(repo
        .git_env(&["write-tree"], &repo.root, "", &env)
        .await?
        .trim()
        .into())
}
impl Core {
    pub async fn versions(&self) -> Result<Value> {
        let _control = self.control.lock().await;
        self.reconcile_versions().await?;
        let state = self.repository.inspect().await?;
        let pending = pending(&self.repository, &self.store, &state).await?;
        let history = self.store.saved_versions()?;
        Ok(
            json!({"repository":state,"pending":pending.iter().map(change_summary).collect::<Vec<_>>(),"history":history.into_iter().map(public_record).collect::<Vec<_>>(),"identity":identity(&self.repository).await?}),
        )
    }
    pub async fn preview_version(&self, input: Value) -> Result<Value> {
        let _control = self.control.lock().await;
        let _mutation = self.repository.mutation.lock().await;
        self.reconcile_versions().await?;
        check(
            !self
                .store
                .saved_versions()?
                .iter()
                .any(|v| text(v, "status") == "saving"),
            409,
            "An interrupted save needs attention before another version can be saved",
        )?;
        ready(&self.repository).await?;
        let selected = input["changes"]
            .as_array()
            .ok_or_else(|| conflict("Choose applied changes to save"))?;
        check(
            !selected.is_empty() && selected.len() <= 50,
            400,
            "Choose between 1 and 50 applied changes",
        )?;
        let keys: BTreeSet<_> = selected.iter().map(key).collect();
        check(
            keys.len() == selected.len(),
            400,
            "Select each correction once",
        )?;
        let state = self.repository.inspect().await?;
        let changes: Vec<_> = pending(&self.repository, &self.store, &state)
            .await?
            .into_iter()
            .filter(|v| keys.contains(&key(v)))
            .collect();
        check(
            changes.len() == keys.len(),
            409,
            "The selected changes are no longer pending on this branch. Refresh the list",
        )?;
        let plan = prepare(&self.repository, changes, state).await?;
        let result = plan.data.clone();
        let mut previews = self.version_previews.lock().unwrap();
        previews.retain(|_, p| {
            let keep = p.created.elapsed().as_secs() < 600;
            if !keep {
                let _ = fs::remove_dir_all(&p.dir);
            }
            keep
        });
        if previews.len() >= 12 {
            let _ = fs::remove_dir_all(&plan.dir);
            check(
                false,
                409,
                "Several reviews are already open. Wait a few minutes before opening another",
            )?;
        }
        previews.insert(text(&result, "id").into(), plan);
        Ok(result)
    }
    pub async fn save_version(&self, input: Value) -> Result<Value> {
        let _control = self.control.lock().await;
        let _mutation = self.repository.mutation.lock().await;
        self.reconcile_versions().await?;
        let id = text(&input, "previewId");
        if let Some(record) = self
            .store
            .saved_versions()?
            .into_iter()
            .find(|r| text(r, "id") == id)
        {
            check(
                text(&record, "status") == "saved",
                409,
                "This save needs attention. Refresh Saved versions before trying again",
            )?;
            return Ok(public_record(record));
        }
        check(
            !self
                .store
                .saved_versions()?
                .iter()
                .any(|v| text(v, "status") == "saving"),
            409,
            "An interrupted save needs attention before another version can be saved",
        )?;
        let plan = self
            .version_previews
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| conflict("Review these changes again before saving"))?;
        check(
            plan.created.elapsed().as_secs() < 600,
            409,
            "This review expired. Review the changes again",
        )?;
        let message = text(&input, "message").trim();
        check(
            !message.is_empty() && message.len() <= 240 && !message.chars().any(char::is_control),
            400,
            "Give this version a short name of up to 240 bytes, on one line",
        )?;
        validate_identity(&input["identity"])?;
        ready(&self.repository).await?;
        let current = self.store.applied_revisions()?;
        check(
            plan.changes
                .iter()
                .all(|c| current.iter().any(|now| key(now) == key(c) && now == c)),
            409,
            "An applied correction changed after your review. Review again",
        )?;
        let record = save(
            &self.repository,
            &self.store,
            &plan,
            message,
            &input["identity"],
        )
        .await?;
        self.version_previews.lock().unwrap().remove(id);
        let _ = fs::remove_dir_all(&plan.dir);
        Ok(public_record(record))
    }
    async fn reconcile_versions(&self) -> Result<()> {
        for mut record in self
            .store
            .saved_versions()?
            .into_iter()
            .filter(|r| text(r, "status") == "saving")
        {
            let repo = &self.repository;
            let branch = format!("refs/heads/{}", text(&record, "branch"));
            let Ok(head) = repo
                .git(&["rev-parse", "--verify", &branch], &repo.root, "")
                .await
            else {
                continue;
            };
            let index = git_path(repo, "index").await?;
            let Ok(hash) = index_hash(repo, &index).await else {
                continue;
            };
            if head.trim() == text(&record, "commit") && hash == text(&record, "indexAfter") {
                record["status"] = "saved".into();
                record.as_object_mut().unwrap().remove("error");
                self.store.record_version(&record)?;
            } else if head.trim() == text(&record, "parent")
                && hash == text(&record, "indexBefore")
                && !index.with_file_name("index.lock").exists()
            {
                record["status"] = "failed".into();
                record["error"] =
                    "The interrupted save did not create a version. Review your changes again."
                        .into();
                self.store.record_version(&record)?;
            }
        }
        Ok(())
    }
}

async fn prepare(repo: &Repository, changes: Vec<Value>, state: Value) -> Result<Plan> {
    let mut before = serde_json::Map::new();
    let mut after = serde_json::Map::new();
    for change in &changes {
        check(
            !text(change, "diff").is_empty(),
            409,
            "This correction has no patch to save",
        )?;
        for path in change["files"].as_array().unwrap() {
            let path = path.as_str().unwrap();
            safe_path(path)?;
            let initial = &change["undo"]["before"][path];
            let final_state = &change["undo"]["after"][path];
            if let Some(previous) = after.get(path) {
                check(
                    previous == initial,
                    409,
                    "Some selected corrections have other edits between them. Include their earlier corrections or review the files in your Git client",
                )?;
            } else {
                before.insert(path.into(), initial.clone());
            }
            after.insert(path.into(), final_state.clone());
        }
    }
    let files: Vec<_> = after.keys().cloned().collect();
    check(
        !files.is_empty() && files.len() <= 200,
        400,
        "Save up to 200 files at a time",
    )?;
    let head = entries(repo, text(&state, "head"), &files).await?;
    for path in &files {
        check(
            matches_entry(head.get(path), &before[path]),
            409,
            &format!(
                "{path} includes earlier edits or has already been committed. Include the earlier applied corrections, or review it in your Git client"
            ),
        )?;
    }
    let files = json!(files);
    let after = Value::Object(after);
    check(
        repo.file_states(&files).await? == after,
        409,
        "Some files changed after Apply. Review those newer edits before saving this version",
    )?;
    let index_path = git_path(repo, "index").await?;
    let index_hash = index_hash(repo, &index_path).await?;
    let paths: Vec<_> = files
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p.as_str().unwrap())
        .collect();
    let mut args = vec!["diff", "--cached", "--quiet", "HEAD", "--"];
    args.extend(paths);
    repo.git(&args,&repo.root,"").await.map_err(|_|conflict("Some selected files are already staged in another Git tool. Review them there before saving this version"))?;
    let id = format!("{:032x}", rand::random::<u128>());
    let dir = repo.state.join(format!("version-{id}"));
    fs::create_dir(&dir)?;
    let result=async {
        let index=dir.join("preview-index");let env=[("GIT_INDEX_FILE",index.to_str().unwrap())];
        repo.git_env(&["read-tree",text(&state,"head")],&repo.root,"",&env).await?;
        let tree=apply_to_index(repo,&index,&changes).await?;
        let actual=entries(repo,&tree,&files.as_array().unwrap().iter().map(|p|p.as_str().unwrap().to_owned()).collect::<Vec<_>>()).await?;
        check(after.as_object().unwrap().iter().all(|(p,s)|matches_entry(actual.get(p),s)),409,"The selected patches do not reproduce the applied files. Review them again")?;
        let diff=repo.git(&["diff","--binary","--no-ext-diff","--no-textconv","--no-renames",text(&state,"head"),&tree,"--"],&repo.root,"").await?;
        check(!diff.is_empty() && diff.len()<=524_288,409,"Choose a smaller non-empty set of changes to review (up to 512 KiB of patch)")?;
        let changed=repo.git(&["diff","--name-only","-z","--no-renames",text(&state,"head"),&tree,"--"],&repo.root,"").await?;
        check(changed.split('\0').filter(|s|!s.is_empty()).all(|p|after.get(p).is_some()),409,"Patch includes files outside the selected corrections")?;
        check(repo.inspect().await?==state && repo.file_states(&files).await?==after && self_hash(repo,&index_path).await?==index_hash,409,"The workspace changed while preparing this review. Try again")?;
        let title=if changes.len()==1 {text(&changes[0],"request").split_whitespace().collect::<Vec<_>>().join(" ").chars().take(120).collect::<String>()} else {format!("Save {} reviewed changes",changes.len())};
        let data=json!({"id":id,"repository":state,"tree":tree,"files":files,"changes":changes.iter().map(change_summary).collect::<Vec<_>>(),"diff":diff,"suggestedMessage":title,"identity":identity(repo).await?,"expiresInSeconds":600});
        Ok(Plan{created:Instant::now(),dir:dir.clone(),data,changes,after,index_hash})
    }.await;
    if result.is_err() {
        let _ = fs::remove_dir_all(dir);
    }
    result
}
async fn self_hash(repo: &Repository, path: &Path) -> Result<String> {
    index_hash(repo, path).await
}

struct IndexLock {
    path: PathBuf,
    file: Option<fs::File>,
    remove: bool,
}
impl Drop for IndexLock {
    fn drop(&mut self) {
        self.file.take();
        if self.remove {
            let _ = fs::remove_file(&self.path);
        }
    }
}
async fn save(
    repo: &Repository,
    store: &Store,
    plan: &Plan,
    message: &str,
    author: &Value,
) -> Result<Value> {
    let state = &plan.data["repository"];
    let files = &plan.data["files"];
    check(
        repo.inspect().await? == *state && repo.file_states(files).await? == plan.after,
        409,
        "Your branch or files changed since review. Review again before saving",
    )?;
    let index = git_path(repo, "index").await?;
    let lock_path = index.with_file_name("index.lock");
    let lock = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|_| {
            conflict("Git is busy. Finish the operation in your other Git tool and try again")
        })?;
    let mut guard = IndexLock {
        path: lock_path,
        file: Some(lock),
        remove: true,
    };
    check(
        index_hash(repo, &index).await? == plan.index_hash,
        409,
        "Your staged changes changed since review. Review again",
    )?;
    let next_index = plan.dir.join("next-index");
    fs::copy(&index, &next_index)?;
    apply_to_index(repo, &next_index, &plan.changes).await?;
    let final_hash = index_hash(repo, &next_index).await?;
    let author_name = text(author, "name").trim();
    let author_email = text(author, "email").trim();
    let env = [
        ("GIT_AUTHOR_NAME", author_name),
        ("GIT_AUTHOR_EMAIL", author_email),
        ("GIT_COMMITTER_NAME", author_name),
        ("GIT_COMMITTER_EMAIL", author_email),
    ];
    let signing = plain(repo, &["config", "--bool", "--get", "commit.gpgSign"]).await?;
    check(
        signing.code == 0 || signing.code == 1,
        409,
        "Cannot read Git signing configuration",
    )?;
    let mut args = vec![
        "commit-tree",
        text(&plan.data, "tree"),
        "-p",
        text(state, "head"),
    ];
    if signing.stdout.trim() == "true" {
        args.push("-S");
    }
    let commit = repo
        .git_env(&args, &repo.root, &format!("{message}\n"), &env)
        .await.map_err(|_| conflict("Git could not create this version. Check your author and commit signing configuration in your Git client, then retry"))?
        .trim()
        .to_owned();
    check(
        repo.inspect().await? == *state
            && repo.file_states(files).await? == plan.after
            && index_hash(repo, &index).await? == plan.index_hash,
        409,
        "Your workspace changed while saving. No version was added; review again",
    )?;
    let mut record = json!({"id":plan.data["id"],"status":"saving","commit":commit,"branch":state["branch"],"parent":state["head"],"tree":plan.data["tree"],"message":message,"identity":{"name":author_name,"email":author_email},"at":now(),"changes":plan.data["changes"],"files":files,"indexBefore":plan.index_hash,"indexAfter":final_hash,"error":"A save was interrupted. Inspect Git status and the saved commit before retrying. No automatic history rewrite will be performed."});
    store.record_version(&record)?;
    let bytes = fs::read(&next_index)?;
    guard.file.as_mut().unwrap().write_all(&bytes)?;
    guard.file.as_ref().unwrap().sync_all()?;
    guard.file.take();
    let branch = format!("refs/heads/{}", text(state, "branch"));
    // An interrupted ref update may have succeeded. Preserve the index until its outcome is known.
    guard.remove = false;
    if repo
        .git_env(
            &[
                "update-ref",
                "-m",
                &format!("commit: {message}"),
                &branch,
                &commit,
                text(state, "head"),
            ],
            &repo.root,
            "",
            &env,
        )
        .await
        .is_err()
    {
        let head = repo
            .git(&["rev-parse", "--verify", &branch], &repo.root, "")
            .await?;
        if head.trim() != commit {
            if head.trim() == text(state, "head") {
                guard.remove = true;
                record["status"] = "failed".into();
                record["error"] =
                    "Git could not update the branch. Review the changes again.".into();
                store.record_version(&record)?;
            }
            return Err(conflict(
                "Git could not finish saving. Open Saved versions to inspect the result before retrying",
            ));
        }
    }
    fs::rename(&guard.path, &index)?;
    record["status"] = "saved".into();
    record.as_object_mut().unwrap().remove("error");
    store.record_version(&record)?;
    Ok(record)
}
