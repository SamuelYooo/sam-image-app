use sqlx::SqlitePool;

use crate::{
    api::storyboard::{
        StoryboardCharacter, StoryboardDraft, StoryboardDraftInput, StoryboardProject,
        StoryboardScene, StoryboardShot,
    },
    db::storyboard_repo,
    domain::clock,
    error::{AppError, AppResult},
};

fn now_nanos() -> AppResult<u128> {
    clock::now_nanos()
}

fn now_stamp() -> AppResult<String> {
    clock::beijing_timestamp_now()
}

fn id(prefix: &str, suffix: impl std::fmt::Display) -> AppResult<String> {
    Ok(format!("{prefix}-{}-{suffix}", now_nanos()?))
}

fn clean(value: &str) -> String {
    value.trim().replace(['\r', '\n'], " ")
}

fn default_shot_specs() -> [(&'static str, &'static str, &'static str, &'static str); 6] {
    [
        ("建立镜头", "wide shot", "eye level", "slow push in"),
        (
            "角色亮相",
            "medium shot",
            "three-quarter angle",
            "static hold",
        ),
        ("关键动作", "full shot", "low angle", "tracking"),
        ("情绪反应", "close-up", "eye level", "slow dolly"),
        ("冲突升级", "over shoulder", "high angle", "handheld"),
        ("收束镜头", "wide shot", "back angle", "pull back"),
    ]
}

pub async fn create_default_storyboard_draft(
    pool: &SqlitePool,
    input: StoryboardDraftInput,
) -> AppResult<StoryboardDraft> {
    let concept = clean(&input.concept);
    if concept.is_empty() {
        return Err(AppError::InvalidData("故事概念不能为空".to_string()));
    }

    let project_id = id("project", "storyboard")?;
    let scene_id = id("scene", 0)?;
    let now = now_stamp()?;
    let style_hint = clean(&input.style_hint);
    let project_name = clean(&input.project_name);
    let shot_count = input.shot_count.clamp(3, 12) as usize;
    let project = StoryboardProject {
        id: project_id.clone(),
        project_type: "storyboard".to_string(),
        name: if project_name.is_empty() {
            "未命名分镜项目".to_string()
        } else {
            project_name
        },
        description: Some(concept.clone()),
        status: "draft".to_string(),
        settings: serde_json::json!({
            "styleHint": style_hint,
            "draftProvider": "samimage-default-draft",
        }),
        created_at: now.clone(),
        updated_at: now,
    };

    let characters = vec![
        StoryboardCharacter {
            id: id("character", "lead")?,
            project_id: project_id.clone(),
            name: "主角".to_string(),
            role: "protagonist".to_string(),
            appearance: "与故事概念一致的核心人物，造型清晰，便于后续保持一致性".to_string(),
            personality: Some("目标明确，情绪有可见变化".to_string()),
            reference_asset_ids: vec![],
        },
        StoryboardCharacter {
            id: id("character", "support")?,
            project_id: project_id.clone(),
            name: "关键配角".to_string(),
            role: "supporting".to_string(),
            appearance: "与主角形成对比的视觉轮廓，可作为冲突或协作对象".to_string(),
            personality: Some("推动情节转折".to_string()),
            reference_asset_ids: vec![],
        },
    ];

    let scene = StoryboardScene {
        id: scene_id.clone(),
        project_id: project_id.clone(),
        name: "核心场景".to_string(),
        summary: format!("围绕“{concept}”展开的主要视觉段落"),
        location: "按故事概念设定的主要空间".to_string(),
        time_of_day: Some("黄金时刻或高辨识度光线".to_string()),
        mood: Some("电影感、清晰叙事、镜头连续".to_string()),
        order_index: 0,
    };

    let specs = default_shot_specs();
    let shots = (0..shot_count)
        .map(|index| {
            let (title, framing, angle, movement) = specs[index % specs.len()];
            let description = format!("{title}：围绕“{concept}”推进故事信息和视觉节奏");
            let prompt_text = [
                concept.as_str(),
                title,
                framing,
                angle,
                movement,
                style_hint.as_str(),
                "cinematic storyboard frame, coherent character design, production-ready composition",
            ]
            .iter()
            .filter(|part| !part.trim().is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join(", ");

            Ok(StoryboardShot {
                id: id("shot", index)?,
                project_id: project_id.clone(),
                scene_id: Some(scene_id.clone()),
                order_index: index as i64,
                title: title.to_string(),
                description,
                prompt_text,
                framing: framing.to_string(),
                angle: angle.to_string(),
                movement: movement.to_string(),
                duration_sec: Some(4),
                transition: Some(if index == 0 { "fade in" } else { "cut" }.to_string()),
                asset_id: None,
                status: "draft".to_string(),
            })
        })
        .collect::<AppResult<Vec<_>>>()?;

    let draft = StoryboardDraft {
        project,
        characters,
        scenes: vec![scene],
        shots,
    };
    storyboard_repo::save_storyboard_draft(pool, &draft).await
}

#[cfg(test)]
mod tests {
    use crate::{api::storyboard::StoryboardDraftInput, db::init_sqlite};

    use super::*;

    #[tokio::test]
    async fn creates_default_storyboard_draft() {
        let dir = std::env::temp_dir().join("samimage-v2-storyboard-service-test");
        let _ = std::fs::remove_dir_all(&dir);
        let pool = init_sqlite(&dir).await.expect("database should initialize");

        let draft = create_default_storyboard_draft(
            &pool,
            StoryboardDraftInput {
                concept: "雨夜城市追逐".to_string(),
                project_name: "雨夜追逐".to_string(),
                style_hint: "neo noir".to_string(),
                shot_count: 4,
            },
        )
        .await
        .expect("draft should be created");

        assert_eq!(draft.project.project_type, "storyboard");
        assert_eq!(draft.characters.len(), 2);
        assert_eq!(draft.scenes.len(), 1);
        assert_eq!(draft.shots.len(), 4);
        assert!(draft.shots[0].prompt_text.contains("雨夜城市追逐"));

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
