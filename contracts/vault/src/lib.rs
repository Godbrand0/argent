#![no_std]

mod interest;
mod storage;
mod types;

use soroban_sdk::{
    contract, contractimpl, token, Address, Bytes, Env, Symbol,
};

use interest::{accrue_interest, compute_borrow_rate, compute_utilization};
use storage::{
    bump_instance, get_admin, get_auction, get_auction_count, get_borrow_index,
    get_collateral_config, get_deposit_index, get_heartbeat, get_position,
    get_position_count, get_reserve_fund, get_total_borrows, get_total_deposits, get_usdc,
    get_vusdc, is_circuit_breaker, is_dev_mode, set_admin, set_auction, set_auction_count,
    set_circuit_breaker, set_collateral_config, set_deposit_index, set_dev_mode, set_heartbeat,
    set_hf_verifier, set_position, set_position_count, set_reserve_fund, set_total_borrows,
    set_total_deposits, set_usdc, set_vusdc, SCALE,
};
use types::{Auction, AuctionState, CollateralConfig, DataKey, Position};

// ---------------------------------------------------------------------------
// Fee constants
// ---------------------------------------------------------------------------

/// Trigger fee bps thresholds in ledgers (~5s each)
const FEE_TIER1_MAX: u32 = 120; // 0-10 min → 0.1%
const FEE_TIER2_MAX: u32 = 360; // 10-30 min → 0.2%
// beyond 360 ledgers → 0.5%

/// Circuit breaker trips if a position is liquidatable for 60+ min (~720 ledgers)
const CIRCUIT_BREAKER_LEDGERS: u32 = 720;

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
        // Prevent re-initialization
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
        set_dev_mode(&env, true); // dev mode on by default; admin disables before mainnet
        set_position_count(&env, 0);
        set_auction_count(&env, 0);

        bump_instance(&env);
    }

    /// Configure collateral parameters for an asset.
    pub fn set_collateral_config(
        env: Env,
        asset: Symbol,
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

        // Transfer USDC from user to this contract
        token::Client::new(&env, &usdc).transfer(&user, &env.current_contract_address(), &amount);

        // Compute vUSDC to mint: amount * SCALE / deposit_index
        let deposit_index = get_deposit_index(&env);
        let vusdc_amount = amount * SCALE / deposit_index;

        // Mint vUSDC to user via vault-controlled mint
        token::Client::new(&env, &vusdc).transfer(&env.current_contract_address(), &user, &vusdc_amount);

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

        // Burn vUSDC from user
        token::Client::new(&env, &vusdc).transfer(&user, &env.current_contract_address(), &vusdc_amount);

        // Transfer USDC to user
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
    /// NOTE: XLM is deposited as the native asset; caller must pass asset = "XLM".
    /// For now price is supplied by the caller (will be ZK-attested in Phase 3).
    pub fn deposit_collateral(env: Env, user: Address, asset: Symbol, amount: i128) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");
        assert!(
            get_collateral_config(&env, &asset).is_some(),
            "unsupported collateral"
        );

        // For non-native collateral, transfer the token.
        // Native XLM handling will be addressed with Stellar's asset contract.
        // For now we treat all collateral as token transfers.
        // Create or update position
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
    /// `price` is the collateral/USDC price (scaled 1e7) — ZK-attested in Phase 3.
    pub fn borrow(env: Env, user: Address, position_id: u64, usdc_amount: i128, price: i128) {
        user.require_auth();
        assert!(usdc_amount > 0, "amount must be positive");
        assert!(!is_circuit_breaker(&env), "circuit breaker active");

        accrue_interest(&env);

        let mut pos = get_position(&env, position_id).expect("position not found");
        assert!(pos.owner == user, "not position owner");
        assert!(pos.auction_state == AuctionState::None, "position in auction");

        let cfg = get_collateral_config(&env, &pos.collateral_asset)
            .expect("unsupported collateral");

        let collateral_value = pos.collateral_amount * price / SCALE;
        let max_borrow = collateral_value * cfg.max_ltv / SCALE;
        let new_debt = pos.debt_principal + usdc_amount;
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
        pos.debt_principal = new_debt;
        pos.borrow_index_at_open = borrow_index;
        set_position(&env, position_id, &pos);
        set_total_borrows(&env, get_total_borrows(&env) + usdc_amount);
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "borrow"),),
            (user, position_id, usdc_amount),
        );
    }

    /// Repay USDC debt (partial or full).
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

        // Reduce principal proportionally
        let new_debt = current_debt - repay_amount;
        pos.debt_principal = new_debt;
        pos.borrow_index_at_open = get_borrow_index(&env);
        if pos.auction_state == AuctionState::Active && new_debt == 0 {
            pos.auction_state = AuctionState::None;
        }
        set_position(&env, position_id, &pos);

        let total_borrows = get_total_borrows(&env);
        set_total_borrows(&env, total_borrows.saturating_sub(repay_amount));
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "repay"),),
            (user, position_id, repay_amount),
        );
    }

    /// Withdraw collateral if health factor remains >= 1.0 after.
    pub fn withdraw_collateral(env: Env, user: Address, position_id: u64, amount: i128, price: i128) {
        user.require_auth();
        assert!(amount > 0, "amount must be positive");

        accrue_interest(&env);

        let mut pos = get_position(&env, position_id).expect("position not found");
        assert!(pos.owner == user, "not position owner");
        assert!(pos.auction_state == AuctionState::None, "position in auction");
        assert!(pos.collateral_amount >= amount, "insufficient collateral");

        // Check HF after withdrawal
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
        bump_instance(&env);

        env.events().publish(
            (Symbol::new(&env, "withdraw_collateral"),),
            (user, position_id, amount),
        );
    }

    // -----------------------------------------------------------------------
    // Liquidation — agent-facing
    // -----------------------------------------------------------------------

    /// Trigger a Dutch auction for an undercollateralized position.
    /// `hf_proof` and `pa_proof` are ZK proofs (bypassed in dev mode).
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

        accrue_interest(&env);

        let mut pos = get_position(&env, position_id).expect("position not found");
        assert!(pos.auction_state == AuctionState::None, "auction already active");

        let cfg = get_collateral_config(&env, &pos.collateral_asset)
            .expect("unsupported collateral");

        let current_debt = Self::current_debt(&env, &pos);
        assert!(current_debt > 0, "no debt");

        // Verify health factor < 1.0
        let col_val = pos.collateral_amount * price / SCALE;
        let hf = col_val * cfg.liq_threshold / current_debt;
        assert!(hf < SCALE, "position is healthy");

        // ZK proof verification (skipped in dev mode)
        if !is_dev_mode(&env) {
            Self::verify_hf_proof(&env, &hf_proof, &pos, price);
            Self::verify_pa_proof(&env, &pa_proof, price);
        }

        // Compute trigger fee (escalating based on how long liquidatable)
        let trigger_fee = Self::compute_trigger_fee(col_val, &pos, &env);

        // Create auction
        let auction_id = get_auction_count(&env);
        let floor = col_val * cfg.floor_ratio / SCALE;
        let auction = Auction {
            position_id,
            start_price: col_val,
            floor_price: floor,
            decay_rate_per_ledger: cfg.decay_rate_per_ledger,
            started_at_ledger: env.ledger().sequence(),
            trigger_agent: caller.clone(),
            settled: false,
        };
        set_auction(&env, auction_id, &auction);
        set_auction_count(&env, auction_id + 1);

        pos.auction_state = AuctionState::Active;
        if pos.became_liquidatable_at == 0 {
            pos.became_liquidatable_at = env.ledger().sequence();
        }
        set_position(&env, position_id, &pos);

        // Pay trigger fee to caller from reserve fund
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

        bump_instance(&env);
        env.events().publish(
            (Symbol::new(&env, "auction_started"),),
            (auction_id, position_id, col_val, caller),
        );
    }

    /// Place a bid on an active Dutch auction.
    /// `ap_proof` is the AuctionPrice ZK proof (bypassed in dev mode).
    pub fn bid(env: Env, bidder: Address, auction_id: u64, bid_amount: i128, ap_proof: Bytes) {
        bidder.require_auth();

        accrue_interest(&env);

        let mut auction = get_auction(&env, auction_id).expect("auction not found");
        assert!(!auction.settled, "auction already settled");

        let current_price = Self::auction_price_at(&env, &auction);
        assert!(bid_amount >= current_price, "bid below current price");

        // ZK proof verification (skipped in dev mode)
        if !is_dev_mode(&env) {
            Self::verify_ap_proof(&env, &ap_proof, current_price, &auction);
        }

        let mut pos = get_position(&env, auction.position_id).expect("position not found");
        let current_debt = Self::current_debt(&env, &pos);

        let usdc = get_usdc(&env);

        // Transfer bid USDC from bidder to contract
        token::Client::new(&env, &usdc).transfer(
            &bidder,
            &env.current_contract_address(),
            &bid_amount,
        );

        // Repay debt
        let debt_repaid = current_debt.min(bid_amount);
        let surplus = bid_amount - debt_repaid;

        // Transfer collateral to bidder (entire position collateral)
        // NOTE: full collateral transfer — partial collateral auctions are a stretch goal
        let collateral_amount = pos.collateral_amount;
        // For now we emit an event; actual native asset transfer is asset-specific
        env.events().publish(
            (Symbol::new(&env, "collateral_transfer"),),
            (bidder.clone(), pos.collateral_asset.clone(), collateral_amount),
        );

        // Send surplus USDC to borrower
        if surplus > 0 {
            token::Client::new(&env, &usdc).transfer(
                &env.current_contract_address(),
                &pos.owner,
                &surplus,
            );
        }

        // Update state
        let total_borrows = get_total_borrows(&env);
        set_total_borrows(&env, total_borrows.saturating_sub(debt_repaid));
        set_total_deposits(&env, get_total_deposits(&env).saturating_sub(debt_repaid));

        pos.debt_principal = 0;
        pos.collateral_amount = 0;
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

    /// Expire an auction that ran past its max duration.
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

    /// Returns the health factor for a position scaled to 1e7 (1.0 = 10_000_000).
    /// `price` is collateral/USDC (scaled 1e7).
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

    /// Walk positions to find an existing one for this owner + asset.
    /// Linear scan — acceptable for testnet; would use an index on mainnet.
    fn find_position_by_owner(env: &Env, user: &Address, asset: &Symbol) -> Option<(u64, Position)> {
        let count = get_position_count(env);
        for id in 0..count {
            if let Some(pos) = get_position(env, id) {
                if &pos.owner == user && &pos.collateral_asset == asset && pos.debt_principal == 0 && pos.collateral_amount > 0 {
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
        // Phase 3: call HfVerifier contract via cross-contract invocation
        panic!("ZK verification not yet wired");
    }

    fn verify_pa_proof(_env: &Env, _proof: &Bytes, _price: i128) {
        panic!("ZK verification not yet wired");
    }

    fn verify_ap_proof(_env: &Env, _proof: &Bytes, _current_price: i128, _auction: &Auction) {
        panic!("ZK verification not yet wired");
    }
}
