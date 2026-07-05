//! On-disk contract between Payload (drops task files via the guest agent) and
//! this companion (reads + runs them as the logged-in user). The spool dir is
//! the whole transport — no network.
//!
//!   <id>.task.json    a Task
//!   <payload_file>    optional sibling blob a task references (image, script)
//!   <id>.result.json  a TaskResult this agent writes when done

use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    #[serde(default)]
    pub v: u32,
    pub id: String,
    #[serde(flatten)]
    pub kind: TaskKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum TaskKind {
    Wallpaper { payload_file: String },
    RunScript { payload_file: String, interpreter: Interpreter },
    Notify { title: String, body: String },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Interpreter {
    Bash,
    Powershell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub v: u32,
    pub id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub took_ms: u128,
}

impl TaskResult {
    pub fn ok(id: &str, took_ms: u128) -> Self {
        Self { v: PROTOCOL_VERSION, id: id.to_string(), ok: true, error: None, took_ms }
    }
    pub fn failed(id: &str, error: impl Into<String>, took_ms: u128) -> Self {
        Self { v: PROTOCOL_VERSION, id: id.to_string(), ok: false, error: Some(error.into()), took_ms }
    }
}
