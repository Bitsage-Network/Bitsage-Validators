//! Input Validation for Rental API
//!
//! Provides validation utilities for rental marketplace requests.
//! Prevents invalid data from reaching business logic.

use regex::Regex;
use std::sync::LazyLock;

/// Starknet address regex pattern (0x followed by 1-64 hex chars)
static STARKNET_ADDRESS_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^0x[a-fA-F0-9]{1,64}$").expect("Invalid regex pattern")
});

/// Template ID pattern (alphanumeric with hyphens and dots for versioning)
static TEMPLATE_ID_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-zA-Z0-9][a-zA-Z0-9\-\.]{0,63}$").expect("Invalid regex pattern")
});

/// GPU ID pattern (alphanumeric with hyphens and underscores)
static GPU_ID_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-zA-Z0-9][a-zA-Z0-9\-_]{0,127}$").expect("Invalid regex pattern")
});

/// SSH public key pattern (starts with ssh-rsa, ssh-ed25519, etc.)
static SSH_KEY_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^ssh-(rsa|ed25519|dss|ecdsa-sha2-nistp\d+)\s+[A-Za-z0-9+/=]+").expect("Invalid regex pattern")
});

/// Validation errors
#[derive(Debug, Clone)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.field, self.message)
    }
}

impl std::error::Error for ValidationError {}

/// Validation result
pub type ValidationResult<T> = Result<T, Vec<ValidationError>>;

/// Validator builder for collecting multiple validation errors
pub struct Validator {
    errors: Vec<ValidationError>,
}

impl Validator {
    /// Create a new validator
    pub fn new() -> Self {
        Self { errors: Vec::new() }
    }

    /// Add an error if condition is false
    pub fn require(&mut self, condition: bool, field: &str, message: &str) -> &mut Self {
        if !condition {
            self.errors.push(ValidationError {
                field: field.to_string(),
                message: message.to_string(),
            });
        }
        self
    }

    /// Validate that a string is not empty
    pub fn not_empty(&mut self, value: &str, field: &str) -> &mut Self {
        self.require(!value.trim().is_empty(), field, "cannot be empty")
    }

    /// Validate string length bounds
    pub fn length(&mut self, value: &str, min: usize, max: usize, field: &str) -> &mut Self {
        let len = value.len();
        self.require(
            len >= min && len <= max,
            field,
            &format!("length must be between {} and {} characters", min, max),
        )
    }

    /// Validate a Starknet wallet address
    pub fn starknet_address(&mut self, address: &str, field: &str) -> &mut Self {
        self.require(
            STARKNET_ADDRESS_REGEX.is_match(address),
            field,
            "must be a valid Starknet address (0x followed by hex)",
        )
    }

    /// Validate a template ID
    pub fn template_id(&mut self, id: &str, field: &str) -> &mut Self {
        self.require(
            TEMPLATE_ID_REGEX.is_match(id),
            field,
            "must be alphanumeric with optional hyphens, max 64 chars",
        )
    }

    /// Validate a GPU ID
    pub fn gpu_id(&mut self, id: &str, field: &str) -> &mut Self {
        self.require(
            GPU_ID_REGEX.is_match(id),
            field,
            "must be alphanumeric with optional hyphens/underscores, max 128 chars",
        )
    }

    /// Validate an SSH public key (optional)
    pub fn ssh_key(&mut self, key: Option<&str>, field: &str) -> &mut Self {
        if let Some(k) = key {
            if !k.is_empty() {
                self.require(
                    SSH_KEY_REGEX.is_match(k),
                    field,
                    "must be a valid SSH public key (ssh-rsa, ssh-ed25519, etc.)",
                );
            }
        }
        self
    }

    /// Validate a positive integer
    pub fn positive(&mut self, value: u64, field: &str) -> &mut Self {
        self.require(value > 0, field, "must be greater than 0")
    }

    /// Validate a range
    pub fn range(&mut self, value: u64, min: u64, max: u64, field: &str) -> &mut Self {
        self.require(
            value >= min && value <= max,
            field,
            &format!("must be between {} and {}", min, max),
        )
    }

    /// Finish validation and return result
    pub fn finish<T>(self, value: T) -> ValidationResult<T> {
        if self.errors.is_empty() {
            Ok(value)
        } else {
            Err(self.errors)
        }
    }

    /// Check if there are any errors
    pub fn has_errors(&self) -> bool {
        !self.errors.is_empty()
    }

    /// Get errors as formatted string
    pub fn error_string(&self) -> String {
        self.errors
            .iter()
            .map(|e| e.to_string())
            .collect::<Vec<_>>()
            .join("; ")
    }
}

impl Default for Validator {
    fn default() -> Self {
        Self::new()
    }
}

/// Validate StartRentalRequest
pub fn validate_start_rental(
    tenant_wallet: &str,
    template_id: &str,
    gpu_id: &str,
    duration_hours: u64,
    ssh_public_key: Option<&str>,
) -> Result<(), String> {
    let mut v = Validator::new();

    v.starknet_address(tenant_wallet, "tenant_wallet")
        .template_id(template_id, "template_id")
        .gpu_id(gpu_id, "gpu_id")
        .range(duration_hours, 1, 720, "duration_hours") // Max 30 days
        .ssh_key(ssh_public_key, "ssh_public_key");

    if v.has_errors() {
        Err(v.error_string())
    } else {
        Ok(())
    }
}

/// Validate RegisterGpu request
pub fn validate_register_gpu(
    gpu_id: &str,
    validator_wallet: &str,
    rate_sage_per_hour: u64,
    vram_gb: u32,
) -> Result<(), String> {
    let mut v = Validator::new();

    v.gpu_id(gpu_id, "gpu_id")
        .starknet_address(validator_wallet, "validator_wallet")
        .positive(rate_sage_per_hour, "rate_sage_per_hour")
        .range(vram_gb as u64, 4, 256, "vram_gb"); // 4GB to 256GB reasonable range

    if v.has_errors() {
        Err(v.error_string())
    } else {
        Ok(())
    }
}

/// Validate ExtendRental request
pub fn validate_extend_rental(additional_hours: u64) -> Result<(), String> {
    let mut v = Validator::new();

    v.range(additional_hours, 1, 168, "additional_hours"); // Max 1 week extension

    if v.has_errors() {
        Err(v.error_string())
    } else {
        Ok(())
    }
}

/// Validate deposit amount
pub fn validate_deposit(amount: u64) -> Result<(), String> {
    let mut v = Validator::new();

    v.positive(amount, "amount")
        .range(amount, 1, 1_000_000_000, "amount"); // Max 1B SAGE

    if v.has_errors() {
        Err(v.error_string())
    } else {
        Ok(())
    }
}

/// Validate a wallet address standalone
pub fn validate_wallet_address(address: &str) -> Result<(), String> {
    let mut v = Validator::new();
    v.starknet_address(address, "wallet");

    if v.has_errors() {
        Err(v.error_string())
    } else {
        Ok(())
    }
}

/// Validate withdrawal request
pub fn validate_withdrawal(wallet: &str, amount: u64) -> Result<(), String> {
    let mut v = Validator::new();

    v.starknet_address(wallet, "wallet")
        .positive(amount, "amount")
        .range(amount, 1, 1_000_000_000, "amount"); // Max 1B SAGE

    if v.has_errors() {
        Err(v.error_string())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_starknet_address_valid() {
        assert!(STARKNET_ADDRESS_REGEX.is_match("0x1234abcd"));
        assert!(STARKNET_ADDRESS_REGEX.is_match("0xABCDEF123456789"));
        assert!(STARKNET_ADDRESS_REGEX.is_match("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"));
    }

    #[test]
    fn test_starknet_address_invalid() {
        assert!(!STARKNET_ADDRESS_REGEX.is_match("1234abcd")); // Missing 0x
        assert!(!STARKNET_ADDRESS_REGEX.is_match("0x")); // Too short
        assert!(!STARKNET_ADDRESS_REGEX.is_match("0xGHIJKL")); // Invalid hex
    }

    #[test]
    fn test_template_id_valid() {
        assert!(TEMPLATE_ID_REGEX.is_match("llama-3.2-dev"));
        assert!(TEMPLATE_ID_REGEX.is_match("comfyui-studio"));
        assert!(TEMPLATE_ID_REGEX.is_match("stwo-prover"));
    }

    #[test]
    fn test_validate_start_rental() {
        // Valid request
        let result = validate_start_rental(
            "0x1234abcd",
            "llama-dev",
            "gpu-001",
            24,
            Some("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5"),
        );
        assert!(result.is_ok());

        // Invalid wallet
        let result = validate_start_rental(
            "invalid-wallet",
            "llama-dev",
            "gpu-001",
            24,
            None,
        );
        assert!(result.is_err());

        // Invalid duration
        let result = validate_start_rental(
            "0x1234abcd",
            "llama-dev",
            "gpu-001",
            1000, // Too long
            None,
        );
        assert!(result.is_err());
    }
}
