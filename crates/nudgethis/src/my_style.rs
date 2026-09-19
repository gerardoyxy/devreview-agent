//! Local, user-confirmed design preferences. Repetition is evidence, never automatic consent.
use crate::{config::valid_id, error::check, store::now};
use anyhow::Result;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub fn empty() -> Value {
    json!({"version":1,"revision":0,"profiles":[],"activeId":null,"dismissed":[]})
}
fn text(value: &Value, limit: usize) -> bool {
    value
        .as_str()
        .is_some_and(|s| s.len() <= limit && s.chars().all(|c| !c.is_control() || c == '\n'))
}
fn color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].bytes().all(|c| c.is_ascii_hexdigit())
}
fn font(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= 160
        && value
            .chars()
            .all(|c| c.is_alphanumeric() || " ,_-".contains(c))
}
fn number(value: &str, unit: &str, min: f64, max: f64) -> bool {
    value
        .strip_suffix(unit)
        .and_then(|s| s.parse::<f64>().ok())
        .is_some_and(|n| n.is_finite() && (min..=max).contains(&n))
}
pub fn valid_rule(property: &str, value: &str) -> bool {
    match property {
        "color" | "background-color" | "border-color" => color(value),
        "border-radius" | "padding" | "gap" => number(value, "px", 0., 128.),
        "font-size" => number(value, "px", 10., 96.),
        "font-weight" => matches!(value, "400" | "500" | "600" | "700" | "800" | "900"),
        "line-height" => number(value, "", 1., 2.5),
        "font-family" => font(value),
        _ => false,
    }
}
fn valid_scope(value: &Value) -> bool {
    matches!(
        value.as_str(),
        Some("global" | "buttons" | "inputs" | "headings" | "surfaces")
    )
}
fn profile(input: &Value, previous: Option<&Value>) -> Result<Value> {
    let id = input["id"].as_str().unwrap_or("");
    check(
        valid_id(id) && valid_id(&context_id(id)) && id.starts_with("style-"),
        400,
        "Invalid style profile ID",
    )?;
    check(
        text(&input["name"], 100) && !input["name"].as_str().unwrap_or("").trim().is_empty(),
        400,
        "Name your style using up to 100 characters",
    )?;
    check(
        matches!(
            input["direction"].as_str(),
            Some("quiet" | "editorial" | "bold")
        ),
        400,
        "Choose a style direction",
    )?;
    let branch = input["branch"].as_str().unwrap_or("");
    let branches: &[&str] = match input["direction"].as_str() {
        Some("quiet") => &["airy", "balanced", "compact"],
        Some("editorial") => &["reading", "publication", "technical"],
        _ => &["color", "contrast", "shape"],
    };
    check(
        branches.contains(&branch),
        400,
        "Choose a detail that belongs to your style direction",
    )?;
    let tokens = &input["tokens"];
    let mut clean = json!({});
    for key in [
        "background",
        "surface",
        "text",
        "muted",
        "accent",
        "onAccent",
        "border",
    ] {
        check(
            tokens[key].as_str().is_some_and(color),
            400,
            "Style colors must use #RRGGBB",
        )?;
        clean[key] = tokens[key].as_str().unwrap().to_lowercase().into();
    }
    for key in ["bodyFont", "headingFont"] {
        check(
            tokens[key].as_str().is_some_and(font),
            400,
            "Use installed font family names separated by commas",
        )?;
        clean[key] = tokens[key].clone();
    }
    for (key, min, max) in [
        ("fontSize", 12, 24),
        ("spacing", 4, 48),
        ("radius", 0, 32),
        ("headingWeight", 400, 900),
    ] {
        check(
            tokens[key]
                .as_u64()
                .is_some_and(|n| (min..=max).contains(&n)),
            400,
            "Style size, spacing, radius or weight is outside its range",
        )?;
        clean[key] = tokens[key].clone();
    }
    check(
        text(&input["notes"], 4000),
        400,
        "Keep style notes to 4000 bytes of plain text",
    )?;
    let rules = input["rules"].as_array();
    check(
        rules.is_some_and(|r| r.len() <= 32),
        400,
        "Use at most 32 style rules",
    )?;
    let mut normalized = vec![];
    let mut unique = BTreeSet::new();
    for rule in rules.unwrap() {
        let property = rule["property"].as_str().unwrap_or("");
        let value = rule["value"].as_str().unwrap_or("").trim();
        let scope = rule["scope"].as_str().unwrap_or("");
        check(
            valid_scope(&rule["scope"])
                && valid_rule(property, value)
                && unique.insert((scope, property)),
            400,
            "Use a supported value and one rule per property and scope",
        )?;
        let prior = previous
            .and_then(|p| p["rules"].as_array())
            .and_then(|rules| {
                rules.iter().find(|r| {
                    r["scope"] == scope && r["property"] == property && r["value"] == value
                })
            });
        normalized.push(prior.cloned().unwrap_or_else(|| json!({"scope":scope,"property":property,"value":value,"source":"manual","evidence":[]})));
    }
    Ok(
        json!({"id":id,"name":input["name"].as_str().unwrap().trim(),"direction":input["direction"],"branch":branch,"tokens":clean,"notes":input["notes"],"rules":normalized,"version":previous.and_then(|p|p["version"].as_u64()).unwrap_or(0)+1,"updatedAt":now()}),
    )
}
pub fn context_id(id: &str) -> String {
    format!("my-{id}")
}
pub fn guide(profile: &Value) -> String {
    let tokens = &profile["tokens"];
    let mut lines = vec![format!("# {} — style v{}", profile["name"].as_str().unwrap(), profile["version"]),
        "Apply these user-approved design preferences only within the requested scope. Reuse the project's existing design tokens and components where possible. Preserve behavior, content, responsive layouts and accessible states. If a preference conflicts with readability or a project requirement, explain the conflict before changing it.".into(),
        "\n## Base preferences".into()];
    for (key, label) in [
        ("background", "Page background"),
        ("surface", "Surface"),
        ("text", "Text"),
        ("muted", "Secondary text"),
        ("accent", "Accent"),
        ("onAccent", "Text on accent"),
        ("border", "Border"),
        ("bodyFont", "Body font"),
        ("headingFont", "Heading font"),
        ("fontSize", "Body size in px"),
        ("spacing", "Base spacing in px"),
        ("radius", "Corner radius in px"),
        ("headingWeight", "Heading weight"),
    ] {
        lines.push(format!(
            "- {label}: {}",
            tokens[key]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| tokens[key].to_string())
        ));
    }
    lines.push("\n## Scoped rules (override base preferences in their scope)".into());
    for rule in profile["rules"].as_array().unwrap() {
        lines.push(format!(
            "- {}: {} = {}",
            rule["scope"].as_str().unwrap(),
            rule["property"].as_str().unwrap(),
            rule["value"].as_str().unwrap()
        ));
    }
    if let Some(notes) = profile["notes"].as_str().filter(|s| !s.is_empty()) {
        lines.push(format!("\n## Additional user guidance\n{notes}"));
    }
    lines.join("\n")
}
fn candidate_id(property: &str, value: &str) -> String {
    let hash = format!("{property}:{value}")
        .bytes()
        .fold(0xcbf29ce484222325u64, |h, b| {
            (h ^ u64::from(b)).wrapping_mul(0x100000001b3)
        });
    format!("pattern-{hash:016x}")
}
/// Conservative exact-value patterns in CSS declaration corrections, not prose or model inference.
pub fn suggestions(tasks: &[Value], dismissed: &Value) -> Vec<Value> {
    let mut patterns: BTreeMap<(String, String), Vec<Value>> = BTreeMap::new();
    for task in tasks.iter().filter(|t| t["status"] == "applied").take(200) {
        let diff = task["diff"].as_str().unwrap_or("");
        if diff.len() > 262_144 {
            continue;
        }
        let mut css = false;
        let mut before: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut after: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        for line in diff.lines().take(10000) {
            if let Some(path) = line.strip_prefix("+++ b/") {
                css = path.ends_with(".css") || path.ends_with(".scss");
                continue;
            }
            if line.starts_with("diff --git ") {
                css = false;
                continue;
            }
            if !css || line.starts_with("---") {
                continue;
            }
            let (map, declaration) = if let Some(s) = line.strip_prefix('+') {
                (&mut after, s)
            } else if let Some(s) = line.strip_prefix('-') {
                (&mut before, s)
            } else {
                continue;
            };
            let Some((key, value)) = declaration
                .trim()
                .strip_suffix(';')
                .and_then(|s| s.split_once(':'))
            else {
                continue;
            };
            let property = key.trim();
            let value = value.trim();
            if valid_rule(property, value) {
                map.entry(property.to_owned())
                    .or_default()
                    .insert(value.to_owned());
            }
        }
        for (property, values) in after {
            let Some(old) = before.get(&property) else {
                continue;
            };
            if values.len() != 1 || old.len() != 1 || values == *old {
                continue;
            }
            let value = values.into_iter().next().unwrap();
            let rows = patterns.entry((property, value)).or_default();
            if !rows.iter().any(|t| t["id"] == task["id"]) {
                rows.push(json!({"id":task["id"],"route":task["context"]["route"],"tagName":task["context"]["tagName"]}));
            }
        }
    }
    patterns.into_iter().filter_map(|((property,value),evidence)| {
        let id = candidate_id(&property,&value);
        if evidence.len() < 3 || dismissed.as_array().is_some_and(|d|d.iter().any(|s|s == &id)) { return None; }
        let same_tag = evidence.iter().all(|e| e["tagName"] == evidence[0]["tagName"]);
        let scope = if same_tag { match evidence[0]["tagName"].as_str() { Some("button" | "a")=>"buttons", Some("input" | "textarea" | "select")=>"inputs",Some("h1" | "h2" | "h3" | "h4")=>"headings",_=>"global" } } else { "global" };
        Some(json!({"id":id,"property":property,"value":value,"scope":scope,"count":evidence.len(),"evidence":evidence.into_iter().take(12).collect::<Vec<_>>()}))
    }).take(64).collect()
}
pub fn mutate(
    input: &Value,
    previous: &Value,
    tasks: &[Value],
    context: &Value,
) -> Result<(Value, Value)> {
    check(
        input["revision"] == previous["revision"],
        409,
        "My Style changed in another window. Reload before saving.",
    )?;
    let mut next = previous.clone();
    let id = input["profileId"]
        .as_str()
        .or(input["profile"]["id"].as_str())
        .unwrap_or("");
    let position = next["profiles"]
        .as_array()
        .unwrap()
        .iter()
        .position(|p| p["id"] == id);
    let action = input["action"].as_str().unwrap_or("");
    let mut publish = None;
    let mut remove = None;
    match action {
        "save" | "import" => {
            check(
                input.get("profileId").is_none() || input["profileId"] == input["profile"]["id"],
                400,
                "Profile identifiers must match",
            )?;
            check(
                action != "import" || position.is_none(),
                409,
                "Import using a new profile ID",
            )?;
            let value = profile(&input["profile"], position.map(|p| &next["profiles"][p]))?;
            if let Some(p) = position {
                next["profiles"][p] = value;
            } else {
                check(
                    next["profiles"].as_array().unwrap().len() < 12,
                    400,
                    "Keep at most 12 style profiles",
                )?;
                next["profiles"].as_array_mut().unwrap().push(value);
            }
            if next["activeId"] == id {
                publish = Some(id.to_owned());
            }
        }
        "delete" => {
            check(position.is_some(), 404, "Style profile not found")?;
            next["profiles"]
                .as_array_mut()
                .unwrap()
                .remove(position.unwrap());
            remove = Some(context_id(id));
            if next["activeId"] == id {
                next["activeId"] = Value::Null;
            }
        }
        "publish" | "activate" => {
            check(position.is_some(), 404, "Save your style before using it")?;
            publish = Some(id.to_owned());
            if action == "activate" {
                next["activeId"] = id.into();
            }
        }
        "deactivate" => {
            next["activeId"] = Value::Null;
        }
        "accept" => {
            check(
                position.is_some(),
                404,
                "Save your style before adding a suggestion",
            )?;
            let candidates = suggestions(tasks, &next["dismissed"]);
            let candidate = candidates.iter().find(|c| c["id"] == input["suggestionId"]);
            check(
                candidate.is_some(),
                409,
                "This pattern no longer has enough applied corrections. Reload suggestions.",
            )?;
            check(
                valid_scope(&input["scope"]),
                400,
                "Choose where this rule applies",
            )?;
            let c = candidate.unwrap();
            let p = &mut next["profiles"][position.unwrap()];
            let rules = p["rules"].as_array_mut().unwrap();
            rules.retain(|r| r["property"] != c["property"] || r["scope"] != input["scope"]);
            check(rules.len() < 32, 400, "Use at most 32 style rules")?;
            rules.push(json!({"scope":input["scope"],"property":c["property"],"value":c["value"],"source":"accepted-pattern","evidence":c["evidence"].as_array().unwrap().iter().map(|e|e["id"].clone()).collect::<Vec<_>>()}));
            p["version"] = (p["version"].as_u64().unwrap() + 1).into();
            p["updatedAt"] = now().into();
            if next["activeId"] == id {
                publish = Some(id.to_owned());
            }
        }
        "dismiss" => {
            let candidates = suggestions(tasks, &next["dismissed"]);
            check(
                candidates.iter().any(|c| c["id"] == input["suggestionId"]),
                409,
                "Suggestion no longer available",
            )?;
            let dismissed = next["dismissed"].as_array_mut().unwrap();
            check(
                dismissed.len() < 256,
                400,
                "Clear dismissed suggestions before hiding more",
            )?;
            dismissed.push(input["suggestionId"].clone());
        }
        "reset-dismissed" => {
            next["dismissed"] = json!([]);
        }
        _ => {
            check(false, 400, "Unknown My Style action")?;
        }
    }
    let mut library = context.clone();
    if let Some(remove) = remove {
        library["items"]
            .as_array_mut()
            .unwrap()
            .retain(|i| i["id"] != remove);
    }
    if let Some(id) = publish {
        let p = next["profiles"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == id)
            .unwrap();
        let item = json!({"id":context_id(&id),"kind":"instruction","title":format!("Style: {}",p["name"].as_str().unwrap()),"content":guide(p),"source":format!("My Style / {} / v{}",id,p["version"]),"default":next["activeId"] == id});
        let items = library["items"].as_array_mut().unwrap();
        if let Some(index) = items.iter().position(|i| i["id"] == item["id"]) {
            items[index] = item;
        } else {
            items.push(item);
        }
    }
    for p in previous["profiles"]
        .as_array()
        .unwrap()
        .iter()
        .chain(next["profiles"].as_array().unwrap())
    {
        for item in library["items"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .filter(|i| i["id"] == context_id(p["id"].as_str().unwrap()))
        {
            item["default"] = (next["activeId"] == p["id"]).into();
        }
    }
    if library != *context {
        library = crate::project_context::save(&library, context)?;
    }
    next["revision"] = (previous["revision"].as_u64().unwrap() + 1).into();
    check(
        next.to_string().len() <= 262_144,
        413,
        "Style library exceeds 256 KiB; shorten notes or remove profiles",
    )?;
    Ok((next, library))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn correction(id: &str, old: &str, new: &str) -> Value {
        json!({"id":id,"status":"applied","context":{"tagName":"button","route":"/settings"},"diff":format!("diff --git a/src/ui.css b/src/ui.css\n--- a/src/ui.css\n+++ b/src/ui.css\n@@ -1,3 +1,3 @@\n .button {{\n-  border-radius: {old};\n+  border-radius: {new};\n }}\n")})
    }
    fn corrections() -> Vec<Value> {
        vec![
            correction("QA-1", "4px", "12px"),
            correction("QA-2", "6px", "12px"),
            correction("QA-3", "8px", "12px"),
        ]
    }
    fn sample() -> Value {
        json!({"id":"style-sample","name":"Sample","direction":"quiet","branch":"balanced","notes":"","rules":[],"tokens":{"background":"#ffffff","surface":"#ffffff","text":"#172143","muted":"#566480","accent":"#2147cc","onAccent":"#ffffff","border":"#bdc8de","bodyFont":"system-ui, sans-serif","headingFont":"Georgia, serif","fontSize":16,"spacing":16,"radius":6,"headingWeight":700}})
    }
    #[test]
    fn patterns_require_distinct_applied_corrections_and_keep_evidence() {
        let mut tasks = corrections();
        assert!(suggestions(&tasks[..2], &json!([])).is_empty());
        tasks.push(tasks[0].clone());
        let found = suggestions(&tasks, &json!([]));
        assert_eq!(found.len(), 1);
        assert_eq!(found[0]["count"], 3);
        assert_eq!(found[0]["scope"], "buttons");
        assert_eq!(found[0]["evidence"][0]["id"], "QA-1");
        assert!(suggestions(&tasks, &json!([found[0]["id"]])).is_empty());
        tasks[1]["status"] = "undone".into();
        assert!(suggestions(&tasks, &json!([])).is_empty());
    }
    #[test]
    fn patterns_skip_additions_ambiguous_values_and_non_css() {
        let original = corrections();
        for diff in [
            "+++ b/ui.css\n+  border-radius: 12px;\n",
            "+++ b/ui.css\n-  border-radius: 4px;\n+  border-radius: 12px;\n+  border-radius: 20px;\n",
            "+++ b/example.md\n-  border-radius: 4px;\n+  border-radius: 12px;\n",
            "+++ b/ui.css\n-  border-radius: 12px;\n+  border-radius: 12px;\n",
        ] {
            let mut tasks = original.clone();
            tasks[2]["diff"] = diff.into();
            assert!(suggestions(&tasks, &json!([])).is_empty(), "{diff}");
        }
        let mut mixed = original;
        mixed[2]["context"]["tagName"] = "div".into();
        assert_eq!(suggestions(&mixed, &json!([]))[0]["scope"], "global");
    }
    #[test]
    fn acceptance_rechecks_evidence_and_requires_explicit_scope() {
        let tasks = corrections();
        let candidate = &suggestions(&tasks, &json!([]))[0];
        let (saved, context) = mutate(
            &json!({"revision":0,"action":"save","profile":sample()}),
            &empty(),
            &tasks,
            &crate::project_context::empty(),
        )
        .unwrap();
        assert!(saved["profiles"][0]["rules"].as_array().unwrap().is_empty());
        let mut request = json!({"revision":1,"action":"accept","profileId":"style-sample","suggestionId":candidate["id"]});
        assert!(mutate(&request, &saved, &tasks, &context).is_err());
        request["scope"] = "inputs".into();
        assert!(mutate(&request, &saved, &tasks[..2], &context).is_err());
        let (accepted, _) = mutate(&request, &saved, &tasks, &context).unwrap();
        assert_eq!(
            accepted["profiles"][0]["rules"][0],
            json!({"scope":"inputs","property":"border-radius","value":"12px","source":"accepted-pattern","evidence":["QA-1","QA-2","QA-3"]})
        );
        assert_eq!(accepted["profiles"][0]["version"], 2);
        assert_eq!(
            profile(&accepted["profiles"][0], Some(&accepted["profiles"][0])).unwrap()["rules"],
            accepted["profiles"][0]["rules"]
        );
        assert_eq!(
            profile(&accepted["profiles"][0], None).unwrap()["rules"][0]["source"],
            "manual"
        );
    }
}
