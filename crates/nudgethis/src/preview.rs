//! Owned local previews and explicitly reviewed package operations, separate from agents.
use crate::{core::Core, error::check, project, workspace::text};
use anyhow::Result;
use axum::{
    Router,
    extract::{Request, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use std::{
    fs,
    hash::{Hash, Hasher},
    path::{Component, Path},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU16, Ordering},
    },
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;

struct Review {
    id: String,
    created: Instant,
    action: String,
    fingerprint: u64,
    data: Value,
}
struct Running {
    cancel: CancellationToken,
    task: tokio::task::JoinHandle<()>,
}
#[derive(Default)]
struct Control {
    review: Option<Review>,
    running: Option<Running>,
}
#[derive(Default)]
pub struct Preview {
    control: tokio::sync::Mutex<Control>,
    state: Mutex<Value>,
    port: AtomicU16,
}
impl Preview {
    pub fn origin(&self) -> Option<String> {
        let port = self.port.load(Ordering::Relaxed);
        (port > 0).then(|| format!("http://127.0.0.1:{port}"))
    }
    fn set(&self, status: &str, message: &str) {
        *self.state.lock().unwrap() = json!({"status":status,"message":message});
    }
    pub async fn close(&self) {
        let mut control = self.control.lock().await;
        if let Some(run) = control.running.take() {
            run.cancel.cancel();
            let _ = tokio::time::timeout(Duration::from_secs(8), run.task).await;
        }
        self.port.store(0, Ordering::Relaxed);
        self.set("stopped", "Your preview is stopped. Files are kept.");
    }
}
fn fingerprint(root: &Path) -> Result<u64> {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for name in [
        "package.json",
        "package-lock.json",
        ".npmrc",
        "vite.config.ts",
        "vite.config.js",
        "vite.config.mjs",
        "astro.config.ts",
        "astro.config.mjs",
        "nudgethis.toml",
        ".nudgethis/starter.json",
    ] {
        let path = root.join(name);
        name.hash(&mut h);
        match fs::symlink_metadata(&path) {
            Ok(m) => {
                check(
                    m.is_file() && !m.file_type().is_symlink() && m.len() <= 2_097_152,
                    409,
                    "Project configuration must be regular files up to 2 MiB",
                )?;
                fs::read(path)?.hash(&mut h);
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(h.finish())
}
fn recipe(root: &Path) -> Result<Value> {
    let metadata = root.join(".nudgethis/starter.json");
    let starter: Value = if metadata.is_file() {
        check(
            fs::metadata(&metadata)?.len() <= 4096,
            409,
            "Invalid starter metadata",
        )?;
        serde_json::from_str(&fs::read_to_string(metadata)?)?
    } else {
        Value::Null
    };
    if starter["template"] == "website" {
        return Ok(
            json!({"kind":"website","supported":true,"dependenciesReady":true,"description":"Built-in local website preview. No package installation or project command is needed."}),
        );
    }
    let project = project::inspect(root)?;
    let frameworks = project["frameworks"].as_array().unwrap();
    let kind = if frameworks.iter().any(|v| v == "Astro") {
        "astro"
    } else if frameworks.iter().any(|v| v == "Vite") {
        "vite"
    } else {
        "unsupported"
    };
    let package: Value = if root.join("package.json").is_file() {
        serde_json::from_str(&fs::read_to_string(root.join("package.json"))?)?
    } else {
        json!({})
    };
    let script = text(&package["scripts"], "dev");
    let supported =
        kind != "unsupported" && project["packageManager"] == "npm" && !script.trim().is_empty();
    Ok(
        json!({"kind":kind,"supported":supported,"script":script,"dependenciesReady":root.join("node_modules").join(if kind=="astro" {"astro"} else {"vite"}).join("package.json").is_file(),"description":if supported {"The preview runs this project's dev script on localhost. Review the command before starting."}else{"Use your existing development server. Managed commands currently support npm projects with an Astro or Vite dev script."},"project":project}),
    )
}
impl Core {
    pub fn preview_status(&self) -> Result<Value> {
        let mut state = self.preview.state.lock().unwrap().clone();
        if !state.is_object() {
            state =
                json!({"status":"stopped","message":"Start a local preview when you are ready."});
        }
        let recipe = recipe(&self.repository.root)?;
        if state["status"] == "running"
            && let Some(origin) = self.preview.origin()
        {
            state["url"] = format!("{origin}/#token={}", self.token).into();
        }
        Ok(
            json!({"state":state,"recipe":recipe,"nodeAvailable":project::executable("node"),"npmAvailable":project::executable("npm"),"commandsBlocked":std::env::var("NUDGETHIS_DISABLE_EXECUTION").as_deref()==Ok("1")}),
        )
    }
    pub async fn preview_review(&self, input: Value) -> Result<Value> {
        let action = text(&input, "action");
        check(
            ["install", "start", "restart"].contains(&action),
            400,
            "Choose install, start or restart",
        )?;
        let mut control = self.preview.control.lock().await;
        let recipe = recipe(&self.repository.root)?;
        check(
            recipe["supported"] == true,
            409,
            text(&recipe, "description"),
        )?;
        let static_site = recipe["kind"] == "website";
        check(
            !static_site || action != "install",
            400,
            "This starter does not need package installation",
        )?;
        if !static_site {
            check(
                std::env::var("NUDGETHIS_DISABLE_EXECUTION").as_deref() != Ok("1"),
                403,
                "Project commands are disabled by NUDGETHIS_DISABLE_EXECUTION. The built-in website preview remains available",
            )?;
            check(
                project::executable("node") && project::executable("npm"),
                409,
                "Install Node.js 22.12 or newer with npm, restart NudgeThis, then return here",
            )?;
            let node = crate::process::run(
                "node",
                &["--version".into()],
                &self.repository.root,
                b"",
                5000,
                &self.stop,
            )
            .await?;
            let version: Vec<u64> = node
                .stdout
                .trim()
                .trim_start_matches('v')
                .split('.')
                .filter_map(|s| s.parse().ok())
                .collect();
            check(
                node.code == 0
                    && version.len() == 3
                    && (version[0] > 22 || (version[0] == 22 && version[1] >= 12)),
                409,
                "This starter needs Node.js 22.12 or newer. Update Node.js and restart NudgeThis",
            )?;
            if action != "install" {
                check(
                    recipe["dependenciesReady"] == true,
                    409,
                    "Install this project's dependencies first",
                )?;
            }
        }
        let install = if self.repository.root.join("package-lock.json").is_file() {
            "npm ci --ignore-scripts --no-audit --no-fund"
        } else {
            "npm install --ignore-scripts --no-audit --no-fund"
        };
        let command = if static_site {
            "Built-in Rust file server".into()
        } else if action == "install" {
            install.into()
        } else {
            format!(
                "npm --ignore-scripts run dev -- --host 127.0.0.1 --port <available port>{}",
                if recipe["kind"] == "vite" {
                    " --strictPort"
                } else {
                    ""
                }
            )
        };
        let data = json!({"id":format!("{:032x}",rand::random::<u128>()),"action":action,"command":command,"script":recipe["script"],"kind":recipe["kind"],"folder":self.repository.root,"network":action=="install","note":if action=="install"{"Downloads packages into this project. Dependency lifecycle scripts are disabled; packages requiring them may need manual setup. No global packages are installed."}else if static_site{"Serves this folder's public website files locally. Stop closes only this preview."}else{"Runs your project's dev script, which can execute code. The process and its children are owned by NudgeThis and stopped with this preview."},"expiresInSeconds":600});
        control.review = Some(Review {
            id: text(&data, "id").into(),
            created: Instant::now(),
            action: action.into(),
            fingerprint: fingerprint(&self.repository.root)?,
            data: data.clone(),
        });
        Ok(data)
    }
    pub async fn preview_action(self: &Arc<Self>, input: Value, server_port: u16) -> Result<Value> {
        if input["action"] == "stop" {
            self.preview.close().await;
            return self.preview_status();
        }
        check(
            input["confirm"] == true,
            400,
            "Confirm the preview operation after reviewing it",
        )?;
        let mut control = self.preview.control.lock().await;
        let review = control
            .review
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Review this preview operation first"))?;
        check(
            review.id == text(&input, "previewId")
                && review.created.elapsed().as_secs() < 600
                && review.fingerprint == fingerprint(&self.repository.root)?,
            409,
            "The review expired or the project configuration changed. Review again",
        )?;
        let action = review.action.clone();
        let kind = text(&review.data, "kind").to_owned();
        if let Some(run) = control.running.as_ref() {
            check(
                run.task.is_finished()
                    || (action == "restart"
                        && self.preview.state.lock().unwrap()["status"] == "running"),
                409,
                "Stop the current preview or installation before continuing",
            )?;
        }
        if let Some(run) = control.running.take() {
            run.cancel.cancel();
            let _ = tokio::time::timeout(Duration::from_secs(8), run.task).await;
        }
        self.preview.port.store(0, Ordering::Relaxed);
        if kind != "website" {
            check(
                std::env::var("NUDGETHIS_DISABLE_EXECUTION").as_deref() != Ok("1"),
                403,
                "Project commands are disabled",
            )?;
        }
        control.review = None;
        let cancel = self.stop.child_token();
        let owned_cancel = cancel.clone();
        let core = self.clone();
        self.preview.set(
            if action == "install" {
                "installing"
            } else {
                "starting"
            },
            if action == "install" {
                "Installing project dependencies…"
            } else {
                "Starting your local preview…"
            },
        );
        let task = tokio::spawn(async move {
            let result = if kind == "website" {
                serve_static(core.clone(), server_port, &owned_cancel).await
            } else {
                run_project(core.clone(), &action, &kind, server_port, &owned_cancel).await
            };
            core.preview.port.store(0, Ordering::Relaxed);
            match result {
                Ok(()) => {
                    if !owned_cancel.is_cancelled() && action == "install" {
                        core.preview.set(
                            "stopped",
                            "Dependencies installed. Your preview is ready to start.",
                        );
                    } else {
                        core.preview
                            .set("stopped", "Your preview is stopped. Files are kept.");
                    }
                }
                Err(e) => {
                    core.preview.set("failed", &format!("{e}"));
                }
            }
        });
        control.running = Some(Running { cancel, task });
        drop(control);
        self.preview_status()
    }
}
async fn run_project(
    core: Arc<Core>,
    action: &str,
    kind: &str,
    server_port: u16,
    cancel: &CancellationToken,
) -> Result<()> {
    let root = &core.repository.root;

    let port = if action == "install" {
        0
    } else {
        let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
        listener.local_addr()?.port()
    };
    let args: Vec<String> = if action == "install" {
        vec![
            if root.join("package-lock.json").is_file() {
                "ci"
            } else {
                "install"
            }
            .into(),
            "--ignore-scripts".into(),
            "--no-audit".into(),
            "--no-fund".into(),
        ]
    } else {
        let mut a = vec![
            "--ignore-scripts".into(),
            "run".into(),
            "dev".into(),
            "--".into(),
            "--host".into(),
            "127.0.0.1".into(),
            "--port".into(),
            port.to_string(),
        ];
        if kind == "vite" {
            a.push("--strictPort".into());
        }
        a
    };
    let address = format!("http://127.0.0.1:{server_port}");
    let env = [
        ("VITE_NUDGETHIS_SERVER", address.as_str()),
        ("PUBLIC_NUDGETHIS_SERVER", address.as_str()),
        ("ASTRO_TELEMETRY_DISABLED", "1"),
        ("ASTRO_DEV_BACKGROUND", "0"),
        ("ASTRO_PREVIEW_BACKGROUND", "0"),
        ("NO_COLOR", "1"),
    ];
    #[cfg(windows)]
    let executable = "npm.cmd";
    #[cfg(not(windows))]
    let executable = "npm";
    let process = crate::process::run_scoped(
        executable,
        &args,
        root,
        b"",
        if action == "install" {
            600_000
        } else {
            86_400_000
        },
        cancel,
        &env,
        &[
            "GH_TOKEN",
            "GITHUB_TOKEN",
            "GH_ENTERPRISE_TOKEN",
            "GITHUB_ENTERPRISE_TOKEN",
        ],
    );
    tokio::pin!(process);
    if action == "install" {
        let result = process.await?;
        check(
            result.code == 0,
            409,
            "Dependency installation failed. Check Node.js, network access and package permissions, then retry. Files were kept",
        )?;
        return Ok(());
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(1))
        .build()?;
    let deadline = Instant::now();
    let mut ready = false;
    loop {
        tokio::select! {
            result=&mut process=>{if cancel.is_cancelled(){return Ok(());}let _output=result?;anyhow::bail!("The preview command exited. Its dev script must keep the server in the foreground. Review the script and dependencies before retrying");},
            _=tokio::time::sleep(Duration::from_millis(300)),if !ready=>{
                if client.get(format!("http://127.0.0.1:{port}/")).send().await.is_ok_and(|r|r.status().is_success()) {ready=true;core.preview.port.store(port,Ordering::Relaxed);core.preview.set("running","Your local preview is ready.");}
                else if deadline.elapsed()>Duration::from_secs(60){cancel.cancel();let _=process.await;anyhow::bail!("The preview did not become ready within a minute. Check the dev script, port and dependencies");}
            }
        }
    }
}
#[derive(Clone)]
struct StaticSite {
    root: std::path::PathBuf,
    port: u16,
    server_port: u16,
}
async fn serve_static(core: Arc<Core>, server_port: u16, cancel: &CancellationToken) -> Result<()> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let state = StaticSite {
        root: core.repository.root.clone(),
        port,
        server_port,
    };
    let token = cancel.clone();
    core.preview.port.store(port, Ordering::Relaxed);
    core.preview.set(
        "running",
        "Your local website is ready. Reload after editing its files.",
    );
    axum::serve(
        listener,
        Router::new().fallback(static_file).with_state(state),
    )
    .with_graceful_shutdown(async move { token.cancelled().await })
    .await?;
    Ok(())
}
async fn static_file(State(site): State<StaticSite>, req: Request) -> Response {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if host != format!("127.0.0.1:{}", site.port) && host != format!("localhost:{}", site.port) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if req.method() != axum::http::Method::GET {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let relative = req.uri().path().trim_start_matches('/');
    let relative = if relative.is_empty() {
        "index.html"
    } else {
        relative
    };
    if relative.contains(['%', '\\'])
        || !Path::new(relative)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
        || crate::git::safe_path(relative).is_err()
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    let path = site.root.join(relative);
    if !path.is_file()
        || !dunce::canonicalize(&path).is_ok_and(|p| p == path)
        || !fs::metadata(&path).is_ok_and(|m| m.len() <= 16_777_216)
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    let mime = match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let Ok(mut bytes) = fs::read(&path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if mime.starts_with("text/html") {
        let source = String::from_utf8_lossy(&bytes);
        let bridge = format!(
            "<script type=\"module\" src=\"http://127.0.0.1:{}/starter-bridge.js\"></script>",
            site.server_port
        );
        bytes = if let Some(i) = source.to_ascii_lowercase().rfind("</body>") {
            format!("{}{}{}", &source[..i], bridge, &source[i..]).into_bytes()
        } else {
            format!("{source}{bridge}").into_bytes()
        };
    }
    (
        [
            (header::CONTENT_TYPE, mime),
            (header::CACHE_CONTROL, "no-store"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            (header::REFERRER_POLICY, "no-referrer"),
        ],
        bytes,
    )
        .into_response()
}
