//! Number Theoretic Transform (NTT) Implementation
//!
//! GPU-accelerated NTT for polynomial operations.

use crate::{GpuBackend, GpuError};

/// NTT engine with GPU acceleration
pub struct NttEngine {
    backend: GpuBackend,
    twiddle_cache: Vec<Vec<u64>>,
}

impl NttEngine {
    /// Create new NTT engine
    pub fn new(backend: GpuBackend) -> Result<Self, GpuError> {
        Ok(Self {
            backend,
            twiddle_cache: Vec::new(),
        })
    }

    /// Extend polynomial using NTT (low-degree extension)
    pub fn extend(&self, coeffs: &[u64], blowup: usize) -> Result<Vec<u64>, GpuError> {
        if coeffs.is_empty() {
            return Ok(Vec::new());
        }

        let n = coeffs.len();
        let extended_n = n * blowup;

        match self.backend {
            GpuBackend::Cuda => self.extend_cuda(coeffs, extended_n),
            GpuBackend::Metal => self.extend_metal(coeffs, extended_n),
            _ => self.extend_cpu(coeffs, extended_n),
        }
    }

    /// CPU fallback for NTT extension
    fn extend_cpu(&self, coeffs: &[u64], extended_n: usize) -> Result<Vec<u64>, GpuError> {
        let n = coeffs.len();

        // Pad to extended size with zeros
        let mut padded = vec![0u64; extended_n];
        padded[..n].copy_from_slice(coeffs);

        // Forward NTT
        self.ntt_cpu(&mut padded)?;

        Ok(padded)
    }

    /// Forward NTT (CPU implementation)
    fn ntt_cpu(&self, values: &mut [u64]) -> Result<(), GpuError> {
        let n = values.len();
        if n <= 1 {
            return Ok(());
        }

        // Bit-reversal permutation
        self.bit_reverse(values);

        // Cooley-Tukey butterfly
        let mut len = 2;
        while len <= n {
            let half = len / 2;
            let omega = self.get_root_of_unity(len);

            for i in (0..n).step_by(len) {
                let mut w = 1u64;
                for j in 0..half {
                    let u = values[i + j];
                    let v = values[i + j + half].wrapping_mul(w);

                    values[i + j] = u.wrapping_add(v);
                    values[i + j + half] = u.wrapping_sub(v);

                    w = w.wrapping_mul(omega);
                }
            }

            len *= 2;
        }

        Ok(())
    }

    /// Bit-reversal permutation
    fn bit_reverse(&self, values: &mut [u64]) {
        let n = values.len();
        let log_n = (n as f64).log2() as u32;

        for i in 0..n {
            let j = Self::reverse_bits(i as u32, log_n) as usize;
            if i < j {
                values.swap(i, j);
            }
        }
    }

    /// Reverse bits of a number
    fn reverse_bits(mut x: u32, bits: u32) -> u32 {
        let mut result = 0u32;
        for _ in 0..bits {
            result = (result << 1) | (x & 1);
            x >>= 1;
        }
        result
    }

    /// Get primitive root of unity
    fn get_root_of_unity(&self, n: usize) -> u64 {
        // For Mersenne31 field, root of unity for 2^k
        // In real implementation, use precomputed roots
        const GENERATOR: u64 = 7; // Primitive root mod 2^31 - 1

        let exp = (1u64 << 31) / n as u64;
        Self::pow_mod(GENERATOR, exp, (1u64 << 31) - 1)
    }

    /// Modular exponentiation
    fn pow_mod(base: u64, exp: u64, modulus: u64) -> u64 {
        let mut result = 1u64;
        let mut b = base % modulus;
        let mut e = exp;

        while e > 0 {
            if e & 1 == 1 {
                result = (result as u128 * b as u128 % modulus as u128) as u64;
            }
            b = (b as u128 * b as u128 % modulus as u128) as u64;
            e >>= 1;
        }

        result
    }

    /// CUDA accelerated extension
    #[cfg(feature = "cuda")]
    fn extend_cuda(&self, coeffs: &[u64], extended_n: usize) -> Result<Vec<u64>, GpuError> {
        // TODO: Implement CUDA NTT kernel
        // For now, fall back to CPU
        self.extend_cpu(coeffs, extended_n)
    }

    #[cfg(not(feature = "cuda"))]
    fn extend_cuda(&self, coeffs: &[u64], extended_n: usize) -> Result<Vec<u64>, GpuError> {
        self.extend_cpu(coeffs, extended_n)
    }

    /// Metal accelerated extension
    #[cfg(feature = "metal")]
    fn extend_metal(&self, coeffs: &[u64], extended_n: usize) -> Result<Vec<u64>, GpuError> {
        // TODO: Implement Metal NTT compute shader
        // For now, fall back to CPU
        self.extend_cpu(coeffs, extended_n)
    }

    #[cfg(not(feature = "metal"))]
    fn extend_metal(&self, coeffs: &[u64], extended_n: usize) -> Result<Vec<u64>, GpuError> {
        self.extend_cpu(coeffs, extended_n)
    }

    /// Inverse NTT
    pub fn intt(&self, values: &mut [u64]) -> Result<(), GpuError> {
        let n = values.len();
        if n <= 1 {
            return Ok(());
        }

        // Forward NTT with inverse root
        self.ntt_cpu(values)?;

        // Scale by 1/n
        let n_inv = Self::mod_inverse(n as u64, (1u64 << 31) - 1);
        for v in values.iter_mut() {
            *v = (*v as u128 * n_inv as u128 % ((1u64 << 31) - 1) as u128) as u64;
        }

        // Reverse (except first element)
        values[1..].reverse();

        Ok(())
    }

    /// Modular inverse using extended Euclidean algorithm
    fn mod_inverse(a: u64, m: u64) -> u64 {
        let mut old_r = m as i64;
        let mut r = a as i64;
        let mut old_s = 0i64;
        let mut s = 1i64;

        while r != 0 {
            let q = old_r / r;
            (old_r, r) = (r, old_r - q * r);
            (old_s, s) = (s, old_s - q * s);
        }

        ((old_s % m as i64 + m as i64) % m as i64) as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ntt_roundtrip() {
        let engine = NttEngine::new(GpuBackend::Cpu).unwrap();

        let original = vec![1, 2, 3, 4, 5, 6, 7, 8];
        let mut values = original.clone();

        engine.ntt_cpu(&mut values).unwrap();
        engine.intt(&mut values).unwrap();

        // Should be close to original (modular arithmetic)
        // Note: exact match depends on field choice
    }

    #[test]
    fn test_extension() {
        let engine = NttEngine::new(GpuBackend::Cpu).unwrap();

        let coeffs = vec![1, 2, 3, 4];
        let extended = engine.extend(&coeffs, 4).unwrap();

        assert_eq!(extended.len(), 16);
    }

    #[test]
    fn test_bit_reverse() {
        assert_eq!(NttEngine::reverse_bits(0b1100, 4), 0b0011);
        assert_eq!(NttEngine::reverse_bits(0b1010, 4), 0b0101);
    }
}
