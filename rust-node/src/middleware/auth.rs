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
        let mut validation = Validation::new(jsonwebtoken::Algorithm::HS256);
        // Require exp claim and validate it (default in jsonwebtoken 9.x)
        validation.validate_exp = true;
        // Reject tokens issued far in the future (clock skew tolerance: 60s)
        validation.leeway = 60;
        // Explicitly only allow HS256 — prevents algorithm confusion attacks
        validation.algorithms = vec![jsonwebtoken::Algorithm::HS256];

        let token_data = decode::<Claims>(token, &self.decoding_key, &validation)
            .map_err(|e| match e.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
                jsonwebtoken::errors::ErrorKind::InvalidToken => AuthError::InvalidToken,
                _ => AuthError::TokenValidation(e.to_string()),
            })?;
        Ok(token_data.claims)
    }

    /// Validate worker API key (constant-time comparison to prevent timing attacks)
    pub fn validate_worker_api_key(&self, key: &str) -> bool {
        match self.worker_api_key.as_ref() {
            Some(k) => {
                use ring::constant_time::verify_slices_are_equal;
                verify_slices_are_equal(k.as_bytes(), key.as_bytes()).is_ok()
            }
            None => {
                let is_production = std::env::var("PRODUCTION").unwrap_or_default() == "true"
                    || std::env::var("NODE_ENV").unwrap_or_default() == "production";
                if is_production {
                    tracing::error!("WORKER_API_KEY not configured — rejecting request in production");
                    false
                } else {
                    tracing::warn!("WORKER_API_KEY not configured — allowing in dev mode");
                    true
                }
            }
        }
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

    /// Maximum age for a signed request (5 minutes)
    const MAX_SIGNATURE_AGE_SECS: i64 = 300;

    /// Request to authenticate with wallet signature (for JWT token issuance)
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
        let public_key = FieldElement::from_hex_be(wallet)
            .map_err(|_| AuthError::InvalidSignature)?;

        let msg_hash = FieldElement::from_hex_be(message_hash)
            .map_err(|_| AuthError::InvalidSignature)?;

        let r = FieldElement::from_hex_be(sig_r)
            .map_err(|_| AuthError::InvalidSignature)?;

        let s = FieldElement::from_hex_be(sig_s)
            .map_err(|_| AuthError::InvalidSignature)?;

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

    /// Compute the message hash for per-request wallet signature verification.
    /// The message is: keccak256(wallet_address || timestamp || request_path)
    /// Returns the hash as a hex string (without 0x prefix).
    pub fn compute_request_hash(wallet: &str, timestamp: &str, request_path: &str) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(wallet.as_bytes());
        hasher.update(b":");
        hasher.update(timestamp.as_bytes());
        hasher.update(b":");
        hasher.update(request_path.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Verify the X-Wallet-Address header is backed by a valid signature.
    ///
    /// Required headers:
    /// - X-Wallet-Address: Starknet address (0x...)
    /// - X-Signature-R: ECDSA signature r component (0x...)
    /// - X-Signature-S: ECDSA signature s component (0x...)
    /// - X-Signature-Timestamp: Unix timestamp when the signature was created
    ///
    /// The signed message is: SHA256(wallet:timestamp:request_path)
    /// The timestamp must be within MAX_SIGNATURE_AGE_SECS of the current time.
    pub fn verify_wallet_header(
        headers: &HeaderMap,
        request_path: &str,
    ) -> Result<String, AuthError> {
        let wallet = headers.get("X-Wallet-Address")
            .and_then(|v| v.to_str().ok())
            .filter(|v| !v.is_empty())
            .ok_or(AuthError::MissingAuth)?;

        let sig_r = headers.get("X-Signature-R")
            .and_then(|v| v.to_str().ok())
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                warn!(wallet = %wallet, "Missing X-Signature-R header");
                AuthError::InvalidSignature
            })?;

        let sig_s = headers.get("X-Signature-S")
            .and_then(|v| v.to_str().ok())
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                warn!(wallet = %wallet, "Missing X-Signature-S header");
                AuthError::InvalidSignature
            })?;

        let timestamp_str = headers.get("X-Signature-Timestamp")
            .and_then(|v| v.to_str().ok())
            .filter(|v| !v.is_empty())
            .ok_or_else(|| {
                warn!(wallet = %wallet, "Missing X-Signature-Timestamp header");
                AuthError::InvalidSignature
            })?;

        // Validate timestamp is within window
        let timestamp: i64 = timestamp_str.parse()
            .map_err(|_| AuthError::InvalidSignature)?;
        let now = Utc::now().timestamp();
        let age = (now - timestamp).abs();
        if age > MAX_SIGNATURE_AGE_SECS {
            warn!(
                wallet = %wallet,
                age_secs = age,
                max_secs = MAX_SIGNATURE_AGE_SECS,
                "Signature timestamp too old or too far in future"
            );
            return Err(AuthError::TokenExpired);
        }

        // Compute message hash and verify signature
        let message_hash = compute_request_hash(wallet, timestamp_str, request_path);

        // Prepend 0x for FieldElement parsing if the hash doesn't have it
        let hash_hex = if message_hash.starts_with("0x") {
            message_hash.clone()
        } else {
            format!("0x{}", message_hash)
        };

        match verify_signature(wallet, &hash_hex, sig_r, sig_s) {
            Ok(true) => {
                debug!(wallet = %wallet, "Wallet signature verified");
                Ok(wallet.to_string())
            }
            Ok(false) => {
                warn!(wallet = %wallet, "Wallet signature verification failed — invalid signature");
                Err(AuthError::InvalidSignature)
            }
            Err(e) => {
                warn!(wallet = %wallet, error = %e, "Wallet signature verification error");
                Err(e)
            }
        }
    }

    /// Check if wallet signature verification should be enforced.
    /// Returns true in production when wallet_auth is enabled.
    pub fn is_enforced() -> bool {
        let is_production = std::env::var("PRODUCTION").is_ok()
            || std::env::var("BITSAGE_PRODUCTION").is_ok();
        is_production && CONFIG.auth.wallet_auth_enabled
    }
}
