use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {
    pub server: Server,
    pub workers: Workers,
    pub validation: Validation,
    pub agents: Vec<Agent>,
    pub default_agent: String,
    pub setup: Setup,
    pub execution: Execution,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct Setup {
    pub commands: Vec<String>,
    pub timeout: u64,
}
impl Default for Setup {
    fn default() -> Self {
        Self {
            commands: vec![],
            timeout: 120_000,
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Execution {
    pub enabled: bool,
}
impl Default for Execution {
    fn default() -> Self {
        Self { enabled: true }
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct Server {
    pub port: u16,
    pub allowed_origins: Vec<String>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct Workers {
    pub max_concurrent: usize,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct Validation {
    pub commands: Vec<String>,
    pub timeout: u64,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    #[serde(default)]
    pub label: String,
    pub transport: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub model: Option<String>,
    #[serde(default = "agent_timeout")]
    pub timeout: u64,
}
fn agent_timeout() -> u64 {
    600_000
}
impl Default for Server {
    fn default() -> Self {
        Self {
            port: 7331,
            allowed_origins: [
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
            ]
            .map(String::from)
            .to_vec(),
        }
    }
}
impl Default for Workers {
    fn default() -> Self {
        Self { max_concurrent: 2 }
    }
}
impl Default for Validation {
    fn default() -> Self {
        Self {
            commands: vec![],
            timeout: 120_000,
        }
    }
}
impl Default for Config {
    fn default() -> Self {
        Self {
            server: Server::default(),
            workers: Workers::default(),
            validation: Validation::default(),
            agents: vec![Agent {
                id: "codex".into(),
                label: "Codex CLI".into(),
                transport: "codex".into(),
                command: "codex".into(),
                args: vec![],
                model: None,
                timeout: agent_timeout(),
            }],
            default_agent: "codex".into(),
            setup: Setup {
                commands: vec![],
                timeout: 120_000,
            },
            execution: Execution::default(),
        }
    }
}
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.as_bytes()[0].is_ascii_lowercase()
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_' || c == b'-')
}
impl Config {
    pub fn execution_enabled(&self) -> bool {
        self.execution.enabled && std::env::var("NUDGETHIS_DISABLE_EXECUTION").as_deref() != Ok("1")
    }
    pub fn load(root: &Path) -> Result<Self> {
        let path = root.join("nudgethis.toml");
        let config = if path.exists() {
            toml::from_str(&std::fs::read_to_string(path)?)?
        } else {
            ensure!(
                !root.join("nudgethis.config.mjs").exists(),
                "Legacy nudgethis.config.mjs found. Migrate its values to nudgethis.toml (see docs/migration.md); executable JavaScript configuration is no longer loaded."
            );
            Self::default()
        };
        config.validate()?;
        Ok(config)
    }
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.setup.commands.len() <= 16 && self.validation.commands.len() <= 32,
            "Too many setup or validation commands"
        );
        ensure!(
            self.setup.commands.is_empty() || (1..=3_600_000).contains(&self.setup.timeout),
            "Invalid setup timeout"
        );
        ensure!(
            self.setup
                .commands
                .iter()
                .chain(&self.validation.commands)
                .all(|s| !s.trim().is_empty() && s.len() <= 4096),
            "Invalid setup or validation command"
        );
        ensure!(
            (1..=8).contains(&self.workers.max_concurrent),
            "Workers must be between 1 and 8"
        );
        ensure!(
            (1..=3_600_000).contains(&self.validation.timeout),
            "Invalid validation timeout"
        );
        ensure!(
            self.validation
                .commands
                .iter()
                .all(|s| !s.trim().is_empty()),
            "Validation commands cannot be empty"
        );
        for origin in &self.server.allowed_origins {
            let url = url::Url::parse(origin)?;
            ensure!(
                matches!(url.scheme(), "http" | "https")
                    && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
                    && url.origin().ascii_serialization() == *origin,
                "Only explicit loopback origins are supported"
            );
        }
        let mut ids = std::collections::HashSet::new();
        for agent in &self.agents {
            ensure!(
                valid_id(&agent.id) && ids.insert(&agent.id),
                "Invalid or duplicate agent ID"
            );
            ensure!(
                matches!(agent.transport.as_str(), "codex" | "acp" | "stdio"),
                "Unknown agent transport"
            );
            ensure!(
                !agent.command.trim().is_empty() && (1..=3_600_000).contains(&agent.timeout),
                "Invalid agent command or timeout"
            );
        }
        ensure!(
            ids.contains(&self.default_agent),
            "defaultAgent must match a configured agent"
        );
        Ok(())
    }
}
