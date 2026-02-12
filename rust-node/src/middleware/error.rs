//! Error Handling
//!
//! Unified error types and responses for the API.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use tracing::error;

/// Unified application error type
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    // Client errors (4xx)
    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    // Server errors (5xx)
    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("External service error: {0}")]
    ExternalService(String),

    #[error("Configuration error: {0}")]
    Configuration(String),

    // Domain-specific errors
    #[error("Worker not available: {0}")]
    WorkerNotAvailable(String),

    #[error("Deployment failed: {0}")]
    DeploymentFailed(String),

    #[error("Insufficient funds: required {required}, available {available}")]
    InsufficientFunds { required: u64, available: u64 },

    #[error("Rental error: {0}")]
    Rental(String),

    #[error("Billing error: {0}")]
    Billing(String),
}

impl AppError {
    /// Get HTTP status code for this error
    pub fn status_code(&self) -> StatusCode {
        match self {
            // Client errors
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Validation(_) => StatusCode::UNPROCESSABLE_ENTITY,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,

            // Server errors
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::ExternalService(_) => StatusCode::BAD_GATEWAY,
            AppError::Configuration(_) => StatusCode::INTERNAL_SERVER_ERROR,

            // Domain errors
            AppError::WorkerNotAvailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            AppError::DeploymentFailed(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::InsufficientFunds { .. } => StatusCode::PAYMENT_REQUIRED,
            AppError::Rental(_) => StatusCode::BAD_REQUEST,
            AppError::Billing(_) => StatusCode::PAYMENT_REQUIRED,
        }
    }

    /// Get error code string
    pub fn error_code(&self) -> &'static str {
        match self {
            AppError::BadRequest(_) => "BAD_REQUEST",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Conflict(_) => "CONFLICT",
            AppError::Unauthorized(_) => "UNAUTHORIZED",
            AppError::Forbidden(_) => "FORBIDDEN",
            AppError::Internal(_) => "INTERNAL_ERROR",
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::ExternalService(_) => "EXTERNAL_SERVICE_ERROR",
            AppError::Configuration(_) => "CONFIGURATION_ERROR",
            AppError::WorkerNotAvailable(_) => "WORKER_NOT_AVAILABLE",
            AppError::DeploymentFailed(_) => "DEPLOYMENT_FAILED",
            AppError::InsufficientFunds { .. } => "INSUFFICIENT_FUNDS",
            AppError::Rental(_) => "RENTAL_ERROR",
            AppError::Billing(_) => "BILLING_ERROR",
        }
    }

    /// Check if this is a server error (should be logged)
    pub fn is_server_error(&self) -> bool {
        self.status_code().is_server_error()
    }
}

/// Standard error response format
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: ErrorDetail,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ErrorDetail {
    pub code: &'static str,
    pub message: String,
    pub status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status_code();

        // Log server errors
        if self.is_server_error() {
            error!(
                error = %self,
                code = self.error_code(),
                status = status.as_u16(),
                "Server error"
            );
        }

        let response = ErrorResponse {
            error: ErrorDetail {
                code: self.error_code(),
                message: self.to_string(),
                status: status.as_u16(),
                details: match &self {
                    AppError::InsufficientFunds { required, available } => {
                        Some(serde_json::json!({
                            "required": required,
                            "available": available,
                        }))
                    }
                    _ => None,
                },
            },
            request_id: None, // Would be populated from request extensions
        };

        (status, Json(response)).into_response()
    }
}

// Conversions from other error types

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound("Record not found".to_string()),
            sqlx::Error::Database(ref e) if e.is_unique_violation() => {
                AppError::Conflict("Record already exists".to_string())
            }
            _ => AppError::Database(err.to_string()),
        }
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::BadRequest(format!("Invalid JSON: {}", err))
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Internal(format!("IO error: {}", err))
    }
}

/// Result type alias using AppError
pub type AppResult<T> = Result<T, AppError>;

/// Validation helper
pub fn validate_wallet_address(address: &str) -> Result<(), AppError> {
    // Starknet addresses should be 64 hex chars with 0x prefix
    if !address.starts_with("0x") {
        return Err(AppError::Validation(
            "Wallet address must start with 0x".to_string(),
        ));
    }

    let hex_part = &address[2..];
    if hex_part.len() > 64 {
        return Err(AppError::Validation(
            "Invalid wallet address length".to_string(),
        ));
    }

    if !hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::Validation(
            "Invalid wallet address format".to_string(),
        ));
    }

    Ok(())
}

/// Validation helper for UUIDs
pub fn validate_uuid(id: &str) -> Result<uuid::Uuid, AppError> {
    uuid::Uuid::parse_str(id)
        .map_err(|_| AppError::Validation(format!("Invalid UUID: {}", id)))
}
