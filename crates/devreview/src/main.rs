mod appearance;
#[cfg(test)]
mod application_tests;
mod config;
mod core;
mod error;
mod git;
mod process;
mod project;
mod project_context;
mod route_review;
mod server;
mod store;

use anyhow::{Result, ensure};
use clap::{Parser, Subcommand};
use std::{io::Write, path::PathBuf};
#[derive(Parser)]
#[command(version, about = "Local visual feedback and isolated coding agents")]
struct Cli {
    #[arg(long, global = true, default_value = ".")]
    root: PathBuf,
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    /// Create devreview.toml and ignore local state. Does not overwrite configuration.
    Init,
    /// Inspect setup without executing project commands or contacting providers.
    Doctor,
    /// Start the loopback-only Rust server.
    Start {
        #[arg(long)]
        port: Option<u16>,
        #[arg(long)]
        no_execution: bool,
    },
    /// Stop this repository's server and its running agents.
    Stop,
    Status,
    Tasks,
    Task {
        id: String,
    },
    Apply {
        id: String,
    },
    Undo {
        id: String,
    },
    Reject {
        id: String,
    },
    Retry {
        id: String,
    },
    Cancel {
        id: String,
    },
    /// Deterministic demo in a disposable repository. No model or account needed.
    Demo {
        #[arg(long, default_value_t = 7331)]
        port: u16,
    },
    #[command(hide = true)]
    AgentRun,
    #[command(hide = true)]
    DemoAgent,
}
#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("{e:#}");
        std::process::exit(1);
    }
}
async fn run() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::AgentRun => {
            ensure!(
                std::env::var("NUDGETHIS_DISABLE_EXECUTION").as_deref() != Ok("1"),
                "Execution is disabled"
            );
            devreview_agent_runtime::run_stdio().await
        }
        Command::DemoAgent => {
            ensure!(
                std::env::var("NUDGETHIS_DISABLE_EXECUTION").as_deref() != Ok("1"),
                "Execution is disabled"
            );
            demo_agent()?;
        }
        Command::Init => init(&cli.root)?,
        Command::Doctor => println!(
            "{}",
            serde_json::to_string_pretty(&project::doctor(
                &cli.root,
                &config::Config::load(&cli.root)?
            )?)?
        ),
        Command::Start { port, no_execution } => {
            let mut config = config::Config::load(&cli.root)?;
            if no_execution {
                config.execution.enabled = false;
            }
            if let Some(port) = port {
                config.server.port = port;
            }
            start(&cli.root, config).await?;
        }
        Command::Demo { port } => {
            ensure!(
                std::env::var("NUDGETHIS_DISABLE_EXECUTION").as_deref() != Ok("1"),
                "Execution is disabled"
            );
            demo(port).await?;
        }
        command => {
            let cfg = config::Config::load(&cli.root)?;
            let token = std::fs::read_to_string(cli.root.join(".devreview/token"))?;
            let (path, post) = match command {
                Command::Stop => ("shutdown".into(), true),
                Command::Status => ("status".into(), false),
                Command::Tasks => ("tasks".into(), false),
                Command::Task { id } => (format!("tasks/{id}"), false),
                Command::Apply { id } => (format!("tasks/{id}/apply"), true),
                Command::Undo { id } => (format!("tasks/{id}/undo"), true),
                Command::Reject { id } => (format!("tasks/{id}/reject"), true),
                Command::Retry { id } => (format!("tasks/{id}/retry"), true),
                Command::Cancel { id } => (format!("tasks/{id}/cancel"), true),
                _ => unreachable!(),
            };
            let client = reqwest::Client::builder()
                .no_proxy()
                .timeout(std::time::Duration::from_secs(130))
                .build()?;
            let url = format!("http://127.0.0.1:{}/api/{path}", cfg.server.port);
            let request = if post {
                client.post(url).json(&serde_json::json!({}))
            } else {
                client.get(url)
            };
            let response = request.bearer_auth(token.trim()).send().await?;
            let status = response.status();
            let value: serde_json::Value = response.json().await?;
            ensure!(
                status.is_success(),
                "{}",
                value["error"].as_str().unwrap_or("Request failed")
            );
            println!("{}", serde_json::to_string_pretty(&value)?);
        }
    }
    Ok(())
}
fn init(root: &std::path::Path) -> Result<()> {
    let path = root.join("devreview.toml");
    for file in [&path, &root.join(".gitignore")] {
        if let Ok(metadata) = std::fs::symlink_metadata(file) {
            anyhow::ensure!(
                metadata.is_file() && !metadata.file_type().is_symlink(),
                "Configuration and ignore files must be regular files"
            );
        }
    }
    if !path.exists() {
        let contents = toml::to_string_pretty(&project::suggested_config(root)?)?;
        let mut file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)?;
        file.write_all(contents.as_bytes())?;
    }
    let ignore = root.join(".gitignore");
    let text = std::fs::read_to_string(&ignore).unwrap_or_default();
    if !text
        .lines()
        .any(|l| matches!(l.trim(), ".devreview/" | "/.devreview/"))
    {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(ignore)?;
        file.write_all(b"\n.devreview/\n")?;
    }
    println!(
        "Configuration ready. Review the detected setup and validation commands in devreview.toml. Run devreview doctor for a read-only diagnosis."
    );
    Ok(())
}
async fn start(root: &std::path::Path, config: config::Config) -> Result<()> {
    let port = config.server.port;
    let core = core::Core::open(root, config).await?;
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    let port = listener.local_addr()?.port();
    println!(
        "DevReview Rust server\nDashboard: http://127.0.0.1:{port}/#token={}\nPlayground: http://127.0.0.1:{port}/playground#token={}\nPress Ctrl+C to stop.",
        core.token, core.token
    );
    let stop = core.stop.clone();
    tokio::spawn(async move {
        #[cfg(unix)]
        {
            let mut term =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("signal handler");
            tokio::select! {_=tokio::signal::ctrl_c()=>{},_=term.recv()=>{}}
        }
        #[cfg(not(unix))]
        {
            let _ = tokio::signal::ctrl_c().await;
        }
        stop.cancel();
    });
    let result = server::serve(core.clone(), listener).await;
    core.close().await;
    result
}
async fn demo(port: u16) -> Result<()> {
    let root = std::env::temp_dir().join(format!(
        "devreview-demo-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_millis()
    ));
    std::fs::create_dir(&root)?;
    let result=async {
        std::fs::write(root.join(".gitignore"),".devreview/\n")?; std::fs::write(root.join("button.css"),".button { color: red; border-radius: 4px; }\n")?;
        let repo=git::Repository::new(root.clone(),root.join(".devreview"));
        repo.git(&["init","-b","main"],&root,"").await?; repo.git(&["add","."],&root,"").await?;
        repo.git(&["-c","user.name=DevReview Demo","-c","user.email=demo@example.invalid","-c","commit.gpgsign=false","commit","-m","Demo fixture"],&root,"").await?;
        let mut cfg=config::Config::default(); cfg.server.port=port; cfg.default_agent="demo".into();
        cfg.agents=vec![config::Agent {id:"demo".into(),label:"Demo (predefined button fix)".into(),transport:"stdio".into(),command:std::env::current_exe()?.to_string_lossy().into(),args:vec!["demo-agent".into()],model:None,timeout:10_000}];
        println!("Disposable demo: {}. The demo agent makes a predefined change to button.css; it is not a model.",root.display());
        start(&root,cfg).await
    }.await;
    let _ = std::fs::remove_dir_all(root);
    result
}
fn demo_agent() -> Result<()> {
    use std::io::Read;
    let mut input = String::new();
    std::io::stdin().take(262_145).read_to_string(&mut input)?;
    let value: serde_json::Value = serde_json::from_str(&input)?;
    let attempt = value["task"]["attempt"].as_u64().unwrap_or(1);
    std::fs::write(
        "button.css",
        format!(
            ".button {{ color: green; border-radius: {}px; }}\n",
            if attempt == 1 { 8 } else { 14 }
        ),
    )?;
    println!(
        "{}",
        serde_json::json!({"type":"message","text":"Updated button.css in the isolated worktree. This is a predefined demonstration. Review the diff before applying."})
    );
    Ok(())
}
