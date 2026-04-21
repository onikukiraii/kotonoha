use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value as JsonValue};
use serde_yml::Value as YamlValue;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SplitResult {
    pub fm: Option<String>,
    pub body: String,
    pub had_frontmatter: bool,
}

const DELIMITER: &str = "---";

static ISO_DATE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$",
    )
    .unwrap()
});

pub fn split_frontmatter(md: &str) -> SplitResult {
    let lines: Vec<&str> = md.split('\n').collect();
    if lines.is_empty() || lines[0] != DELIMITER {
        return SplitResult {
            fm: None,
            body: md.to_string(),
            had_frontmatter: false,
        };
    }
    let close_line = lines[1..]
        .iter()
        .position(|&l| l == DELIMITER)
        .map(|i| i + 1);
    let Some(close_line) = close_line else {
        return SplitResult {
            fm: None,
            body: md.to_string(),
            had_frontmatter: false,
        };
    };
    let fm_lines = &lines[1..close_line];
    let fm = if fm_lines.is_empty() {
        String::new()
    } else {
        let mut joined = fm_lines.join("\n");
        joined.push('\n');
        joined
    };
    let body = lines[close_line + 1..].join("\n");
    SplitResult {
        fm: Some(fm),
        body,
        had_frontmatter: true,
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "outcome")]
pub enum ParseOutcome {
    #[serde(rename = "ok")]
    Ok {
        had_frontmatter: bool,
        properties: serde_json::Map<String, JsonValue>,
        body: String,
    },
    #[serde(rename = "error")]
    Err { error: &'static str },
}

pub fn parse_frontmatter(md: &str) -> ParseOutcome {
    let split = split_frontmatter(md);
    let Some(fm) = split.fm.clone() else {
        return ParseOutcome::Ok {
            had_frontmatter: false,
            properties: serde_json::Map::new(),
            body: split.body,
        };
    };
    if fm.trim().is_empty() {
        return ParseOutcome::Ok {
            had_frontmatter: true,
            properties: serde_json::Map::new(),
            body: split.body,
        };
    }
    let parsed: YamlValue = match serde_yml::from_str(&fm) {
        Ok(v) => v,
        Err(_) => {
            return ParseOutcome::Err {
                error: "yaml_parse_error",
            }
        }
    };
    let YamlValue::Mapping(map) = parsed else {
        return ParseOutcome::Err {
            error: "yaml_parse_error",
        };
    };
    let mut props = serde_json::Map::new();
    for (key, value) in map {
        let Some(key) = key.as_str() else { continue };
        props.insert(key.to_string(), yaml_to_typed(&value));
    }
    ParseOutcome::Ok {
        had_frontmatter: true,
        properties: props,
        body: split.body,
    }
}

fn yaml_to_typed(v: &YamlValue) -> JsonValue {
    match v {
        YamlValue::Null => json!({ "type": "null", "value": null }),
        YamlValue::Bool(b) => json!({ "type": "bool", "value": b }),
        YamlValue::Number(n) => json!({ "type": "number", "value": number_to_json(n) }),
        YamlValue::String(s) => {
            if ISO_DATE_RE.is_match(s) {
                json!({ "type": "date", "value": s })
            } else {
                json!({ "type": "string", "value": s })
            }
        }
        YamlValue::Sequence(seq) => {
            let arr: Vec<JsonValue> = seq.iter().map(yaml_to_plain).collect();
            json!({ "type": "list", "value": arr })
        }
        YamlValue::Mapping(map) => {
            let mut obj = serde_json::Map::new();
            for (k, val) in map {
                if let Some(k) = k.as_str() {
                    obj.insert(k.to_string(), yaml_to_plain(val));
                }
            }
            json!({ "type": "object", "value": obj })
        }
        YamlValue::Tagged(t) => yaml_to_typed(&t.value),
    }
}

fn yaml_to_plain(v: &YamlValue) -> JsonValue {
    match v {
        YamlValue::Null => JsonValue::Null,
        YamlValue::Bool(b) => JsonValue::Bool(*b),
        YamlValue::Number(n) => number_to_json(n),
        YamlValue::String(s) => JsonValue::String(s.clone()),
        YamlValue::Sequence(seq) => JsonValue::Array(seq.iter().map(yaml_to_plain).collect()),
        YamlValue::Mapping(map) => {
            let mut obj = serde_json::Map::new();
            for (k, val) in map {
                if let Some(k) = k.as_str() {
                    obj.insert(k.to_string(), yaml_to_plain(val));
                }
            }
            JsonValue::Object(obj)
        }
        YamlValue::Tagged(t) => yaml_to_plain(&t.value),
    }
}

fn number_to_json(n: &serde_yml::Number) -> JsonValue {
    if let Some(i) = n.as_i64() {
        return JsonValue::from(i);
    }
    if let Some(u) = n.as_u64() {
        return JsonValue::from(u);
    }
    if let Some(f) = n.as_f64() {
        return serde_json::Number::from_f64(f)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null);
    }
    JsonValue::Null
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn fixture_dir() -> PathBuf {
        // CARGO_MANIFEST_DIR = <repo>/apps/desktop/src-tauri
        let manifest = env!("CARGO_MANIFEST_DIR");
        PathBuf::from(manifest)
            .parent() // apps/desktop
            .unwrap()
            .parent() // apps
            .unwrap()
            .parent() // <repo>
            .unwrap()
            .join("packages/base/test-fixtures/frontmatter")
    }

    fn read(name: &str) -> String {
        fs::read_to_string(fixture_dir().join(name)).unwrap()
    }

    fn expected() -> JsonValue {
        serde_json::from_str(&read("expected.json")).unwrap()
    }

    fn expected_for(key: &str) -> JsonValue {
        expected().get(key).unwrap().clone()
    }

    fn to_snapshot(outcome: ParseOutcome) -> JsonValue {
        match outcome {
            ParseOutcome::Ok {
                had_frontmatter,
                properties,
                body,
            } => json!({
                "ok": true,
                "hadFrontmatter": had_frontmatter,
                "properties": properties,
                "body": body,
            }),
            ParseOutcome::Err { error } => json!({
                "ok": false,
                "error": error,
            }),
        }
    }

    #[test]
    fn simple_md_matches_ts_fixture() {
        let got = to_snapshot(parse_frontmatter(&read("simple.md")));
        assert_eq!(got, expected_for("simple.md"));
    }

    #[test]
    fn date_md_matches_ts_fixture() {
        let got = to_snapshot(parse_frontmatter(&read("date.md")));
        assert_eq!(got, expected_for("date.md"));
    }

    #[test]
    fn nested_md_matches_ts_fixture() {
        let got = to_snapshot(parse_frontmatter(&read("nested.md")));
        assert_eq!(got, expected_for("nested.md"));
    }

    #[test]
    fn no_fm_md_matches_ts_fixture() {
        let got = to_snapshot(parse_frontmatter(&read("no-fm.md")));
        assert_eq!(got, expected_for("no-fm.md"));
    }

    #[test]
    fn empty_fm_md_matches_ts_fixture() {
        let got = to_snapshot(parse_frontmatter(&read("empty-fm.md")));
        assert_eq!(got, expected_for("empty-fm.md"));
    }

    #[test]
    fn invalid_md_errors() {
        let outcome = parse_frontmatter(&read("invalid.md"));
        match outcome {
            ParseOutcome::Err { error } => assert_eq!(error, "yaml_parse_error"),
            _ => panic!("expected Err, got Ok"),
        }
    }

    #[test]
    fn split_returns_fm_null_when_first_line_not_delimiter() {
        let r = split_frontmatter("Plain body\n");
        assert!(!r.had_frontmatter);
        assert!(r.fm.is_none());
        assert_eq!(r.body, "Plain body\n");
    }
}
