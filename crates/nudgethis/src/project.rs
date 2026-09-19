use crate::config::Config;
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

fn file(root: &Path, name: &str) -> bool {
    std::fs::symlink_metadata(root.join(name))
        .is_ok_and(|m| m.is_file() && !m.file_type().is_symlink())
}
pub fn executable(command: &str) -> bool {
    fn exists(path: &Path) -> bool {
        if !path.is_file() {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::metadata(path).is_ok_and(|m| m.permissions().mode() & 0o111 != 0)
        }
        #[cfg(not(unix))]
        {
            true
        }
    }
    let candidates: Vec<PathBuf> = if Path::new(command).components().count() > 1 {
        vec![PathBuf::from(command)]
    } else {
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
            .map(|p| p.join(command))
            .collect()
    };
    candidates.iter().any(|p| {
        if exists(p) {
            return true;
        }
        #[cfg(windows)]
        {
            ["exe", "cmd", "bat", "com"]
                .iter()
                .any(|ext| exists(&p.with_extension(ext)))
        }
        #[cfg(not(windows))]
        {
            false
        }
    })
}

/// Inspect declarative project metadata only. Never invoke package scripts or providers.
pub fn inspect(root: &Path) -> Result<Value> {
    let package = if file(root, "package.json") {
        ensure!(
            std::fs::metadata(root.join("package.json"))?.len() <= 1_048_576,
            "package.json exceeds 1 MiB"
        );
        serde_json::from_str::<Value>(&std::fs::read_to_string(root.join("package.json"))?)?
    } else {
        json!({})
    };
    let managers = [
        ("bun", vec!["bun.lock", "bun.lockb"]),
        ("pnpm", vec!["pnpm-lock.yaml"]),
        ("yarn", vec!["yarn.lock"]),
        ("npm", vec!["package-lock.json", "npm-shrinkwrap.json"]),
    ];
    let locks: Vec<_> = managers
        .iter()
        .filter(|(_, files)| files.iter().any(|p| file(root, p)))
        .map(|(manager, _)| *manager)
        .collect();
    let declared = package["packageManager"]
        .as_str()
        .unwrap_or("")
        .split('@')
        .next()
        .unwrap_or("");
    let manager = if managers.iter().any(|(m, _)| *m == declared) {
        declared
    } else {
        locks
            .first()
            .copied()
            .unwrap_or(if file(root, "package.json") {
                "npm"
            } else {
                ""
            })
    };
    let mut frameworks = vec![];
    for (dependency, label) in [
        ("react", "React"),
        ("vue", "Vue"),
        ("@angular/core", "Angular"),
        ("svelte", "Svelte"),
        ("next", "Next.js"),
        ("nuxt", "Nuxt"),
        ("astro", "Astro"),
        ("vite", "Vite"),
    ] {
        if package["dependencies"].get(dependency).is_some()
            || package["devDependencies"].get(dependency).is_some()
        {
            frameworks.push(label);
        }
    }
    let mut backends = vec![];
    for (name, label) in [
        ("Cargo.toml", "Rust"),
        ("pyproject.toml", "Python"),
        ("requirements.txt", "Python"),
        ("go.mod", "Go"),
        ("composer.json", "PHP"),
        ("pom.xml", "Java"),
        ("build.gradle", "JVM"),
    ] {
        if file(root, name) && !backends.contains(&label) {
            backends.push(label);
        }
    }
    let mut warnings = vec![];
    if locks.len() > 1 || locks.iter().any(|m| !declared.is_empty() && *m != declared) {
        warnings.push(
            "Multiple or conflicting package-manager declarations. Review the suggested commands.",
        );
    }
    let setup = match manager {
        "bun" => {
            if locks.contains(&"bun") {
                "bun install --frozen-lockfile"
            } else {
                "bun install"
            }
        }
        "pnpm" => {
            if locks.contains(&"pnpm") {
                "pnpm install --frozen-lockfile"
            } else {
                "pnpm install"
            }
        }
        "yarn" => {
            if declared.starts_with("yarn")
                && package["packageManager"]
                    .as_str()
                    .is_some_and(|v| !v.starts_with("yarn@1."))
            {
                "yarn install --immutable"
            } else {
                "yarn install --frozen-lockfile"
            }
        }
        "npm" => {
            if locks.contains(&"npm") {
                "npm ci"
            } else {
                "npm install"
            }
        }
        _ => "",
    };
    let mut validation = vec![];
    let mut scripts = vec![];
    for name in ["test", "typecheck", "check", "lint", "build"] {
        if package["scripts"][name]
            .as_str()
            .is_some_and(|s| !s.trim().is_empty())
        {
            scripts.push(name);
            if !manager.is_empty() {
                validation.push(format!("{manager} run {name}"));
            }
        }
    }
    if validation.is_empty() && backends.contains(&"Rust") {
        validation.push("cargo check --locked".into());
    }
    if validation.is_empty() {
        warnings.push(
            "No validation commands detected. Configure checks before relying on a ready change.",
        );
    }
    if !setup.is_empty()
        && !setup.contains("frozen")
        && !setup.contains("immutable")
        && setup != "npm ci"
    {
        warnings.push("No frozen dependency install was detected. Commit a lockfile and review setup commands.");
    }
    let port = if frameworks.contains(&"Angular") {
        4200
    } else if frameworks.contains(&"Vite") {
        5173
    } else {
        3000
    };
    Ok(
        json!({"frameworks":frameworks,"backends":backends,"packageManager":manager,"packageManagerAvailable":!manager.is_empty() && executable(manager),"scripts":scripts,"suggestedSetup":if setup.is_empty(){vec![]}else{vec![setup]},"suggestedValidation":validation,"suggestedOrigin":format!("http://localhost:{port}"),"warnings":warnings}),
    )
}
pub fn suggested_config(root: &Path) -> Result<Config> {
    let project = inspect(root)?;
    let mut config = Config::default();
    config.setup.commands = serde_json::from_value(project["suggestedSetup"].clone())?;
    config.validation.commands = serde_json::from_value(project["suggestedValidation"].clone())?;
    let origin = project["suggestedOrigin"].as_str().unwrap().to_owned();
    if !config.server.allowed_origins.contains(&origin) {
        config.server.allowed_origins.push(origin);
    }
    Ok(config)
}
pub fn doctor(root: &Path, config: &Config) -> Result<Value> {
    let device_browser = crate::device_preview::availability();
    let project = inspect(root)?;
    let providers: Vec<_> = config.agents.iter().map(|a| json!({"id":a.id,"executableAvailable":executable(&a.command),"authentication":"not checked"})).collect();
    Ok(
        json!({"project":project,"gitAvailable":executable("git"),"configurationExists":file(root,"nudgethis.toml"),"executionEnabled":config.execution_enabled(),"agents":providers,"deviceBrowser":device_browser,"setupCommands":config.setup.commands,"validationCommands":config.validation.commands,"validationConfigured":!config.validation.commands.is_empty(),"allowedOrigins":config.server.allowed_origins,"note":"Diagnostics inspect files and executable paths only. They do not run commands, contact providers or verify authentication."}),
    )
}
