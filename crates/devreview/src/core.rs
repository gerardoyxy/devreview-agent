use crate::{config::Config, error::check, git::Repository, process, store::Store};
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tokio::sync::{Notify, watch};
use tokio_util::sync::CancellationToken;

struct Active {
    cancel: CancellationToken,
    done: watch::Receiver<bool>,
}
pub struct Core {
    pub config: Config,
    pub repository: Repository,
    pub store: Store,
    pub token: String,
    control: tokio::sync::Mutex<()>,
    active: Mutex<HashMap<String, Active>>,
    wake: Notify,
    pub stop: CancellationToken,
    _lock: Lock,
}
struct Lock(PathBuf);
impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
fn private_create(path: &Path) -> Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    Ok(options.open(path)?)
}
impl Core {
    pub async fn open(root: &Path, config: Config) -> Result<Arc<Self>> {
        config.validate()?;
        let root = dunce::canonicalize(root)?;
        let state = root.join(".devreview");
        if !state.exists() {
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(false);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(&state)?;
        }
        ensure!(
            dunce::canonicalize(&state)? == state,
            ".devreview must be a real directory inside the repository"
        );
        let lock_path = state.join("server.lock");
        let mut lock = private_create(&lock_path).map_err(|e| anyhow::anyhow!("Cannot acquire server lock. Stop any other server; after a crash, verify it is stopped before removing .devreview/server.lock: {e}"))?;
        let guard = Lock(lock_path);
        writeln!(lock, "{}", std::process::id())?;
        drop(lock);
        let repository = Repository::new(root, state.clone());
        repository.inspect().await?;
        repository.git(&["check-ignore","--quiet","--no-index",".devreview/token"],&repository.root,"").await.map_err(|_| anyhow::anyhow!("Ignore .devreview/ before starting. Run devreview init, then commit the configuration."))?;
        // Refuse symlinked state files before opening secrets or SQLite.
        for name in [
            "token",
            "tasks.sqlite",
            "tasks.sqlite-wal",
            "tasks.sqlite-shm",
        ] {
            if let Ok(meta) = std::fs::symlink_metadata(state.join(name)) {
                ensure!(
                    !meta.file_type().is_symlink(),
                    "State files cannot be symlinks"
                );
            }
        }
        let token_path = state.join("token");
        let token = if token_path.exists() {
            std::fs::read_to_string(token_path)?.trim().into()
        } else {
            use rand::RngCore;
            let mut bytes = [0u8; 32];
            rand::rng().fill_bytes(&mut bytes);
            let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
            private_create(&token_path)?.write_all(token.as_bytes())?;
            token
        };
        ensure!(
            token.len() == 64 && token.bytes().all(|b| b.is_ascii_hexdigit()),
            "Invalid local token file"
        );
        let store = Store::open(&state.join("tasks.sqlite"))?;
        Ok(Arc::new(Self {
            config,
            repository,
            store,
            token,
            control: tokio::sync::Mutex::new(()),
            active: Mutex::new(HashMap::new()),
            wake: Notify::new(),
            stop: CancellationToken::new(),
            _lock: guard,
        }))
    }
    pub fn start(self: &Arc<Self>) {
        let core = self.clone();
        tokio::spawn(async move {
            loop {
                {
                    let _lock = core.control.lock().await;
                    if core.stop.is_cancelled() {
                        break;
                    }
                    match core.store.list() {
                        Ok(tasks) => {
                            for task in tasks.into_iter().rev() {
                                if core.active.lock().unwrap().len()
                                    >= core.config.workers.max_concurrent
                                {
                                    break;
                                }
                                let id = task["id"].as_str().unwrap().to_owned();
                                if task["status"] != "pending"
                                    || core.active.lock().unwrap().contains_key(&id)
                                {
                                    continue;
                                }
                                let cancel = core.stop.child_token();
                                let (done, rx) = watch::channel(false);
                                core.active.lock().unwrap().insert(
                                    id.clone(),
                                    Active {
                                        cancel: cancel.clone(),
                                        done: rx,
                                    },
                                );
                                let worker = core.clone();
                                tokio::spawn(async move {
                                    if let Err(error) = worker.execute(task, cancel.clone()).await {
                                        let _ = worker.store.update(&id,json!({"status":if cancel.is_cancelled() {"cancelled"} else {"failed"},"error":format!("{error:#}")}));
                                    }
                                    worker.active.lock().unwrap().remove(&id);
                                    let _ = done.send(true);
                                    worker.wake.notify_one();
                                });
                            }
                        }
                        Err(error) => eprintln!("Queue error: {error:#}"),
                    }
                }
                tokio::select! { _ = core.wake.notified() => {}, _ = core.stop.cancelled() => break }
            }
        });
    }
    pub async fn close(&self) {
        self.stop.cancel();
        let _lock = self.control.lock().await;
        let receivers: Vec<_> = self
            .active
            .lock()
            .unwrap()
            .values()
            .map(|a| a.done.clone())
            .collect();
        for mut done in receivers {
            while !*done.borrow() {
                if done.changed().await.is_err() {
                    break;
                }
            }
        }
    }
    pub async fn submit(&self, mut input: Value) -> Result<Value> {
        let _lock = self.control.lock().await;
        check(!self.stop.is_cancelled(), 503, "Server is stopping")?;
        let id = input["agent"]
            .as_str()
            .unwrap_or(&self.config.default_agent)
            .to_owned();
        check(
            self.config.agents.iter().any(|a| a.id == id),
            400,
            "Agent is not configured",
        )?;
        input["agent"] = id.into();
        input["projectContext"] = crate::project_context::snapshot(
            &self.store.project_context()?,
            input.get("contextIds"),
        )?;
        input.as_object_mut().unwrap().remove("contextIds");
        input.as_object_mut().unwrap().extend(
            self.repository
                .snapshot()
                .await?
                .as_object()
                .unwrap()
                .clone(),
        );
        let task = self.store.create(input)?;
        self.wake.notify_one();
        Ok(task)
    }
    async fn execute(self: &Arc<Self>, task: Value, cancel: CancellationToken) -> Result<()> {
        let id = task["id"].as_str().unwrap().to_owned();
        self.store.update(&id, json!({"status":"analyzing"}))?;
        let cwd = if task["continueWorktree"] == true {
            self.repository.continued(&task).await?
        } else {
            self.repository.prepare(&task).await?
        };
        ensure!(!cancel.is_cancelled(), "Task cancelled");
        self.store.update(&id, json!({"status":"working"}))?;
        let agent = self
            .config
            .agents
            .iter()
            .find(|a| task["agent"] == a.id)
            .ok_or_else(|| anyhow::anyhow!("Agent no longer configured"))?;
        let history = self.store.messages(&id)?;
        let before = history.len();
        let mut recent = Vec::new();
        let mut bytes = 0;
        for message in history.into_iter().rev() {
            bytes += message["content"].as_str().unwrap_or("").len();
            if bytes > 128_000 {
                break;
            }
            recent.push(message);
        }
        recent.reverse();
        let envelope = json!({"id":id,"request":task["request"],"context":task["context"],"attempt":task["attempt"],"agent":task["agent"],"messages":recent,"projectContext":task["projectContext"]});
        let request = serde_json::from_value(
            json!({"protocolVersion":1,"transport":agent.transport,"command":agent.command,"args":agent.args,"model":agent.model,"timeoutMs":agent.timeout,"cwd":cwd,"task":envelope}),
        )?;
        let worker = self.clone();
        let task_id = id.clone();
        let cancelled = cancel.clone();
        let callback_error = Arc::new(Mutex::new(None));
        let sink_error = callback_error.clone();
        devreview_agent_runtime::run(
            request,
            Arc::new(move |event| {
                if cancelled.is_cancelled() {
                    return;
                }
                let result = if event["type"] == "message" {
                    let text: String = event["text"]
                        .as_str()
                        .unwrap_or("")
                        .chars()
                        .take(32_000)
                        .collect();
                    if text.trim().is_empty() {
                        Ok(())
                    } else {
                        worker.store.message(&task_id, "assistant", &text)
                    }
                } else if event["type"] == "result" {
                    worker
                        .store
                        .update(
                            &task_id,
                            json!({"output":event["output"],"agentErrors":event["stderr"]}),
                        )
                        .map(|_| ())
                } else {
                    Ok(())
                };
                if let Err(error) = result {
                    *sink_error.lock().unwrap() = Some(error.to_string());
                }
            }),
            cancel.cancelled(),
        )
        .await?;
        if let Some(error) = callback_error.lock().unwrap().take() {
            anyhow::bail!(error);
        }
        ensure!(!cancel.is_cancelled(), "Task cancelled");
        let patch = self.repository.collect(&task).await?;
        if patch["diff"] == "" {
            let response = self.store.messages(&id)?.len() > before;
            let mut update = patch;
            update["status"] = if response {
                "awaiting_feedback"
            } else {
                "failed"
            }
            .into();
            update["error"] = if response {
                Value::Null
            } else {
                "The agent produced no changes or response".into()
            };
            self.store.update(&id, update)?;
            return Ok(());
        }
        let mut update = patch.clone();
        update["status"] = "validating".into();
        self.store.update(&id, update)?;
        let mut checks = vec![];
        for command in &self.config.validation.commands {
            let start = std::time::Instant::now();
            let result =
                process::shell(command, &cwd, self.config.validation.timeout, &cancel).await;
            let (code, output) = match result {
                Ok(r) => (r.code, format!("{}{}", r.stdout, r.stderr)),
                Err(e) => (1, format!("{e:#}")),
            };
            checks.push(json!({"command":command,"passed":code==0,"code":code,"durationMs":start.elapsed().as_millis() as u64,"output":output}));
            self.store.update(&id, json!({"validation":checks}))?;
            ensure!(!cancel.is_cancelled(), "Task cancelled");
            ensure!(
                code == 0,
                "Validation failed. Review command output and retry."
            );
        }
        ensure!(!cancel.is_cancelled(), "Task cancelled");
        ensure!(
            self.repository.collect(&task).await?["diff"] == patch["diff"],
            "Validation changed source files. Inspect the worktree before retrying."
        );
        self.store
            .update(&id, json!({"status":"ready","validation":checks}))?;
        Ok(())
    }
    pub async fn message(
        &self,
        id: &str,
        content: &str,
        attempt: Option<u64>,
        context_ids: Option<&Value>,
    ) -> Result<Value> {
        let _lock = self.control.lock().await;
        check(!self.stop.is_cancelled(), 503, "Server is stopping")?;
        check(
            !content.trim().is_empty() && content.chars().count() <= 8000,
            400,
            "Message must contain 1-8000 characters",
        )?;
        let task = self.store.get(id)?;
        check_attempt(&task, attempt)?;
        check(
            !self.active.lock().unwrap().contains_key(id)
                && matches!(
                    task["status"].as_str().unwrap_or(""),
                    "ready" | "awaiting_feedback" | "failed" | "cancelled" | "applied" | "rejected"
                ),
            409,
            "Wait for the agent to finish, or retry a conflicting task before sending a follow-up.",
        )?;
        // Freeze explicit new selections before mutating the conversation. Omission keeps its previous snapshot.
        let project_context = context_ids
            .map(|ids| crate::project_context::snapshot(&self.store.project_context()?, Some(ids)))
            .transpose()?;
        let fresh = matches!(
            task["status"].as_str().unwrap_or(""),
            "applied" | "rejected"
        ) || !self.repository.worktree(id)?.exists();
        let mut patch = reset(&task);
        if fresh {
            self.repository.cleanup(id).await?;
            patch.as_object_mut().unwrap().extend(
                self.repository
                    .snapshot()
                    .await?
                    .as_object()
                    .unwrap()
                    .clone(),
            );
        } else {
            self.repository.continued(&task).await?;
        }
        patch["continueWorktree"] = (!fresh).into();
        if let Some(value) = project_context {
            patch["projectContext"] = value;
        }
        self.store.archive(&task)?;
        self.store.update(id, patch)?;
        self.store.message(id, "user", content.trim())?;
        self.store.update(id, json!({"status":"pending"}))?;
        self.wake.notify_one();
        self.store.details(id)
    }
    pub async fn action(&self, id: &str, action: &str, attempt: Option<u64>) -> Result<Value> {
        let _lock = self.control.lock().await;
        check(!self.stop.is_cancelled(), 503, "Server is stopping")?;
        let task = self.store.get(id)?;
        check_attempt(&task, attempt)?;
        let status = task["status"].as_str().unwrap_or("");
        if action == "cancel" {
            check(
                matches!(status, "pending" | "analyzing" | "working" | "validating"),
                409,
                "Task cannot be cancelled in its current state",
            )?;
            let active = self
                .active
                .lock()
                .unwrap()
                .get(id)
                .map(|a| (a.cancel.clone(), a.done.clone()));
            if let Some((cancel, mut done)) = active {
                cancel.cancel();
                while !*done.borrow() {
                    if done.changed().await.is_err() {
                        break;
                    }
                }
            }
            if self.store.get(id)?["status"] != "cancelled" {
                self.store
                    .update(id, json!({"status":"cancelled","error":"Task cancelled"}))?;
            }
            return self.store.get(id);
        }
        check(
            !self.active.lock().unwrap().contains_key(id),
            409,
            "Wait for the running task to stop",
        )?;
        match action {
            "apply" => {
                check(status == "ready", 409, "Only ready tasks can be applied")?;
                self.store.update(id, json!({"status":"applying"}))?;
                if let Err(error) = self.repository.apply(&task).await {
                    self.store
                        .update(id, json!({"status":"conflict","error":error.to_string()}))?;
                    return Err(error);
                }
                self.store
                    .update(id, json!({"status":"applied","error":null}))?;
                if let Err(error) = self.repository.cleanup(id).await {
                    self.store
                        .update(id, json!({"cleanupWarning":error.to_string()}))?;
                }
            }
            "retry" => {
                check(
                    matches!(
                        status,
                        "failed"
                            | "conflict"
                            | "cancelled"
                            | "rejected"
                            | "ready"
                            | "awaiting_feedback"
                    ),
                    409,
                    "Task cannot be retried in its current state",
                )?;
                let snapshot = self.repository.snapshot().await?;
                self.repository.cleanup(id).await?;
                self.store.archive(&task)?;
                let mut patch = reset(&task);
                patch
                    .as_object_mut()
                    .unwrap()
                    .extend(snapshot.as_object().unwrap().clone());
                patch["status"] = "pending".into();
                patch["continueWorktree"] = false.into();
                self.store.update(id, patch)?;
                self.wake.notify_one();
            }
            "reject" | "delete" => {
                check(
                    !matches!(status, "applied" | "applying"),
                    409,
                    "An applied task cannot be rejected or deleted",
                )?;
                self.repository.cleanup(id).await?;
                if action == "delete" {
                    self.store.delete(id)?;
                    return Ok(json!({"id":id,"deleted":true}));
                }
                self.store.update(id, json!({"status":"rejected"}))?;
            }
            _ => check(false, 404, "Unknown action")?,
        }
        self.store.get(id)
    }
}
fn reset(task: &Value) -> Value {
    json!({"attempt":task["attempt"].as_u64().unwrap_or(1)+1,"diff":"","files":[],"validation":[],"output":"","agentErrors":"","error":null,"cleanupWarning":null})
}
fn check_attempt(task: &Value, attempt: Option<u64>) -> Result<()> {
    check(
        attempt.is_none_or(|a| task["attempt"] == a),
        409,
        "This task has a newer version. Review it before continuing.",
    )
}
pub fn validate_input(input: Value) -> Result<Value> {
    let request: String = input["request"]
        .as_str()
        .unwrap_or("")
        .trim()
        .chars()
        .take(8000)
        .collect();
    check(!request.is_empty(), 400, "Describe the change you need")?;
    let source = &input["context"];
    check(source.is_object(), 400, "Element context is required")?;
    let mut context = json!({});
    for (key, max) in [
        ("url", 2000),
        ("route", 1000),
        ("selector", 1000),
        ("tagName", 80),
        ("text", 1000),
        ("testId", 200),
        ("ariaLabel", 200),
        ("source", 1000),
        ("domSnippet", 4000),
    ] {
        context[key] = source[key]
            .as_str()
            .unwrap_or("")
            .chars()
            .take(max)
            .collect::<String>()
            .into();
    }
    check(context["tagName"] != "", 400, "Element tagName is required")?;
    let url = url::Url::parse(context["url"].as_str().unwrap());
    check(url.is_ok(), 400, "A valid HTTP page URL is required")?;
    let mut url = url?;
    check(
        matches!(url.scheme(), "http" | "https"),
        400,
        "A valid HTTP page URL is required",
    )?;
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    context["url"] = url.as_str().into();
    context["route"] = url.path().into();
    for (key, fields) in [
        ("viewport", vec!["width", "height"]),
        ("boundingBox", vec!["x", "y", "width", "height"]),
    ] {
        context[key] = json!({});
        for field in fields {
            context[key][field] = source[key][field]
                .as_f64()
                .unwrap_or(0.)
                .clamp(-100_000., 100_000.)
                .into();
        }
    }
    let mut result = json!({"request":request,"context":context});
    if let Some(agent) = input.get("agent") {
        check(
            agent.as_str().is_some_and(crate::config::valid_id),
            400,
            "Invalid agent ID",
        )?;
        result["agent"] = agent.clone();
    }
    if let Some(ids) = input.get("contextIds") {
        crate::project_context::validate_ids(ids)?;
        result["contextIds"] = ids.clone();
    }
    Ok(result)
}
