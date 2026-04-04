use soroban_sdk::{Address, Env, Symbol};

use crate::types::{Auction, CollateralConfig, DataKey, Position};

// ---------------------------------------------------------------------------
// TTL constants (in ledgers, ~5s each)
// ---------------------------------------------------------------------------

/// 30 days — for persistent entries (positions, auctions, VKs)
pub const PERSISTENT_TTL: u32 = 518_400;
/// 5 minutes — for agent heartbeat
pub const HEARTBEAT_TTL: u32 = 60;
/// 7 days — for instance storage entries
pub const INSTANCE_TTL: u32 = 120_960;

pub const SCALE: i128 = 10_000_000; // 1e7

// ---------------------------------------------------------------------------
// Instance helpers
// ---------------------------------------------------------------------------

pub fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_usdc(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Usdc).unwrap()
}

pub fn set_usdc(env: &Env, usdc: &Address) {
    env.storage().instance().set(&DataKey::Usdc, usdc);
}

pub fn get_vusdc(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Vusdc).unwrap()
}

pub fn set_vusdc(env: &Env, vusdc: &Address) {
    env.storage().instance().set(&DataKey::Vusdc, vusdc);
}

pub fn get_hf_verifier(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::HfVerifier).unwrap()
}

pub fn set_hf_verifier(env: &Env, hf_verifier: &Address) {
    env.storage().instance().set(&DataKey::HfVerifier, hf_verifier);
}

pub fn get_total_deposits(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::TotalDeposits).unwrap_or(0)
}

pub fn set_total_deposits(env: &Env, v: i128) {
    env.storage().instance().set(&DataKey::TotalDeposits, &v);
}

pub fn get_total_borrows(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::TotalBorrows).unwrap_or(0)
}

pub fn set_total_borrows(env: &Env, v: i128) {
    env.storage().instance().set(&DataKey::TotalBorrows, &v);
}

pub fn get_deposit_index(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::DepositIndex).unwrap_or(SCALE)
}

pub fn set_deposit_index(env: &Env, v: i128) {
    env.storage().instance().set(&DataKey::DepositIndex, &v);
}

pub fn get_borrow_index(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::BorrowIndex).unwrap_or(SCALE)
}

pub fn set_borrow_index(env: &Env, v: i128) {
    env.storage().instance().set(&DataKey::BorrowIndex, &v);
}

pub fn get_last_accrual_ledger(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::LastAccrualLedger).unwrap_or(0)
}

pub fn set_last_accrual_ledger(env: &Env, v: u32) {
    env.storage().instance().set(&DataKey::LastAccrualLedger, &v);
}

pub fn get_reserve_fund(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::ReserveFund).unwrap_or(0)
}

pub fn set_reserve_fund(env: &Env, v: i128) {
    env.storage().instance().set(&DataKey::ReserveFund, &v);
}

pub fn is_circuit_breaker(env: &Env) -> bool {
    env.storage().instance().get(&DataKey::CircuitBreaker).unwrap_or(false)
}

pub fn set_circuit_breaker(env: &Env, v: bool) {
    env.storage().instance().set(&DataKey::CircuitBreaker, &v);
}

pub fn is_dev_mode(env: &Env) -> bool {
    env.storage().instance().get(&DataKey::DevMode).unwrap_or(false)
}

pub fn set_dev_mode(env: &Env, v: bool) {
    env.storage().instance().set(&DataKey::DevMode, &v);
}

pub fn get_position_count(env: &Env) -> u64 {
    env.storage().instance().get(&DataKey::PositionCount).unwrap_or(0)
}

pub fn set_position_count(env: &Env, v: u64) {
    env.storage().instance().set(&DataKey::PositionCount, &v);
}

pub fn get_auction_count(env: &Env) -> u64 {
    env.storage().instance().get(&DataKey::AuctionCount).unwrap_or(0)
}

pub fn set_auction_count(env: &Env, v: u64) {
    env.storage().instance().set(&DataKey::AuctionCount, &v);
}

pub fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
}

// ---------------------------------------------------------------------------
// Persistent helpers — positions
// ---------------------------------------------------------------------------

pub fn get_position(env: &Env, position_id: u64) -> Option<Position> {
    let key = DataKey::Position(position_id);
    let pos = env.storage().persistent().get(&key);
    if pos.is_some() {
        env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);
    }
    pos
}

pub fn set_position(env: &Env, position_id: u64, pos: &Position) {
    let key = DataKey::Position(position_id);
    env.storage().persistent().set(&key, pos);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);
}

// ---------------------------------------------------------------------------
// Persistent helpers — auctions
// ---------------------------------------------------------------------------

pub fn get_auction(env: &Env, auction_id: u64) -> Option<Auction> {
    let key = DataKey::Auction(auction_id);
    let a = env.storage().persistent().get(&key);
    if a.is_some() {
        env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);
    }
    a
}

pub fn set_auction(env: &Env, auction_id: u64, auction: &Auction) {
    let key = DataKey::Auction(auction_id);
    env.storage().persistent().set(&key, auction);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);
}

// ---------------------------------------------------------------------------
// Persistent helpers — collateral config
// ---------------------------------------------------------------------------

pub fn get_collateral_config(env: &Env, asset: &Symbol) -> Option<CollateralConfig> {
    env.storage().persistent().get(&DataKey::CollateralConfig(asset.clone()))
}

pub fn set_collateral_config(env: &Env, asset: &Symbol, cfg: &CollateralConfig) {
    let key = DataKey::CollateralConfig(asset.clone());
    env.storage().persistent().set(&key, cfg);
    env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);
}

// ---------------------------------------------------------------------------
// Temporary helpers — heartbeat
// ---------------------------------------------------------------------------

pub fn set_heartbeat(env: &Env, ledger: u32) {
    env.storage().temporary().set(&DataKey::AgentHeartbeat, &ledger);
    env.storage().temporary().extend_ttl(&DataKey::AgentHeartbeat, HEARTBEAT_TTL, HEARTBEAT_TTL);
}

pub fn get_heartbeat(env: &Env) -> u32 {
    env.storage().temporary().get(&DataKey::AgentHeartbeat).unwrap_or(0)
}
