pub fn first_api_key(value: &str) -> Option<&str> {
    value
        .split(',')
        .map(str::trim)
        .find(|item| !item.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_first_non_empty_api_key_from_comma_separated_value() {
        assert_eq!(first_api_key("  , sk-first , sk-second "), Some("sk-first"));
    }

    #[test]
    fn returns_none_when_api_key_field_is_blank() {
        assert_eq!(first_api_key(" ,   "), None);
    }
}
