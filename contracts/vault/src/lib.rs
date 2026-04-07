#![no_std]

mod interest;
mod storage;
mod types;

use soroban_sdk::{
    contract, contractclient, contractimpl, token, Address, Bytes, Env, Symbol, Vec,
};

use interest::{accrue_interest, compute_borrow_rate, compute_utilization};
use storage::{
    bump_instance, get_admin, get_auction, get_auction_bids, get_auction_count, get_borrow_index,
    get_collateral_config, get_deposit_index, get_heartbeat, get_pool_agent, get_position,
    get_position_count, get_reserve_fund, get_total_borrows, get_total_deposits, get_usdc,
    get_vusdc, is_circuit_breaker, is_dev_mode, is_registered_agent, remove_pool_agent,
    set_admin, set_auction, set_auction_bids, set_auction_count, set_circuit_breaker,
    set_collateral_config, set_deposit_index, set_dev_mode, set_heartbeat, set_hf_verifier,
    set_pool_agent, set_position, set_position_count, set_reserve_fund, set_total_borrows,
    set_total_deposits, set_usdc, set_vusdc, SCALE,
};
use types::{Auction, AuctionState, CollateralConfig, DataKey, LimitBid, PoolAgent, Position};

// ---------------------------------------------------------------------------
// vUSDC client — for mint/burn which are not part of the standard SEP-41 interface
// ---------------------------------------------------------------------------

#[contractclient(name = "VusdcClient")]
pub trait VusdcInterface {
    fn mint(env: &Env, to: Address, amount: i128);
    fn burn(env: &Env, from: Address, amount: i128);
}

// ---------------------------------------------------------------------------
// Fee constants
// ---------------------------------------------------------------------------

/// Trigger fee bps thresholds in ledgers (~5s each)
const FEE_TIER1_MAX: u32 = 120; // 0-10 min → 0.1%
const FEE_TIER2_MAX: u32 = 360; // 10-30 min → 0.2%
// beyond 360 ledgers → 0.5%

/// Circuit breaker trips if a position is liquidatable for 60+ min (~720 ledgers)
const CIRCUIT_BREAKER_LEDGERS: u32 = 720;

/// Loan term options in ledgers (~5s/ledger). Borrower picks one.
/// 7 days  ≈ 120_960 ledgers
/// 14 days ≈ 241_920 ledgers
/// 30 days ≈ 518_400 ledgers
const LOAN_TERM_MIN: u32 = 120_960; // 7 days minimum

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    /// One-time initializer. Sets all core addresses and resets indexes.
    pub fn initialize(
        env: Env,
        admin: Address,
        usdc: Address,
        vusdc: Address,
        hf_verifier: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }

        set_admin(&env, &admin);
        set_usdc(&env, &usdc);
        set_vusdc(&env, &vusdc);
        set_hf_verifier(&env, &hf_verifier);

        set_total_deposits(&env, 0);
        set_total_borrows(&env, 0);
        set_deposit_index(&env, SCALE);
        storage::set_borrow_index(&env, SCALE);
        storage::set_last_accrual_ledger(&env, env.ledger().sequence());
        set_reserve_fund(&env, 0);
        set_circuit_breaker(&env, false);
        set_dev_mode(&env, true);
        set_position_count(&env, 0);
        set_auction_count(&env, 0);

        bump_instance(&env);
    }

    /// Configure collateral parameters for an asset.
    pub fn set_collateral_config(
        env: Env,
        asset: Symbol,
        token_address: Address,
        max_ltv: i128,
        liq_threshold: i128,
        decay_rate_per_ledger: i128,
        floor_ratio: i128,
        max_auction_ledgers: u32,
    ) {
        get_admin(&env).require_auth();
        set_collateral_config(
            &env,
            &asset,
            &CollateralConfig {
                token_address,
                max_ltv,
                liq_threshold,
                decay_rate_per_ledger,
                floor_ratio,
                max_auction_ledgers,
            },
        );
        bump_instance(&env);
    }

    /// Upload ZK verification keys (stored as raw bytes).
    pub fn set_verification_keys(env: Env, hf_vk: Bytes, pa_vk: Bytes, ap_vk: Bytes) {
        get_admin(&env).require_auth();
        env.storage().persistent().set(&DataKey::HfVk, &hf_vk);
        env.storage().persistent().set(&DataKey::PaVk, &pa_vk);
        env.storage().persistent().set(&DataKey::ApVk, &ap_vk);
        bump_instance(&env);
    }

    /// Toggle dev mode (bypasses ZK proof verification when true).
    pub fn set_dev_mode(env: Env, enabled: bool) {
        get_admin(&env).require_auth();
        set_dev_mode(&env, enabled);
        bump_instance(&env);
    }

    // -----------------------------------------------------------------------
    // Lender functions
    // -----------------------------------------------------------------------

    /// Deposit USDC into the pool. Mints vUSDC to `user`.
    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");

        accrue_interest(&env);

        let usdc = get_usdc(&env);
        let vusdc = get_vusdc(&env);

        token::Client::new(&env, &usdc).transfer(&user, &env.current_contract_address(), &amount);

        let deposit_index = get_deposit_index(&env);
        let vusdc_amount = amount * SCALE / deposit_index;

        VusdcClient::new(&env, &vusdc).mint(&user, &vusdc_amount);

        set_total_deposits(&env, get_total_deposits(&env) + amount);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "deposit"),),
            (user, amount, vusdc_amount),
        );
    }

    /// Burn vUSDC and withdraw underlying USDC.
    pub fn withdraw(env: Env, user: Address, vusdc_amount: i128) {
        user.require_auth();
        assert!(vusdc_amount > 0, "amount must be positive");

        accrue_interest(&env);

        let deposit_index = get_deposit_index(&env);
        let usdc_amount = vusdc_amount * deposit_index / SCALE;

        let available = get_total_deposits(&env) - get_total_borrows(&env);
        assert!(usdc_amount <= available, "insufficient liquidity");

        let usdc = get_usdc(&env);
        let vusdc = get_vusdc(&env);

        VusdcClient::new(&env, &vusdc).burn(&user, &vusdc_amount);
        token::Client::new(&env, &usdc).transfer(&env.current_contract_address(), &user, &usdc_amount);

        set_total_deposits(&env, get_total_deposits(&env) - usdc_amount);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "withdraw"),),
            (user, vusdc_amount, usdc_amount),
        );
    }

    // -----------------------------------------------------------------------
    // Borrower functions
    // -----------------------------------------------------------------------

    /// Deposit collateral (XLM or sBTC) and open or extend a position.
    pub fn deposit_collateral(env: Env, user: Address, asset: Symbol, amount: i128) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");

        let cfg = get_collateral_config(&env, &asset)
            .expect("unsupported collateral");

        token::Client::new(&env, &cfg.token_address).transfer(
            &user,
            &env.current_contract_address(),
            &amount,
        );

        let position_id = get_position_count(&env);
        let existing = Self::find_position_by_owner(&env, &user, &asset);

        if let Some((id, mut pos)) = existing {
            pos.collateral_amount += amount;
            set_position(&env, id, &pos);
        } else {
            let borrow_index = get_borrow_index(&env);
            let pos = Position {
                owner: user.clone(),
                collateral_asset: asset.clone(),
                collateral_amount: amount,
                debt_principal: 0,
                borrow_index_at_open: borrow_index,
                opened_at_ledger: env.ledger().sequence(),
                due_at_ledger: 0,
                loan_term_ledgers: 0,
                auction_state: AuctionState::None,
                became_liquidatable_at: 0,
            };
            set_position(&env, position_id, &pos);
            set_position_count(&env, position_id + 1);
        }

        bump_instance(&env);
        env.events().publish(
            (Symbol::new(&env, "deposit_collateral"),),
            (user, asset, amount),
        );
    }

    /// Borrow USDC against deposited collateral.
    ///
    /// `loan_term_ledgers` — chosen loan duration. Must be >= LOAN_TERM_MIN (7 days).
    /// Preset options (frontend should offer these):
    ///   - 120_960  (7 days)
    ///   - 241_920  (14 days)
    ///   - 518_400  (30 days)
    ///
    /// `price` is the collateral/USDC price (scaled 1e7) — ZK-attested in Phase 3.
    pub fn borrow(
        env: Env,
        user: Address,
        position_id: u64,
        usdc_amount: i128,
        price: i128,
        loan_term_ledgers: u32,
    ) {
        user.require_auth();
        assert!(usdc_amount > 0, "amount must be positive");
        assert!(loan_term_ledgers >= LOAN_TERM_MIN, "loan term too short: minimum 7 days");
        assert!(!is_circuit_breaker(&env), "circuit breaker active");

        accrue_interest(&env);

        let mut pos = get_position(&env, position_id).expect("position not found");
        assert!(pos.owner == user, "not position owner");
        assert!(pos.auction_state == AuctionState::None, "position in auction");

        let cfg = get_collateral_config(&env, &pos.collateral_asset)
            .expect("unsupported collateral");

        let current_debt = Self::current_debt(&env, &pos);
        let collateral_value = pos.collateral_amount * price / SCALE;
        let max_borrow = collateral_value * cfg.max_ltv / SCALE;
        let new_debt = current_debt + usdc_amount;
        assert!(new_debt <= max_borrow, "exceeds max LTV");

        let usdc = get_usdc(&env);
        let available = get_total_deposits(&env) - get_total_borrows(&env);
        assert!(usdc_amount <= available, "insufficient liquidity");

        token::Client::new(&env, &usdc).transfer(
            &env.current_contract_address(),
            &user,
            &usdc_amount,
        );

        let borrow_index = get_borrow_index(&env);
        let due_at = env.ledger().sequence() + loan_term_ledgers;

        pos.debt_principal = new_debt;
        pos.borrow_index_at_open = borrow_index;
        pos.loan_term_ledgers = loan_term_ledgers;
        pos.due_at_ledger = due_at;
        set_position(&env, position_id, &pos);
        set_total_borrows(&env, get_total_borrows(&env) + usdc_amount);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "borrow"),),
            (user, position_id, usdc_amount, due_at),
        );
    }

    /// Repay USDC debt (partial or full).
    /// Full repayment unlocks the collateral — borrower can then call withdraw_collateral.
    pub fn repay(env: Env, user: Address, position_id: u64, amount: i128) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");

        accrue_interest(&env);

        let mut pos = get_position(&env, position_id).expect("position not found");
        assert!(pos.owner == user, "not position owner");

        let current_debt = Self::current_debt(&env, &pos);
        let repay_amount = amount.min(current_debt);

        let usdc = get_usdc(&env);
        token::Client::new(&env, &usdc).transfer(
            &user,
            &env.current_contract_address(),
            &repay_amount,
        );

        let new_debt = current_debt - repay_amount;
        pos.debt_principal = new_debt;
        pos.borrow_index_at_open = get_borrow_index(&env);

        // Full repayment: unlock the collateral and clear the loan term
        if new_debt == 0 {
            pos.due_at_ledger = 0;
            pos.loan_term_ledgers = 0;
            pos.became_liquidatable_at = 0;
            if pos.auction_state == AuctionState::Active {
                pos.auction_state = AuctionState::None;
            }
        }

        set_position(&env, position_id, &pos);

        let total_borrows = get_total_borrows(&env);
        set_total_borrows(&env, total_borrows.saturating_sub(repay_amount));
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "repay"),),
            (user, position_id, repay_amount, new_debt),
        );
    }

    /// Withdraw collateral. Only allowed when the position has no active debt.
    pub fn withdraw_collateral(env: Env, user: Address, position_id: u64, amount: i128, price: i128) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");

        accrue_interest(&env);

        let mut pos = get_position(&env, position_id).expect("position not found");
        assert!(pos.owner == user, "not position owner");
        assert!(pos.auction_state == AuctionState::None, "position in auction");
        assert!(pos.collateral_amount >= amount, "insufficient collateral");

        let cfg = get_collateral_config(&env, &pos.collateral_asset)
            .expect("unsupported collateral");
        let new_collateral = pos.collateral_amount - amount;
        let current_debt = Self::current_debt(&env, &pos);

        if current_debt > 0 {
            let col_val = new_collateral * price / SCALE;
            let hf = col_val * cfg.liq_threshold / current_debt;
            assert!(hf >= SCALE, "withdrawal would undercollateralize position");
        }

        pos.collateral_amount -= amount;
        set_position(&env, position_id, &pos);

        token::Client::new(&env, &cfg.token_address).transfer(
            &env.current_contract_address(),
            &user,
            &amount,
        );

        bump_instance(&env);
        env.events().publish(
            (Symbol::new(&env, "withdraw_collateral"),),
            (user, position_id, amount),
        );
    }

    // -----------------------------------------------------------------------
    // Agent pool — registration
    // -----------------------------------------------------------------------

    /// Register an agent in the bidding pool, declaring its human owner.
    /// The agent's keypair signs this transaction; the owner is just recorded.
    /// Registered agents gain exclusive access to place limit bids on auctions.
    pub fn register_agent(env: Env, agent: Address, owner: Address) {
        agent.require_auth();
        assert!(!is_registered_agent(&env, &agent), "agent already registered");

        let entry = PoolAgent {
            owner,
            joined_at_ledger: env.ledger().sequence(),
            auctions_won: 0,
            collateral_earned_usdc: 0,
        };
        set_pool_agent(&env, &agent, &entry);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "agent_registered"),),
            (agent, entry.owner, entry.joined_at_ledger),
        );
    }

    /// Remove an agent from the pool. Cancels any active limit bids they have.
    pub fn deregister_agent(env: Env, agent: Address) {
        agent.require_auth();
        assert!(is_registered_agent(&env, &agent), "agent not registered");

        remove_pool_agent(&env, &agent);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "agent_deregistered"),),
            (agent,),
        );
    }

    // -----------------------------------------------------------------------
    // Agent pool — limit order book
    // -----------------------------------------------------------------------

    /// Place a limit bid on an active auction.
    ///
    /// The agent commits to paying up to `max_price` USDC for the collateral.
    /// Settlement price will be the Dutch auction price at the time of settle
    /// (always <= max_price). No USDC is locked here — the agent must have
    /// sufficient balance when settle_auction is called.
    ///
    /// Rule: the agent that triggered the auction cannot bid on it.
    pub fn place_limit_bid(env: Env, agent: Address, auction_id: u64, max_price: i128) {
        agent.require_auth();
        assert!(is_registered_agent(&env, &agent), "agent not in pool");
        assert!(max_price > 0, "max_price must be positive");

        let auction = get_auction(&env, auction_id).expect("auction not found");
        assert!(!auction.settled, "auction already settled");

        // Block the trigger agent from bidding on their own auction
        assert!(
            auction.trigger_agent != agent,
            "trigger agent cannot bid on own auction"
        );

        // Check no existing active bid from this agent on this auction
        let mut bids = get_auction_bids(&env, auction_id);
        for i in 0..bids.len() {
            let bid = bids.get(i).unwrap();
            if bid.agent == agent && bid.active {
                panic!("agent already has an active bid on this auction");
            }
        }

        bids.push_back(LimitBid {
            agent: agent.clone(),
            max_price,
            placed_at_ledger: env.ledger().sequence(),
            active: true,
        });
        set_auction_bids(&env, auction_id, &bids);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "limit_bid_placed"),),
            (agent, auction_id, max_price),
        );
    }

    /// Cancel a previously placed limit bid on an auction.
    pub fn cancel_limit_bid(env: Env, agent: Address, auction_id: u64) {
        agent.require_auth();

        let mut bids = get_auction_bids(&env, auction_id);
        let mut found = false;

        for i in 0..bids.len() {
            let mut bid = bids.get(i).unwrap();
            if bid.agent == agent && bid.active {
                bid.active = false;
                bids.set(i, bid);
                found = true;
                break;
            }
        }

        assert!(found, "no active bid found for this agent");
        set_auction_bids(&env, auction_id, &bids);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "limit_bid_cancelled"),),
            (agent, auction_id),
        );
    }

    /// Settle an auction by picking the best fillable limit bid.
    ///
    /// Anyone can call this. The contract finds the active bid with the highest
    /// max_price that is >= the current Dutch price, and settles with them.
    /// The winning agent pays the current Dutch price (not their max_price),
    /// so agents are rewarded for placing higher bids without paying more.
    pub fn settle_auction(env: Env, auction_id: u64) {
        accrue_interest(&env);

        let mut auction = get_auction(&env, auction_id).expect("auction not found");
        assert!(!auction.settled, "auction already settled");

        let current_price = Self::auction_price_at(&env, &auction);
        let bids = get_auction_bids(&env, auction_id);

        // Find the active bid with the highest max_price >= current_price
        let mut best_idx: Option<u32> = None;
        let mut best_max_price: i128 = 0;

        for i in 0..bids.len() {
            let bid = bids.get(i).unwrap();
            if bid.active && bid.max_price >= current_price && bid.max_price > best_max_price {
                best_max_price = bid.max_price;
                best_idx = Some(i);
            }
        }

        let idx = best_idx.expect("no fillable bid at current price");
        let winning_bid = bids.get(idx).unwrap();
        let winner = winning_bid.agent.clone();
        let settlement_price = current_price; // winner pays Dutch price, not their max

        let mut pos = get_position(&env, auction.position_id).expect("position not found");
        let current_debt = Self::current_debt(&env, &pos);
        let cfg = get_collateral_config(&env, &pos.collateral_asset)
            .expect("unsupported collateral");

        let usdc = get_usdc(&env);

        // Transfer USDC from winning agent to contract
        token::Client::new(&env, &usdc).transfer(
            &winner,
            &env.current_contract_address(),
            &settlement_price,
        );

        // Repay debt; send any surplus back to borrower
        let debt_repaid = current_debt.min(settlement_price);
        let surplus = settlement_price - debt_repaid;

        // Transfer collateral to winning agent
        let collateral_amount = pos.collateral_amount;
        token::Client::new(&env, &cfg.token_address).transfer(
            &env.current_contract_address(),
            &winner,
            &collateral_amount,
        );

        if surplus > 0 {
            token::Client::new(&env, &usdc).transfer(
                &env.current_contract_address(),
                &pos.owner,
                &surplus,
            );
        }

        // Update winning agent stats
        if let Some(mut agent_entry) = get_pool_agent(&env, &winner) {
            agent_entry.auctions_won += 1;
            agent_entry.collateral_earned_usdc += settlement_price;
            set_pool_agent(&env, &winner, &agent_entry);
        }

        // Deactivate all bids on this auction
        let mut updated_bids = get_auction_bids(&env, auction_id);
        for i in 0..updated_bids.len() {
            let mut bid = updated_bids.get(i).unwrap();
            bid.active = false;
            updated_bids.set(i, bid);
        }
        set_auction_bids(&env, auction_id, &updated_bids);

        let total_borrows = get_total_borrows(&env);
        set_total_borrows(&env, total_borrows.saturating_sub(debt_repaid));

        pos.debt_principal = 0;
        pos.collateral_amount = 0;
        pos.due_at_ledger = 0;
        pos.auction_state = AuctionState::Settled;
        set_position(&env, auction.position_id, &pos);

        auction.settled = true;
        set_auction(&env, auction_id, &auction);

        bump_instance(&env);
        env.events().publish(
            (Symbol::new(&env, "auction_settled"),),
            (auction_id, winner, settlement_price, debt_repaid, surplus),
        );
    }

    // -----------------------------------------------------------------------
    // Liquidation — agent-facing
    // -----------------------------------------------------------------------

    /// Trigger a Dutch auction for an undercollateralized or matured position.
    ///
    /// Two liquidation conditions:
    ///  1. Health factor < 1.0 (price dropped — classic)
    ///  2. Loan term expired without full repayment (maturity-based)
    ///
    /// `price` is the attested collateral/USDC price (scaled 1e7).
    pub fn start_auction(
        env: Env,
        caller: Address,
        position_id: u64,
        hf_proof: Bytes,
        pa_proof: Bytes,
        price: i128,
    ) {
        caller.require_auth();
        assert!(is_registered_agent(&env, &caller), "caller must be a registered agent");

        accrue_interest(&env);

        let mut pos = get_position(&env, position_id).expect("position not found");
        assert!(pos.auction_state == AuctionState::None, "auction already active");

        let cfg = get_collateral_config(&env, &pos.collateral_asset)
            .expect("unsupported collateral");

        let current_debt = Self::current_debt(&env, &pos);
        assert!(current_debt > 0, "no debt");

        let col_val = pos.collateral_amount * price / SCALE;
        let current_ledger = env.ledger().sequence();

        // Determine liquidation reason
        let hf = col_val * cfg.liq_threshold / current_debt;
        let price_unsafe = hf < SCALE;
        let term_expired = pos.due_at_ledger > 0 && current_ledger >= pos.due_at_ledger;

        assert!(
            price_unsafe || term_expired,
            "position is healthy and loan has not matured"
        );

        // ZK proof verification (skipped in dev mode; only required for price-unsafe path)
        if !is_dev_mode(&env) && price_unsafe {
            Self::verify_hf_proof(&env, &hf_proof, &pos, price);
            Self::verify_pa_proof(&env, &pa_proof, price);
        }

        if pos.became_liquidatable_at == 0 {
            pos.became_liquidatable_at = current_ledger;
        }

        let trigger_fee = Self::compute_trigger_fee(col_val, &pos, &env);

        let auction_id = get_auction_count(&env);
        let floor = col_val * cfg.floor_ratio / SCALE;
        let auction = Auction {
            position_id,
            start_price: col_val,
            floor_price: floor,
            decay_rate_per_ledger: cfg.decay_rate_per_ledger,
            started_at_ledger: current_ledger,
            trigger_agent: caller.clone(),
            settled: false,
        };
        set_auction(&env, auction_id, &auction);
        set_auction_count(&env, auction_id + 1);

        pos.auction_state = AuctionState::Active;
        set_position(&env, position_id, &pos);

        // Pay trigger fee from reserve fund
        let reserve = get_reserve_fund(&env);
        let actual_fee = trigger_fee.min(reserve);
        if actual_fee > 0 {
            let usdc = get_usdc(&env);
            token::Client::new(&env, &usdc).transfer(
                &env.current_contract_address(),
                &caller,
                &actual_fee,
            );
            set_reserve_fund(&env, reserve - actual_fee);
        }

        // Update trigger agent stats
        if let Some(mut agent_entry) = get_pool_agent(&env, &caller) {
            // Track trigger fees in collateral_earned_usdc (reused field)
            // In a production system you'd have a separate trigger_fees_earned field
            agent_entry.collateral_earned_usdc += actual_fee;
            set_pool_agent(&env, &caller, &agent_entry);
        }

        bump_instance(&env);
        env.events().publish(
            (Symbol::new(&env, "auction_started"),),
            (auction_id, position_id, col_val, caller, term_expired),
        );
    }

    /// Instant-fill bid. Requires the caller to be a registered pool agent.
    /// The trigger agent of this auction cannot call this.
    /// Useful when an agent wants to bid immediately at the current Dutch price
    /// without waiting for settle_auction to pick among limit orders.
    pub fn bid(env: Env, bidder: Address, auction_id: u64, bid_amount: i128, ap_proof: Bytes) {
        bidder.require_auth();
        assert!(is_registered_agent(&env, &bidder), "bidder must be a registered pool agent");

        accrue_interest(&env);

        let mut auction = get_auction(&env, auction_id).expect("auction not found");
        assert!(!auction.settled, "auction already settled");

        // Block the trigger agent from bidding on their own auction
        assert!(
            auction.trigger_agent != bidder,
            "trigger agent cannot bid on own auction"
        );

        let current_price = Self::auction_price_at(&env, &auction);
        assert!(bid_amount >= current_price, "bid below current price");

        if !is_dev_mode(&env) {
            Self::verify_ap_proof(&env, &ap_proof, current_price, &auction);
        }

        let mut pos = get_position(&env, auction.position_id).expect("position not found");
        let current_debt = Self::current_debt(&env, &pos);
        let cfg = get_collateral_config(&env, &pos.collateral_asset)
            .expect("unsupported collateral");

        let usdc = get_usdc(&env);

        token::Client::new(&env, &usdc).transfer(
            &bidder,
            &env.current_contract_address(),
            &bid_amount,
        );

        let debt_repaid = current_debt.min(bid_amount);
        let surplus = bid_amount - debt_repaid;

        let collateral_amount = pos.collateral_amount;
        token::Client::new(&env, &cfg.token_address).transfer(
            &env.current_contract_address(),
            &bidder,
            &collateral_amount,
        );

        if surplus > 0 {
            token::Client::new(&env, &usdc).transfer(
                &env.current_contract_address(),
                &pos.owner,
                &surplus,
            );
        }

        // Update winning agent stats
        if let Some(mut agent_entry) = get_pool_agent(&env, &bidder) {
            agent_entry.auctions_won += 1;
            agent_entry.collateral_earned_usdc += bid_amount;
            set_pool_agent(&env, &bidder, &agent_entry);
        }

        // Deactivate all limit bids on this auction
        let mut bids = get_auction_bids(&env, auction_id);
        for i in 0..bids.len() {
            let mut b = bids.get(i).unwrap();
            b.active = false;
            bids.set(i, b);
        }
        set_auction_bids(&env, auction_id, &bids);

        let total_borrows = get_total_borrows(&env);
        set_total_borrows(&env, total_borrows.saturating_sub(debt_repaid));

        pos.debt_principal = 0;
        pos.collateral_amount = 0;
        pos.due_at_ledger = 0;
        pos.auction_state = AuctionState::Settled;
        set_position(&env, auction.position_id, &pos);

        auction.settled = true;
        set_auction(&env, auction_id, &auction);

        bump_instance(&env);
        env.events().publish(
            (Symbol::new(&env, "auction_settled"),),
            (auction_id, bidder, bid_amount, debt_repaid, surplus),
        );
    }

    /// Expire an auction that ran past its max duration with no bids.
    pub fn expire_auction(env: Env, auction_id: u64) {
        let mut auction = get_auction(&env, auction_id).expect("auction not found");
        assert!(!auction.settled, "auction already settled");

        let mut pos = get_position(&env, auction.position_id).expect("position not found");
        let cfg = get_collateral_config(&env, &pos.collateral_asset)
            .expect("unsupported collateral");

        let elapsed = env.ledger().sequence().saturating_sub(auction.started_at_ledger);
        assert!(elapsed > cfg.max_auction_ledgers, "auction still active");

        pos.auction_state = AuctionState::Expired;
        set_position(&env, auction.position_id, &pos);
        auction.settled = true;
        set_auction(&env, auction_id, &auction);

        env.events().publish(
            (Symbol::new(&env, "auction_expired"),),
            (auction_id, auction.position_id),
        );
    }

    // -----------------------------------------------------------------------
    // Agent functions
    // -----------------------------------------------------------------------

    /// Agent liveness signal. Stored in Temporary storage with short TTL.
    pub fn heartbeat(env: Env, agent: Address) {
        agent.require_auth();
        let ledger = env.ledger().sequence();
        set_heartbeat(&env, ledger);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "heartbeat"),),
            (agent, ledger),
        );
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /// Health factor for a position scaled to 1e7 (1.0 = 10_000_000).
    pub fn health_factor(env: Env, position_id: u64, price: i128) -> i128 {
        let pos = get_position(&env, position_id).expect("position not found");
        let current_debt = Self::current_debt(&env, &pos);
        if current_debt == 0 {
            return i128::MAX;
        }
        let cfg = get_collateral_config(&env, &pos.collateral_asset)
            .expect("unsupported collateral");
        let col_val = pos.collateral_amount * price / SCALE;
        col_val * cfg.liq_threshold / current_debt
    }

    /// True if the loan term has expired and the borrower has not repaid.
    pub fn is_matured(env: Env, position_id: u64) -> bool {
        let pos = get_position(&env, position_id).expect("position not found");
        let current_debt = Self::current_debt(&env, &pos);
        pos.due_at_ledger > 0
            && env.ledger().sequence() >= pos.due_at_ledger
            && current_debt > 0
    }

    /// Current Dutch auction price scaled to 1e7.
    pub fn current_auction_price(env: Env, auction_id: u64) -> i128 {
        let auction = get_auction(&env, auction_id).expect("auction not found");
        Self::auction_price_at(&env, &auction)
    }

    /// Annualized borrow rate scaled to 1e7.
    pub fn borrow_rate(env: Env) -> i128 {
        let util = compute_utilization(get_total_deposits(&env), get_total_borrows(&env));
        compute_borrow_rate(util)
    }

    /// Current utilization ratio scaled to 1e7.
    pub fn utilization(env: Env) -> i128 {
        compute_utilization(get_total_deposits(&env), get_total_borrows(&env))
    }

    pub fn get_position(env: Env, position_id: u64) -> Position {
        get_position(&env, position_id).expect("position not found")
    }

    pub fn get_auction(env: Env, auction_id: u64) -> Auction {
        get_auction(&env, auction_id).expect("auction not found")
    }

    pub fn get_pool_agent(env: Env, agent: Address) -> PoolAgent {
        get_pool_agent(&env, &agent).expect("agent not registered")
    }

    pub fn get_auction_bids(env: Env, auction_id: u64) -> Vec<LimitBid> {
        get_auction_bids(&env, auction_id)
    }

    pub fn is_registered_agent(env: Env, agent: Address) -> bool {
        is_registered_agent(&env, &agent)
    }

    pub fn get_heartbeat(env: Env) -> u32 {
        get_heartbeat(&env)
    }

    pub fn total_deposits(env: Env) -> i128 {
        get_total_deposits(&env)
    }

    pub fn total_borrows(env: Env) -> i128 {
        get_total_borrows(&env)
    }

    pub fn reserve_fund(env: Env) -> i128 {
        get_reserve_fund(&env)
    }

    pub fn position_count(env: Env) -> u64 {
        get_position_count(&env)
    }

    pub fn auction_count(env: Env) -> u64 {
        get_auction_count(&env)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn current_debt(env: &Env, pos: &Position) -> i128 {
        if pos.debt_principal == 0 || pos.borrow_index_at_open == 0 {
            return 0;
        }
        let borrow_index = get_borrow_index(env);
        pos.debt_principal * borrow_index / pos.borrow_index_at_open
    }

    fn auction_price_at(env: &Env, auction: &Auction) -> i128 {
        let elapsed = env
            .ledger()
            .sequence()
            .saturating_sub(auction.started_at_ledger) as i128;
        let discount = auction.decay_rate_per_ledger * elapsed;
        let price = auction.start_price * (SCALE - discount) / SCALE;
        price.max(auction.floor_price)
    }

    fn compute_trigger_fee(col_val: i128, pos: &Position, env: &Env) -> i128 {
        let ledgers_liq = if pos.became_liquidatable_at == 0 {
            0u32
        } else {
            env.ledger().sequence().saturating_sub(pos.became_liquidatable_at)
        };
        let fee_bps: i128 = if ledgers_liq <= FEE_TIER1_MAX {
            10
        } else if ledgers_liq <= FEE_TIER2_MAX {
            20
        } else {
            50
        };
        col_val * fee_bps / 10_000
    }

    fn find_position_by_owner(env: &Env, user: &Address, asset: &Symbol) -> Option<(u64, Position)> {
        let count = get_position_count(env);
        for id in 0..count {
            if let Some(pos) = get_position(env, id) {
                if &pos.owner == user
                    && &pos.collateral_asset == asset
                    && pos.collateral_amount > 0
                    && pos.auction_state == AuctionState::None
                {
                    return Some((id, pos));
                }
            }
        }
        None
    }

    // -----------------------------------------------------------------------
    // ZK proof stubs (wired to ZK Verifier contract in Phase 3)
    // -----------------------------------------------------------------------

    fn verify_hf_proof(_env: &Env, _proof: &Bytes, _pos: &Position, _price: i128) {
        panic!("ZK verification not yet wired");
    }

    fn verify_pa_proof(_env: &Env, _proof: &Bytes, _price: i128) {
        panic!("ZK verification not yet wired");
    }

    fn verify_ap_proof(_env: &Env, _proof: &Bytes, _current_price: i128, _auction: &Auction) {
        panic!("ZK verification not yet wired");
    }
}
