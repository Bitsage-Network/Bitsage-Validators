//! Rate Limiting Middleware
//!
//! Token bucket rate limiting with per-IP and per-wallet limits.

use axum::{
    body::Body,
    extract::{ConnectInfo, State},
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use governor::{
    clock::DefaultClock,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    num::NonZeroU32,
    sync::Arc,
};
use tokio::sync::RwLock;
use tracing::{debug, warn};

use crate::config::CONFIG;

/// Rate limiter state
#[derive(Clone)]
pub struct RateLimitLayer {
    /// Per-IP rate limiters
    ip_limiters: Arc<RwLock<HashMap<String, Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>>>>>,
    /// Global rate limiter
    global_limiter: Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>>,
    /// Requests per minute limit
    requests_per_minute: u32,
    /// Burst size
    burst_size: u32,
}

impl RateLimitLayer {
    pub fn new() -> Self {
        let requests_per_minute = CONFIG.auth.rate_limit_per_minute;
        let burst_size = CONFIG.auth.rate_limit_burst;

        // Global limiter (10x individual rate)
        let global_quota = Quota::per_minute(
            NonZeroU32::new(requests_per_minute * 10).unwrap_or(NonZeroU32::new(1000).unwrap())
        );

        Self {
            ip_limiters: Arc::new(RwLock::new(HashMap::new())),
            global_limiter: Arc::new(RateLimiter::direct(global_quota)),
            requests_per_minute,
            burst_size,
        }
    }

    /// Check rate limit for an IP address
    pub async fn check_limit(&self, ip: &str) -> Result<(), RateLimitError> {
        // Check global limit first
        if self.global_limiter.check().is_err() {
            warn!("Global rate limit exceeded");
            return Err(RateLimitError::GlobalLimitExceeded);
        }

        // Get or create per-IP limiter
        let limiter = {
            let limiters = self.ip_limiters.read().await;
            limiters.get(ip).cloned()
        };

        let limiter = match limiter {
            Some(l) => l,
            None => {
                let quota = Quota::per_minute(
                    NonZeroU32::new(self.requests_per_minute).unwrap_or(NonZeroU32::new(100).unwrap())
                ).allow_burst(
                    NonZeroU32::new(self.burst_size).unwrap_or(NonZeroU32::new(20).unwrap())
                );
                let new_limiter = Arc::new(RateLimiter::direct(quota));

                let mut limiters = self.ip_limiters.write().await;
                limiters.insert(ip.to_string(), new_limiter.clone());
                new_limiter
            }
        };

        // Check the rate limit
        if limiter.check().is_err() {
            debug!(ip = ip, "Rate limit exceeded for IP");
            return Err(RateLimitError::IpLimitExceeded);
        }

        Ok(())
    }

    /// Clean up old limiters (call periodically)
    pub async fn cleanup(&self) {
        let mut limiters = self.ip_limiters.write().await;
        // In production, implement proper cleanup based on last access time
        if limiters.len() > 10000 {
            limiters.clear();
        }
    }
}

impl Default for RateLimitLayer {
    fn default() -> Self {
        Self::new()
    }
}

/// Rate limit errors
#[derive(Debug, thiserror::Error)]
pub enum RateLimitError {
    #[error("Rate limit exceeded")]
    IpLimitExceeded,

    #[error("Service temporarily unavailable")]
    GlobalLimitExceeded,
}

impl IntoResponse for RateLimitError {
    fn into_response(self) -> Response {
        let (status, message, retry_after) = match self {
            RateLimitError::IpLimitExceeded => (
                StatusCode::TOO_MANY_REQUESTS,
                "Rate limit exceeded. Please slow down.",
                60,
            ),
            RateLimitError::GlobalLimitExceeded => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Service temporarily unavailable due to high load.",
                30,
            ),
        };

        let body = serde_json::json!({
            "error": message,
            "code": status.as_u16(),
            "retry_after_seconds": retry_after,
        });

        let mut response = (status, Json(body)).into_response();
        response.headers_mut().insert(
            "Retry-After",
            retry_after.to_string().parse().unwrap(),
        );

        response
    }
}

/// Middleware function for rate limiting (axum 0.7 compatible)
pub async fn rate_limit_middleware(
    State(limiter): State<RateLimitLayer>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, RateLimitError> {
    // Get client IP (handle proxies)
    let client_ip = request
        .headers()
        .get("X-Forwarded-For")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| addr.ip().to_string());

    // Check rate limit
    limiter.check_limit(&client_ip).await?;

    // Continue to next handler
    Ok(next.run(request).await)
}

/// Stricter rate limit for sensitive endpoints
pub struct StrictRateLimit {
    limiter: Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>>,
}

impl StrictRateLimit {
    pub fn new(requests_per_minute: u32) -> Self {
        let quota = Quota::per_minute(
            NonZeroU32::new(requests_per_minute).unwrap_or(NonZeroU32::new(10).unwrap())
        );

        Self {
            limiter: Arc::new(RateLimiter::direct(quota)),
        }
    }

    pub fn check(&self) -> Result<(), RateLimitError> {
        if self.limiter.check().is_err() {
            Err(RateLimitError::IpLimitExceeded)
        } else {
            Ok(())
        }
    }
}
