use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
#[derive(Debug)]
pub struct Error {
    pub status: u16,
    pub message: String,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.message.fmt(f)
    }
}
impl std::error::Error for Error {}
pub fn check(ok: bool, status: u16, message: &str) -> anyhow::Result<()> {
    if !ok {
        return Err(Error {
            status,
            message: message.into(),
        }
        .into());
    }
    Ok(())
}
pub struct ApiError(pub anyhow::Error);
impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        Self(e.into())
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (code, message) = if let Some(error) = self.0.downcast_ref::<Error>() {
            (error.status, error.message.clone())
        } else {
            eprintln!("{:#}", self.0);
            (500, "Internal server error".into())
        };
        (
            StatusCode::from_u16(code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            Json(json!({"error": message})),
        )
            .into_response()
    }
}
