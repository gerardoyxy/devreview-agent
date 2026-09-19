use crate::protocol::Transport;
use anyhow::{Result, bail};
use serde_json::Value;
use std::collections::HashSet;

#[derive(Default)]
pub struct Normalizer {
    seen: HashSet<String>,
}
impl Normalizer {
    /// Only public assistant messages are accepted. Tool logs and reasoning never become chat.
    pub fn message(&mut self, transport: Transport, line: &str) -> Result<Option<String>> {
        let value: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) if transport == Transport::Codex => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let (id, text) = if transport == Transport::Codex {
            match value["type"].as_str() {
                Some("turn.failed" | "error") => bail!(
                    "{}",
                    value["error"]["message"]
                        .as_str()
                        .or(value["message"].as_str())
                        .unwrap_or("Agent reported an error")
                ),
                Some("item.completed") if value["item"]["type"] == "agent_message" => {
                    (value["item"]["id"].as_str(), value["item"]["text"].as_str())
                }
                _ => return Ok(None),
            }
        } else {
            match value["type"].as_str() {
                Some("error") => bail!(
                    "{}",
                    value["message"]
                        .as_str()
                        .unwrap_or("Agent reported an error")
                ),
                Some("message") => (value["id"].as_str(), value["text"].as_str()),
                _ => return Ok(None),
            }
        };
        let Some(text) = text.filter(|text| !text.trim().is_empty()) else {
            return Ok(None);
        };
        if id.is_some_and(|id| !self.seen.insert(id.into())) {
            return Ok(None);
        }
        Ok(Some(text.into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_public_messages_are_emitted_and_ids_are_deduplicated() {
        let mut parser = Normalizer::default();
        let public =
            r#"{"type":"item.completed","item":{"id":"a","type":"agent_message","text":"Done"}}"#;
        assert_eq!(
            parser.message(Transport::Codex, public).unwrap(),
            Some("Done".into())
        );
        assert_eq!(parser.message(Transport::Codex, public).unwrap(), None);
        assert_eq!(
            parser
                .message(
                    Transport::Codex,
                    r#"{"type":"item.completed","item":{"type":"reasoning","text":"private"}}"#
                )
                .unwrap(),
            None
        );
        assert!(
            parser
                .message(
                    Transport::Codex,
                    r#"{"type":"turn.failed","error":{"message":"Unavailable"}}"#
                )
                .is_err()
        );
    }
    #[test]
    fn custom_transport_does_not_guess_log_formats() {
        let mut parser = Normalizer::default();
        assert!(parser.message(Transport::Stdio, "plain log").is_err());
        assert_eq!(
            parser
                .message(Transport::Stdio, r#"{"type":"message","text":"Hello"}"#)
                .unwrap(),
            Some("Hello".into())
        );
        assert_eq!(
            parser
                .message(Transport::Stdio, r#"{"type":"tool","text":"private"}"#)
                .unwrap(),
            None
        );
    }
}
