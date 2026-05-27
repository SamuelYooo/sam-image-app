use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("应用目录错误: {0}")]
    AppDir(String),
    #[error("数据库错误: {0}")]
    Database(#[from] sqlx::Error),
    #[error("迁移错误: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("网络请求错误: {0}")]
    Network(#[from] reqwest::Error),
    #[error("JSON 错误: {0}")]
    Json(#[from] serde_json::Error),
    #[error("数据格式错误: {0}")]
    InvalidData(String),
    #[error("文件系统错误: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    code: &'static str,
    message: String,
}

impl AppError {
    fn code(&self) -> &'static str {
        match self {
            Self::AppDir(_) => "APP_DIR_ERROR",
            Self::Database(_) => "DATABASE_ERROR",
            Self::Migration(_) => "MIGRATION_ERROR",
            Self::Network(_) => "NETWORK_ERROR",
            Self::Json(_) => "JSON_ERROR",
            Self::InvalidData(_) => "INVALID_DATA",
            Self::Io(_) => "IO_ERROR",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        ErrorPayload {
            code: self.code(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}
