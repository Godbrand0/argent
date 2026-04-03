# LiquidMind — System Architecture

Last updated: April 2026  
Network: Stellar Testnet

---

## High-Level System Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        STELLAR TESTNET                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    SOROBAN CONTRACTS                     │   │
│  │                                                          │   │
│  │  ┌─────────────┐   ┌──────────────┐  ┌──────────────┐   │   │
│  │  │ Vault        │   │ vUSDC Token  │  │ ZK Verifier  │   │   │
│  │  │ Contract     │◄──│ (SEP-41)     │  │ (Groth16)    │   │   │
│  │  │              │   │              │  │              │   │   │
│  │  │ - deposit()  │   │ - mint()     │  │ - verify_hf()│   │   │
│  │  │ - borrow()   │   │ - burn()     │  │ - verify_pa()│   │   │
│  │  │ - repay()    │   │ - transfer() │  │ - verify_ap()│   │   │
│  │  │ - withdraw() │   └──────────────┘  └──────────────┘   │   │
│  │  │ - start_auc()│                                         │   │
│  │  │ - bid()      │   ┌──────────────┐                      │   │
│  │  │ - settle()   │   │ USDC SAC     │                      │   │
│  │  │ - heartbeat()│◄──│ (Stellar     │                      │   │
│  │  └──────────────┘   │  Asset       │                      │   │
│  │                     │  Contract)   │                      │   │
│  │                     └──────────────┘                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────┐    ┌─────────────────────────────┐   │
│  │  Stellar DEX         │    │  Horizon API                │   │
│  │  (path payments for  │    │  (trade history, TWAP data) │   │
│  │   collateral sales)  │    │                             │   │
│  └──────────────────────┘    └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        AGENT LAYER                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 LiquidMind Agent (TypeScript)            │   │
│  │                                                          │   │
│  │  ┌────────────────────┐    ┌─────────────────────────┐   │   │
│  │  │  Monitor Module    │    │  Bidder Module           │   │   │
│  │  │                    │    │                          │   │   │
│  │  │  scan_positions()  │    │  watch_auctions()        │   │   │
│  │  │  fetch_prices()    │    │  evaluate_bid()          │   │   │
│  │  │  compute_hf()      │    │  generate_ap_proof()     │   │   │
│  │  │  gen_zk_proofs()   │    │  submit_bid()            │   │   │
│  │  │  start_auction()   │    │  collect_earnings()      │   │   │
│  │  │  heartbeat()       │    │                          │   │   │
│  │  └────────────────────┘    └─────────────────────────┘   │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │           Action Model Scheduler                 │   │   │
│  │  │  loop: observe → evaluate preconditions →        │   │   │
│  │  │        execute highest-priority action → repeat  │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  │  ┌──────────────────┐    ┌──────────────────────────┐   │   │
│  │  │  ZK Proof Engine │    │  Chain Interface         │   │   │
│  │  │  (snarkjs)       │    │  (@stellar/stellar-sdk)  │   │   │
│  │  │                  │    │                          │   │   │
│  │  │  - hf circuit    │    │  - soroban RPC client    │   │   │
│  │  │  - pa circuit    │    │  - horizon client        │   │   │
│  │  │  - ap circuit    │    │  - tx builder/signer     │   │   │
│  │  └──────────────────┘    └──────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                 │
│                                                                 │
│  Next.js 15 + TypeScript + Tailwind CSS                         │
│                                                                 │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Vault Dashboard│  │ Position View│  │ Live Auction Panel │  │
│  │                │  │              │  │                    │  │
│  │ - deposit      │  │ - HF meter   │  │ - Dutch price      │  │
│  │ - borrow       │  │ - at-risk    │  │   decay curve      │  │
│  │ - repay        │  │   warning    │  │ - bid button       │  │
│  │ - withdraw     │  │ - collateral │  │ - auction history  │  │
│  └────────────────┘  └──────────────┘  └────────────────────┘  │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │                Agent Activity Feed                     │     │
│  │  - scan events  - proof generation  - auction triggers │     │
│  │  - bid events   - fee receipts      - heartbeats       │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  Freighter Wallet (browser extension, Soroban auth signing)     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    ZK PROOF SYSTEM                              │
│                                                                 │
│  circom circuits → snarkjs build → WASM + zkey files           │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │HealthFactorProof│  │PriceAttestation  │  │AuctionPrice   │  │
│  │                 │  │Proof             │  │Proof          │  │
│  │inputs:          │  │                  │  │               │  │
│  │ collateral_val  │  │inputs:           │  │inputs:        │  │
│  │ debt_val        │  │ prices[] (priv)  │  │ start_price   │  │
│  │ liq_threshold   │  │ weights[] (priv) │  │ decay_rate    │  │
│  │                 │  │ ledger_start     │  │ elapsed_ledgers│  │
│  │output:          │  │ ledger_end       │  │ ledger_hash   │  │
│  │ is_liquidatable │  │                  │  │               │  │
│  │                 │  │output:           │  │output:        │  │
│  │verified by:     │  │ twap_price       │  │ current_price │  │
│  │ ZK Verifier     │  │                  │  │               │  │
│  │ contract        │  │verified by:      │  │verified by:   │  │
│  └─────────────────┘  │ Vault contract   │  │ Vault contract│  │
│                       └──────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Contract Architecture

### Vault Contract (Primary Contract)

**Responsibilities:**

- Manages lender deposits and vUSDC issuance
- Manages borrower positions (collateral + debt)
- Tracks interest index per ledger
- Orchestrates Dutch auction lifecycle
- Verifies ZK proofs before auction actions
- Pays agents atomically (trigger fee + bid settlement)
- Manages reserve fund
- Fires circuit breaker

**Storage Layout:**

| Key                    | Type       | Storage    | Description                          |
| ---------------------- | ---------- | ---------- | ------------------------------------ |
| `ADMIN`                | `Address`  | Instance   | Protocol admin                       |
| `USDC`                 | `Address`  | Instance   | USDC contract ID                     |
| `VUSDC`                | `Address`  | Instance   | vUSDC token contract ID              |
| `HF_VERIFIER`          | `Address`  | Instance   | ZK verifier contract ID              |
| `TOTAL_DEPOSITS`       | `i128`     | Instance   | Sum of all USDC deposited            |
| `TOTAL_BORROWS`        | `i128`     | Instance   | Sum of all USDC borrowed             |
| `DEPOSIT_INDEX`        | `i128`     | Instance   | Lender interest index (scaled 1e7)   |
| `BORROW_INDEX`         | `i128`     | Instance   | Borrower interest index (scaled 1e7) |
| `LAST_ACCRUAL_LEDGER`  | `u32`      | Instance   | Ledger of last interest accrual      |
| `RESERVE_FUND`         | `i128`     | Instance   | Protocol reserve USDC balance        |
| `CIRCUIT_BREAKER`      | `bool`     | Instance   | If true, new borrows paused          |
| `POSITION(user)`       | `Position` | Persistent | Per-user borrow position             |
| `AUCTION(position_id)` | `Auction`  | Persistent | Per-auction state                    |
| `HF_VK`                | `Bytes`    | Persistent | HealthFactor verification key        |
| `PA_VK`                | `Bytes`    | Persistent | PriceAttestation verification key    |
| `AP_VK`                | `Bytes`    | Persistent | AuctionPrice verification key        |
| `AGENT_HEARTBEAT`      | `u32`      | Temporary  | Last agent heartbeat ledger          |

**Data Structures:**

```rust
pub struct Position {
    pub owner: Address,
    pub collateral_asset: Symbol,     // "XLM" or "SBTC"
    pub collateral_amount: i128,      // in asset's native units (7dp)
    pub debt_principal: i128,         // USDC borrowed (7dp)
    pub borrow_index_at_open: i128,   // index snapshot when borrowed
    pub opened_at_ledger: u32,
    pub auction_state: AuctionState,
}

pub enum AuctionState {
    None,
    Active,
    Settled,
    Expired,
}

pub struct Auction {
    pub position_id: u64,
    pub start_price: i128,            // USDC (7dp)
    pub floor_price: i128,            // USDC (7dp)
    pub decay_rate_bps_per_ledger: i128,
    pub started_at_ledger: u32,
    pub trigger_agent: Address,
    pub settled: bool,
}
```

**Public Interface:**

```rust
// Lender functions
fn deposit(env: Env, user: Address, amount: i128)
fn withdraw(env: Env, user: Address, amount: i128)

// Borrower functions
fn deposit_collateral(env: Env, user: Address, asset: Symbol, amount: i128)
fn borrow(env: Env, user: Address, usdc_amount: i128)
fn repay(env: Env, user: Address, amount: i128)
fn withdraw_collateral(env: Env, user: Address, amount: i128)

// Liquidation functions (agent-facing)
fn start_auction(env: Env, position_id: u64, hf_proof: Bytes, pa_proof: Bytes)
fn bid(env: Env, auction_id: u64, bid_amount: i128, ap_proof: Bytes)
fn settle_auction(env: Env, auction_id: u64)          // internal, called from bid
fn fallback_liquidate(env: Env, position_id: u64)     // after auction expires

// Agent functions
fn heartbeat(env: Env, agent: Address)
fn get_positions(env: Env, cursor: u64, limit: u32) -> Vec<Position>
fn get_active_auctions(env: Env) -> Vec<Auction>

// View functions
fn health_factor(env: Env, position_id: u64) -> i128
fn current_auction_price(env: Env, auction_id: u64) -> i128
fn borrow_rate(env: Env) -> i128
fn utilization(env: Env) -> i128
fn get_position(env: Env, position_id: u64) -> Position

// Admin functions
fn initialize(env: Env, admin: Address, usdc: Address, vusdc: Address, hf_verifier: Address)
fn set_collateral_config(env: Env, asset: Symbol, max_ltv: i128, liq_threshold: i128)
fn set_verification_keys(env: Env, hf_vk: Bytes, pa_vk: Bytes, ap_vk: Bytes)
```

---

### vUSDC Token Contract (SEP-41)

Standard fungible token representing lender share of the pool.

```
Mint: when lender deposits USDC (1 vUSDC per USDC at current index)
Burn: when lender withdraws USDC
Transfer: freely transferable (composability)
Value: vUSDC × current_deposit_index / initial_index
```

---

### ZK Verifier Contract

Thin wrapper around Soroban's BN254 host functions. Stateless — verification key
passed per call or stored separately.

```rust
fn verify_groth16(
    env: Env,
    proof_a: Bytes,      // G1 point, 64 bytes
    proof_b: Bytes,      // G2 point, 128 bytes
    proof_c: Bytes,      // G1 point, 64 bytes
    public_inputs: Vec<i128>,
    vk: Bytes,           // full verification key serialized
) -> bool
```

---

## Agent Architecture

### Action Model — Full Definition

```typescript
// MONITOR ACTIONS (ordered by priority)

const MONITOR_ACTIONS: Action[] = [
	{
		name: "heartbeat",
		priority: 100,
		preconditions: (s) => s.ledgerSinceHeartbeat > HEARTBEAT_INTERVAL,
		execute: async (s) => vaultContract.heartbeat(agentKeypair),
	},
	{
		name: "start_auction",
		priority: 90,
		preconditions: (s) =>
			s.atRiskPositions.length > 0 && s.zkProofsReady && s.agentBudget > TX_FEE,
		execute: async (s) => {
			for (const pos of s.atRiskPositions) {
				const { hfProof, paProof } = s.proofs[pos.id]
				await vaultContract.startAuction(pos.id, hfProof, paProof)
			}
		},
	},
	{
		name: "generate_zk_proofs",
		priority: 80,
		preconditions: (s) => s.atRiskPositions.length > 0 && !s.zkProofsReady,
		execute: async (s) => {
			for (const pos of s.atRiskPositions) {
				s.proofs[pos.id] = await zkEngine.generateProofs(pos, s.prices)
			}
			s.zkProofsReady = true
		},
	},
	{
		name: "compute_health_factors",
		priority: 70,
		preconditions: (s) => s.priceCache.age < 60_000,
		execute: async (s) => {
			s.atRiskPositions = s.positions.filter(
				(p) => computeHF(p, s.priceCache) < 1.0,
			)
		},
	},
	{
		name: "fetch_prices",
		priority: 60,
		preconditions: (s) => s.priceCache.age > 30_000 || s.positionBuffer.changed,
		execute: async (s) => {
			s.priceCache = await horizon.computeTWAP(["XLM/USDC", "SBTC/USDC"])
		},
	},
	{
		name: "scan_positions",
		priority: 50,
		preconditions: (s) => Date.now() - s.lastScan > SCAN_INTERVAL,
		execute: async (s) => {
			s.positions = await vaultContract.getPositions(s.cursor)
			s.lastScan = Date.now()
		},
	},
]

// BIDDER ACTIONS
const BIDDER_ACTIONS: Action[] = [
	{
		name: "submit_bid",
		priority: 90,
		preconditions: (s) =>
			s.biddableAuctions.length > 0 &&
			s.agentUsdcBalance >= s.biddableAuctions[0].currentPrice &&
			s.apProofsReady,
		execute: async (s) => {
			const auction = s.biddableAuctions[0]
			await vaultContract.bid(
				auction.id,
				auction.currentPrice,
				s.apProofs[auction.id],
			)
		},
	},
	{
		name: "generate_ap_proof",
		priority: 80,
		preconditions: (s) => s.biddableAuctions.length > 0 && !s.apProofsReady,
		execute: async (s) => {
			for (const a of s.biddableAuctions) {
				s.apProofs[a.id] = await zkEngine.generateAuctionPriceProof(a)
			}
			s.apProofsReady = true
		},
	},
	{
		name: "evaluate_bids",
		priority: 70,
		preconditions: (s) => s.activeAuctions.length > 0,
		execute: async (s) => {
			s.biddableAuctions = s.activeAuctions.filter((a) => {
				const discount =
					(s.prices[a.asset] - a.currentPrice) / s.prices[a.asset]
				return discount > MIN_PROFIT_THRESHOLD
			})
		},
	},
	{
		name: "watch_auctions",
		priority: 60,
		preconditions: (s) => true, // always eligible
		execute: async (s) => {
			s.activeAuctions = await vaultContract.getActiveAuctions()
		},
	},
]
```

---

## ZK Proof Flow

```
AGENT (off-chain)                    SOROBAN CONTRACT (on-chain)

1. Fetches position data via RPC
2. Fetches TWAP from Horizon
3. Computes health factor off-chain
4. Generates HealthFactorProof:
   - Private: collateral_val, debt_val
   - Public: liq_threshold, is_liquidatable=1
5. Generates PriceAttestationProof:
   - Private: prices[], weights[]
   - Public: twap_price, ledger_range
6. Calls start_auction() with both proofs
                                     7. Receives proofs as Bytes
                                     8. Calls ZK Verifier contract:
                                        verify_groth16(hf_proof, hf_vk)
                                        verify_groth16(pa_proof, pa_vk)
                                     9. If both valid:
                                        - Creates Auction record
                                        - Emits AuctionStarted event
                                        - Transfers trigger fee to caller
                                        - Returns success
10. Agent receives trigger fee
11. Agent emits local "triggered" log
```

---

## Interest Rate Model

```
OPTIMAL_UTILIZATION = 80%    (8_000_000 at 7dp)
BASE_RATE           = 0%
SLOPE1              = 8%     (rate at optimal utilization)
SLOPE2              = 40%    (additional rate above optimal)

if util <= OPTIMAL:
    rate = (util / OPTIMAL) * SLOPE1

if util > OPTIMAL:
    excess = (util - OPTIMAL) / (100% - OPTIMAL)
    rate = SLOPE1 + excess * SLOPE2

Per-ledger rate = annual_rate / 6_307_200  (ledgers per year at ~5s each)

Interest index update (per contract interaction):
    delta = current_ledger - last_accrual_ledger
    new_index = old_index * (1 + rate_per_ledger)^delta
    (approximated as: old_index * (1 + rate_per_ledger * delta) for small delta)

Reserve split:
    lender_share  = 90% of new interest
    reserve_share = 10% of new interest
```

---

## Dutch Auction Mechanics

```
start_price = current_collateral_market_value (from PA proof)

decay per ledger:
    XLM:  0.01% / 12 ledgers ≈ 0.000833% per ledger
    sBTC: 0.005% / 12 ledgers ≈ 0.000417% per ledger

current_price(ledger) = start_price * (1 - decay_rate * (ledger - start_ledger))

floor:
    XLM:  85% of market value
    sBTC: 90% of market value

Auction duration:
    XLM:  30 minutes = ~360 ledgers
    sBTC: 60 minutes = ~720 ledgers

Settlement:
    USDC from winner → repay debt → surplus to borrower
    collateral → winner
    trigger fee (0.1%) already paid at auction start
```

---

## Data Flow: Full Liquidation Cycle

```
T=0s   Agent scans positions (Soroban RPC)
T=1s   Detects position HF < 1.0
T=1s   Fetches 30min TWAP from Horizon API
T=1.2s Generates HealthFactorProof (snarkjs, ~200ms)
T=1.4s Generates PriceAttestationProof (snarkjs, ~200ms)
T=1.6s Calls start_auction() with both proofs
T=1.7s Soroban simulates tx, assembles with footprint
T=2s   Agent signs + submits tx
T=7s   Tx lands in Stellar ledger (~5s)
T=7s   AuctionStarted event emitted on-chain
T=7s   Agent receives 0.1% trigger fee (atomic)
T=7s   Bidder agent detects AuctionStarted event
T=8s   Bidder evaluates current auction price
T=8.2s Bidder generates AuctionPriceProof
T=8.4s Bidder calls bid() if discount attractive
T=13s  Bid tx lands in ledger
T=13s  Collateral → bidder, debt repaid, surplus → borrower
T=13s  Auction settled

Total cycle: ~13 seconds from detection to settlement
```

---

## Frontend Component Tree

```
App
├── WalletConnect (Freighter)
├── NetworkStatus (testnet indicator, current ledger)
├── VaultDashboard
│   ├── PoolStats (TVL, utilization, borrow rate, reserve)
│   ├── DepositPanel (deposit USDC → receive vUSDC)
│   └── BorrowPanel (deposit collateral → borrow USDC)
├── PositionList
│   ├── PositionCard (per position: HF meter, collateral, debt)
│   └── AtRiskBanner (warning if HF < 1.1)
├── AuctionPanel
│   ├── ActiveAuctions (list with live countdown + price)
│   ├── AuctionPriceChart (Dutch decay curve)
│   └── BidButton (manual bid for human players)
└── AgentFeed
    ├── AgentStatus (online/offline, heartbeat)
    ├── ActionLog (real-time action model events)
    └── EarningsTracker (trigger fees received, total earned)
```

---

## Tech Stack Summary

| Layer            | Technology                                   | Notes                                      |
| ---------------- | -------------------------------------------- | ------------------------------------------ |
| Smart Contracts  | Rust + soroban-sdk 23.4.1                    | Vault, vUSDC, ZK Verifier                  |
| ZK Circuits      | circom 2.1 + snarkjs                         | 3 circuits: HF, PA, AP                     |
| ZK Verification  | Soroban BN254 host functions (Protocol 25)   | Groth16 on-chain                           |
| Agent Runtime    | TypeScript + Node.js                         | Action model scheduler                     |
| Chain Interface  | @stellar/stellar-sdk 14.4.3                  | Soroban RPC + Horizon                      |
| Price Data       | Horizon trade aggregations                   | 30min TWAP, multi-asset                    |
| Payment Layer    | x402 (atomic on-chain) + HTTP x402 (stretch) | Built-on-Stellar facilitator               |
| Frontend         | Next.js 15 + TypeScript + Tailwind CSS       | App Router, SSR-safe, responsive dashboard |
| Wallet           | Freighter browser extension                  | Soroban auth-entry signing                 |
| Testnet Explorer | stellar.expert/explorer/testnet              | StellarExpert                              |
