//! Authentication Middleware
//!
//! JWT-based authentication with support for:
//! - Wallet-based authentication (Starknet signatures)
//! - API key authentication for workers
//! - Session tokens for web clients

use axum::{
    extract::{FromRequestParts, State},
    http::{header, request::Parts, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
    middleware::Next,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use chrono::{Duration, Utc};
use tracing::{debug, warn};

use crate::config::CONFIG;

/// JWT Claims structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (wallet address or worker ID)
    pub sub: String,
    /// Issued at (Unix timestamp)
    pub iat: i64,
    /// Expiration (Unix timestamp)
    pub exp: i64,
    /// Token type (user, worker, api_key)
    pub token_type: TokenType,
    /// Permissions/roles
    #[serde(default)]
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TokenType {
    User,
    Worker,
    ApiKey,
}

impl Claims {
    /// Create new user claims
    pub fn new_user(wallet: String, permissions: Vec<String>) -> Self {
        let now = Utc::now();
        let exp = now + Duration::hours(CONFIG.auth.token_expiry_hours as i64);

        Self {
            sub: wallet,
            iat: now.timestamp(),
            exp: exp.timestamp(),
            token_type: TokenType::User,
            permissions,
        }
    }

    /// Create new worker claims
    pub fn new_worker(worker_id: String) -> Self {
        let now = Utc::now();
        // Workers get longer-lived tokens (7 days)
        let exp = now + Duration::days(7);

        Self {
            sub: worker_id,
            iat: now.timestamp(),
            exp: exp.timestamp(),
            token_type: TokenType::Worker,
            permissions: vec!["worker".to_string()],
        }
    }

    /// Check if the token has a specific permission
    pub fn has_permission(&self, permission: &str) -> bool {
        self.permissions.iter().any(|p| p == permission || p == "admin")
    }

    /// Check if this is a worker token
    pub fn is_worker(&self) -> bool {
        self.token_type == TokenType::Worker
    }

    /// Check if this is a user token
    pub fn is_user(&self) -> bool {
        self.token_type == TokenType::User
    }
}

/// Authentication state
#[derive(Clone)]
pub struct AuthState {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    worker_api_key: Option<String>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(CONFIG.auth.jwt_secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(CONFIG.auth.jwt_secret.as_bytes()),
            worker_api_key: CONFIG.auth.worker_api_key.clone(),
        }
    }

    /// Generate a JWT token from claims
    pub fn generate_token(&self, claims: &Claims) -> Result<String, AuthError> {
        encode(&Header::default(), claims, &self.encoding_key)
            .map_err(|e| AuthError::TokenGeneration(e.to_string()))
    }

    /// Validate and decode a JWT token
    pub fn validate_token(&self, token: &str) -> Result<Claims, AuthError> {
        let validation = Validation::default();
        let token_data = decode::<Claims>(token, &self.decoding_key, &validation)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
                jsonwebtoken::errors::ErrorKind::InvalidToken => AuthError::InvalidToken,
                _ => AuthError::TokenValidation(e.to_string()),
            })?;
        Ok(token_data.claims)
    }

    /// Validate worker API key
    pub fn validate_worker_api_key(&self, key: &str) -> bool {
        self.worker_api_key
            .as_ref()
            .map(|k| k == key)
            .unwrap_or(true) // Allow if no key is configured (dev mode)
    }
}

impl Default for AuthState {
    fn default() -> Self {
        Self::new()
    }
}

/// Authentication layer for Axum
pub struct AuthLayer;

/// Extract authenticated claims from request
#[axum::async_trait]
impl<S> FromRequestParts<S> for Claims
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Get auth state from extensions
        let auth = AuthState::new();

        // Try Bearer token first
        if let Some(auth_header) = parts.headers.get(header::AUTHORIZATION) {
            let auth_str = auth_header.to_str().map_err(|_| AuthError::InvalidHeader)?;

            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                return auth.validate_token(token);
            }
        }

        // Try X-API-Key header for workers
        if let Some(api_key) = parts.headers.get("X-API-Key") {
            let key = api_key.to_str().map_err(|_| AuthError::InvalidHeader)?;

            if auth.validate_worker_api_key(key) {
                // Generate worker claims from API key
                // In production, look up the API key in the database
                return Ok(Claims::new_worker("api-key-worker".to_string()));
            } else {
                return Err(AuthError::InvalidApiKey);
            }
        }

        Err(AuthError::MissingAuth)
    }
}

/// Optional authentication - doesn't fail if not present
pub struct OptionalAuth(pub Option<Claims>);

#[axum::async_trait]
impl<S> FromRequestParts<S> for OptionalAuth
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        match Claims::from_request_parts(parts, state).await {
            Ok(claims) => Ok(OptionalAuth(Some(claims))),
            Err(_) => Ok(OptionalAuth(None)),
        }
    }
}

/// Admin permission requirement
pub struct RequireAdmin(pub Claims);

#[axum::async_trait]
impl<S> FromRequestParts<S> for RequireAdmin
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let claims = Claims::from_request_parts(parts, state).await?;

        if claims.has_permission("admin") {
            Ok(RequireAdmin(claims))
        } else {
            Err(AuthError::InsufficientPermissions)
        }
    }
}

/// Worker permission requirement
pub struct RequireWorker(pub Claims);

#[axum::async_trait]
impl<S> FromRequestParts<S> for RequireWorker
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let claims = Claims::from_request_parts(parts, state).await?;

        if claims.is_worker() || claims.has_permission("admin") {
            Ok(RequireWorker(claims))
        } else {
            Err(AuthError::InsufficientPermissions)
        }
    }
}

/// Authentication errors
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Missing authentication")]
    MissingAuth,

    #[error("Invalid authorization header")]
    InvalidHeader,

    #[error("Invalid token")]
    InvalidToken,

    #[error("Token expired")]
    TokenExpired,

    #[error("Token validation failed: {0}")]
    TokenValidation(String),

    #[error("Token generation failed: {0}")]
    TokenGeneration(String),

    #[error("Invalid API key")]
    InvalidApiKey,

    #[error("Insufficient permissions")]
    InsufficientPermissions,

    #[error("Invalid signature")]
    InvalidSignature,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AuthError::MissingAuth => (StatusCode::UNAUTHORIZED, "Authentication required"),
            AuthError::InvalidHeader => (StatusCode::BAD_REQUEST, "Invalid authorization header"),
            AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid token"),
            AuthError::TokenExpired => (StatusCode::UNAUTHORIZED, "Token expired"),
            AuthError::TokenValidation(_) => (StatusCode::UNAUTHORIZED, "Token validation failed"),
            AuthError::TokenGeneration(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate token"),
            AuthError::InvalidApiKey => (StatusCode::UNAUTHORIZED, "Invalid API key"),
            AuthError::InsufficientPermissions => (StatusCode::FORBIDDEN, "Insufficient permissions"),
            AuthError::InvalidSignature => (StatusCode::UNAUTHORIZED, "Invalid signature"),
        };

        let body = serde_json::json!({
            "error": message,
            "code": status.as_u16(),
        });

        (status, Json(body)).into_response()
    }
}

/// Wallet signature verification for Starknet
pub mod wallet_auth {
    use super::*;
    use starknet_crypto::{verify, FieldElement};

    /// Request to authenticate with wallet signature
    #[derive(Debug, Deserialize)]
    pub struct WalletAuthRequest {
        pub wallet_address: String,
        pub message: String,
        pub signature_r: String,
        pub signature_s: String,
    }

    /// Response with JWT token
    #[derive(Debug, Serialize)]
    pub struct WalletAuthResponse {
        pub token: String,
        pub expires_at: i64,
        pub wallet: String,
    }

    /// Verify a Starknet wallet signature
    pub fn verify_signature(
        wallet: &str,
        message_hash: &str,
        sig_r: &str,
        sig_s: &str,
    ) -> Result<bool, AuthError> {
        // Parse the wallet address and signature components
        let public_key = FieldElement::from_hex_be(wallet)
            .map_err(|_| AuthError::InvalidSignature)?;

        let msg_hash = FieldElement::from_hex_be(message_hash)
            .map_err(|_| AuthError::InvalidSignature)?;

        let r = FieldElement::from_hex_be(sig_r)
            .map_err(|_| AuthError::InvalidSignature)?;

        let s = FieldElement::from_hex_be(sig_s)
            .map_err(|_| AuthError::InvalidSignature)?;

        // Verify the ECDSA signature
        match verify(&public_key, &msg_hash, &r, &s) {
            Ok(valid) => Ok(valid),
            Err(_) => Err(AuthError::InvalidSignature),
        }
    }

    /// Generate authentication message for wallet to sign
    pub fn generate_auth_message(wallet: &str) -> String {
        let timestamp = Utc::now().timestamp();
        format!(
            "Sign this message to authenticate with BitSage Network.\n\nWallet: {}\nTimestamp: {}",
            wallet, timestamp
        )
    }
}
