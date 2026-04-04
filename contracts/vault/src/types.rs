use soroban_sdk::{contracttype, Address, Symbol};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    // Instance storage (cheap reads, expires with contract)
    Admin,
    Usdc,
    Vusdc,
    HfVerifier,
    TotalDeposits,
    TotalBorrows,
    DepositIndex,
    BorrowIndex,
    LastAccrualLedger,
    ReserveFund,
    CircuitBreaker,
    DevMode, // bypass ZK verification during development
    PositionCount,
    AuctionCount,
    // Collateral config per asset
    CollateralConfig(Symbol),
    // Persistent storage (per user / per auction)
    Position(u64),
    Auction(u64),
    // Persistent: verification keys
    HfVk,
    PaVk,
    ApVk,
    // Temporary storage (5-ledger TTL)
    AgentHeartbeat,
}

// ---------------------------------------------------------------------------
// Core structs
// ---------------------------------------------------------------------------

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum AuctionState {
    None,
    Active,
    Settled,
    Expired,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Position {
    pub owner: Address,
    /// "XLM" or "SBTC"
    pub collateral_asset: Symbol,
    /// In asset's native units, 7 decimal places
    pub collateral_amount: i128,
    /// USDC borrowed, 7 decimal places
    pub debt_principal: i128,
    /// Borrow index snapshot at open (scaled 1e7)
    pub borrow_index_at_open: i128,
    pub opened_at_ledger: u32,
    pub auction_state: AuctionState,
    /// Ledger when this position first became liquidatable (0 = not yet)
    pub became_liquidatable_at: u32,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Auction {
    pub position_id: u64,
    /// USDC, 7 decimal places
    pub start_price: i128,
    /// USDC floor, 7 decimal places
    pub floor_price: i128,
    /// Basis-points discount per ledger (scaled 1e7)
    pub decay_rate_per_ledger: i128,
    pub started_at_ledger: u32,
    pub trigger_agent: Address,
    pub settled: bool,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct CollateralConfig {
    /// Max LTV ratio (scaled 1e7 — e.g. 6_500_000 = 65%)
    pub max_ltv: i128,
    /// Liquidation threshold (scaled 1e7 — e.g. 8_000_000 = 80%)
    pub liq_threshold: i128,
    /// Auction decay rate in bps per ledger (scaled 1e7)
    pub decay_rate_per_ledger: i128,
    /// Auction floor as fraction of market value (scaled 1e7)
    pub floor_ratio: i128,
    /// Max auction duration in ledgers
    pub max_auction_ledgers: u32,
}
