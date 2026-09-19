use crate::{error::check, git::Repository};
use anyhow::Result;
use serde_json::{Value, json};
use std::{collections::BTreeMap, path::Path};

pub fn empty() -> Value {
    json!({"version":1,"revision":0,"origin":"","scannedAt":null,"head":"","routes":[],"warnings":[]})
}
pub fn origin(value: &str) -> Result<String> {
    let parsed = url::Url::parse(value);
    check(
        parsed.is_ok(),
        400,
        "Enter a localhost origin including its port",
    )?;
    let url = parsed?;
    check(
        matches!(url.scheme(), "http" | "https")
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
            && url.origin().ascii_serialization() == value,
        400,
        "Use an explicit loopback origin without credentials, a path, query or fragment",
    )?;
    Ok(value.into())
}
fn concrete_path(value: &str) -> bool {
    value.starts_with('/')
        && !value.starts_with("//")
        && value.len() <= 2000
        && !value.chars().any(|c| {
            c.is_control() || matches!(c, '\\' | '#' | '?' | ':' | '*' | '[' | ']' | '{' | '}')
        })
        && !value.split('/').any(|p| p == ".." || p == ".")
        && !value.to_ascii_lowercase().contains("%2f")
        && !value.to_ascii_lowercase().contains("%5c")
}
fn route(pattern: &str, source: &str, needs_url: bool) -> Value {
    json!({"id":pattern,"pattern":pattern,"path":if needs_url {""}else{pattern},"source":source,"needsUrl":needs_url,"desktop":{"status":"pending"},"mobile":{"status":"pending"}})
}
fn file_route(file: &str) -> Option<String> {
    let (directory, extension) = file.rsplit_once('.')?;
    if ![
        "tsx", "jsx", "ts", "js", "vue", "svelte", "astro", "md", "mdx",
    ]
    .contains(&extension)
    {
        return None;
    }
    for prefix in ["app/", "src/app/"] {
        if let Some(rest) = directory.strip_prefix(prefix)
            && (rest == "page" || rest.ends_with("/page"))
        {
            let path = rest.strip_suffix("page")?.trim_end_matches('/');
            let segments: Vec<_> = path
                .split('/')
                .filter(|p| !p.is_empty() && !(p.starts_with('(') && p.ends_with(')')))
                .collect();
            if segments
                .iter()
                .any(|p| p.starts_with('@') || p.starts_with('_') || p.starts_with('('))
            {
                return None;
            }
            return Some(format!("/{}", segments.join("/")));
        }
    }
    for prefix in ["pages/", "src/pages/", "app/pages/"] {
        if let Some(rest) = directory.strip_prefix(prefix) {
            if rest == "api"
                || rest.starts_with("api/")
                || rest.split('/').any(|p| p.starts_with('_'))
            {
                return None;
            }
            return Some(format!(
                "/{}",
                rest.strip_suffix("/index")
                    .unwrap_or(if rest == "index" { "" } else { rest })
            ));
        }
    }
    if let Some(rest) = directory.strip_prefix("src/routes/")
        && (rest == "+page" || rest.ends_with("/+page"))
    {
        let segments: Vec<_> = rest
            .trim_end_matches("+page")
            .trim_end_matches('/')
            .split('/')
            .filter(|p| !p.is_empty() && !(p.starts_with('(') && p.ends_with(')')))
            .collect();
        return Some(format!("/{}", segments.join("/")));
    }
    None
}
// Conservative literal discovery. Expressions and nested relative declarations require a concrete URL.
fn literal_routes(text: &str) -> Vec<(String, bool)> {
    let mut routes = vec![];
    for (index, _) in text.match_indices("path") {
        if index > 0
            && text[..index]
                .chars()
                .next_back()
                .is_some_and(|c| c.is_alphanumeric() || c == '_')
        {
            continue;
        }
        let rest = text[index + 4..].trim_start();
        let Some(rest) = rest.strip_prefix(':').or_else(|| rest.strip_prefix('=')) else {
            continue;
        };
        let rest = rest.trim_start().trim_start_matches('{').trim_start();
        let Some(quote) = rest.chars().next().filter(|c| matches!(c, '\'' | '"')) else {
            continue;
        };
        let Some(end) = rest[1..].find(quote) else {
            continue;
        };
        let value = &rest[1..end + 1];
        if value.len() > 1000 || value.contains('\\') || value.contains(' ') {
            continue;
        }
        let relative = !value.starts_with('/');
        let pattern = if relative {
            format!("/{value}")
        } else {
            value.into()
        };
        routes.push((pattern, relative));
    }
    routes
}
pub async fn scan(repository: &Repository, input: &Value) -> Result<Value> {
    let origin = origin(input["origin"].as_str().unwrap_or(""))?;
    let files = repository
        .git(
            &[
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
                "-z",
            ],
            &repository.root,
            "",
        )
        .await?;
    let mut routes = BTreeMap::new();
    let mut skipped = 0;
    let mut inspected = 0;
    for file in files.split('\0').filter(|s| !s.is_empty()) {
        if crate::git::safe_path(file).is_err() {
            continue;
        }
        if file.split('/').any(|p| {
            matches!(
                p,
                "node_modules"
                    | "dist"
                    | "build"
                    | "target"
                    | "tests"
                    | "__tests__"
                    | "fixtures"
                    | ".next"
                    | ".nuxt"
            )
        }) {
            continue;
        }
        let path = repository.root.join(file);
        if path
            .ancestors()
            .take_while(|p| *p != repository.root)
            .any(|p| std::fs::symlink_metadata(p).is_ok_and(|m| m.file_type().is_symlink()))
        {
            continue;
        }
        if let Some(pattern) = file_route(file) {
            let needs = !concrete_path(&pattern);
            routes
                .entry(pattern.clone())
                .or_insert_with(|| route(&pattern, file, needs));
        }
        if file == "index.html" || file == "public/index.html" {
            routes
                .entry("/".into())
                .or_insert_with(|| route("/", file, false));
        }
        let ext = Path::new(file)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if !["js", "jsx", "ts", "tsx", "vue"].contains(&ext) || file.ends_with(".d.ts") {
            continue;
        }
        if inspected >= 3000 || std::fs::metadata(&path).is_ok_and(|m| m.len() > 262_144) {
            skipped += 1;
            continue;
        }
        inspected += 1;
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        for (pattern, relative) in literal_routes(&text) {
            let needs = relative || !concrete_path(&pattern);
            routes
                .entry(pattern.clone())
                .or_insert_with(|| route(&pattern, file, needs));
            check(
                routes.len() <= 1000,
                413,
                "More than 1000 route candidates. Narrow your tracked source files before scanning.",
            )?;
        }
    }
    check(
        routes.len() <= 1000,
        413,
        "More than 1000 route candidates. Narrow your source files before scanning.",
    )?;
    let mut warnings = vec!["Static route candidates are not an exhaustive runtime crawl. Confirm nested routes, redirects, generated routes and sign-in requirements; add missing URLs manually.".to_owned()];
    if skipped > 0 {
        warnings.push(format!(
            "Skipped {skipped} large files or files beyond the 3000-file scan limit."
        ));
    }
    let mut value = empty();
    value["origin"] = origin.into();
    value["scannedAt"] = crate::store::now().into();
    value["head"] = repository.inspect().await?["head"].clone();
    value["routes"] = routes.into_values().collect::<Vec<_>>().into();
    value["warnings"] = warnings.into();
    Ok(value)
}
pub fn change(previous: &Value, input: &Value) -> Result<Value> {
    let mut next = previous.clone();
    let routes = next["routes"].as_array_mut().unwrap();
    let action = input["action"].as_str().unwrap_or("");
    if action == "add" {
        let path = input["path"].as_str().unwrap_or("");
        check(
            concrete_path(path),
            400,
            "Use a concrete relative URL path, without a query or fragment",
        )?;
        check(
            routes.len() < 1000 && !routes.iter().any(|r| r["id"] == path),
            409,
            "Route already exists or the 1000-route limit was reached",
        )?;
        routes.push(route(path, "Added manually", false));
        return Ok(next);
    }
    let id = input["id"].as_str().unwrap_or("");
    let index = routes.iter().position(|r| r["id"] == id);
    check(index.is_some(), 404, "Route not found")?;
    let index = index.unwrap();
    if action == "remove" {
        routes.remove(index);
        return Ok(next);
    }
    let route = &mut routes[index];
    if action == "resolve" {
        let path = input["path"].as_str().unwrap_or("");
        check(
            concrete_path(path),
            400,
            "Enter a concrete path such as /products/123",
        )?;
        route["path"] = path.into();
        route["needsUrl"] = false.into();
        route["desktop"] = json!({"status":"pending"});
        route["mobile"] = json!({"status":"pending"});
    } else {
        check(action == "review", 400, "Unknown route action")?;
        let viewport = input["viewport"].as_str().unwrap_or("");
        check(
            matches!(viewport, "desktop" | "mobile"),
            400,
            "Choose desktop or mobile",
        )?;
        let status = input["status"].as_str().unwrap_or("");
        check(
            matches!(status, "reviewed" | "blocked" | "pending"),
            400,
            "Invalid review status",
        )?;
        check(
            route["needsUrl"] == false || status != "reviewed",
            409,
            "Resolve this route's URL first",
        )?;
        let note = input["note"].as_str().unwrap_or("");
        check(
            note.chars().count() <= 2000 && (status != "blocked" || !note.trim().is_empty()),
            400,
            "Use a note up to 2000 characters; blocked views need a reason",
        )?;
        let width = input["width"].as_u64().unwrap_or(0);
        check(
            status != "reviewed"
                || if viewport == "mobile" {
                    (320..=480).contains(&width)
                } else {
                    (1024..=2560).contains(&width)
                },
            400,
            "Review at a mobile width of 320–480 px or desktop width of 1024–2560 px",
        )?;
        route[viewport] = json!({"status":status,"note":note,"width":width,"at":crate::store::now(),"method":"manual-browser-review"});
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn file_routes_include_dynamic_patterns_and_skip_api_files() {
        assert_eq!(
            file_route("src/app/(shop)/products/[id]/page.tsx"),
            Some("/products/[id]".into())
        );
        assert_eq!(file_route("pages/blog/index.vue"), Some("/blog".into()));
        assert_eq!(
            file_route("src/routes/(app)/settings/+page.svelte"),
            Some("/settings".into())
        );
        assert_eq!(file_route("pages/api/users.ts"), None);
        assert_eq!(file_route("src/app/api/route.ts"), None);
        assert_eq!(
            literal_routes("<Route path=\"/home\"/> { path: 'child' }"),
            vec![("/home".into(), false), ("/child".into(), true)]
        );
    }
    #[test]
    fn coverage_is_explicit_and_dynamic_routes_need_resolution() {
        let mut report = empty();
        report["routes"] = json!([route("/users/:id", "routes.ts", true)]);
        let input = json!({"action":"review","id":"/users/:id","viewport":"mobile","status":"reviewed","width":390});
        assert!(change(&report, &input).is_err());
        let report = change(
            &report,
            &json!({"action":"resolve","id":"/users/:id","path":"/users/123"}),
        )
        .unwrap();
        let report = change(&report, &input).unwrap();
        assert_eq!(report["routes"][0]["mobile"]["status"], "reviewed");
        assert_eq!(report["routes"][0]["desktop"]["status"], "pending");
        assert!(change(&report, &json!({"action":"review","id":"/users/:id","viewport":"desktop","status":"reviewed","width":390})).is_err());
        for value in [
            "https://example.com",
            "http://user:pass@localhost:3000",
            "http://localhost:3000/path",
        ] {
            assert!(origin(value).is_err());
        }
    }
}
