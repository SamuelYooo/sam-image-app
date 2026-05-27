use sqlx::{Row, SqlitePool};

use crate::{api::assets::Asset, error::AppResult};

#[allow(dead_code)]
fn to_json(values: &[String]) -> AppResult<String> {
    Ok(serde_json::to_string(values)?)
}

fn from_json(value: String) -> AppResult<Vec<String>> {
    Ok(serde_json::from_str(&value)?)
}

fn parse_metadata(value: String) -> AppResult<serde_json::Value> {
    Ok(serde_json::from_str(&value)?)
}

#[allow(dead_code)]
fn optional_trimmed(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
}

fn asset_from_row(row: sqlx::sqlite::SqliteRow) -> AppResult<Asset> {
    Ok(Asset {
        id: row.try_get("id")?,
        kind: row.try_get("kind")?,
        uri: row.try_get("uri")?,
        thumbnail_uri: row.try_get("thumbnail_uri")?,
        prompt_text: row.try_get("prompt_text")?,
        negative_prompt: row.try_get("negative_prompt")?,
        model_profile_id: row.try_get("model_profile_id")?,
        width: row.try_get("width")?,
        height: row.try_get("height")?,
        seed: row.try_get("seed")?,
        source_task_id: row.try_get("source_task_id")?,
        project_id: row.try_get("project_id")?,
        workflow_id: row.try_get("workflow_id")?,
        tags: from_json(row.try_get("tags_json")?)?,
        favorite: row.try_get::<i64, _>("favorite")? == 1,
        metadata: parse_metadata(row.try_get("metadata_json")?)?,
        created_at: row.try_get("created_at")?,
        preview_uri: None,
    })
}

pub async fn list_assets(pool: &SqlitePool) -> AppResult<Vec<Asset>> {
    let rows = sqlx::query(
        r#"
        SELECT
          id, kind, uri, thumbnail_uri, prompt_text, negative_prompt, model_profile_id,
          width, height, seed, source_task_id, project_id, workflow_id, tags_json,
          favorite, metadata_json, created_at
        FROM assets
        ORDER BY created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(asset_from_row).collect()
}

pub async fn get_asset(pool: &SqlitePool, id: &str) -> AppResult<Option<Asset>> {
    let row = sqlx::query(
        r#"
        SELECT
          id, kind, uri, thumbnail_uri, prompt_text, negative_prompt, model_profile_id,
          width, height, seed, source_task_id, project_id, workflow_id, tags_json,
          favorite, metadata_json, created_at
        FROM assets
        WHERE id = ?
        LIMIT 1
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    row.map(asset_from_row).transpose()
}

pub async fn toggle_asset_favorite(pool: &SqlitePool, id: &str) -> AppResult<Vec<Asset>> {
    sqlx::query(
        r#"
        UPDATE assets
        SET favorite = CASE favorite WHEN 1 THEN 0 ELSE 1 END
        WHERE id = ?
        "#,
    )
    .bind(id)
    .execute(pool)
    .await?;

    list_assets(pool).await
}

pub async fn delete_asset(pool: &SqlitePool, id: &str) -> AppResult<Vec<Asset>> {
    sqlx::query("DELETE FROM assets WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    list_assets(pool).await
}

pub async fn delete_assets(pool: &SqlitePool, ids: &[String]) -> AppResult<Vec<Asset>> {
    if ids.is_empty() {
        return list_assets(pool).await;
    }

    let mut tx = pool.begin().await?;
    for id in ids
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
    {
        sqlx::query("DELETE FROM assets WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    list_assets(pool).await
}

#[allow(dead_code)]
pub async fn upsert_asset(pool: &SqlitePool, asset: &Asset) -> AppResult<Vec<Asset>> {
    sqlx::query(
        r#"
        INSERT INTO assets (
          id, kind, uri, thumbnail_uri, prompt_text, negative_prompt, model_profile_id,
          width, height, seed, source_task_id, project_id, workflow_id, tags_json,
          favorite, metadata_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          uri = excluded.uri,
          thumbnail_uri = excluded.thumbnail_uri,
          prompt_text = excluded.prompt_text,
          negative_prompt = excluded.negative_prompt,
          model_profile_id = excluded.model_profile_id,
          width = excluded.width,
          height = excluded.height,
          seed = excluded.seed,
          source_task_id = excluded.source_task_id,
          project_id = excluded.project_id,
          workflow_id = excluded.workflow_id,
          tags_json = excluded.tags_json,
          favorite = excluded.favorite,
          metadata_json = excluded.metadata_json
        "#,
    )
    .bind(asset.id.trim())
    .bind(asset.kind.trim())
    .bind(asset.uri.trim())
    .bind(optional_trimmed(&asset.thumbnail_uri))
    .bind(optional_trimmed(&asset.prompt_text))
    .bind(optional_trimmed(&asset.negative_prompt))
    .bind(optional_trimmed(&asset.model_profile_id))
    .bind(asset.width)
    .bind(asset.height)
    .bind(asset.seed)
    .bind(optional_trimmed(&asset.source_task_id))
    .bind(optional_trimmed(&asset.project_id))
    .bind(optional_trimmed(&asset.workflow_id))
    .bind(to_json(&asset.tags)?)
    .bind(if asset.favorite { 1 } else { 0 })
    .bind(asset.metadata.to_string())
    .bind(asset.created_at.trim())
    .execute(pool)
    .await?;

    list_assets(pool).await
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::db::init_sqlite;

    use super::*;

    fn test_asset() -> Asset {
        Asset {
            id: "asset-test".to_string(),
            kind: "image".to_string(),
            uri: "assets/images/asset-test.png".to_string(),
            thumbnail_uri: Some("assets/thumbnails/asset-test.webp".to_string()),
            prompt_text: Some("清晨街角的现代咖啡馆".to_string()),
            negative_prompt: Some("水印".to_string()),
            model_profile_id: Some("image-model-test".to_string()),
            width: Some(1024),
            height: Some(1024),
            seed: Some(123),
            source_task_id: Some("task-test".to_string()),
            project_id: None,
            workflow_id: Some("daily".to_string()),
            tags: vec!["daily".to_string(), "摄影".to_string()],
            favorite: false,
            metadata: serde_json::json!({ "quality": "high" }),
            created_at: "2026-05-22T00:00:00.000Z".to_string(),
            preview_uri: None,
        }
    }

    #[tokio::test]
    async fn upserts_and_lists_assets() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("samimage-v2-asset-test-{nonce}"));
        let pool = init_sqlite(&dir).await.expect("database should initialize");

        let assets = upsert_asset(&pool, &test_asset())
            .await
            .expect("asset should upsert");

        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].kind, "image");
        assert_eq!(assets[0].source_task_id.as_deref(), Some("task-test"));
        assert_eq!(assets[0].tags, vec!["daily", "摄影"]);
        assert_eq!(assets[0].metadata["quality"], "high");

        let favorited = toggle_asset_favorite(&pool, "asset-test")
            .await
            .expect("favorite should toggle");
        assert!(favorited[0].favorite);

        let deleted = delete_asset(&pool, "asset-test")
            .await
            .expect("asset should delete");
        assert!(deleted.is_empty());

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn deletes_assets_in_one_batch() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("samimage-v2-asset-batch-test-{nonce}"));
        let pool = init_sqlite(&dir).await.expect("database should initialize");

        let mut first = test_asset();
        first.id = "asset-batch-1".to_string();
        let mut second = test_asset();
        second.id = "asset-batch-2".to_string();
        upsert_asset(&pool, &first)
            .await
            .expect("first asset should upsert");
        upsert_asset(&pool, &second)
            .await
            .expect("second asset should upsert");

        let deleted = delete_assets(
            &pool,
            &["asset-batch-1".to_string(), "asset-batch-2".to_string()],
        )
        .await
        .expect("assets should delete");

        assert!(deleted.is_empty());

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
