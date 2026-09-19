use crate::{
    emit,
    protocol::{Event, RunRequest, prompt},
    read_line,
};
use anyhow::{Result, bail, ensure};
use serde_json::{Value, json};
use tokio::io::{AsyncBufRead, AsyncWrite, AsyncWriteExt};

async fn send(writer: &mut (impl AsyncWrite + Unpin), value: Value) -> Result<()> {
    writer.write_all(format!("{value}\n").as_bytes()).await?;
    writer.flush().await?;
    Ok(())
}

#[derive(Default)]
struct PublicMessage {
    id: Option<String>,
    text: String,
}
impl PublicMessage {
    fn flush(&mut self) -> Result<()> {
        if !self.text.trim().is_empty() {
            emit(Event::Message { text: &self.text })?;
        }
        self.text.clear();
        self.id = None;
        Ok(())
    }
}

async fn response(
    reader: &mut (impl AsyncBufRead + Unpin),
    writer: &mut (impl AsyncWrite + Unpin),
    id: u64,
    session: Option<&str>,
    budget: &mut usize,
) -> Result<Value> {
    let mut message = PublicMessage::default();
    while let Some(line) = read_line(reader, budget).await? {
        let value: Value = serde_json::from_str(&line)?;
        ensure!(
            value["jsonrpc"] == "2.0",
            "Agent did not speak ACP JSON-RPC 2.0"
        );
        if let Some(method) = value["method"].as_str() {
            if method == "session/update" {
                ensure!(
                    session.is_some() && value["params"]["sessionId"].as_str() == session,
                    "ACP update belongs to another session"
                );
                let update = &value["params"]["update"];
                if update["sessionUpdate"] == "agent_message_chunk"
                    && update["content"]["type"] == "text"
                {
                    let next_id = update["messageId"].as_str().map(String::from);
                    if message.id != next_id {
                        message.flush()?;
                    }
                    message.id = next_id;
                    if let Some(text) = update["content"]["text"].as_str() {
                        message.text.push_str(text);
                    }
                } else if matches!(
                    update["sessionUpdate"].as_str(),
                    Some("tool_call" | "tool_call_update")
                ) {
                    message.flush()?;
                }
                // Reasoning, raw tools and other notifications are not public chat.
            } else if !value["id"].is_null() {
                if method == "session/request_permission" {
                    // Interactive approvals are a later phase. Never silently grant a permission.
                    send(writer, json!({"jsonrpc":"2.0","id":value["id"],"result":{"outcome":{"outcome":"cancelled"}}})).await?;
                    bail!(
                        "ACP agent requested a permission. Interactive permissions are not supported in this migration phase"
                    );
                }
                send(writer, json!({"jsonrpc":"2.0","id":value["id"],"error":{"code":-32601,"message":"Client capability not supported"}})).await?;
            }
            continue;
        }
        ensure!(
            value["id"].as_u64() == Some(id),
            "Unexpected ACP response ID"
        );
        if !value["error"].is_null() {
            bail!(
                "ACP: {}",
                value["error"]["message"]
                    .as_str()
                    .unwrap_or("Agent request failed")
            );
        }
        ensure!(value.get("result").is_some(), "Missing ACP result");
        message.flush()?;
        return Ok(value["result"].clone());
    }
    bail!("ACP process closed before replying")
}

pub async fn turn(
    request: &RunRequest,
    reader: &mut (impl AsyncBufRead + Unpin),
    writer: &mut (impl AsyncWrite + Unpin),
    budget: &mut usize,
) -> Result<()> {
    send(writer, json!({"jsonrpc":"2.0","id":0,"method":"initialize","params":{
        "protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"nudgethis","version":env!("CARGO_PKG_VERSION")}
    }})).await?;
    let initialized = response(reader, writer, 0, None, budget).await?;
    ensure!(
        initialized["protocolVersion"] == 1,
        "Unsupported ACP protocol version"
    );
    send(writer, json!({"jsonrpc":"2.0","id":1,"method":"session/new","params":{"cwd":request.cwd,"mcpServers":[]}})).await?;
    let created = response(reader, writer, 1, None, budget).await?;
    let session = created["sessionId"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("ACP session ID missing"))?;
    send(writer, json!({"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{"sessionId":session,"prompt":[{"type":"text","text":prompt(&request.task)}]}})).await?;
    let result = response(reader, writer, 2, Some(session), budget).await?;
    ensure!(
        result["stopReason"] == "end_turn",
        "ACP turn did not finish normally: {}",
        result["stopReason"]
    );
    Ok(())
}
