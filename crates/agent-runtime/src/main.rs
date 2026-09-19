mod acp;
mod normalize;
mod protocol;

use anyhow::{Context, Result, ensure};
use process_wrap::tokio::*;
use protocol::{Event, INPUT_LIMIT, OUTPUT_LIMIT, RunRequest, Transport};
use std::{io::Write, process::Stdio, time::Duration};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

fn emit(event: Event<'_>) -> Result<()> {
    let mut value = serde_json::to_value(event)?;
    value["protocolVersion"] = protocol::VERSION.into();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    serde_json::to_writer(&mut out, &value)?;
    writeln!(out)?;
    out.flush()?;
    Ok(())
}

/// Bound each line AND cumulative output before allocating an unbounded JSON frame.
async fn read_line(
    reader: &mut (impl AsyncBufRead + Unpin),
    budget: &mut usize,
) -> Result<Option<String>> {
    let mut bytes = Vec::new();
    loop {
        let buffer = reader.fill_buf().await?;
        if buffer.is_empty() {
            break;
        }
        let take = buffer
            .iter()
            .position(|&b| b == b'\n')
            .map_or(buffer.len(), |i| i + 1);
        ensure!(take <= *budget, "Agent output exceeded 2 MiB limit");
        *budget -= take;
        bytes.extend_from_slice(&buffer[..take]);
        reader.consume(take);
        if bytes.last() == Some(&b'\n') {
            break;
        }
    }
    if bytes.is_empty() {
        return Ok(None);
    }
    Ok(Some(
        String::from_utf8(bytes)?
            .trim_end_matches(['\n', '\r'])
            .into(),
    ))
}

fn cancellation_signal() -> Result<impl std::future::Future<Output = ()>> {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        let mut interrupt =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
        Ok(async move {
            tokio::select! { _ = terminate.recv() => {}, _ = interrupt.recv() => {} }
        })
    }
    #[cfg(windows)]
    {
        let mut interrupt = tokio::signal::windows::ctrl_c()?;
        let mut stop = tokio::signal::windows::ctrl_break()?;
        Ok(async move {
            tokio::select! { _ = interrupt.recv() => {}, _ = stop.recv() => {} }
        })
    }
}

async fn execute(request: RunRequest) -> Result<()> {
    request.validate()?;
    // Install handlers before starting a child so early cancellation cannot orphan it.
    let cancellation = cancellation_signal()?;
    let args = request.arguments();
    let mut command = CommandWrap::with_new(&request.command, |command| {
        command
            .args(args)
            .current_dir(&request.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
    });
    command.wrap(KillOnDrop);
    #[cfg(unix)]
    {
        command.wrap(ProcessGroup::leader());
    }
    #[cfg(windows)]
    {
        command.wrap(JobObject);
    }
    let mut child = command
        .spawn()
        .with_context(|| format!("Cannot start agent executable {}", request.command))?;
    let mut input = child.stdin().take().context("Agent stdin missing")?;
    let mut output = BufReader::new(child.stdout().take().context("Agent stdout missing")?);
    let stderr = child.stderr().take().context("Agent stderr missing")?;
    let mut errors = Vec::new();
    let mut raw = String::new();
    let work = async {
        let stdout_task = async {
            let mut budget = OUTPUT_LIMIT;
            if request.transport == Transport::Acp {
                acp::turn(&request, &mut output, &mut input, &mut budget).await?;
                drop(input);
            } else {
                // The custom transport receives one JSON envelope; Codex receives plain prompt text.
                let prompt = protocol::prompt(&request.task);
                let text = if request.transport == Transport::Stdio {
                    format!(
                        "{}\n",
                        serde_json::json!({"protocolVersion":1,"task":request.task,"prompt":prompt})
                    )
                } else {
                    prompt
                };
                input.write_all(text.as_bytes()).await?;
                input.shutdown().await?;
                drop(input);
                let mut parser = normalize::Normalizer::default();
                while let Some(line) = read_line(&mut output, &mut budget).await? {
                    if let Some(text) = parser.message(request.transport, &line)? {
                        emit(Event::Message { text: &text })?;
                    }
                    raw.push_str(&line);
                    raw.push('\n');
                }
            }
            Ok::<(), anyhow::Error>(())
        };
        let stderr_task = async {
            stderr
                .take((OUTPUT_LIMIT + 1) as u64)
                .read_to_end(&mut errors)
                .await?;
            ensure!(
                errors.len() <= OUTPUT_LIMIT,
                "Agent stderr exceeded 2 MiB limit"
            );
            Ok::<(), anyhow::Error>(())
        };
        if request.transport == Transport::Acp {
            // ACP servers remain alive after a turn. Do not wait for EOF to finish the task.
            tokio::pin!(stdout_task);
            tokio::pin!(stderr_task);
            tokio::select! {
                result = &mut stdout_task => result?,
                result = &mut stderr_task => { result?; stdout_task.await?; }
            }
        } else {
            tokio::try_join!(stdout_task, stderr_task)?;
            let status = child.wait().await?;
            ensure!(
                status.success(),
                "Agent exited with {status}: {}",
                String::from_utf8_lossy(&errors)
            );
        }
        Ok::<(), anyhow::Error>(())
    };
    let result = tokio::select! {
        result = tokio::time::timeout(Duration::from_millis(request.timeout_ms), work) => result.unwrap_or_else(|_| Err(anyhow::anyhow!("Agent timed out"))),
        _ = cancellation => Err(anyhow::anyhow!("Agent cancelled")),
    };
    // Kill the process group / Windows job before handing the worktree back to the queue.
    let _ = child.start_kill();
    let cleanup = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
    result?;
    cleanup.context("Agent process tree did not stop")??;
    emit(Event::Result {
        output: &raw,
        stderr: &String::from_utf8_lossy(&errors),
    })
}

#[tokio::main]
async fn main() {
    let result = async {
        let mut input = Vec::new();
        tokio::io::stdin()
            .take(INPUT_LIMIT + 1)
            .read_to_end(&mut input)
            .await?;
        ensure!(
            input.len() as u64 <= INPUT_LIMIT,
            "Runtime input exceeded 256 KiB limit"
        );
        let request = serde_json::from_slice(&input).context("Invalid runtime request")?;
        execute(request).await
    }
    .await;
    if let Err(error) = result {
        let _ = emit(Event::Error {
            message: &format!("{error:#}"),
        });
        std::process::exit(1);
    }
}
