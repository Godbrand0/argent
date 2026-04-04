use soroban_sdk::Env;

use crate::storage::{
    get_borrow_index, get_deposit_index, get_last_accrual_ledger, get_reserve_fund,
    get_total_borrows, get_total_deposits, set_borrow_index, set_deposit_index,
    set_last_accrual_ledger, set_reserve_fund, SCALE,
};

// ---------------------------------------------------------------------------
// Interest rate model constants
// ---------------------------------------------------------------------------

/// 80% optimal utilization (scaled 1e7)
const OPTIMAL_UTIL: i128 = 8_000_000;
/// 8% annual rate at optimal utilization (scaled 1e7)
const SLOPE1: i128 = 800_000;
/// 40% additional annual rate above optimal (scaled 1e7)
const SLOPE2: i128 = 4_000_000;
/// ~6,307,200 ledgers per year at 5s each
const LEDGERS_PER_YEAR: i128 = 6_307_200;
/// 10% reserve cut from interest earned
const RESERVE_CUT_BPS: i128 = 1_000; // out of 10_000

// ---------------------------------------------------------------------------
// Rate computation
// ---------------------------------------------------------------------------

/// Returns annual borrow rate scaled to 1e7.
pub fn compute_borrow_rate(util: i128) -> i128 {
    if util <= OPTIMAL_UTIL {
        // linear ramp from 0 to SLOPE1
        util * SLOPE1 / OPTIMAL_UTIL
    } else {
        let excess = (util - OPTIMAL_UTIL) * SCALE / (SCALE - OPTIMAL_UTIL);
        SLOPE1 + excess * SLOPE2 / SCALE
    }
}

/// Returns utilization ratio scaled to 1e7.
pub fn compute_utilization(total_deposits: i128, total_borrows: i128) -> i128 {
    if total_deposits == 0 {
        return 0;
    }
    total_borrows * SCALE / total_deposits
}

// ---------------------------------------------------------------------------
// Interest accrual
// ---------------------------------------------------------------------------

/// Accrues interest up to the current ledger. Must be called at the start of
/// every state-changing operation.
pub fn accrue_interest(env: &Env) {
    let current = env.ledger().sequence();
    let last = get_last_accrual_ledger(env);
    let delta = current.saturating_sub(last) as i128;

    if delta == 0 {
        return;
    }

    let total_deposits = get_total_deposits(env);
    let total_borrows = get_total_borrows(env);

    if total_borrows == 0 || total_deposits == 0 {
        set_last_accrual_ledger(env, current);
        return;
    }

    let util = compute_utilization(total_deposits, total_borrows);
    let annual_rate = compute_borrow_rate(util);
    // per-ledger rate (linear approximation)
    let rate_per_ledger = annual_rate / LEDGERS_PER_YEAR;

    let borrow_index = get_borrow_index(env);
    // new_borrow_index = borrow_index * (1 + rate_per_ledger * delta)
    let new_borrow_index = borrow_index + borrow_index * rate_per_ledger * delta / SCALE;

    let interest_earned = total_borrows * (new_borrow_index - borrow_index) / SCALE;
    let reserve_cut = interest_earned * RESERVE_CUT_BPS / 10_000;
    let lender_interest = interest_earned - reserve_cut;

    // Update deposit index: spread lender_interest across all deposits
    let deposit_index = get_deposit_index(env);
    let new_deposit_index = deposit_index + lender_interest * SCALE / total_deposits;

    let reserve_fund = get_reserve_fund(env);

    set_borrow_index(env, new_borrow_index);
    set_deposit_index(env, new_deposit_index);
    set_reserve_fund(env, reserve_fund + reserve_cut);
    set_last_accrual_ledger(env, current);
}
