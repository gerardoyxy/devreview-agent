//! Deterministic project planning and explicit creation in a new directory. No model calls.
use crate::{
    config::Config,
    core::Core,
    error::check,
    project,
    store::{Store, now},
    workspace::text,
};
use anyhow::Result;
use rusqlite::OptionalExtension;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

struct Plan {
    created: Instant,
    data: Value,
}
pub struct OpenProject {
    pub core: Arc<Core>,
    pub port: u16,
    pub task: tokio::task::JoinHandle<()>,
}
#[derive(Default)]
pub struct Library {
    plans: HashMap<String, Plan>,
    opened: HashMap<String, OpenProject>,
}
impl Library {
    pub fn drain(&mut self) -> Vec<OpenProject> {
        self.opened.drain().map(|(_, v)| v).collect()
    }
}
impl Store {
    fn projects(&self) -> Result<Vec<Value>> {
        let data: Option<String> = self
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT data FROM preferences WHERE key='project-library'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        Ok(data
            .map(|s| serde_json::from_str(&s))
            .transpose()?
            .unwrap_or_default())
    }
    fn save_project_record(&self, record: Value) -> Result<()> {
        let mut rows = self.projects()?;
        if let Some(i) = rows.iter().position(|r| r["id"] == record["id"]) {
            rows[i] = record;
        } else {
            check(
                rows.len() < 64,
                409,
                "Your library has 64 projects. Open another folder directly or remove an entry first",
            )?;
            rows.push(record);
        }
        self.db.lock().unwrap().execute("INSERT INTO preferences(key,data) VALUES('project-library',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",[serde_json::to_string(&rows)?])?;
        Ok(())
    }
}
fn id() -> String {
    format!("{:032x}", rand::random::<u128>())
}
fn directory(path: &str) -> Result<PathBuf> {
    check(
        !path.is_empty() && Path::new(path).is_absolute(),
        400,
        "Choose an absolute folder path",
    )?;
    let path = dunce::canonicalize(path).map_err(|_| {
        anyhow::anyhow!("This folder is unavailable. Choose an existing local folder")
    })?;
    check(path.is_dir(), 400, "Choose a folder")?;
    Ok(path)
}
async fn independent_parent(parent: &Path) -> Result<()> {
    // Git's discovery rules distinguish actual repositories from unrelated .git directories.
    let repo = crate::git::Repository::new(parent.to_path_buf(), parent.join(".nudgethis"));
    let state = crate::workspace::probe(&repo).await?;
    check(
        matches!(text(&state, "kind"), "no_repository" | "missing_git"),
        409,
        "Choose a parent folder outside an existing Git project, so the new project has its own version history",
    )
}
fn project_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.as_bytes()[0].is_ascii_lowercase()
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && ![
            "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7",
            "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
        ]
        .contains(&name)
}
pub fn catalog() -> Value {
    json!([
        {"id":"website","name":"Simple website","description":"A landing page, portfolio or business website. Preview immediately with no extra tools.","stack":"HTML + CSS · built-in Rust preview","requiresNode":false},
        {"id":"astro","name":"Content website","description":"A website with reusable pages and articles. A starting point for a blog or content library.","stack":"Astro + TypeScript","requiresNode":true},
        {"id":"react","name":"Interactive app","description":"An interactive interface with example data. Accounts, payments and shared storage need additional implementation.","stack":"React + TypeScript + Vite","requiresNode":true}
    ])
}
pub fn diagnose(input: &Value) -> Result<Value> {
    let (goal, objective, audience, data, budget) = (
        text(input, "goal"),
        text(input, "objective").trim(),
        text(input, "audience").trim(),
        text(input, "data"),
        text(input, "budget"),
    );
    check(
        ["website", "content", "app", "unsure"].contains(&goal),
        400,
        "Choose what you want to build",
    )?;
    check(
        !objective.is_empty()
            && objective.chars().count() <= 1200
            && !audience.is_empty()
            && audience.chars().count() <= 240,
        400,
        "Describe the goal and who it is for",
    )?;
    check(
        ["none", "device", "shared", "unsure"].contains(&data)
            && ["free", "flexible", "unsure"].contains(&budget),
        400,
        "Choose your data and budget preferences",
    )?;
    check(
        input["accounts"].is_boolean() && input["payments"].is_boolean(),
        400,
        "Choose whether accounts and payments are needed",
    )?;
    check(
        [objective, audience].iter().all(|s| {
            !s.chars()
                .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
        }),
        400,
        "Use plain text for your project goal",
    )?;
    let advanced = input["accounts"] == true || input["payments"] == true || data == "shared";
    let recommended = if goal == "app" || advanced {
        "react"
    } else if goal == "content" {
        "astro"
    } else {
        "website"
    };
    let mut next = vec![
        "Review and personalize the starter".to_owned(),
        "Save the first local version before agent changes".into(),
    ];
    if data == "shared" {
        next.push("Design shared storage, a backend and access rules".into());
    }
    if data == "device" {
        next.push("Decide which information to keep on this device and how to back it up".into());
    }
    if input["accounts"] == true {
        next.push("Implement and verify user sign-in and authorization".into());
    }
    if input["payments"] == true {
        next.push("Choose and integrate a payment provider before accepting payments".into());
    }
    if data == "unsure" {
        next.push("Clarify what information the finished project should store".into());
    }
    let reason = match recommended {
        "react" => {
            "Your idea involves interactive work or shared features. Start with an interface you can review, then implement the required services."
        }
        "astro" => {
            "Your goal centers on pages and content. This starter includes reusable structure and an example article."
        }
        _ => {
            "A simple website is enough to begin. You can see and edit the first page without installing a package manager."
        }
    };
    Ok(
        json!({"answers":{"goal":goal,"objective":objective,"audience":audience,"data":data,"budget":budget,"accounts":input["accounts"],"payments":input["payments"]},"recommended":recommended,"reason":reason,"needsServices":advanced,"nextSteps":next,"costNote":if advanced {"The starter is local. Hosting, accounts or payments may need external services and separate costs."}else{"The starter runs locally. Domain names, hosting and optional agents have separate requirements and costs."}}),
    )
}
fn brief(plan: &Value) -> String {
    let a = &plan["diagnosis"]["answers"];
    format!(
        "# Project goal\n\n{}\n\n## Audience\n{}\n\n## Starting decisions\n- Starter: {}\n- Data: {}\n- Accounts requested: {}\n- Payments requested: {}\n- Budget preference: {}\n\n## Work still required\n{}\n\nThis is a starter, not a completed production application. Do not claim that accounts, payments or shared storage work until they are implemented and verified. Preserve these goals when proposing changes.\n",
        text(a, "objective"),
        text(a, "audience"),
        text(plan, "template"),
        text(a, "data"),
        a["accounts"],
        a["payments"],
        text(a, "budget"),
        plan["diagnosis"]["nextSteps"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| format!("- {}", v.as_str().unwrap()))
            .collect::<Vec<_>>()
            .join("\n")
    )
}
impl Core {
    pub async fn starter_status(&self) -> Result<Value> {
        let library = self.starter.lock().await;
        let rows = self
            .store
            .projects()?
            .into_iter()
            .map(|mut r| {
                if let Some(open) = library.opened.get(text(&r, "id"))
                    && !open.task.is_finished()
                {
                    r["url"] =
                        format!("http://127.0.0.1:{}/#token={}", open.port, open.core.token).into();
                }
                r
            })
            .collect::<Vec<_>>();
        Ok(
            json!({"projects":rows,"templates":catalog(),"defaultParent":self.repository.root.join("projects").to_string_lossy(),"gitAvailable":project::executable("git"),"nodeAvailable":project::executable("node"),"npmAvailable":project::executable("npm"),"folderPickerAvailable":crate::launcher::picker_available(),"commandsBlocked":std::env::var("NUDGETHIS_DISABLE_EXECUTION").as_deref()==Ok("1")}),
        )
    }
    pub async fn starter_plan(&self, input: Value) -> Result<Value> {
        let mut library = self.starter.lock().await;
        let diagnosis = diagnose(&input["answers"])?;
        let template = input["template"]
            .as_str()
            .unwrap_or(text(&diagnosis, "recommended"));
        check(
            ["website", "astro", "react"].contains(&template),
            400,
            "Choose a maintained starter",
        )?;
        let name = text(&input, "name");
        check(
            project_name(name),
            400,
            "Use a folder name such as my-first-project: lowercase letters, numbers and hyphens",
        )?;
        let default = self.repository.root.join("projects");
        let parent = if input["parent"]
            .as_str()
            .is_none_or(|p| p.is_empty() || Path::new(p) == default)
        {
            if !default.exists() {
                fs::create_dir(&default)?;
            }
            let actual = directory(default.to_str().unwrap())?;
            check(
                actual == default,
                409,
                "The projects folder must not be a link",
            )?;
            actual
        } else {
            directory(text(&input, "parent"))?
        };
        independent_parent(&parent).await?;
        check(
            !parent.starts_with(&self.repository.state),
            409,
            "Choose a folder outside local application state",
        )?;
        let destination = parent.join(name);
        check(
            !destination.exists() && fs::symlink_metadata(&destination).is_err(),
            409,
            "That folder already exists. Choose a new name; existing files will not be replaced",
        )?;
        let data = json!({"id":id(),"name":name,"parent":parent,"path":destination,"template":template,"diagnosis":diagnosis,"files":crate::starters::paths(template),"expiresInSeconds":600});
        library
            .plans
            .retain(|_, p| p.created.elapsed().as_secs() < 600);
        check(
            library.plans.len() < 12,
            409,
            "Several project reviews are open. Close older reviews and wait a few minutes",
        )?;
        library.plans.insert(
            text(&data, "id").into(),
            Plan {
                created: Instant::now(),
                data: data.clone(),
            },
        );
        Ok(data)
    }
    pub async fn starter_create(&self, input: Value) -> Result<Value> {
        let mut library = self.starter.lock().await;
        let plan_id = text(&input, "previewId");
        if let Some(record) = self
            .store
            .projects()?
            .into_iter()
            .find(|r| r["id"] == plan_id)
        {
            check(
                record["status"] == "ready",
                409,
                "Project creation was interrupted. Inspect the saved folder before continuing",
            )?;
            return Ok(record);
        }
        check(
            input["confirm"] == true,
            400,
            "Confirm the new project folder and starter",
        )?;
        let p = library
            .plans
            .get(plan_id)
            .ok_or_else(|| anyhow::anyhow!("Review the project setup again"))?;
        check(
            p.created.elapsed().as_secs() < 600,
            409,
            "The project review expired. Review it again",
        )?;
        let plan = p.data.clone();
        let root = PathBuf::from(text(&plan, "path"));
        check(
            directory(text(&plan, "parent"))? == root.parent().unwrap(),
            409,
            "The destination folder changed. Review it again",
        )?;
        check(
            self.store.projects()?.len() < 64,
            409,
            "Remove a project from the library before creating another",
        )?;
        independent_parent(root.parent().unwrap()).await?;
        fs::create_dir(&root).map_err(|_| {
            anyhow::anyhow!(
                "The destination already exists or cannot be created. Choose a new folder"
            )
        })?;
        let mut record = json!({"id":plan_id,"name":plan["name"],"path":root,"template":plan["template"],"status":"creating","createdAt":now()});
        self.store.save_project_record(record.clone())?;
        let created:Result<()>=async {
            for (path,contents) in crate::starters::files(&plan)? {
                let file=root.join(path);fs::create_dir_all(file.parent().unwrap())?;
                fs::OpenOptions::new().write(true).create_new(true).open(file)?.write_all(contents.as_bytes())?;
            }
            let mut config=project::suggested_config(&root)?;config.execution.enabled=false;
            fs::OpenOptions::new().write(true).create_new(true).open(root.join("nudgethis.toml"))?.write_all(toml::to_string_pretty(&config)?.as_bytes())?;
            let project=Core::open(&root,config).await?;
            project.store.save_project_context(&json!({"version":1,"revision":0,"items":[{"id":"project-goal","title":"Project goal and starting decisions","kind":"instruction","default":true,"source":"NudgeThis project starter","content":brief(&plan)}]}))?;
            fs::write(project.repository.state.join("starter.json"),json!({"version":1,"template":plan["template"]}).to_string())?;
            Ok(())
        }.await;
        match created {
            Ok(()) => {
                record["status"] = "ready".into();
            }
            Err(e) => {
                record["status"] = "incomplete".into();
                self.store.save_project_record(record)?;
                return Err(anyhow::anyhow!(
                    "Project creation stopped: {e}. Files already created were preserved in {}",
                    root.display()
                ));
            }
        }
        self.store.save_project_record(record.clone())?;
        library.plans.remove(plan_id);
        Ok(record)
    }
    pub async fn starter_import(&self, input: Value) -> Result<Value> {
        check(
            input["confirm"] == true,
            400,
            "Confirm opening this local project",
        )?;
        let root = directory(text(&input, "path"))?;
        check(
            root != self.repository.root && !root.starts_with(&self.repository.state),
            400,
            "Choose a project folder outside the launcher state",
        )?;
        project::inspect(&root)?;
        Config::load(&root)?;
        let _library = self.starter.lock().await;
        if let Some(record) = self
            .store
            .projects()?
            .into_iter()
            .find(|r| Path::new(text(r, "path")) == root)
        {
            return Ok(record);
        }
        let record = json!({"id":id(),"name":root.file_name().unwrap_or_default().to_string_lossy(),"path":root,"template":"existing","status":"ready","createdAt":now()});
        self.store.save_project_record(record.clone())?;
        Ok(record)
    }
    pub async fn starter_open(&self, input: Value) -> Result<Value> {
        let mut library = self.starter.lock().await;
        let id = text(&input, "id");
        if let Some(open) = library.opened.get(id)
            && !open.task.is_finished()
        {
            return Ok(
                json!({"url":format!("http://127.0.0.1:{}/#token={}",open.port,open.core.token)}),
            );
        }
        library.opened.remove(id);
        check(
            library.opened.len() < 8,
            409,
            "Eight projects are already open. Close a project before opening another",
        )?;
        let record = self
            .store
            .projects()?
            .into_iter()
            .find(|r| r["id"] == id)
            .ok_or_else(|| anyhow::anyhow!("Choose a project from your library"))?;
        let root = directory(text(&record, "path"))?;
        check(
            root == Path::new(text(&record, "path")),
            409,
            "The project folder moved or became a link. Add its current location again",
        )?;
        let mut config = Config::load(&root)?;
        config.execution.enabled = false;
        config.server.port = 0;
        let core = Core::open(&root, config).await?;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();
        let url = format!("http://127.0.0.1:{port}/#token={}", core.token);
        let serving = core.clone();
        let task = tokio::spawn(async move {
            if let Err(e) = crate::server::serve(serving, listener).await {
                eprintln!("Project server stopped: {e}");
            }
        });
        library
            .opened
            .insert(id.into(), OpenProject { core, port, task });
        Ok(json!({"url":url}))
    }
    pub async fn starter_remove(&self, input: Value) -> Result<Value> {
        check(
            input["confirm"] == true,
            400,
            "Confirm removing the library entry",
        )?;
        self.starter_close(input.clone()).await?;
        let _library = self.starter.lock().await;
        let mut rows = self.store.projects()?;
        rows.retain(|r| r["id"] != input["id"]);
        self.store.db.lock().unwrap().execute(
            "UPDATE preferences SET data=? WHERE key='project-library'",
            [serde_json::to_string(&rows)?],
        )?;
        Ok(json!({"removed": true, "filesPreserved": true}))
    }
    pub async fn starter_close(&self, input: Value) -> Result<Value> {
        let opened = self.starter.lock().await.opened.remove(text(&input, "id"));
        if let Some(open) = opened {
            open.core.stop.cancel();
            let _ = tokio::time::timeout(std::time::Duration::from_secs(20), open.task).await;
        }
        Ok(json!({"closed":true}))
    }
}
