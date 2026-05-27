use sqlx::{Row, SqlitePool, Transaction};

use crate::{api::prompt_assets::PromptAsset, error::AppResult};

fn to_json(values: &[String]) -> AppResult<String> {
    Ok(serde_json::to_string(values)?)
}

fn from_json(value: String) -> AppResult<Vec<String>> {
    Ok(serde_json::from_str(&value)?)
}

fn optional_trimmed(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
}

async fn upsert_prompt_asset(
    transaction: &mut Transaction<'_, sqlx::Sqlite>,
    asset: &PromptAsset,
) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO prompt_assets (
          id, title, content, source, source_id, source_url, license, author,
          categories_json, tags_json, use_cases_json, preview_images_json,
          reference_images_json, language, favorite, usage_count, imported_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          content = excluded.content,
          source = excluded.source,
          source_id = excluded.source_id,
          source_url = excluded.source_url,
          license = excluded.license,
          author = excluded.author,
          categories_json = excluded.categories_json,
          tags_json = excluded.tags_json,
          use_cases_json = excluded.use_cases_json,
          preview_images_json = excluded.preview_images_json,
          reference_images_json = excluded.reference_images_json,
          language = excluded.language,
          imported_at = excluded.imported_at,
          updated_at = excluded.updated_at
        "#,
    )
    .bind(asset.id.trim())
    .bind(asset.title.trim())
    .bind(asset.content.trim())
    .bind(asset.source.trim())
    .bind(optional_trimmed(&asset.source_id))
    .bind(optional_trimmed(&asset.source_url))
    .bind(optional_trimmed(&asset.license))
    .bind(optional_trimmed(&asset.author))
    .bind(to_json(&asset.categories)?)
    .bind(to_json(&asset.tags)?)
    .bind(to_json(&asset.use_cases)?)
    .bind(to_json(&asset.preview_images)?)
    .bind(to_json(&asset.reference_images)?)
    .bind(asset.language.trim())
    .bind(if asset.favorite { 1 } else { 0 })
    .bind(asset.usage_count)
    .bind(asset.imported_at.trim())
    .bind(asset.updated_at.trim())
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

pub async fn list_prompt_assets(pool: &SqlitePool) -> AppResult<Vec<PromptAsset>> {
    let rows = sqlx::query(
        r#"
        SELECT
          id, title, content, source, source_id, source_url, license, author,
          categories_json, tags_json, use_cases_json, preview_images_json,
          reference_images_json, language, favorite, usage_count, imported_at, updated_at
        FROM prompt_assets
        ORDER BY favorite DESC, usage_count DESC, updated_at DESC, title ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(PromptAsset {
                id: row.try_get("id")?,
                title: row.try_get("title")?,
                content: row.try_get("content")?,
                source: row.try_get("source")?,
                source_id: row.try_get("source_id")?,
                source_url: row.try_get("source_url")?,
                license: row.try_get("license")?,
                author: row.try_get("author")?,
                categories: from_json(row.try_get("categories_json")?)?,
                tags: from_json(row.try_get("tags_json")?)?,
                use_cases: from_json(row.try_get("use_cases_json")?)?,
                preview_images: from_json(row.try_get("preview_images_json")?)?,
                reference_images: from_json(row.try_get("reference_images_json")?)?,
                language: row.try_get("language")?,
                favorite: row.try_get::<i64, _>("favorite")? == 1,
                usage_count: row.try_get("usage_count")?,
                imported_at: row.try_get("imported_at")?,
                updated_at: row.try_get("updated_at")?,
            })
        })
        .collect()
}

pub async fn import_prompt_assets(
    pool: &SqlitePool,
    assets: &[PromptAsset],
) -> AppResult<Vec<PromptAsset>> {
    let mut transaction = pool.begin().await?;
    for asset in assets {
        upsert_prompt_asset(&mut transaction, asset).await?;
    }
    transaction.commit().await?;

    list_prompt_assets(pool).await
}

pub async fn increment_prompt_usage(pool: &SqlitePool, id: &str) -> AppResult<Vec<PromptAsset>> {
    sqlx::query(
        r#"
        UPDATE prompt_assets
        SET usage_count = usage_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        "#,
    )
    .bind(id)
    .execute(pool)
    .await?;

    list_prompt_assets(pool).await
}

pub async fn toggle_prompt_favorite(pool: &SqlitePool, id: &str) -> AppResult<Vec<PromptAsset>> {
    sqlx::query(
        r#"
        UPDATE prompt_assets
        SET favorite = CASE favorite WHEN 1 THEN 0 ELSE 1 END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        "#,
    )
    .bind(id)
    .execute(pool)
    .await?;

    list_prompt_assets(pool).await
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::db::init_sqlite;

    use super::*;

    fn test_asset() -> PromptAsset {
        PromptAsset {
            id: "prompt-test".to_string(),
            title: "测试提示词".to_string(),
            content: "cinematic product photography".to_string(),
            source: "builtin".to_string(),
            source_id: Some("builtin-test".to_string()),
            source_url: None,
            license: None,
            author: Some("SamImage".to_string()),
            categories: vec!["产品".to_string()],
            tags: vec!["摄影".to_string()],
            use_cases: vec!["txt2img".to_string()],
            preview_images: Vec::new(),
            reference_images: Vec::new(),
            language: "mixed".to_string(),
            favorite: false,
            usage_count: 0,
            imported_at: "2026-05-22T00:00:00.000Z".to_string(),
            updated_at: "2026-05-22T00:00:00.000Z".to_string(),
        }
    }

    #[tokio::test]
    async fn imports_lists_and_tracks_prompt_usage() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("samimage-v2-prompt-asset-test-{nonce}"));
        let pool = init_sqlite(&dir).await.expect("database should initialize");

        let imported = import_prompt_assets(&pool, &[test_asset()])
            .await
            .expect("prompt asset should import");
        let used = increment_prompt_usage(&pool, "prompt-test")
            .await
            .expect("usage should increment");
        let favorited = toggle_prompt_favorite(&pool, "prompt-test")
            .await
            .expect("favorite should toggle");

        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].source, "builtin");
        assert_eq!(imported[0].categories, vec!["产品"]);
        assert_eq!(used[0].usage_count, 1);
        assert!(favorited[0].favorite);

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
