use anyhow::{Context, Result};
use rusqlite::{params, Connection};

fn storyboard_project_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<crate::models::StoryboardProject> {
    Ok(crate::models::StoryboardProject {
        id: row.get(0)?,
        name: row.get(1)?,
        aspect_ratio: row.get(2)?,
        style: row.get(3)?,
        color_palette: row.get(4)?,
        shot_count: row.get(5)?,
        master_prompt: row.get(6)?,
        shot_size: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn storyboard_scene_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<crate::models::StoryboardScene> {
    Ok(crate::models::StoryboardScene {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        scene_index: row.get(3)?,
        is_active: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
    })
}

fn storyboard_shot_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<crate::models::StoryboardShot> {
    Ok(crate::models::StoryboardShot {
        id: row.get(0)?,
        project_id: row.get(1)?,
        scene_id: row.get(2)?,
        shot_index: row.get(3)?,
        is_master: row.get::<_, i64>(4)? != 0,
        framing: row.get(5)?,
        angle: row.get(6)?,
        focal_length: row.get(7)?,
        movement: row.get(8)?,
        subject: row.get(9)?,
        environment: row.get(10)?,
        lighting: row.get(11)?,
        mood: row.get(12)?,
        style: row.get(13)?,
        generated_image_url: row.get(14)?,
        artifact_id: row.get(15)?,
        duration: row.get(16)?,
        transition: row.get(17)?,
        created_at: row.get(18)?,
    })
}

// ── Projects ─────────────────────────────────────────────────────────────────

pub fn list_storyboard_projects(conn: &Connection) -> Result<Vec<crate::models::StoryboardProject>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, aspect_ratio, style, color_palette, shot_count, master_prompt, shot_size, created_at, updated_at FROM storyboard_projects ORDER BY updated_at DESC, created_at DESC"
    )?;
    let rows = stmt.query_map([], storyboard_project_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().context("load storyboard projects")
}

pub fn insert_storyboard_project(conn: &Connection, project: &crate::models::StoryboardProject) -> Result<crate::models::StoryboardProject> {
    conn.execute(
        "INSERT INTO storyboard_projects (id, name, aspect_ratio, style, color_palette, shot_count, master_prompt, shot_size, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now'))",
        params![project.id, project.name, project.aspect_ratio, project.style, project.color_palette, project.shot_count, project.master_prompt, project.shot_size],
    )?;
    get_storyboard_project(conn, &project.id)
}

pub fn get_storyboard_project(conn: &Connection, id: &str) -> Result<crate::models::StoryboardProject> {
    conn.query_row(
        "SELECT id, name, aspect_ratio, style, color_palette, shot_count, master_prompt, shot_size, created_at, updated_at FROM storyboard_projects WHERE id = ?1",
        [id],
        storyboard_project_from_row,
    ).context("storyboard project not found")
}

pub fn update_storyboard_project(conn: &Connection, id: &str, req: &crate::api::UpdateStoryboardProjectRequest) -> Result<crate::models::StoryboardProject> {
    let current = get_storyboard_project(conn, id)?;
    let new_name = req.name.as_ref().unwrap_or(&current.name);
    let new_aspect_ratio = req.aspect_ratio.as_ref().unwrap_or(&current.aspect_ratio);
    let new_style = req.style.as_ref().unwrap_or(&current.style);
    let new_color_palette = req.color_palette.as_ref().unwrap_or(&current.color_palette);
    let new_master_prompt = req.master_prompt.as_ref().unwrap_or(&current.master_prompt);
    let new_shot_size = req.shot_size.as_ref().unwrap_or(&current.shot_size);
    conn.execute(
        "UPDATE storyboard_projects SET name = ?1, aspect_ratio = ?2, style = ?3, color_palette = ?4, master_prompt = ?5, shot_size = ?6, updated_at = datetime('now') WHERE id = ?7",
        params![new_name, new_aspect_ratio, new_style, new_color_palette, new_master_prompt, new_shot_size, id],
    )?;
    get_storyboard_project(conn, id)
}

pub fn delete_storyboard_project(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM storyboard_projects WHERE id = ?1", [id])?;
    Ok(())
}

// ── Scenes ───────────────────────────────────────────────────────────────────

pub fn list_storyboard_scenes(conn: &Connection, project_id: &str) -> Result<Vec<crate::models::StoryboardScene>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, scene_index, is_active, created_at FROM storyboard_scenes WHERE project_id = ?1 ORDER BY scene_index ASC"
    )?;
    let rows = stmt.query_map([project_id], storyboard_scene_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().context("load storyboard scenes")
}

pub fn insert_storyboard_scene(conn: &Connection, scene: &crate::models::StoryboardScene) -> Result<crate::models::StoryboardScene> {
    conn.execute(
        "INSERT INTO storyboard_scenes (id, project_id, name, scene_index, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
        params![scene.id, scene.project_id, scene.name, scene.scene_index, if scene.is_active { 1 } else { 0 }],
    )?;
    get_storyboard_scene(conn, &scene.id)
}

pub fn get_storyboard_scene(conn: &Connection, id: &str) -> Result<crate::models::StoryboardScene> {
    conn.query_row(
        "SELECT id, project_id, name, scene_index, is_active, created_at FROM storyboard_scenes WHERE id = ?1",
        [id],
        storyboard_scene_from_row,
    ).context("storyboard scene not found")
}

pub fn update_storyboard_scene(conn: &Connection, id: &str, name: &str, is_active: bool) -> Result<crate::models::StoryboardScene> {
    conn.execute(
        "UPDATE storyboard_scenes SET name = ?1, is_active = ?2 WHERE id = ?3",
        params![name, if is_active { 1 } else { 0 }, id],
    )?;
    get_storyboard_scene(conn, id)
}

pub fn delete_storyboard_scene(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM storyboard_scenes WHERE id = ?1", [id])?;
    Ok(())
}

// ── Shots ────────────────────────────────────────────────────────────────────

pub fn list_storyboard_shots(conn: &Connection, project_id: &str, scene_id: Option<&str>) -> Result<Vec<crate::models::StoryboardShot>> {
    let sql = if scene_id.is_some() {
        "SELECT id, project_id, scene_id, shot_index, is_master, framing, angle, focal_length, movement, subject, environment, lighting, mood, style, generated_image_url, artifact_id, duration, transition, created_at FROM storyboard_shots WHERE project_id = ?1 AND scene_id = ?2 ORDER BY shot_index ASC"
    } else {
        "SELECT id, project_id, scene_id, shot_index, is_master, framing, angle, focal_length, movement, subject, environment, lighting, mood, style, generated_image_url, artifact_id, duration, transition, created_at FROM storyboard_shots WHERE project_id = ?1 ORDER BY shot_index ASC"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = if let Some(sid) = scene_id {
        stmt.query_map(params![project_id, sid], storyboard_shot_from_row)?
    } else {
        stmt.query_map([project_id], storyboard_shot_from_row)?
    };
    rows.collect::<Result<Vec<_>, _>>().context("load storyboard shots")
}

pub fn insert_storyboard_shot(conn: &Connection, shot: &crate::models::StoryboardShot) -> Result<crate::models::StoryboardShot> {
    conn.execute(
        "INSERT INTO storyboard_shots (id, project_id, scene_id, shot_index, is_master, framing, angle, focal_length, movement, subject, environment, lighting, mood, style, generated_image_url, artifact_id, duration, transition, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, datetime('now'))",
        params![
            shot.id, shot.project_id, shot.scene_id, shot.shot_index,
            if shot.is_master { 1 } else { 0 },
            shot.framing, shot.angle, shot.focal_length, shot.movement,
            shot.subject, shot.environment, shot.lighting, shot.mood, shot.style,
            shot.generated_image_url, shot.artifact_id, shot.duration, shot.transition,
        ],
    )?;
    get_storyboard_shot(conn, &shot.id)
}

pub fn get_storyboard_shot(conn: &Connection, id: &str) -> Result<crate::models::StoryboardShot> {
    conn.query_row(
        "SELECT id, project_id, scene_id, shot_index, is_master, framing, angle, focal_length, movement, subject, environment, lighting, mood, style, generated_image_url, artifact_id, duration, transition, created_at FROM storyboard_shots WHERE id = ?1",
        [id],
        storyboard_shot_from_row,
    ).context("storyboard shot not found")
}

pub fn update_storyboard_shot(conn: &Connection, id: &str, req: &crate::api::UpdateShotRequest) -> Result<crate::models::StoryboardShot> {
    let current = get_storyboard_shot(conn, id)?;
    conn.execute(
        "UPDATE storyboard_shots SET framing = ?1, angle = ?2, focal_length = ?3, movement = ?4, subject = ?5, environment = ?6, lighting = ?7, mood = ?8, style = ?9, generated_image_url = ?10, artifact_id = ?11, duration = ?12, transition = ?13, shot_index = ?14, is_master = ?15 WHERE id = ?16",
        params![
            req.framing.as_ref().unwrap_or(&current.framing),
            req.angle.as_ref().unwrap_or(&current.angle),
            req.focal_length.as_ref().unwrap_or(&current.focal_length),
            req.movement.as_ref().unwrap_or(&current.movement),
            req.subject.as_ref().unwrap_or(&current.subject),
            req.environment.as_ref().unwrap_or(&current.environment),
            req.lighting.as_ref().unwrap_or(&current.lighting),
            req.mood.as_ref().unwrap_or(&current.mood),
            req.style.as_ref().unwrap_or(&current.style),
            req.generated_image_url.as_ref().unwrap_or(&current.generated_image_url.unwrap_or_default()),
            req.artifact_id.as_ref().unwrap_or(&current.artifact_id.unwrap_or_default()),
            req.duration.unwrap_or(current.duration.unwrap_or(0)),
            req.transition.as_ref().unwrap_or(&current.transition.unwrap_or_default()),
            req.shot_index.unwrap_or(current.shot_index),
            if req.is_master.unwrap_or(current.is_master) { 1 } else { 0 },
            id,
        ],
    )?;
    get_storyboard_shot(conn, id)
}

pub fn delete_storyboard_shot(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM storyboard_shots WHERE id = ?1", [id])?;
    Ok(())
}

pub fn update_storyboard_shot_url(conn: &Connection, id: &str, image_url: &str, artifact_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE storyboard_shots SET generated_image_url = ?1, artifact_id = ?2 WHERE id = ?3",
        params![image_url, artifact_id, id],
    )?;
    Ok(())
}
