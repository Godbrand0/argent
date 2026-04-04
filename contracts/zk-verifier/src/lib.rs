#![no_std]

//! ZK Verifier contract — thin Groth16 wrapper over Soroban's BN254 host functions.
//!
//! Phase 3: wire real verification using `env.crypto().bn254_*` host functions
//! introduced in Stellar Protocol 21+.
//!
//! Proof encoding (all big-endian):
//!   proof_a: 64 bytes  (G1 point: x || y)
//!   proof_b: 128 bytes (G2 point: x_im || x_re || y_im || y_re)
//!   proof_c: 64 bytes  (G1 point: x || y)

use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, Env, Vec};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
}

#[contract]
pub struct ZkVerifierContract;

#[contractimpl]
impl ZkVerifierContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Verify a Groth16 proof over BN254.
    ///
    /// Arguments follow the Soroban BN254 host function signature:
    ///   - `vk`: serialized verification key
    ///   - `proof_a`, `proof_b`, `proof_c`: serialized proof points
    ///   - `public_inputs`: public witness values as i128 (scaled 1e7)
    ///
    /// Returns `true` if proof is valid.
    ///
    /// NOTE: Phase 3 stub — always panics when called from non-dev-mode vault.
    /// Real implementation will call `env.crypto().bn254_g1_msm()` etc.
    pub fn verify_groth16(
        _env: Env,
        _vk: Bytes,
        _proof_a: Bytes,
        _proof_b: Bytes,
        _proof_c: Bytes,
        _public_inputs: Vec<i128>,
    ) -> bool {
        // Phase 3: replace with actual BN254 host function calls:
        //
        //   let g1_points = env.crypto().bn254_g1_msm(...);
        //   let pairing_ok = env.crypto().bn254_pairing(...);
        //   pairing_ok
        //
        panic!("BN254 verification not yet implemented — enable dev_mode on vault");
    }
}
