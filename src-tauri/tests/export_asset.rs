use sam_image_app_v3_lib::generation::{
    export_asset_data_url, export_asset_metadata_json, sanitize_export_name,
};

#[test]
fn exports_svg_data_url_to_requested_directory() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let data_url = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==";

    let output = export_asset_data_url(data_url, temp_dir.path(), "封面图: 01 / draft?", "svg")
        .expect("asset should export");

    assert_eq!(
        output.file_name().and_then(|value| value.to_str()),
        Some("封面图_01_draft.svg")
    );
    assert_eq!(
        std::fs::read_to_string(output).expect("exported file"),
        r#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#
    );
}

#[test]
fn rejects_non_data_url_exports() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let error = export_asset_data_url("https://example.com/a.svg", temp_dir.path(), "bad", "svg")
        .expect_err("remote URLs should not be exported as local data");

    assert!(error.to_string().contains("data URL"));
}

#[test]
fn rejects_unsupported_export_formats() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let data_url = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==";

    let error = export_asset_data_url(data_url, temp_dir.path(), "bad", "html")
        .expect_err("unsupported export formats should fail");

    assert!(error.to_string().contains("不支持的导出格式"));
}

#[test]
fn exports_metadata_json_sidecar_to_requested_directory() {
    let temp_dir = tempfile::tempdir().expect("temp dir");

    let output = export_asset_metadata_json(
        temp_dir.path(),
        "封面图: 01 / draft?",
        r#"{"prompt":"导出元数据"}"#,
    )
    .expect("metadata should export");

    assert_eq!(
        output.file_name().and_then(|value| value.to_str()),
        Some("封面图_01_draft.metadata.json")
    );
    assert_eq!(
        std::fs::read_to_string(output).expect("exported metadata"),
        r#"{"prompt":"导出元数据"}"#
    );
}

#[test]
fn sanitizes_empty_export_name() {
    assert_eq!(sanitize_export_name("  : / ? *  "), "samimage-export");
}
