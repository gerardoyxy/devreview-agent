//! Embedded, versioned starting points. No generated commands or remote template execution.
use crate::workspace::text;
use anyhow::Result;
use serde_json::{Value, json};
pub fn paths(template: &str) -> Vec<&'static str> {
    let mut paths = vec![".gitignore", "README.md", "nudgethis.toml"];
    paths.extend(match template {
        "astro" => vec![
            "package.json",
            "tsconfig.json",
            "src/project.json",
            "src/style.css",
            "src/pages/index.astro",
            "src/pages/first-note.astro",
        ],
        "react" => vec![
            "package.json",
            "tsconfig.json",
            "index.html",
            "src/project.json",
            "src/style.css",
            "src/main.tsx",
            "src/vite-env.d.ts",
        ],
        _ => vec!["index.html", "style.css"],
    });
    paths
}
fn html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}
pub fn files(plan: &Value) -> Result<Vec<(String, String)>> {
    let template = text(plan, "template");
    let a = &plan["diagnosis"]["answers"];
    let title = text(plan, "name")
        .split('-')
        .map(|word| {
            let mut chars = word.chars();
            chars
                .next()
                .map(|c| c.to_uppercase().collect::<String>() + chars.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ");
    let project = json!({"title":title,"objective":a["objective"],"audience":a["audience"]});
    let render = |source: &str| {
        source
            .replace("__TITLE__", &html(&title))
            .replace("__OBJECTIVE__", &html(text(a, "objective")))
            .replace("__AUDIENCE__", &html(text(a, "audience")))
    };
    let mut files=vec![(".gitignore".into(),".nudgethis/\nnode_modules/\ndist/\n.astro/\n.env\n.env.*\n!.env.example\n*.pem\n*.key\n.DS_Store\n".into()),("README.md".into(),format!("# {title}\n\nCreated with NudgeThis. Open this folder from the NudgeThis welcome screen.\nUse **Preview** to review dependency installation and start or stop the local preview.\n\nThe project goal and starting decisions are saved in local Project context.\nSave a first local version before asking an agent to make changes.\nNo GitHub repository is created automatically.\n\n{}\n",if template=="website" {"This website uses HTML and CSS with no package dependencies. Deploy its public files to a static host when ready."} else {"Install the pinned dependencies, save the generated package-lock.json, and use npm run build for a production build. The starter is an interface, not an implemented authentication, payment or shared-data service."}))];
    let css = include_str!("../../../starters/shared.css").to_owned();
    match template {
        "astro" => {
            files.extend([
                ("package.json".into(),serde_json::to_string_pretty(&json!({"name":plan["name"],"private":true,"version":"0.1.0","type":"module","scripts":{"dev":"astro dev","build":"astro build"},"engines":{"node":">=22.12.0"},"dependencies":{"astro":"7.3.3"}}))?),
                ("tsconfig.json".into(),"{\"extends\":\"astro/tsconfigs/strict\"}\n".into()),
                ("src/project.json".into(),serde_json::to_string_pretty(&project)?),("src/style.css".into(),css),
                ("src/pages/index.astro".into(),include_str!("../../../starters/astro/src/pages/index.astro").into()),
                ("src/pages/first-note.astro".into(),include_str!("../../../starters/astro/src/pages/first-note.astro").into())
            ]);
        }
        "react" => {
            files.extend([
                ("package.json".into(),serde_json::to_string_pretty(&json!({"name":plan["name"],"private":true,"version":"0.1.0","type":"module","scripts":{"dev":"vite","build":"tsc --noEmit && vite build"},"engines":{"node":">=22.12.0"},"dependencies":{"react":"19.3.0","react-dom":"19.3.0"},"devDependencies":{"vite":"8.3.0","typescript":"7.0.2","@types/react":"19.3.0","@types/react-dom":"19.3.0"}}))?),
                ("tsconfig.json".into(),serde_json::to_string_pretty(&json!({"compilerOptions":{"target":"ES2022","lib":["ES2022","DOM","DOM.Iterable"],"module":"ESNext","moduleResolution":"Bundler","jsx":"react-jsx","strict":true,"noEmit":true,"resolveJsonModule":true,"allowSyntheticDefaultImports":true,"skipLibCheck":true},"include":["src"]}))?),
                ("index.html".into(),render(include_str!("../../../starters/react/index.html"))),
                ("src/project.json".into(),serde_json::to_string_pretty(&project)?),("src/style.css".into(),css),
                ("src/main.tsx".into(),include_str!("../../../starters/react/src/main.tsx").into()),
                ("src/vite-env.d.ts".into(),"/// <reference types=\"vite/client\" />\n".into())
            ]);
        }
        _ => files.extend([
            (
                "index.html".into(),
                render(include_str!("../../../starters/website/index.html")),
            ),
            ("style.css".into(), css),
        ]),
    }
    Ok(files)
}
