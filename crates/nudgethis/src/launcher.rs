//! Portable welcome launcher; uses the existing local browser UI rather than a separate runtime.
use crate::{config::Config, core::Core, error::check, project};
use anyhow::Result;
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    time::Duration,
};
use tokio_util::sync::CancellationToken;

fn default_library() -> Result<PathBuf> {
    if let Some(path) = std::env::var_os("NUDGETHIS_LIBRARY_DIR") {
        let path = PathBuf::from(path);
        check(
            path.is_absolute(),
            400,
            "NUDGETHIS_LIBRARY_DIR must be absolute",
        )?;
        return Ok(path);
    }
    let profile = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .ok_or_else(|| anyhow::anyhow!("Choose a library folder with --library"))?;
    Ok(PathBuf::from(profile).join("NudgeThis"))
}
pub fn open_browser(url: &str) -> Result<()> {
    let parsed = url::Url::parse(url)?;
    check(
        parsed.scheme() == "http" && parsed.host_str() == Some("127.0.0.1"),
        400,
        "Only the local welcome can be opened",
    )?;
    #[cfg(windows)]
    let mut command = {
        let mut c = Command::new("rundll32.exe");
        c.arg("url.dll,FileProtocolHandler").arg(url);
        c
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = Command::new("open");
        c.arg(url);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    Ok(())
}
pub async fn welcome(library: Option<PathBuf>, no_browser: bool) -> Result<()> {
    let root = library.map(Ok).unwrap_or_else(default_library)?;
    fs::create_dir_all(&root)?;
    let root = dunce::canonicalize(root)?;
    let descriptor = root.join(".nudgethis/welcome.json");
    if let (Ok(data), Ok(token)) = (
        fs::read_to_string(&descriptor),
        fs::read_to_string(root.join(".nudgethis/token")),
    ) && let Ok(record) = serde_json::from_str::<Value>(&data)
        && let Some(port) = record["port"].as_u64().filter(|n| *n > 0 && *n <= 65535)
    {
        let url = format!("http://127.0.0.1:{port}");
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()?;
        if client
            .get(format!("{url}/api/starter"))
            .bearer_auth(token.trim())
            .send()
            .await
            .is_ok_and(|r| r.status().is_success())
        {
            let url = format!("{url}/welcome#token={}", token.trim());
            if !no_browser {
                open_browser(&url)?;
            }
            println!("NudgeThis welcome: {url}");
            return Ok(());
        }
    }
    let mut config = Config::default();
    config.execution.enabled = false;
    config.server.port = 0;
    let core = Core::open(&root, config).await?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let mut options = fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    if let Ok(m) = fs::symlink_metadata(&descriptor) {
        check(
            m.is_file() && !m.file_type().is_symlink(),
            409,
            "Welcome metadata must be a regular file",
        )?;
    }
    options.open(&descriptor)?.write_all(
        json!({"version":1,"port":port,"pid":std::process::id()})
            .to_string()
            .as_bytes(),
    )?;
    let url = format!("http://127.0.0.1:{port}/welcome#token={}", core.token);
    println!("NudgeThis welcome: {url}");
    let token = core.stop.clone();
    tokio::spawn(async move {
        crate::shutdown_signal(token).await;
    });
    if !no_browser && let Err(e) = open_browser(&url) {
        eprintln!("Open the local welcome URL in your browser: {e}");
    }
    let result = crate::server::serve(core, listener).await;
    let _ = fs::remove_file(descriptor);
    result
}
pub fn picker_available() -> bool {
    if cfg!(windows) {
        project::executable("powershell.exe")
    } else if cfg!(target_os = "macos") {
        project::executable("osascript")
    } else {
        project::executable("zenity") || project::executable("kdialog")
    }
}
pub async fn pick_folder(root: &std::path::Path) -> Result<Value> {
    check(
        picker_available(),
        409,
        "A native folder picker is unavailable. Paste the folder path instead",
    )?;
    #[cfg(windows)]
    let (exe, args) = (
        "powershell.exe",
        vec![
            "-NoProfile",
            "-STA",
            "-Command",
            "Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description = 'Choose your project folder'; if ($picker.ShowDialog() -eq 'OK') { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Write($picker.SelectedPath) }",
        ],
    );
    #[cfg(target_os = "macos")]
    let (exe, args) = (
        "osascript",
        vec![
            "-e",
            "POSIX path of (choose folder with prompt \"Choose your project folder\")",
        ],
    );
    #[cfg(all(unix, not(target_os = "macos")))]
    let (exe, args) = if project::executable("zenity") {
        (
            "zenity",
            vec![
                "--file-selection",
                "--directory",
                "--title=Choose your project folder",
            ],
        )
    } else {
        ("kdialog", vec!["--getexistingdirectory"])
    };
    let result = crate::process::run(
        exe,
        &args.iter().map(|s| (*s).into()).collect::<Vec<_>>(),
        root,
        b"",
        120_000,
        &CancellationToken::new(),
    )
    .await?;
    if result.code != 0 || result.stdout.trim().is_empty() {
        return Ok(json!({"cancelled":true}));
    }
    let path = dunce::canonicalize(result.stdout.trim())?;
    check(path.is_dir(), 400, "Choose a folder")?;
    Ok(json!({"path":path}))
}
