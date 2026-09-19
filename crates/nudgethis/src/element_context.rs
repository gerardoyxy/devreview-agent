use crate::error::check;
use anyhow::Result;
use serde_json::{Value, json};
use std::collections::HashSet;

pub fn normalize(source: &Value) -> Result<Value> {
    check(
        source.is_null() || source.is_object(),
        400,
        "Invalid element context",
    )?;
    let mut context = if let Some(elements) = source.get("elements") {
        let elements = elements.as_array();
        check(
            elements.is_some_and(|items| (1..=20).contains(&items.len())),
            400,
            "Select between 1 and 20 elements",
        )?;
        let mut targets = Vec::new();
        let mut selectors = HashSet::new();
        for element in elements.unwrap() {
            check(
                element.is_object() && element.get("elements").is_none(),
                400,
                "Use a flat list of selected elements",
            )?;
            let target = single(element)?;
            check(
                target["url"] != "" && target["selector"] != "" && target["tagName"] != "",
                400,
                "Each selected element needs a page URL, selector and tag name",
            )?;
            check(
                selectors.insert(target["selector"].as_str().unwrap().to_owned()),
                400,
                "Selected elements must have unique selectors",
            )?;
            if let Some(first) = targets.first() {
                let first: &Value = first;
                check(
                    first["url"] == target["url"],
                    400,
                    "Select elements from the same page",
                )?;
            }
            targets.push(target);
        }
        let mut context = targets[0].clone();
        context["elements"] = targets.into();
        context
    } else {
        single(source)?
    };
    context["sourceVerified"] = false.into();
    check(
        serde_json::to_vec(&context)?.len() <= 48 * 1024,
        400,
        "Selected element context exceeds 48 KiB. Select fewer elements or disable DOM capture.",
    )?;
    Ok(context)
}

fn single(source: &Value) -> Result<Value> {
    let mut context = json!({"sourceVerified":false});
    for (key, max) in [
        ("url", 2000),
        ("route", 1000),
        ("selector", 1000),
        ("tagName", 80),
        ("text", 1000),
        ("testId", 200),
        ("ariaLabel", 200),
        ("source", 1000),
        ("domSnippet", 4000),
    ] {
        context[key] = source[key]
            .as_str()
            .unwrap_or("")
            .chars()
            .take(max)
            .collect::<String>()
            .into();
    }
    if context["url"] != "" {
        let url = url::Url::parse(context["url"].as_str().unwrap());
        check(url.is_ok(), 400, "A valid HTTP page URL is required")?;
        let mut url = url?;
        check(
            matches!(url.scheme(), "http" | "https"),
            400,
            "A valid HTTP page URL is required",
        )?;
        let _ = url.set_username("");
        let _ = url.set_password(None);
        url.set_query(None);
        url.set_fragment(None);
        context["url"] = url.as_str().into();
        context["route"] = url.path().into();
    }
    for (key, fields) in [
        ("viewport", vec!["width", "height"]),
        ("boundingBox", vec!["x", "y", "width", "height"]),
    ] {
        context[key] = json!({});
        for field in fields {
            context[key][field] = source[key][field]
                .as_f64()
                .unwrap_or(0.)
                .clamp(-100_000., 100_000.)
                .into();
        }
    }
    Ok(context)
}
