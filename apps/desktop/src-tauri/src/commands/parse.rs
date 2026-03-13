use pulldown_cmark::{html, CodeBlockKind, Event, Options, Parser, Tag};
use regex::Regex;

pub fn extract_wikilinks(content: &str) -> Vec<String> {
    let re = Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].to_string())
        .collect()
}

pub fn extract_tags(content: &str) -> Vec<String> {
    let re = Regex::new(r"(?:^|\s)#([a-zA-Z0-9_\p{Hiragana}\p{Katakana}\p{Han}]+)").unwrap();
    let mut tags: Vec<String> = re
        .captures_iter(content)
        .map(|cap| cap[1].to_string())
        .collect();
    tags.sort();
    tags.dedup();
    tags
}

#[tauri::command]
pub fn render_markdown(content: &str, _vault_path: &str) -> String {
    // Replace wikilinks with placeholders before markdown parsing
    let wikilink_re = Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    let with_placeholders = wikilink_re.replace_all(content, |caps: &regex::Captures| {
        let target = &caps[1];
        format!("<a class=\"wikilink\" data-target=\"{}\">{}</a>", target, target)
    });

    // Replace tags
    let tag_re =
        Regex::new(r"(?:^|\s)#([a-zA-Z0-9_\p{Hiragana}\p{Katakana}\p{Han}]+)").unwrap();
    let with_tags = tag_re.replace_all(&with_placeholders, |caps: &regex::Captures| {
        let tag = &caps[1];
        format!(" <span class=\"tag\">#{}</span>", tag)
    });

    // Parse markdown with source line annotations for scroll sync
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let with_tags_owned = with_tags.into_owned();
    let line_at = |offset: usize| -> usize {
        with_tags_owned.as_bytes()[..offset]
            .iter()
            .filter(|&&b| b == b'\n')
            .count()
            + 1
    };

    let parser = Parser::new_ext(&with_tags_owned, options).into_offset_iter();
    let events = parser.flat_map(|(event, range)| {
        let line = line_at(range.start);
        match event {
            Event::Start(Tag::Paragraph) => {
                vec![Event::Html(
                    format!("<p data-source-line=\"{}\">", line).into(),
                )]
            }
            Event::Start(Tag::Heading { level, .. }) => {
                vec![Event::Html(
                    format!("<h{} data-source-line=\"{}\">", level as usize, line).into(),
                )]
            }
            Event::Start(Tag::BlockQuote(_)) => {
                vec![Event::Html(
                    format!("<blockquote data-source-line=\"{}\">", line).into(),
                )]
            }
            Event::Start(Tag::CodeBlock(kind)) => {
                let html_str = match &kind {
                    CodeBlockKind::Fenced(lang) if !lang.is_empty() => {
                        format!(
                            "<pre data-source-line=\"{}\"><code class=\"language-{}\">",
                            line, lang
                        )
                    }
                    _ => format!("<pre data-source-line=\"{}\"><code>", line),
                };
                vec![Event::Html(html_str.into())]
            }
            Event::Start(Tag::List(start)) => {
                let html_str = match start {
                    Some(1) => format!("<ol data-source-line=\"{}\">", line),
                    Some(n) => format!("<ol start=\"{}\" data-source-line=\"{}\">", n, line),
                    None => format!("<ul data-source-line=\"{}\">", line),
                };
                vec![Event::Html(html_str.into())]
            }
            Event::Rule => {
                vec![Event::Html(
                    format!("<hr data-source-line=\"{}\" />", line).into(),
                )]
            }
            other => vec![other],
        }
    });

    let mut html_output = String::new();
    html::push_html(&mut html_output, events);

    html_output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_wikilinks() {
        let content = "See [[note1]] and [[subdir/note2]]";
        let links = extract_wikilinks(content);
        assert_eq!(links, vec!["note1", "subdir/note2"]);
    }

    #[test]
    fn test_extract_tags() {
        let content = "Hello #rust and #テスト";
        let tags = extract_tags(content);
        assert!(tags.contains(&"rust".to_string()));
        assert!(tags.contains(&"テスト".to_string()));
    }
}
