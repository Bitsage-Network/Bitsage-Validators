//! Middleware Module
//!
//! Production-grade middleware for authentication, rate limiting,
//! request validation, and observability.

pub mod auth;
pub mod rate_limit;
pub mod metrics;
pub mod error;

pub use auth::{AuthLayer, AuthState, Claims};
pub use rate_limit::RateLimitLayer;
pub use metrics::MetricsLayer;
pub use error::{AppError, ErrorResponse};
