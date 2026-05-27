use sqlx::{Row, SqlitePool};

use crate::{
    api::storyboard::{
        StoryboardCharacter, StoryboardDraft, StoryboardProject, StoryboardScene, StoryboardShot,
        UpdateStoryboardShotInput,
    },
    domain::clock,
    error::{AppError, AppResult},
};

fn to_json(values: &[String]) -> AppResult<String> {
    Ok(serde_json::to_string(values)?)
}

fn project_from_row(row: sqlx::sqlite::SqliteRow) -> AppResult<StoryboardProject> {
    Ok(StoryboardProject {
        id: row.try_get("id")?,
        project_type: row.try_get("type")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        status: row.try_get("status")?,
        settings: serde_json::from_str(row.try_get::<String, _>("settings_json")?.as_str())?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub async fn save_storyboard_draft(
    pool: &SqlitePool,
    draft: &StoryboardDraft,
) -> AppResult<StoryboardDraft> {
    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO projects (
          id, type, name, description, status, settings_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&draft.project.id)
    .bind(&draft.project.project_type)
    .bind(&draft.project.name)
    .bind(&draft.project.description)
    .bind(&draft.project.status)
    .bind(draft.project.settings.to_string())
    .bind(&draft.project.created_at)
    .bind(&draft.project.updated_at)
    .execute(&mut *tx)
    .await?;

    for character in &draft.characters {
        sqlx::query(
            r#"
            INSERT INTO storyboard_characters (
              id, project_id, name, role, appearance, personality, reference_asset_ids_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&character.id)
        .bind(&character.project_id)
        .bind(&character.name)
        .bind(&character.role)
        .bind(&character.appearance)
        .bind(&character.personality)
        .bind(to_json(&character.reference_asset_ids)?)
        .execute(&mut *tx)
        .await?;
    }

    for scene in &draft.scenes {
        sqlx::query(
            r#"
            INSERT INTO storyboard_scenes (
              id, project_id, name, summary, location, time_of_day, mood, order_index
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&scene.id)
        .bind(&scene.project_id)
        .bind(&scene.name)
        .bind(&scene.summary)
        .bind(&scene.location)
        .bind(&scene.time_of_day)
        .bind(&scene.mood)
        .bind(scene.order_index)
        .execute(&mut *tx)
        .await?;
    }

    for shot in &draft.shots {
        sqlx::query(
            r#"
            INSERT INTO storyboard_shots (
              id, project_id, scene_id, order_index, title, description, prompt_text,
              framing, angle, movement, duration_sec, transition, asset_id, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&shot.id)
        .bind(&shot.project_id)
        .bind(&shot.scene_id)
        .bind(shot.order_index)
        .bind(&shot.title)
        .bind(&shot.description)
        .bind(&shot.prompt_text)
        .bind(&shot.framing)
        .bind(&shot.angle)
        .bind(&shot.movement)
        .bind(shot.duration_sec)
        .bind(&shot.transition)
        .bind(&shot.asset_id)
        .bind(&shot.status)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(draft.clone())
}

pub async fn list_storyboard_projects(pool: &SqlitePool) -> AppResult<Vec<StoryboardProject>> {
    let rows = sqlx::query(
        r#"
        SELECT id, type, name, description, status, settings_json, created_at, updated_at
        FROM projects
        WHERE type = 'storyboard'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(project_from_row).collect()
}

pub async fn load_storyboard_draft(
    pool: &SqlitePool,
    project_id: &str,
) -> AppResult<Option<StoryboardDraft>> {
    let project_row = sqlx::query(
        r#"
        SELECT id, type, name, description, status, settings_json, created_at, updated_at
        FROM projects
        WHERE id = ?
        "#,
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    let Some(project_row) = project_row else {
        return Ok(None);
    };

    let project = project_from_row(project_row)?;

    let character_rows = sqlx::query(
        r#"
        SELECT id, project_id, name, role, appearance, personality, reference_asset_ids_json
        FROM storyboard_characters
        WHERE project_id = ?
        ORDER BY rowid ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    let characters = character_rows
        .into_iter()
        .map(|row| {
            Ok(StoryboardCharacter {
                id: row.try_get("id")?,
                project_id: row.try_get("project_id")?,
                name: row.try_get("name")?,
                role: row.try_get("role")?,
                appearance: row.try_get("appearance")?,
                personality: row.try_get("personality")?,
                reference_asset_ids: serde_json::from_str(
                    row.try_get::<String, _>("reference_asset_ids_json")?
                        .as_str(),
                )?,
            })
        })
        .collect::<AppResult<Vec<_>>>()?;

    let scene_rows = sqlx::query(
        r#"
        SELECT id, project_id, name, summary, location, time_of_day, mood, order_index
        FROM storyboard_scenes
        WHERE project_id = ?
        ORDER BY order_index ASC, rowid ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    let scenes = scene_rows
        .into_iter()
        .map(|row| {
            Ok(StoryboardScene {
                id: row.try_get("id")?,
                project_id: row.try_get("project_id")?,
                name: row.try_get("name")?,
                summary: row.try_get("summary")?,
                location: row.try_get("location")?,
                time_of_day: row.try_get("time_of_day")?,
                mood: row.try_get("mood")?,
                order_index: row.try_get("order_index")?,
            })
        })
        .collect::<AppResult<Vec<_>>>()?;

    let shot_rows = sqlx::query(
        r#"
        SELECT id, project_id, scene_id, order_index, title, description, prompt_text,
               framing, angle, movement, duration_sec, transition, asset_id, status
        FROM storyboard_shots
        WHERE project_id = ?
        ORDER BY order_index ASC, rowid ASC
        "#,
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    let shots = shot_rows
        .into_iter()
        .map(|row| {
            Ok(StoryboardShot {
                id: row.try_get("id")?,
                project_id: row.try_get("project_id")?,
                scene_id: row.try_get("scene_id")?,
                order_index: row.try_get("order_index")?,
                title: row.try_get("title")?,
                description: row.try_get("description")?,
                prompt_text: row.try_get("prompt_text")?,
                framing: row.try_get("framing")?,
                angle: row.try_get("angle")?,
                movement: row.try_get("movement")?,
                duration_sec: row.try_get("duration_sec")?,
                transition: row.try_get("transition")?,
                asset_id: row.try_get("asset_id")?,
                status: row.try_get("status")?,
            })
        })
        .collect::<AppResult<Vec<_>>>()?;

    Ok(Some(StoryboardDraft {
        project,
        characters,
        scenes,
        shots,
    }))
}

pub async fn mark_storyboard_shot_status(
    pool: &SqlitePool,
    shot_id: &str,
    status: &str,
) -> AppResult<()> {
    sqlx::query("UPDATE storyboard_shots SET status = ? WHERE id = ?")
        .bind(status)
        .bind(shot_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn mark_storyboard_shot_done(
    pool: &SqlitePool,
    shot_id: &str,
    asset_id: &str,
) -> AppResult<()> {
    sqlx::query("UPDATE storyboard_shots SET status = 'done', asset_id = ? WHERE id = ?")
        .bind(asset_id)
        .bind(shot_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn update_storyboard_shot(
    pool: &SqlitePool,
    input: &UpdateStoryboardShotInput,
) -> AppResult<StoryboardDraft> {
    let project_id: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM storyboard_shots WHERE id = ? LIMIT 1")
            .bind(input.id.trim())
            .fetch_optional(pool)
            .await?;
    let project_id =
        project_id.ok_or_else(|| AppError::InvalidData("未找到分镜镜头".to_string()))?;

    sqlx::query(
        r#"
        UPDATE storyboard_shots
        SET title = ?, description = ?, prompt_text = ?, framing = ?, angle = ?,
            movement = ?, duration_sec = ?, transition = ?, status = ?
        WHERE id = ?
        "#,
    )
    .bind(input.title.trim())
    .bind(input.description.trim())
    .bind(input.prompt_text.trim())
    .bind(input.framing.trim())
    .bind(input.angle.trim())
    .bind(input.movement.trim())
    .bind(input.duration_sec)
    .bind(
        input
            .transition
            .as_deref()
            .map(str::trim)
            .filter(|item| !item.is_empty()),
    )
    .bind(input.status.trim())
    .bind(input.id.trim())
    .execute(pool)
    .await?;

    sqlx::query("UPDATE projects SET updated_at = ? WHERE id = ?")
        .bind(clock::beijing_timestamp_now()?)
        .bind(&project_id)
        .execute(pool)
        .await?;

    load_storyboard_draft(pool, &project_id)
        .await?
        .ok_or_else(|| AppError::InvalidData("未找到分镜项目".to_string()))
}

pub async fn reorder_storyboard_shots(
    pool: &SqlitePool,
    project_id: &str,
    shot_ids: &[String],
) -> AppResult<StoryboardDraft> {
    if shot_ids.is_empty() {
        return load_storyboard_draft(pool, project_id)
            .await?
            .ok_or_else(|| AppError::InvalidData("未找到分镜项目".to_string()));
    }

    let mut tx = pool.begin().await?;
    for (index, shot_id) in shot_ids.iter().enumerate() {
        sqlx::query("UPDATE storyboard_shots SET order_index = ? WHERE project_id = ? AND id = ?")
            .bind(index as i64)
            .bind(project_id)
            .bind(shot_id.trim())
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("UPDATE projects SET updated_at = ? WHERE id = ?")
        .bind(clock::beijing_timestamp_now()?)
        .bind(project_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    load_storyboard_draft(pool, project_id)
        .await?
        .ok_or_else(|| AppError::InvalidData("未找到分镜项目".to_string()))
}

#[cfg(test)]
mod tests {
    use crate::{
        api::storyboard::{
            StoryboardCharacter, StoryboardDraft, StoryboardProject, StoryboardScene,
            StoryboardShot,
        },
        db::init_sqlite,
    };

    use super::*;

    fn test_draft() -> StoryboardDraft {
        let project_id = "project-storyboard-test".to_string();
        let scene_id = "scene-storyboard-test".to_string();
        StoryboardDraft {
            project: StoryboardProject {
                id: project_id.clone(),
                project_type: "storyboard".to_string(),
                name: "测试分镜".to_string(),
                description: Some("测试故事".to_string()),
                status: "draft".to_string(),
                settings: serde_json::json!({ "styleHint": "cinematic" }),
                created_at: "2026-05-22T00:00:00.000Z".to_string(),
                updated_at: "2026-05-22T00:00:00.000Z".to_string(),
            },
            characters: vec![StoryboardCharacter {
                id: "character-storyboard-test".to_string(),
                project_id: project_id.clone(),
                name: "主角".to_string(),
                role: "protagonist".to_string(),
                appearance: "深色外套".to_string(),
                personality: Some("冷静".to_string()),
                reference_asset_ids: vec![],
            }],
            scenes: vec![StoryboardScene {
                id: scene_id.clone(),
                project_id: project_id.clone(),
                name: "开场".to_string(),
                summary: "建立环境".to_string(),
                location: "城市街角".to_string(),
                time_of_day: Some("清晨".to_string()),
                mood: Some("克制".to_string()),
                order_index: 0,
            }],
            shots: vec![
                StoryboardShot {
                    id: "shot-storyboard-test".to_string(),
                    project_id: project_id.clone(),
                    scene_id: Some(scene_id.clone()),
                    order_index: 0,
                    title: "建立镜头".to_string(),
                    description: "主角进入画面".to_string(),
                    prompt_text: "cinematic establishing shot".to_string(),
                    framing: "wide shot".to_string(),
                    angle: "eye level".to_string(),
                    movement: "slow push in".to_string(),
                    duration_sec: Some(4),
                    transition: Some("cut".to_string()),
                    asset_id: None,
                    status: "draft".to_string(),
                },
                StoryboardShot {
                    id: "shot-storyboard-test-2".to_string(),
                    project_id,
                    scene_id: Some(scene_id),
                    order_index: 1,
                    title: "反应镜头".to_string(),
                    description: "主角观察环境".to_string(),
                    prompt_text: "cinematic reaction shot".to_string(),
                    framing: "close up".to_string(),
                    angle: "eye level".to_string(),
                    movement: "static".to_string(),
                    duration_sec: Some(3),
                    transition: Some("cut".to_string()),
                    asset_id: None,
                    status: "draft".to_string(),
                },
            ],
        }
    }

    #[tokio::test]
    async fn saves_storyboard_draft_graph() {
        let dir = std::env::temp_dir().join("samimage-v2-storyboard-repo-test");
        let _ = std::fs::remove_dir_all(&dir);
        let pool = init_sqlite(&dir).await.expect("database should initialize");

        let saved = save_storyboard_draft(&pool, &test_draft())
            .await
            .expect("storyboard draft should save");
        let shot_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM storyboard_shots WHERE project_id = ?")
                .bind(&saved.project.id)
                .fetch_one(&pool)
                .await
                .expect("shot count should be readable");

        assert_eq!(saved.characters.len(), 1);
        assert_eq!(saved.scenes.len(), 1);
        assert_eq!(shot_count, 2);

        let projects = list_storyboard_projects(&pool)
            .await
            .expect("storyboard projects should list");
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, "project-storyboard-test");

        mark_storyboard_shot_status(&pool, "shot-storyboard-test", "generating")
            .await
            .expect("shot status should update");
        mark_storyboard_shot_done(&pool, "shot-storyboard-test", "asset-storyboard-test")
            .await
            .expect("shot should complete");
        let status_and_asset: (String, String) =
            sqlx::query_as("SELECT status, asset_id FROM storyboard_shots WHERE id = ?")
                .bind("shot-storyboard-test")
                .fetch_one(&pool)
                .await
                .expect("shot status should be readable");
        assert_eq!(status_and_asset.0, "done");
        assert_eq!(status_and_asset.1, "asset-storyboard-test");

        let loaded = load_storyboard_draft(&pool, "project-storyboard-test")
            .await
            .expect("draft should load")
            .expect("project should exist");
        assert_eq!(loaded.project.name, "测试分镜");
        assert_eq!(loaded.shots.len(), 2);

        let updated = update_storyboard_shot(
            &pool,
            &UpdateStoryboardShotInput {
                id: "shot-storyboard-test".to_string(),
                title: "建立镜头".to_string(),
                description: "主角进入画面".to_string(),
                prompt_text: "cinematic establishing shot".to_string(),
                framing: "wide shot".to_string(),
                angle: "eye level".to_string(),
                movement: "slow push in".to_string(),
                duration_sec: Some(8),
                transition: Some("dissolve".to_string()),
                status: "ready".to_string(),
            },
        )
        .await
        .expect("shot should update");
        assert_eq!(updated.shots[0].duration_sec, Some(8));
        assert_eq!(updated.shots[0].transition.as_deref(), Some("dissolve"));

        let reordered = reorder_storyboard_shots(
            &pool,
            "project-storyboard-test",
            &[
                "shot-storyboard-test-2".to_string(),
                "shot-storyboard-test".to_string(),
            ],
        )
        .await
        .expect("shots should reorder");
        assert_eq!(reordered.shots[0].id, "shot-storyboard-test-2");

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
