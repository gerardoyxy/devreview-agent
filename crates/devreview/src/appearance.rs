use crate::error::check;
use anyhow::Result;
use base64::Engine;
use serde_json::Value;

pub const COLORS: [&str; 18] = [
    "page",
    "surface",
    "elevated",
    "text",
    "muted",
    "border",
    "accent",
    "onAccent",
    "accentSoft",
    "success",
    "successSoft",
    "danger",
    "dangerSoft",
    "warning",
    "warningSoft",
    "info",
    "infoSoft",
    "backdrop",
];
pub fn validate(value: &Value) -> Result<()> {
    check(
        value["version"] == 1
            && matches!(value["mode"].as_str(), Some("light" | "dark" | "system")),
        400,
        "Invalid appearance version or mode",
    )?;
    for mode in ["light", "dark"] {
        for color in COLORS {
            check(
                value["palettes"][mode][color].as_str().is_some_and(|s| {
                    s.len() == 7
                        && s.starts_with('#')
                        && s[1..].bytes().all(|c| c.is_ascii_hexdigit())
                }),
                400,
                "Colors must use #RRGGBB",
            )?;
        }
    }
    for key in ["body", "heading", "mono"] {
        let name = value["fonts"][key].as_str().unwrap_or("");
        check(
            !name.is_empty()
                && name.len() <= 160
                && name
                    .chars()
                    .all(|c| c.is_alphanumeric() || " ,_-".contains(c)),
            400,
            "Use a font family name or comma-separated fallback list",
        )?;
    }
    check(
        value["fontSize"]
            .as_u64()
            .is_some_and(|n| (12..=20).contains(&n))
            && value["radius"].as_u64().is_some_and(|n| n <= 24),
        400,
        "Invalid font size or radius",
    )?;
    let fonts = value["customFonts"].as_array();
    check(
        fonts.is_some_and(|f| f.len() <= 3),
        400,
        "At most three uploaded fonts are supported",
    )?;
    let mut total = 0;
    let mut names = std::collections::HashSet::new();
    for font in fonts.unwrap() {
        let name = font["name"].as_str().unwrap_or("");
        check(
            name.starts_with("DevReviewFont")
                && name.len() <= 64
                && name.bytes().all(|c| c.is_ascii_alphanumeric())
                && names.insert(name),
            400,
            "Invalid or duplicate uploaded font name",
        )?;
        let data =
            base64::engine::general_purpose::STANDARD.decode(font["data"].as_str().unwrap_or(""));
        check(data.is_ok(), 400, "Invalid font data")?;
        let data = data?;
        total += data.len();
        check(
            data.starts_with(b"wOF2") || data.starts_with(b"wOFF"),
            400,
            "Upload a WOFF or WOFF2 font",
        )?;
    }
    check(
        total <= 1_048_576,
        413,
        "Uploaded fonts must total at most 1 MiB",
    )?;
    Ok(())
}
