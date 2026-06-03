use reqwest::Url;

#[derive(Debug, thiserror::Error)]
pub enum ApiEndpointError {
    #[error("API 地址格式不正确: {0}")]
    InvalidUrl(String),
}

pub fn join_api_endpoint(
    base_url: &str,
    api_path: Option<&str>,
    default_path: &str,
) -> Result<String, ApiEndpointError> {
    let mut url = Url::parse(base_url.trim())
        .map_err(|error| ApiEndpointError::InvalidUrl(error.to_string()))?;
    let Some(api_path) = api_path else {
        return append_or_replace_legacy_path(url, default_path);
    };

    let api_path = api_path.trim().trim_matches('/');
    if api_path.is_empty() {
        url.set_query(None);
        return Ok(url.into());
    }

    let mut segments = url
        .path_segments()
        .map(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if let Some(first_api_segment) = api_path
        .split('/')
        .find(|segment| !segment.trim().is_empty())
        .map(str::to_string)
    {
        if let Some(index) = segments
            .iter()
            .position(|segment| segment == &first_api_segment)
        {
            segments.truncate(index);
        }
    }
    segments.extend(
        api_path
            .split('/')
            .filter(|segment| !segment.is_empty())
            .map(str::to_string),
    );
    url.set_path(&format!("/{}", segments.join("/")));
    url.set_query(None);
    Ok(url.into())
}

fn append_or_replace_legacy_path(
    mut url: Url,
    default_path: &str,
) -> Result<String, ApiEndpointError> {
    let segments = url
        .path_segments()
        .map(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut next = if let Some(index) = segments.iter().rposition(|segment| segment == "v1") {
        segments[..index].to_vec()
    } else if let Some(first_api_segment) = default_path
        .trim_matches('/')
        .split('/')
        .find(|segment| !segment.is_empty())
    {
        if let Some(index) = segments
            .iter()
            .position(|segment| segment == first_api_segment)
        {
            segments[..index].to_vec()
        } else {
            segments
        }
    } else {
        segments
    };
    next.extend(
        default_path
            .trim_matches('/')
            .split('/')
            .filter(|segment| !segment.is_empty())
            .map(str::to_string),
    );
    url.set_path(&format!("/{}", next.join("/")));
    url.set_query(None);
    Ok(url.into())
}
