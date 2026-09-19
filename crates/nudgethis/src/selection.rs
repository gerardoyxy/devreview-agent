use crate::error::check;
use anyhow::Result;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Controls {
    version: u8,
    revision: u64,
    pointer: Pointer,
    keyboard: Option<Keyboard>,
    #[serde(default, rename = "additiveModifier")]
    additive_modifier: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Pointer {
    button: Option<u8>,
    modifiers: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Keyboard {
    code: String,
    modifiers: Vec<String>,
}
fn modifiers(values: &[String]) -> bool {
    values.len() <= 4
        && values
            .iter()
            .all(|s| matches!(s.as_str(), "alt" | "control" | "shift" | "meta"))
        && values.iter().collect::<HashSet<_>>().len() == values.len()
}
pub fn validate(value: &Value) -> Result<()> {
    check(
        value.get("keyboard").is_some() && value["pointer"].get("button").is_some(),
        400,
        "Include mouse button and keyboard shortcut, or use null to disable them",
    )?;
    let parsed = serde_json::from_value::<Controls>(value.clone());
    check(parsed.is_ok(), 400, "Invalid selection controls")?;
    let controls = parsed?;
    check(
        controls
            .additive_modifier
            .as_deref()
            .is_none_or(|value| matches!(value, "alt" | "control" | "shift" | "meta")),
        400,
        "Choose a modifier for adding elements, or disable it",
    )?;
    check(
        controls.version == 1 && controls.revision < 9_007_199_254_740_991,
        400,
        "Invalid selection controls version or revision",
    )?;
    check(
        controls.pointer.button.is_none_or(|n| n <= 4) && modifiers(&controls.pointer.modifiers),
        400,
        "Choose a mouse button and unique modifiers",
    )?;
    if let Some(keyboard) = controls.keyboard {
        // Browser KeyboardEvent.code values; Escape and Tab remain available for navigation.
        let code = &keyboard.code;
        let valid =
            (code.starts_with("Key") && code.len() == 4 && code.as_bytes()[3].is_ascii_uppercase())
                || (code.starts_with("Digit")
                    && code.len() == 6
                    && code.as_bytes()[5].is_ascii_digit())
                || code
                    .strip_prefix('F')
                    .is_some_and(|s| (1..=12).any(|n| s == n.to_string()))
                || matches!(
                    code.as_str(),
                    "Space"
                        | "Enter"
                        | "Backquote"
                        | "Minus"
                        | "Equal"
                        | "BracketLeft"
                        | "BracketRight"
                        | "Backslash"
                        | "Semicolon"
                        | "Quote"
                        | "Comma"
                        | "Period"
                        | "Slash"
                        | "ArrowUp"
                        | "ArrowDown"
                        | "ArrowLeft"
                        | "ArrowRight"
                        | "Home"
                        | "End"
                        | "PageUp"
                        | "PageDown"
                        | "Insert"
                        | "Delete"
                        | "Backspace"
                )
                || code.strip_prefix("Numpad").is_some_and(|s| {
                    (s.len() == 1 && s.as_bytes()[0].is_ascii_digit())
                        || matches!(
                            s,
                            "Add" | "Subtract" | "Multiply" | "Divide" | "Decimal" | "Enter"
                        )
                });
        check(
            valid && modifiers(&keyboard.modifiers),
            400,
            "Choose a key other than Escape, Tab or a modifier on its own",
        )?;
    }
    Ok(())
}
