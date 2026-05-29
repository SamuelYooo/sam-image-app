use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("数据库错误: {0}")]
    Database(String),
    #[error("IO 错误: {0}")]
    Io(String),
    #[error("验证失败: {0}")]
    Validation(String),
    #[error("网络错误: {0}")]
    Network(String),
    #[error("未知错误: {0}")]
    Unknown(String),
}

impl From<sqlx::Error> for AppError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<crate::generation::GenerationError> for AppError {
    fn from(value: crate::generation::GenerationError) -> Self {
        Self::Validation(value.to_string())
    }
}

impl From<crate::text::TextPolishError> for AppError {
    fn from(value: crate::text::TextPolishError) -> Self {
        Self::Validation(value.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(value: reqwest::Error) -> Self {
        Self::Network(value.to_string())
    }
}
