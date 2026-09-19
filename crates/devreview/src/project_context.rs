//! Explicit, bounded user-authored context. No filesystem traversal or skill execution.
use crate::{config::valid_id, error::check, store::now};
use anyhow::Result;
use serde_json::{Value, json};
use std::collections::HashSet;

pub fn empty() -> Value {
    json!({"version":1,"revision":0,"items":[]})
}
pub fn validate_ids(value: &Value) -> Result<()> {
    let ids = value.as_array();
    check(
        ids.is_some_and(|a| a.len() <= 32),
        400,
        "Select at most 32 context items",
    )?;
    let mut unique = HashSet::new();
    for id in ids.unwrap() {
        check(
            id.as_str().is_some_and(|s| valid_id(s) && unique.insert(s)),
            400,
            "Invalid or duplicate context ID",
        )?;
    }
    Ok(())
}
pub fn save(input: &Value, previous: &Value) -> Result<Value> {
    check(
        input["version"] == 1 && input["revision"].as_u64().is_some(),
        400,
        "Invalid project context version or revision",
    )?;
    check(
        input["revision"] == previous["revision"],
        409,
        "Project context changed in another window. Reload the saved context before saving again.",
    )?;
    let rows = input["items"].as_array();
    check(
        rows.is_some_and(|a| a.len() <= 32),
        400,
        "Project context supports at most 32 items",
    )?;
    let mut ids = HashSet::new();
    let mut items = Vec::new();
    for row in rows.unwrap() {
        let id = row["id"].as_str().unwrap_or("");
        let title = row["title"].as_str().unwrap_or("").trim();
        let content = row["content"].as_str().unwrap_or("");
        let source = row["source"].as_str().unwrap_or("");
        check(
            valid_id(id) && ids.insert(id),
            400,
            "Invalid or duplicate context ID",
        )?;
        check(
            matches!(
                row["kind"].as_str(),
                Some("instruction" | "skill" | "document")
            ),
            400,
            "Choose Instructions, Skill, or Documentation",
        )?;
        check(
            !title.is_empty() && title.chars().count() <= 120 && source.chars().count() <= 180,
            400,
            "Use a title up to 120 characters and a source name up to 180 characters",
        )?;
        check(
            !content.trim().is_empty() && content.len() <= 16_384,
            400,
            "Each context item needs text up to 16 KiB",
        )?;
        check(
            [title, content, source].iter().all(|s| {
                s.chars()
                    .all(|c| !c.is_control() || matches!(c, '\n' | '\r' | '\t'))
            }),
            400,
            "Context must be plain text",
        )?;
        check(
            row["default"].is_boolean(),
            400,
            "Default context selection must be a boolean",
        )?;
        let mut item = json!({"id":id,"kind":row["kind"],"title":title,"content":content,"source":source,"default":row["default"]});
        let old = previous["items"]
            .as_array()
            .and_then(|a| a.iter().find(|v| v["id"] == id));
        let unchanged = old.is_some_and(|old| {
            ["kind", "title", "content", "source", "default"]
                .iter()
                .all(|key| old[key] == item[key])
        });
        item["revision"] =
            (old.and_then(|v| v["revision"].as_u64()).unwrap_or(0) + u64::from(!unchanged)).into();
        item["updatedAt"] = if unchanged {
            old.unwrap()["updatedAt"].clone()
        } else {
            now().into()
        };
        items.push(item);
    }
    let result =
        json!({"version":1,"revision":previous["revision"].as_u64().unwrap_or(0)+1,"items":items});
    check(
        result.to_string().len() <= 131_072,
        413,
        "Project context library exceeds 128 KiB. Remove or shorten some items.",
    )?;
    snapshot(&result, None)?; // A saved default must fit a task's budget.
    Ok(result)
}
pub fn snapshot(library: &Value, selected: Option<&Value>) -> Result<Value> {
    if let Some(ids) = selected {
        validate_ids(ids)?;
    }
    let all = library["items"].as_array().unwrap();
    let ids: Vec<&str> = if let Some(ids) = selected {
        ids.as_array()
            .unwrap()
            .iter()
            .map(|id| id.as_str().unwrap())
            .collect()
    } else {
        all.iter()
            .filter(|v| v["default"] == true)
            .map(|v| v["id"].as_str().unwrap())
            .collect()
    };
    let mut items = Vec::new();
    for id in ids {
        let item = all.iter().find(|v| v["id"] == id);
        check(
            item.is_some(),
            400,
            "A selected context item no longer exists. Reload Project context and select again.",
        )?;
        items.push(item.unwrap().clone());
    }
    let result =
        json!({"version":1,"libraryRevision":library["revision"],"capturedAt":now(),"items":items});
    check(
        result.to_string().len() <= 49_152,
        413,
        "Selected context exceeds 48 KiB. Select fewer items or shorten their content.",
    )?;
    Ok(result)
}
