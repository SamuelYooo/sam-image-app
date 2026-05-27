use sqlx::{Row, SqlitePool};

use crate::{
    api::generation_tasks::{
        CreateBatchImageGenerationTasksInput, CreateImageGenerationTaskInput, GenerationTask,
    },
    domain::clock,
    error::{AppError, AppResult},
};

fn task_id() -> AppResult<String> {
    Ok(format!("task-{}", clock::now_nanos()?))
}

fn task_timestamp() -> AppResult<String> {
    clock::beijing_timestamp_now()
}

fn parse_json(value: String) -> AppResult<serde_json::Value> {
    Ok(serde_json::from_str(&value)?)
}

fn task_from_row(row: sqlx::sqlite::SqliteRow) -> AppResult<GenerationTask> {
    Ok(GenerationTask {
        id: row.try_get("id")?,
        group_id: row.try_get("group_id")?,
        project_id: row.try_get("project_id")?,
        task_type: row.try_get("type")?,
        status: row.try_get("status")?,
        priority: row.try_get("priority")?,
        input: parse_json(row.try_get("input_json")?)?,
        output: parse_json(row.try_get("output_json")?)?,
        error: row.try_get("error")?,
        progress_current: row.try_get("progress_current")?,
        progress_total: row.try_get("progress_total")?,
        retry_of: row.try_get("retry_of")?,
        created_at: row.try_get("created_at")?,
        started_at: row.try_get("started_at")?,
        finished_at: row.try_get("finished_at")?,
    })
}

fn image_generation_input_json(
    workflow_id: &str,
    prompt_text: &str,
    shot_id: Option<&str>,
    compare_group_id: Option<&str>,
    reference_images: &[String],
    negative_prompt: &str,
    image_size: &str,
    quality: &str,
    image_count: i64,
    seed: &str,
    model: &str,
) -> serde_json::Value {
    let image_count = image_count_for_workflow(workflow_id, image_count);
    serde_json::json!({
        "workflowId": workflow_id,
        "promptText": prompt_text.trim(),
        "shotId": shot_id.unwrap_or_default().trim(),
        "compareGroupId": compare_group_id.unwrap_or_default().trim(),
        "referenceImages": reference_images
            .iter()
            .map(|image| image.trim())
            .filter(|image| !image.is_empty())
            .take(4)
            .collect::<Vec<_>>(),
        "negativePrompt": negative_prompt.trim(),
        "imageSize": image_size,
        "quality": quality,
        "imageCount": image_count,
        "seed": seed.trim(),
        "model": model.trim(),
    })
}

fn image_count_for_workflow(workflow_id: &str, image_count: i64) -> i64 {
    let clamped_count = image_count.clamp(1, 8);
    if workflow_id == "img2img" || workflow_id == "icon" {
        1
    } else {
        clamped_count
    }
}

pub async fn list_generation_tasks(pool: &SqlitePool) -> AppResult<Vec<GenerationTask>> {
    let rows = sqlx::query(
        r#"
        SELECT
          id, group_id, project_id, type, status, priority, input_json, output_json,
          error, progress_current, progress_total, retry_of, created_at, started_at, finished_at
        FROM generation_tasks
        ORDER BY created_at DESC
        LIMIT 50
        "#,
    )
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(task_from_row).collect()
}

pub async fn get_generation_task(pool: &SqlitePool, id: &str) -> AppResult<GenerationTask> {
    let row = sqlx::query(
        r#"
        SELECT
          id, group_id, project_id, type, status, priority, input_json, output_json,
          error, progress_current, progress_total, retry_of, created_at, started_at, finished_at
        FROM generation_tasks
        WHERE id = ?
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    task_from_row(row)
}

pub async fn mark_task_running(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE generation_tasks
        SET status = 'running',
            error = NULL,
            started_at = COALESCE(started_at, ?)
        WHERE id = ?
        "#,
    )
    .bind(task_timestamp()?)
    .bind(id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_task_succeeded(
    pool: &SqlitePool,
    id: &str,
    output: serde_json::Value,
    progress_total: i64,
) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE generation_tasks
        SET status = 'succeeded',
            output_json = ?,
            error = NULL,
            progress_current = ?,
            progress_total = ?,
            finished_at = ?
        WHERE id = ?
        "#,
    )
    .bind(output.to_string())
    .bind(progress_total)
    .bind(progress_total)
    .bind(task_timestamp()?)
    .bind(id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_task_failed(pool: &SqlitePool, id: &str, error: &str) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE generation_tasks
        SET status = 'failed',
            error = ?,
            finished_at = ?
        WHERE id = ?
        "#,
    )
    .bind(error)
    .bind(task_timestamp()?)
    .bind(id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn cancel_generation_task(pool: &SqlitePool, id: &str) -> AppResult<Vec<GenerationTask>> {
    let task = get_generation_task(pool, id).await?;
    if !matches!(task.status.as_str(), "pending" | "running") {
        return Err(AppError::InvalidData(
            "只能取消排队中或生成中的任务".to_string(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE generation_tasks
        SET status = 'cancelled',
            error = NULL,
            finished_at = ?
        WHERE id = ?
        "#,
    )
    .bind(task_timestamp()?)
    .bind(id)
    .execute(pool)
    .await?;

    list_generation_tasks(pool).await
}

pub async fn retry_generation_task(pool: &SqlitePool, id: &str) -> AppResult<Vec<GenerationTask>> {
    let task = get_generation_task(pool, id).await?;
    if !matches!(task.status.as_str(), "failed" | "cancelled") {
        return Err(AppError::InvalidData(
            "只能重试失败或已取消的任务".to_string(),
        ));
    }

    let retry_id = task_id()?;
    sqlx::query(
        r#"
        INSERT INTO generation_tasks (
          id, group_id, project_id, type, status, priority, input_json, output_json,
          progress_current, progress_total, retry_of, created_at
        )
        VALUES (?, ?, ?, ?, 'pending', ?, ?, '{}', 0, ?, ?, ?)
        "#,
    )
    .bind(retry_id)
    .bind(task.group_id)
    .bind(task.project_id)
    .bind(task.task_type)
    .bind(task.priority)
    .bind(task.input.to_string())
    .bind(task.progress_total)
    .bind(task.id)
    .bind(task_timestamp()?)
    .execute(pool)
    .await?;

    list_generation_tasks(pool).await
}

pub async fn clear_finished_generation_tasks(pool: &SqlitePool) -> AppResult<Vec<GenerationTask>> {
    sqlx::query(
        r#"
        DELETE FROM generation_tasks
        WHERE status IN ('succeeded', 'cancelled')
        "#,
    )
    .execute(pool)
    .await?;

    list_generation_tasks(pool).await
}

pub async fn create_image_generation_task(
    pool: &SqlitePool,
    input: CreateImageGenerationTaskInput,
) -> AppResult<Vec<GenerationTask>> {
    let id = task_id()?;
    let image_count = image_count_for_workflow(&input.workflow_id, input.image_count);
    let input_json = image_generation_input_json(
        &input.workflow_id,
        &input.prompt_text,
        None,
        None,
        &input.reference_images,
        &input.negative_prompt,
        &input.image_size,
        &input.quality,
        image_count,
        &input.seed,
        &input.model,
    )
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO generation_tasks (
          id, type, status, priority, input_json, output_json, progress_current, progress_total,
          created_at
        )
        VALUES (?, 'image_generation', 'pending', 0, ?, '{}', 0, ?, ?)
        "#,
    )
    .bind(id)
    .bind(input_json)
    .bind(image_count)
    .bind(task_timestamp()?)
    .execute(pool)
    .await?;

    list_generation_tasks(pool).await
}

pub async fn create_batch_image_generation_tasks(
    pool: &SqlitePool,
    input: CreateBatchImageGenerationTasksInput,
) -> AppResult<Vec<GenerationTask>> {
    let prompts: Vec<String> = input
        .prompts
        .iter()
        .map(|prompt| prompt.trim())
        .filter(|prompt| !prompt.is_empty())
        .map(ToString::to_string)
        .take(50)
        .collect();
    if prompts.is_empty() {
        return Err(AppError::InvalidData(
            "批量生成至少需要一条提示词".to_string(),
        ));
    }

    let group_id = task_id()?.replace("task-", "group-");
    let image_count = image_count_for_workflow(&input.workflow_id, input.image_count);
    let mut tx = pool.begin().await?;
    for (index, prompt) in prompts.iter().enumerate() {
        let input_json = image_generation_input_json(
            &input.workflow_id,
            prompt,
            input.shot_ids.get(index).map(String::as_str),
            (input.workflow_id == "compare").then_some(group_id.as_str()),
            &input.reference_images,
            &input.negative_prompt,
            &input.image_size,
            &input.quality,
            image_count,
            &input.seed,
            input.models.get(index).unwrap_or(&input.model),
        )
        .to_string();

        sqlx::query(
            r#"
            INSERT INTO generation_tasks (
              id, group_id, project_id, type, status, priority, input_json, output_json,
              progress_current, progress_total, created_at
            )
            VALUES (?, ?, ?, 'image_generation', 'pending', ?, ?, '{}', 0, ?, ?)
            "#,
        )
        .bind(task_id()?)
        .bind(&group_id)
        .bind(&input.project_id)
        .bind(index as i64)
        .bind(input_json)
        .bind(image_count)
        .bind(task_timestamp()?)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    list_generation_tasks(pool).await
}

#[cfg(test)]
mod tests {
    use crate::db::init_sqlite;

    use super::*;

    #[tokio::test]
    async fn creates_pending_image_generation_task() {
        let dir = std::env::temp_dir().join(format!(
            "samimage-v2-generation-task-test-{}",
            task_id().expect("task id should be available")
        ));
        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let tasks = create_image_generation_task(
            &pool,
            CreateImageGenerationTaskInput {
                workflow_id: "daily".to_string(),
                prompt_text: "清晨咖啡馆".to_string(),
                reference_images: vec!["data:image/png;base64,abc".to_string()],
                negative_prompt: "水印".to_string(),
                image_size: "1024x1024".to_string(),
                quality: "high".to_string(),
                image_count: 2,
                seed: "123".to_string(),
                model: "image-test".to_string(),
            },
        )
        .await
        .expect("task should be created");

        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].task_type, "image_generation");
        assert_eq!(tasks[0].status, "pending");
        assert_eq!(tasks[0].progress_total, 2);
        assert_eq!(tasks[0].input["model"], "image-test");
        assert_eq!(
            tasks[0].input["referenceImages"][0],
            "data:image/png;base64,abc"
        );
        assert!(tasks[0].created_at.ends_with("+08:00"));

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn creates_img2img_task_with_single_output() {
        let dir = std::env::temp_dir().join(format!(
            "samimage-v2-img2img-single-output-test-{}",
            task_id().expect("task id should be available")
        ));
        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let tasks = create_image_generation_task(
            &pool,
            CreateImageGenerationTaskInput {
                workflow_id: "img2img".to_string(),
                prompt_text: "基于参考图调整光影".to_string(),
                reference_images: vec!["data:image/png;base64,abc".to_string()],
                negative_prompt: "水印".to_string(),
                image_size: "1024x1024".to_string(),
                quality: "high".to_string(),
                image_count: 2,
                seed: "123".to_string(),
                model: "image-test".to_string(),
            },
        )
        .await
        .expect("task should be created");

        assert_eq!(tasks[0].progress_total, 1);
        assert_eq!(tasks[0].input["imageCount"], 1);

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn cancels_and_retries_generation_tasks() {
        let dir = std::env::temp_dir().join(format!(
            "samimage-v2-generation-task-retry-test-{}",
            task_id().expect("task id should be available")
        ));
        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let tasks = create_image_generation_task(
            &pool,
            CreateImageGenerationTaskInput {
                workflow_id: "daily".to_string(),
                prompt_text: "清晨咖啡馆".to_string(),
                reference_images: vec![],
                negative_prompt: "水印".to_string(),
                image_size: "1024x1024".to_string(),
                quality: "high".to_string(),
                image_count: 2,
                seed: "123".to_string(),
                model: "image-test".to_string(),
            },
        )
        .await
        .expect("task should be created");
        let original_id = tasks[0].id.clone();

        let cancelled = cancel_generation_task(&pool, &original_id)
            .await
            .expect("task should cancel");
        assert_eq!(cancelled[0].status, "cancelled");
        assert!(cancelled[0]
            .finished_at
            .as_deref()
            .unwrap_or_default()
            .ends_with("+08:00"));

        let retried = retry_generation_task(&pool, &original_id)
            .await
            .expect("task should retry");
        assert_eq!(retried[0].status, "pending");
        assert_eq!(retried[0].retry_of.as_deref(), Some(original_id.as_str()));
        assert_eq!(retried[0].input["promptText"], "清晨咖啡馆");

        let remaining = clear_finished_generation_tasks(&pool)
            .await
            .expect("finished tasks should be cleared");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].status, "pending");

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn creates_batch_image_generation_task_group() {
        let dir = std::env::temp_dir().join(format!(
            "samimage-v2-generation-task-batch-test-{}",
            task_id().expect("task id should be available")
        ));
        let pool = init_sqlite(&dir).await.expect("database should initialize");

        let tasks = create_batch_image_generation_tasks(
            &pool,
            CreateBatchImageGenerationTasksInput {
                workflow_id: "batch".to_string(),
                project_id: None,
                prompts: vec![
                    "第一张海报".to_string(),
                    "  ".to_string(),
                    "第二张海报".to_string(),
                ],
                shot_ids: vec![],
                models: vec!["image-a".to_string(), "image-b".to_string()],
                reference_images: vec!["data:image/png;base64,ref".to_string()],
                negative_prompt: "水印".to_string(),
                image_size: "1024x1024".to_string(),
                quality: "high".to_string(),
                image_count: 1,
                seed: "".to_string(),
                model: "image-test".to_string(),
            },
        )
        .await
        .expect("batch tasks should be created");

        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].task_type, "image_generation");
        assert_eq!(tasks[0].status, "pending");
        let second_prompt_task = tasks
            .iter()
            .find(|task| task.input["promptText"] == "第二张海报")
            .expect("second prompt task should exist");
        assert_eq!(second_prompt_task.input["workflowId"], "batch");
        assert_eq!(second_prompt_task.input["model"], "image-b");
        assert_eq!(
            tasks[0].input["referenceImages"][0],
            "data:image/png;base64,ref"
        );
        assert_eq!(tasks[0].group_id, tasks[1].group_id);

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn creates_compare_tasks_with_compare_group_id() {
        let dir = std::env::temp_dir().join(format!(
            "samimage-v2-generation-task-compare-test-{}",
            task_id().expect("task id should be available")
        ));
        let pool = init_sqlite(&dir).await.expect("database should initialize");

        let tasks = create_batch_image_generation_tasks(
            &pool,
            CreateBatchImageGenerationTasksInput {
                workflow_id: "compare".to_string(),
                project_id: None,
                prompts: vec!["同一提示词".to_string(), "同一提示词".to_string()],
                shot_ids: vec![],
                models: vec!["image-a".to_string(), "image-b".to_string()],
                reference_images: vec![],
                negative_prompt: "水印".to_string(),
                image_size: "1024x1024".to_string(),
                quality: "high".to_string(),
                image_count: 1,
                seed: "42".to_string(),
                model: "image-test".to_string(),
            },
        )
        .await
        .expect("compare tasks should be created");

        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].group_id, tasks[1].group_id);
        let compare_group_id = tasks[0]
            .group_id
            .as_deref()
            .expect("compare tasks should keep a task group id");
        assert_eq!(tasks[0].input["workflowId"], "compare");
        assert_eq!(tasks[0].input["compareGroupId"], compare_group_id);
        assert_eq!(tasks[1].input["compareGroupId"], compare_group_id);

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn creates_storyboard_batch_tasks_with_project_and_shot_ids() {
        let dir = std::env::temp_dir().join(format!(
            "samimage-v2-generation-task-storyboard-batch-test-{}",
            task_id().expect("task id should be available")
        ));
        let pool = init_sqlite(&dir).await.expect("database should initialize");

        let tasks = create_batch_image_generation_tasks(
            &pool,
            CreateBatchImageGenerationTasksInput {
                workflow_id: "storyboard".to_string(),
                project_id: Some("project-storyboard".to_string()),
                prompts: vec!["镜头一".to_string(), "镜头二".to_string()],
                shot_ids: vec!["shot-1".to_string(), "shot-2".to_string()],
                models: vec![],
                reference_images: vec![],
                negative_prompt: "水印".to_string(),
                image_size: "1024x1024".to_string(),
                quality: "high".to_string(),
                image_count: 1,
                seed: "".to_string(),
                model: "image-test".to_string(),
            },
        )
        .await
        .expect("storyboard batch tasks should be created");

        assert_eq!(tasks.len(), 2);
        let shot_one_task = tasks
            .iter()
            .find(|task| task.input["shotId"] == "shot-1")
            .expect("first shot task should exist");
        assert_eq!(
            shot_one_task.project_id.as_deref(),
            Some("project-storyboard")
        );
        assert_eq!(shot_one_task.input["workflowId"], "storyboard");

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
