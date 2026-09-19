use anyhow::{Context, Result, bail, ensure};
use process_wrap::tokio::*;
use std::{path::Path, process::Stdio, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

#[derive(Debug)]
pub struct Output {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}
pub async fn run(
    command: &str,
    args: &[String],
    cwd: &Path,
    input: &[u8],
    timeout: u64,
    cancel: &CancellationToken,
) -> Result<Output> {
    run_env(command, args, cwd, input, timeout, cancel, &[]).await
}
#[allow(clippy::too_many_arguments)]
pub async fn run_env(
    command: &str,
    args: &[String],
    cwd: &Path,
    input: &[u8],
    timeout: u64,
    cancel: &CancellationToken,
    environment: &[(&str, &str)],
) -> Result<Output> {
    ensure!(!cancel.is_cancelled(), "Cancelled");
    let mut cmd = CommandWrap::with_new(command, |cmd| {
        #[cfg(windows)]
        if command.eq_ignore_ascii_case("cmd.exe") && args.len() == 4 && args[2] == "/C" {
            // Validation is trusted shell text; cmd.exe does not use argv quoting rules.
            cmd.args(&args[..3]).raw_arg(format!("\"{}\"", args[3]));
        } else {
            cmd.args(args);
        }
        #[cfg(not(windows))]
        cmd.args(args);
        cmd.envs(environment.iter().copied())
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
    });
    cmd.wrap(KillOnDrop);
    #[cfg(unix)]
    cmd.wrap(ProcessGroup::leader());
    #[cfg(windows)]
    cmd.wrap(JobObject);
    let mut child = cmd
        .spawn()
        .with_context(|| format!("Cannot start {command}"))?;
    let mut stdin = child.stdin().take().context("Missing stdin")?;
    let stdout = child.stdout().take().context("Missing stdout")?;
    let stderr = child.stderr().take().context("Missing stderr")?;
    let work = async {
        let write = async {
            if !input.is_empty() {
                stdin.write_all(input).await?;
            }
            drop(stdin);
            Ok::<_, anyhow::Error>(())
        };
        async fn read(pipe: impl tokio::io::AsyncRead + Unpin) -> Result<String> {
            let mut data = vec![];
            pipe.take(2_097_153).read_to_end(&mut data).await?;
            ensure!(data.len() <= 2_097_152, "Command output exceeded limit");
            Ok(String::from_utf8_lossy(&data).into())
        }
        let (_, stdout, stderr) = tokio::try_join!(write, read(stdout), read(stderr))?;
        let status = child.wait().await?;
        Ok::<_, anyhow::Error>(Output {
            code: status.code().unwrap_or(1),
            stdout,
            stderr,
        })
    };
    let result = tokio::select! {
        result = tokio::time::timeout(Duration::from_millis(timeout), work) => result.unwrap_or_else(|_| Err(anyhow::anyhow!("Command timed out"))),
        _ = cancel.cancelled() => Err(anyhow::anyhow!("Cancelled")),
    };
    let _ = child.start_kill();
    let cleanup = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
    // Cleanup also runs after timeouts and cancellation, before a worktree can be reused.
    let result = result?;
    if cleanup.is_err() {
        bail!("Command process tree did not stop");
    }
    cleanup??;
    Ok(result)
}
pub async fn shell(
    command: &str,
    cwd: &Path,
    timeout: u64,
    cancel: &CancellationToken,
) -> Result<Output> {
    #[cfg(windows)]
    let (exe, args) = (
        "cmd.exe",
        vec!["/D".into(), "/S".into(), "/C".into(), command.into()],
    );
    #[cfg(not(windows))]
    let (exe, args) = ("sh", vec!["-c".into(), command.into()]);
    run(exe, &args, cwd, &[], timeout, cancel).await
}
