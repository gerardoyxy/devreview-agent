use crate::error::check;
use anyhow::Result;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use std::{path::Path, sync::Mutex};
use tokio::sync::broadcast;

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub fn terminal(status: &str) -> bool {
    matches!(
        status,
        "ready"
            | "awaiting_feedback"
            | "failed"
            | "conflict"
            | "applied"
            | "rejected"
            | "cancelled"
    )
}
pub fn task_number(id: &str) -> Result<i64> {
    let n = id.strip_prefix("QA-").unwrap_or("");
    check(
        !n.is_empty()
            && n.len() <= 9
            && !n.starts_with('0')
            && n.bytes().all(|c| c.is_ascii_digit()),
        400,
        "Invalid task ID",
    )?;
    Ok(n.parse()?)
}
pub struct Store {
    db: Mutex<Connection>,
    pub events: broadcast::Sender<(String, Value)>,
}
impl Store {
    pub fn open(file: &Path) -> Result<Self> {
        // Back up legacy databases through SQLite, including committed WAL pages.
        let exists = file.exists();
        let db = Connection::open(file)?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        check(
            version <= 1,
            409,
            "Database was created by a newer DevReview version",
        )?;
        if exists && version == 0 {
            let backup = file.with_file_name(format!(
                "tasks.before-rust-{}.sqlite",
                chrono::Utc::now().timestamp_millis()
            ));
            db.backup("main", backup, None)?;
        }
        db.execute_batch("PRAGMA journal_mode=WAL;
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, task_id TEXT, action TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, task_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, attempt INTEGER NOT NULL, at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS messages_task ON messages(task_id,id);
            CREATE TABLE IF NOT EXISTS revisions (task_id TEXT NOT NULL, attempt INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(task_id,attempt));
            CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, data TEXT NOT NULL);
            INSERT INTO messages(task_id,role,content,attempt,at) SELECT 'QA-' || id,'user',json_extract(data,'$.request'),1,json_extract(data,'$.createdAt') FROM tasks WHERE NOT EXISTS (SELECT 1 FROM messages WHERE task_id = 'QA-' || tasks.id);
            PRAGMA user_version=1; COMMIT;")?;
        let store = Self {
            db: Mutex::new(db),
            events: broadcast::channel(128).0,
        };
        for task in store.list()? {
            let status = task["status"].as_str().unwrap_or("");
            if terminal(status)
                && store
                    .revision(
                        task["id"].as_str().unwrap(),
                        task["attempt"].as_u64().unwrap_or(1),
                    )
                    .is_err()
            {
                store.archive(&task)?;
            }
            if matches!(status, "analyzing" | "working" | "validating" | "applying") {
                store.update(task["id"].as_str().unwrap(), json!({"status":"failed","error":"Server stopped during execution. Inspect the worktree / active files, then retry."}))?;
            }
        }
        Ok(store)
    }
    pub fn emit(&self, event: &str, value: Value) {
        let _ = self.events.send((event.into(), value));
    }
    pub fn get(&self, id: &str) -> Result<Value> {
        let n = task_number(id)?;
        let data: Option<String> = self
            .db
            .lock()
            .unwrap()
            .query_row("SELECT data FROM tasks WHERE id=?", [n], |r| r.get(0))
            .optional()?;
        check(data.is_some(), 404, "Task not found")?;
        let mut task: Value = serde_json::from_str(&data.unwrap())?;
        task["id"] = id.into();
        Ok(task)
    }
    pub fn list(&self) -> Result<Vec<Value>> {
        let db = self.db.lock().unwrap();
        let mut stmt = db.prepare("SELECT id,data FROM tasks ORDER BY id DESC")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
        rows.map(|r| {
            let (id, data) = r?;
            let mut task: Value = serde_json::from_str(&data)?;
            task["id"] = format!("QA-{id}").into();
            Ok(task)
        })
        .collect()
    }
    pub fn create(&self, mut task: Value) -> Result<Value> {
        task.as_object_mut().unwrap().extend(json!({"status":"pending","attempt":1,"createdAt":now(),"updatedAt":now(),"diff":"","files":[],"validation":[],"output":"","error":null}).as_object().unwrap().clone());
        let id = {
            let mut db = self.db.lock().unwrap();
            let tx = db.transaction()?;
            tx.execute("INSERT INTO tasks(data) VALUES(?)", [task.to_string()])?;
            let id = format!("QA-{}", tx.last_insert_rowid());
            tx.execute(
                "INSERT INTO messages(task_id,role,content,attempt,at) VALUES(?,'user',?,1,?)",
                params![id, task["request"].as_str().unwrap_or(""), now()],
            )?;
            tx.execute(
                "INSERT INTO audit(task_id,action,at) VALUES(?,'created',?)",
                params![id, now()],
            )?;
            tx.commit()?;
            id
        };
        let task = self.get(&id)?;
        self.emit("task", summary(task.clone()));
        Ok(task)
    }
    pub fn update(&self, id: &str, patch: Value) -> Result<Value> {
        let mut task = self.get(id)?;
        task.as_object_mut()
            .unwrap()
            .extend(patch.as_object().unwrap().clone());
        task["updatedAt"] = now().into();
        {
            let mut db = self.db.lock().unwrap();
            let tx = db.transaction()?;
            tx.execute(
                "UPDATE tasks SET data=? WHERE id=?",
                params![task.to_string(), task_number(id)?],
            )?;
            if let Some(status) = patch["status"].as_str() {
                tx.execute(
                    "INSERT INTO audit(task_id,action,at) VALUES(?,?,?)",
                    params![id, status, now()],
                )?;
                if terminal(status) {
                    archive_in(&tx, &task)?;
                }
            }
            tx.commit()?;
        }
        self.emit("task", summary(task.clone()));
        Ok(task)
    }
    pub fn messages(&self, id: &str) -> Result<Vec<Value>> {
        let db = self.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT id,role,content,attempt,at FROM messages WHERE task_id=? ORDER BY id",
        )?;
        Ok(stmt.query_map([id], |r| Ok(json!({"id":r.get::<_,i64>(0)?,"role":r.get::<_,String>(1)?,"content":r.get::<_,String>(2)?,"attempt":r.get::<_,i64>(3)?,"at":r.get::<_,String>(4)?})))?.collect::<rusqlite::Result<Vec<_>>>()?)
    }
    pub fn message(&self, id: &str, role: &str, content: &str) -> Result<()> {
        let task = self.get(id)?;
        self.db.lock().unwrap().execute(
            "INSERT INTO messages(task_id,role,content,attempt,at) VALUES(?,?,?,?,?)",
            params![
                id,
                role,
                content,
                task["attempt"].as_i64().unwrap_or(1),
                now()
            ],
        )?;
        self.emit("task", summary(task));
        Ok(())
    }
    pub fn archive(&self, task: &Value) -> Result<()> {
        archive_in(&self.db.lock().unwrap(), task)
    }
    pub fn revision(&self, id: &str, attempt: u64) -> Result<Value> {
        self.get(id)?;
        check(attempt > 0, 400, "Invalid revision")?;
        let data: Option<String> = self
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT data FROM revisions WHERE task_id=? AND attempt=?",
                params![id, attempt as i64],
                |r| r.get(0),
            )
            .optional()?;
        check(data.is_some(), 404, "Revision not found")?;
        Ok(serde_json::from_str(&data.unwrap())?)
    }
    pub fn details(&self, id: &str) -> Result<Value> {
        let mut task = self.get(id)?;
        task["messages"] = self.messages(id)?.into();
        let db = self.db.lock().unwrap();
        let mut stmt = db.prepare("SELECT id,at,action FROM audit WHERE task_id=? ORDER BY id")?;
        task["history"] = stmt.query_map([id], |r| Ok(json!({"id":r.get::<_,i64>(0)?,"at":r.get::<_,String>(1)?,"action":r.get::<_,String>(2)?})))?.collect::<rusqlite::Result<Vec<_>>>()?.into();
        let mut stmt =
            db.prepare("SELECT data FROM revisions WHERE task_id=? ORDER BY attempt DESC")?;
        let mut revisions = vec![];
        for row in stmt.query_map([id], |r| r.get::<_, String>(0))? {
            let mut v: Value = serde_json::from_str(&row?)?;
            let validations = v["validation"].as_array().cloned().unwrap_or_default();
            v["checks"] = validations.len().into();
            v["passed"] = validations.iter().all(|c| c["passed"] == true).into();
            v.as_object_mut().unwrap().remove("projectContext");
            v.as_object_mut().unwrap().remove("diff");
            v.as_object_mut().unwrap().remove("validation");
            revisions.push(v);
        }
        task["revisions"] = revisions.into();
        Ok(task)
    }
    pub fn delete(&self, id: &str) -> Result<()> {
        self.get(id)?;
        let mut db = self.db.lock().unwrap();
        let tx = db.transaction()?;
        tx.execute("DELETE FROM tasks WHERE id=?", [task_number(id)?])?;
        tx.execute("DELETE FROM messages WHERE task_id=?", [id])?;
        tx.execute("DELETE FROM revisions WHERE task_id=?", [id])?;
        tx.execute(
            "INSERT INTO audit(task_id,action,at) VALUES(?,'deleted',?)",
            params![id, now()],
        )?;
        tx.commit()?;
        self.emit("task", json!({"id":id,"deleted":true}));
        Ok(())
    }
    pub fn project_context(&self) -> Result<Value> {
        let db = self.db.lock().unwrap();
        read_project_context(&db)
    }
    pub fn save_project_context(&self, input: &Value) -> Result<Value> {
        let value = {
            let mut db = self.db.lock().unwrap();
            let tx = db.transaction()?;
            let previous = read_project_context(&tx)?;
            let value = crate::project_context::save(input, &previous)?;
            tx.execute("INSERT INTO preferences(key,data) VALUES('project-context',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data", [value.to_string()])?;
            tx.commit()?;
            value
        };
        self.emit("project-context", json!({"revision":value["revision"]}));
        Ok(value)
    }
    pub fn preference(&self) -> Result<Value> {
        let data: Option<String> = self
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT data FROM preferences WHERE key='appearance'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        Ok(data
            .map(|s| serde_json::from_str(&s))
            .transpose()?
            .unwrap_or(Value::Null))
    }
    pub fn save_preference(&self, value: &Value) -> Result<()> {
        self.db.lock().unwrap().execute("INSERT INTO preferences(key,data) VALUES('appearance',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data", [value.to_string()])?;
        self.emit("appearance", value.clone());
        Ok(())
    }
}
fn read_project_context(db: &Connection) -> Result<Value> {
    let data: Option<String> = db
        .query_row(
            "SELECT data FROM preferences WHERE key='project-context'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    Ok(data
        .map(|s| serde_json::from_str(&s))
        .transpose()?
        .unwrap_or_else(crate::project_context::empty))
}
fn archive_in(db: &Connection, task: &Value) -> Result<()> {
    let mut revision = json!({});
    for key in [
        "attempt",
        "status",
        "diff",
        "files",
        "validation",
        "projectContext",
        "baseCommit",
        "baseBranch",
        "updatedAt",
        "error",
    ] {
        revision[key] = task[key].clone();
    }
    db.execute("INSERT INTO revisions(task_id,attempt,data) VALUES(?,?,?) ON CONFLICT(task_id,attempt) DO UPDATE SET data=excluded.data", params![task["id"].as_str().unwrap(),task["attempt"].as_i64().unwrap_or(1),revision.to_string()])?;
    Ok(())
}
pub fn summary(mut task: Value) -> Value {
    for key in ["diff", "output", "agentErrors", "projectContext"] {
        task.as_object_mut().unwrap().remove(key);
    }
    if let Some(checks) = task["validation"].as_array_mut() {
        for check in checks {
            check.as_object_mut().unwrap().remove("output");
        }
    }
    task
}
