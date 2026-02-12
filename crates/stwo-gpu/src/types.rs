//! STWO GPU Prover Types

use serde::{Deserialize, Serialize};

/// Circuit definition
#[derive(Debug, Clone)]
pub struct Circuit {
    /// Log2 of trace length
    pub log_size: u32,
    /// Number of trace columns
    pub num_columns: usize,
    /// Circuit identifier
    pub id: u32,
}

/// Witness data
#[derive(Debug, Clone)]
pub struct Witness {
    pub public_inputs: Vec<u64>,
    pub private_inputs: Vec<u64>,
}

/// Execution trace
#[derive(Debug, Clone)]
pub struct Trace {
    pub columns: Vec<Vec<u64>>,
}

/// Low-degree extension of trace
#[derive(Debug, Clone)]
pub struct TraceLDE {
    pub columns: Vec<Vec<u64>>,
    pub log_blowup: u32,
}

/// Merkle tree commitment
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Commitment {
    pub root: [u8; 32],
}

/// FRI proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FriProof {
    /// Commitments for each FRI layer
    pub layer_commitments: Vec<[u8; 32]>,
    /// Final polynomial coefficients
    pub final_poly: Vec<u64>,
    /// Query responses for each layer
    pub query_responses: Vec<LayerQueryResponse>,
}

/// Query response for a FRI layer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerQueryResponse {
    pub index: usize,
    pub sibling: u64,
    pub merkle_path: Vec<[u8; 32]>,
}

/// Query response for a single index
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResponse {
    pub index: usize,
    pub values: Vec<u64>,
    pub merkle_path: Vec<[u8; 32]>,
}

/// Complete proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proof {
    pub commitment: Commitment,
    pub fri: FriProof,
    pub queries: Vec<QueryResponse>,
    pub public_inputs: Vec<u64>,
    pub generation_time_ms: u64,
}

/// Proof generation progress
#[derive(Debug, Clone, Copy)]
pub struct ProofProgress {
    pub phase: ProofPhase,
    pub progress: u8, // 0-100
}

/// Proof generation phase
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProofPhase {
    Witness,
    Commit,
    Fri,
    Query,
    Done,
}

/// Circle STARK field element (Mersenne31)
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct M31(pub u32);

impl M31 {
    pub const P: u32 = (1 << 31) - 1;

    pub fn new(val: u32) -> Self {
        Self(val % Self::P)
    }

    pub fn add(self, other: Self) -> Self {
        let sum = self.0 as u64 + other.0 as u64;
        Self((sum % Self::P as u64) as u32)
    }

    pub fn sub(self, other: Self) -> Self {
        let diff = (self.0 as i64 - other.0 as i64).rem_euclid(Self::P as i64);
        Self(diff as u32)
    }

    pub fn mul(self, other: Self) -> Self {
        let prod = self.0 as u64 * other.0 as u64;
        Self((prod % Self::P as u64) as u32)
    }

    pub fn inv(self) -> Self {
        // Fermat's little theorem: a^(-1) = a^(p-2) mod p
        self.pow(Self::P - 2)
    }

    pub fn pow(self, exp: u32) -> Self {
        let mut result = Self(1);
        let mut base = self;
        let mut e = exp;

        while e > 0 {
            if e & 1 == 1 {
                result = result.mul(base);
            }
            base = base.mul(base);
            e >>= 1;
        }

        result
    }
}

/// Extension field element (CM31 = M31^2)
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CM31 {
    pub a: M31,
    pub b: M31,
}

impl CM31 {
    pub fn new(a: M31, b: M31) -> Self {
        Self { a, b }
    }

    pub fn add(self, other: Self) -> Self {
        Self {
            a: self.a.add(other.a),
            b: self.b.add(other.b),
        }
    }

    pub fn mul(self, other: Self) -> Self {
        // (a + bi)(c + di) = (ac - bd) + (ad + bc)i
        // where i^2 = 2 + i in CM31
        let ac = self.a.mul(other.a);
        let bd = self.b.mul(other.b);
        let ad = self.a.mul(other.b);
        let bc = self.b.mul(other.a);

        Self {
            a: ac.sub(bd).add(bd.mul(M31(2))), // ac + bd(2-1) = ac + bd
            b: ad.add(bc).add(bd),              // ad + bc + bd
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_m31_arithmetic() {
        let a = M31::new(100);
        let b = M31::new(200);

        let sum = a.add(b);
        assert_eq!(sum.0, 300);

        let diff = b.sub(a);
        assert_eq!(diff.0, 100);

        let prod = a.mul(b);
        assert_eq!(prod.0, 20000);
    }

    #[test]
    fn test_m31_inverse() {
        let a = M31::new(12345);
        let a_inv = a.inv();
        let prod = a.mul(a_inv);
        assert_eq!(prod.0, 1);
    }
}
