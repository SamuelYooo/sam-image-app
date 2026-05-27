use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};

use crate::{
    api::model_profiles::{ModelCapability, ModelProfileDraft},
    error::{AppError, AppResult},
};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredEndpoints {
    chat: Option<String>,
    image: Option<String>,
    models: Option<String>,
}

fn new_profile_id(capability: ModelCapability) -> AppResult<String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::InvalidData(format!("系统时间错误: {error}")))?
        .as_nanos();
    Ok(format!("model-{}-{nanos}", capability.as_str()))
}

fn endpoints_from_profile(profile: &ModelProfileDraft) -> StoredEndpoints {
    StoredEndpoints {
        chat: non_empty(profile.chat_endpoint.as_str()),
        image: non_empty(profile.image_endpoint.as_str()),
        models: non_empty(profile.models_endpoint.as_str()),
    }
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

pub async fn list_model_profiles(pool: &SqlitePool) -> AppResult<Vec<ModelProfileDraft>> {
    let rows = sqlx::query(
        r#"
        SELECT
          id, capability, name, provider, base_url, api_key_ref, model, endpoints_json,
          is_default_text, is_default_image, enabled
        FROM model_profiles
        ORDER BY CASE capability
          WHEN 'text' THEN 1
          WHEN 'image' THEN 2
          WHEN 'multimodal' THEN 3
          ELSE 4
        END,
        CASE
          WHEN capability = 'text' THEN is_default_text
          WHEN capability = 'image' THEN is_default_image
          ELSE 0
        END DESC,
        updated_at DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            let capability =
                ModelCapability::from_db(row.try_get::<String, _>("capability")?.as_str())?;
            let endpoints: StoredEndpoints =
                serde_json::from_str(row.try_get::<String, _>("endpoints_json")?.as_str())?;

            Ok(ModelProfileDraft {
                id: row.try_get("id")?,
                capability,
                name: row.try_get("name")?,
                provider: row.try_get("provider")?,
                base_url: row.try_get("base_url")?,
                api_key: String::new(),
                has_api_key: non_empty(row.try_get::<String, _>("api_key_ref")?.as_str()).is_some(),
                model: row.try_get("model")?,
                chat_endpoint: endpoints.chat.unwrap_or_default(),
                image_endpoint: endpoints.image.unwrap_or_default(),
                models_endpoint: endpoints.models.unwrap_or_else(|| "/v1/models".to_string()),
                enabled: row.try_get::<i64, _>("enabled")? == 1,
                is_default: match capability {
                    ModelCapability::Text => row.try_get::<i64, _>("is_default_text")? == 1,
                    ModelCapability::Image => row.try_get::<i64, _>("is_default_image")? == 1,
                    ModelCapability::Multimodal => false,
                },
            })
        })
        .collect()
}

pub async fn get_default_image_profile(pool: &SqlitePool) -> AppResult<Option<ModelProfileDraft>> {
    let row = sqlx::query(
        r#"
        SELECT id, capability, name, provider, base_url, api_key_ref, model, endpoints_json,
               is_default_image, enabled
        FROM model_profiles
        WHERE capability = 'image' AND enabled = 1
        ORDER BY is_default_image DESC, updated_at DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await?;

    row.map(|row| {
        let endpoints: StoredEndpoints =
            serde_json::from_str(row.try_get::<String, _>("endpoints_json")?.as_str())?;
        let api_key: String = row.try_get("api_key_ref")?;
        Ok(ModelProfileDraft {
            id: row.try_get("id")?,
            capability: ModelCapability::Image,
            name: row.try_get("name")?,
            provider: row.try_get("provider")?,
            base_url: row.try_get("base_url")?,
            has_api_key: non_empty(&api_key).is_some(),
            api_key,
            model: row.try_get("model")?,
            chat_endpoint: endpoints.chat.unwrap_or_default(),
            image_endpoint: endpoints.image.unwrap_or_default(),
            models_endpoint: endpoints.models.unwrap_or_else(|| "/v1/models".to_string()),
            enabled: row.try_get::<i64, _>("enabled")? == 1,
            is_default: row.try_get::<i64, _>("is_default_image")? == 1,
        })
    })
    .transpose()
}

pub async fn get_api_key_ref(
    pool: &SqlitePool,
    id: &str,
    capability: ModelCapability,
) -> AppResult<Option<String>> {
    let api_key_ref: Option<String> = if id.trim().is_empty() {
        sqlx::query_scalar(
            r#"
            SELECT api_key_ref
            FROM model_profiles
            WHERE capability = ?
            ORDER BY CASE
              WHEN capability = 'text' THEN is_default_text
              WHEN capability = 'image' THEN is_default_image
              ELSE 0
            END DESC, updated_at DESC
            LIMIT 1
            "#,
        )
        .bind(capability.as_str())
        .fetch_optional(pool)
        .await?
    } else {
        sqlx::query_scalar("SELECT api_key_ref FROM model_profiles WHERE id = ? LIMIT 1")
            .bind(id.trim())
            .fetch_optional(pool)
            .await?
    };

    Ok(api_key_ref.and_then(|value| non_empty(&value)))
}

async fn has_default_profile(pool: &SqlitePool, capability: ModelCapability) -> AppResult<bool> {
    let column = match capability {
        ModelCapability::Text => "is_default_text",
        ModelCapability::Image => "is_default_image",
        ModelCapability::Multimodal => return Ok(false),
    };
    let query = format!(
        "SELECT COUNT(*) FROM model_profiles WHERE capability = ? AND enabled = 1 AND {column} = 1"
    );
    let count: i64 = sqlx::query_scalar(&query)
        .bind(capability.as_str())
        .fetch_one(pool)
        .await?;
    Ok(count > 0)
}

pub async fn save_model_profile(
    pool: &SqlitePool,
    profile: &ModelProfileDraft,
) -> AppResult<Vec<ModelProfileDraft>> {
    let id = if profile.id.trim().is_empty() {
        new_profile_id(profile.capability)?
    } else {
        profile.id.trim().to_string()
    };
    let existing_api_key_ref: Option<String> =
        sqlx::query_scalar("SELECT api_key_ref FROM model_profiles WHERE id = ? LIMIT 1")
            .bind(&id)
            .fetch_optional(pool)
            .await?;
    let api_key_ref = non_empty(&profile.api_key)
        .or(existing_api_key_ref)
        .unwrap_or_default();
    let should_default =
        profile.is_default || !has_default_profile(pool, profile.capability).await?;
    let endpoints_json = serde_json::to_string(&endpoints_from_profile(profile))?;
    let request_defaults_json = serde_json::json!({
      "timeoutSec": 60,
      "referenceImageLimit": if profile.capability == ModelCapability::Image { 4 } else { 0 },
    })
    .to_string();

    let mut tx = pool.begin().await?;
    if should_default {
        sqlx::query(
            r#"
            UPDATE model_profiles
            SET is_default_text = CASE WHEN capability = 'text' THEN 0 ELSE is_default_text END,
                is_default_image = CASE WHEN capability = 'image' THEN 0 ELSE is_default_image END
            WHERE capability = ?
            "#,
        )
        .bind(profile.capability.as_str())
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        r#"
        INSERT INTO model_profiles (
          id, name, provider, capability, base_url, api_key_ref, model, endpoints_json,
          request_defaults_json, is_default_text, is_default_image, enabled, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          provider = excluded.provider,
          capability = excluded.capability,
          base_url = excluded.base_url,
          api_key_ref = excluded.api_key_ref,
          model = excluded.model,
          endpoints_json = excluded.endpoints_json,
          request_defaults_json = excluded.request_defaults_json,
          is_default_text = excluded.is_default_text,
          is_default_image = excluded.is_default_image,
          enabled = excluded.enabled,
          updated_at = CURRENT_TIMESTAMP
    "#,
    )
    .bind(id)
    .bind(&profile.name)
    .bind(&profile.provider)
    .bind(profile.capability.as_str())
    .bind(&profile.base_url)
    .bind(api_key_ref)
    .bind(&profile.model)
    .bind(endpoints_json)
    .bind(request_defaults_json)
    .bind(
        if should_default && profile.capability == ModelCapability::Text {
            1
        } else {
            0
        },
    )
    .bind(
        if should_default && profile.capability == ModelCapability::Image {
            1
        } else {
            0
        },
    )
    .bind(if profile.enabled { 1 } else { 0 })
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    list_model_profiles(pool).await
}

pub async fn set_default_model_profile(
    pool: &SqlitePool,
    id: &str,
) -> AppResult<Vec<ModelProfileDraft>> {
    let id = id.trim();
    if id.is_empty() {
        return Err(AppError::InvalidData("请选择要生效的模型配置".to_string()));
    }
    let capability: String =
        sqlx::query_scalar("SELECT capability FROM model_profiles WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await?;

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE model_profiles
        SET is_default_text = CASE WHEN capability = 'text' THEN 0 ELSE is_default_text END,
            is_default_image = CASE WHEN capability = 'image' THEN 0 ELSE is_default_image END
        WHERE capability = ?
        "#,
    )
    .bind(&capability)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"
        UPDATE model_profiles
        SET is_default_text = CASE WHEN capability = 'text' THEN 1 ELSE is_default_text END,
            is_default_image = CASE WHEN capability = 'image' THEN 1 ELSE is_default_image END,
            enabled = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        "#,
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    list_model_profiles(pool).await
}

pub async fn delete_model_profile(
    pool: &SqlitePool,
    id: &str,
) -> AppResult<Vec<ModelProfileDraft>> {
    let id = id.trim();
    if id.is_empty() {
        return Err(AppError::InvalidData("请选择要删除的模型配置".to_string()));
    }
    let row = sqlx::query(
        r#"
        SELECT capability, is_default_text, is_default_image
        FROM model_profiles
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    let capability = ModelCapability::from_db(row.try_get::<String, _>("capability")?.as_str())?;
    let was_default = match capability {
        ModelCapability::Text => row.try_get::<i64, _>("is_default_text")? == 1,
        ModelCapability::Image => row.try_get::<i64, _>("is_default_image")? == 1,
        ModelCapability::Multimodal => false,
    };

    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM model_profiles WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if was_default {
        if let Some(next_id) = sqlx::query_scalar::<_, String>(
            r#"
            SELECT id
            FROM model_profiles
            WHERE capability = ? AND enabled = 1
            ORDER BY updated_at DESC
            LIMIT 1
            "#,
        )
        .bind(capability.as_str())
        .fetch_optional(&mut *tx)
        .await?
        {
            sqlx::query(
                r#"
                UPDATE model_profiles
                SET is_default_text = CASE WHEN capability = 'text' THEN 1 ELSE is_default_text END,
                    is_default_image = CASE WHEN capability = 'image' THEN 1 ELSE is_default_image END
                WHERE id = ?
                "#,
            )
            .bind(next_id)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;

    list_model_profiles(pool).await
}

pub async fn clear_model_profile(
    pool: &SqlitePool,
    capability: ModelCapability,
) -> AppResult<Vec<ModelProfileDraft>> {
    sqlx::query("DELETE FROM model_profiles WHERE capability = ?")
        .bind(capability.as_str())
        .execute(pool)
        .await?;

    list_model_profiles(pool).await
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::db::init_sqlite;

    use super::*;

    #[tokio::test]
    async fn persists_model_profiles_in_sqlite() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("samimage-v2-model-profile-test-{nonce}"));
        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let profile = ModelProfileDraft {
            id: String::new(),
            capability: ModelCapability::Image,
            name: "测试图像模型".to_string(),
            provider: "custom".to_string(),
            base_url: "https://api.example.com".to_string(),
            api_key: "sk-test".to_string(),
            has_api_key: false,
            model: "image-test".to_string(),
            chat_endpoint: String::new(),
            image_endpoint: "/v1/images/generations".to_string(),
            models_endpoint: "/v1/models".to_string(),
            enabled: true,
            is_default: true,
        };

        let saved = save_model_profile(&pool, &profile)
            .await
            .expect("profile should save");
        let cleared = clear_model_profile(&pool, ModelCapability::Image)
            .await
            .expect("profile should clear");

        assert_eq!(saved.len(), 1);
        assert!(!saved[0].id.is_empty());
        assert_eq!(saved[0].model, "image-test");
        assert!(saved[0].is_default);
        assert_eq!(saved[0].image_endpoint, "/v1/images/generations");
        assert!(saved[0].api_key.is_empty());
        assert!(saved[0].has_api_key);
        assert!(cleared.is_empty());

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn supports_multiple_profiles_and_switches_default() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("samimage-v2-model-profile-multi-test-{nonce}"));
        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let first = ModelProfileDraft {
            id: String::new(),
            capability: ModelCapability::Image,
            name: "图像 A".to_string(),
            provider: "custom".to_string(),
            base_url: "https://a.example.com".to_string(),
            api_key: "sk-a".to_string(),
            has_api_key: false,
            model: "image-a".to_string(),
            chat_endpoint: String::new(),
            image_endpoint: "/v1/images/generations".to_string(),
            models_endpoint: "/v1/models".to_string(),
            enabled: true,
            is_default: true,
        };
        let mut saved = save_model_profile(&pool, &first)
            .await
            .expect("first profile should save");
        let first_id = saved[0].id.clone();
        let second = ModelProfileDraft {
            id: String::new(),
            capability: ModelCapability::Image,
            name: "图像 B".to_string(),
            provider: "custom".to_string(),
            base_url: "https://b.example.com".to_string(),
            api_key: "sk-b".to_string(),
            has_api_key: false,
            model: "image-b".to_string(),
            chat_endpoint: String::new(),
            image_endpoint: "/v1/images/generations".to_string(),
            models_endpoint: "/v1/models".to_string(),
            enabled: true,
            is_default: false,
        };
        saved = save_model_profile(&pool, &second)
            .await
            .expect("second profile should save");
        assert_eq!(saved.len(), 2);
        assert_eq!(
            get_default_image_profile(&pool)
                .await
                .expect("default should load")
                .expect("default image should exist")
                .model,
            "image-a"
        );

        let second_id = saved
            .iter()
            .find(|profile| profile.model == "image-b")
            .expect("second profile should exist")
            .id
            .clone();
        saved = set_default_model_profile(&pool, &second_id)
            .await
            .expect("default should switch");
        assert!(
            saved
                .iter()
                .find(|profile| profile.id == second_id)
                .expect("second should exist")
                .is_default
        );
        assert!(
            !saved
                .iter()
                .find(|profile| profile.id == first_id)
                .expect("first should exist")
                .is_default
        );

        let remaining = delete_model_profile(&pool, &second_id)
            .await
            .expect("profile should delete");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, first_id);
        assert!(remaining[0].is_default);

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
