# LiquidMind — Implementation Plan

Last updated: April 2026  
Timeline: 13 days  
Network: Stellar Testnet

---

## Guiding Principles

1. **Contract first.** Everything depends on the Vault contract. Build and test
   it before touching agent or frontend.
2. **One integration at a time.** Agent wires to contract, then ZK proofs wire
   to agent, then frontend wires to both. Never build in parallel across
   integration boundaries.
3. **Mock ZK proofs early.** Use a bypass flag during contract dev to skip proof
   verification. Plug in real proofs at Phase 3.
4. **Testnet USDC from day one.** Use the real USDC SAC on testnet — don't
   simulate with a dummy token.
5. **Demo-able at every phase.** Each phase ends with something you can show on
   screen.

---

## Phase 0 — Project Scaffold (Day 1)

### Goals

- Repo structure created
- Dev toolchain installed and verified
- Stellar testnet access confirmed
- USDC testnet contract ID captured

### Tasks

- [ ] **0.1** Initialize project directory structure

  ```
  argent/
  ├── contracts/
  │   ├── vault/          (Rust, Soroban)
  │   ├── vusdc/          (Rust, Soroban, SEP-41 token)
  │   └── zk-verifier/   (Rust, Soroban, thin Groth16 wrapper)
  ├── circuits/
  │   ├── health_factor/  (circom)
  │   ├── price_attestation/ (circom)
  │   └── auction_price/ (circom)
  ├── agent/              (TypeScript)
  ├── frontend/           (Next.js 15, App Router)
  ├── scripts/            (deployment, test helpers)
  └── docs/               (this file + supporting docs)
  ```

- [ ] **0.2** Install Rust toolchain + Soroban CLI

  ```bash
  rustup target add wasm32-unknown-unknown
  cargo install --locked stellar-cli --features opt
  stellar network add --global testnet \
    --rpc-url https://soroban-testnet.stellar.org \
    --network-passphrase "Test SDF Network ; September 2015"
  ```

- [ ] **0.3** Create and fund testnet accounts (agent, admin, test users)

  ```bash
  stellar keys generate agent --global
  stellar keys generate admin --global
  # Fund via friendbot
  curl "https://friendbot-testnet.stellar.org/?addr=$(stellar keys address agent)"
  ```

- [ ] **0.4** Install Node.js toolchain

  ```bash
  pnpm init (in agent/ and frontend/)
  pnpm add @stellar/stellar-sdk snarkjs circomlibjs typescript tsx
  ```

- [ ] **0.5** Install circom + snarkjs globally

  ```bash
  npm install -g circom snarkjs
  ```

- [ ] **0.6** Capture testnet USDC contract ID
  - Search StellarExpert testnet for USDC issuer
  - Record: `USDC_TESTNET_CONTRACT=G...`
  - Verify via `stellar contract invoke` that SAC exists

- [ ] **0.7** Set up `scripts/deploy.sh` skeleton

**Phase 0 Deliverable:** `stellar contract --help` works, testnet accounts
funded, USDC contract ID confirmed.

---

## Phase 1 — Vault Contract (Days 2–5)

### Goals

- Full Vault contract deployed on testnet
- All core functions working via CLI
- Interest accrual correct
- Dutch auction lifecycle complete
- ZK proofs bypassed with a dev flag

### Sub-phases

#### 1A — Data Structures + Storage (Day 2)

- [ ] **1A.1** `Cargo.toml` for vault with correct soroban-sdk version (23.4.1)
- [ ] **1A.2** Define all storage keys as enum
  ```rust
  #[derive(Clone)]
  #[contracttype]
  pub enum DataKey {
      Admin, Usdc, Vusdc, HfVerifier,
      TotalDeposits, TotalBorrows,
      DepositIndex, BorrowIndex, LastAccrualLedger,
      ReserveFund, CircuitBreaker,
      Position(u64),
      Auction(u64),
      HfVk, PaVk, ApVk,
      AgentHeartbeat,
      PositionCount,
  }
  ```
- [ ] **1A.3** Define `Position`, `Auction`, `CollateralConfig` structs with
      `#[contracttype]`
- [ ] **1A.4** Write `initialize()` function with admin check
- [ ] **1A.5** Write storage helpers (get/set with TTL bumps for Persistent
      entries)

#### 1B — Lender Functions (Day 2-3)

- [ ] **1B.1** `deposit(user, amount)`:
  - `user.require_auth()`
  - Accrue interest first
  - Transfer USDC from user to contract
  - Mint vUSDC proportional to current index
  - Update `TOTAL_DEPOSITS`

- [ ] **1B.2** `withdraw(user, amount)`:
  - `user.require_auth()`
  - Accrue interest first
  - Check available liquidity (total_deposits - total_borrows)
  - Burn vUSDC
  - Transfer USDC to user

- [ ] **1B.3** `accrue_interest()` internal function:
  ```rust
  fn accrue_interest(env: &Env) {
      let delta = env.ledger().sequence() - last_accrual_ledger;
      if delta == 0 { return; }
      let util = total_borrows * SCALE / total_deposits;
      let rate = compute_rate(util);
      let new_borrow_index = borrow_index * (SCALE + rate * delta) / SCALE;
      let interest_earned = total_borrows * (new_borrow_index - borrow_index) / SCALE;
      let reserve_cut = interest_earned / 10;
      reserve_fund += reserve_cut;
      deposit_index += (interest_earned - reserve_cut) * SCALE / total_deposits;
      borrow_index = new_borrow_index;
      last_accrual_ledger = current_ledger;
  }
  ```

#### 1C — Borrower Functions (Day 3)

- [ ] **1C.1** `deposit_collateral(user, asset, amount)`:
  - Transfer XLM or sBTC from user
  - Create or update Position struct
  - Store collateral_amount, collateral_asset

- [ ] **1C.2** `borrow(user, usdc_amount)`:
  - Accrue interest
  - Compute max borrow: `collateral_value * max_ltv / SCALE`
  - Check user not exceeding LTV
  - Update debt, borrow_index_at_open
  - Transfer USDC to user
  - Update TOTAL_BORROWS

- [ ] **1C.3** `repay(user, amount)`:
  - Accrue interest
  - Compute current debt (principal × index ratio)
  - Accept partial or full repayment
  - Update position
  - Transfer USDC from user to contract

- [ ] **1C.4** `withdraw_collateral(user, amount)`:
  - Check health factor after withdrawal still >= 1.0
  - Transfer collateral to user

- [ ] **1C.5** `health_factor(position_id)` view function:
  ```rust
  // Returns i128 scaled to 7dp (1.0 = 10_000_000)
  let col_val = collateral_amount * price / SCALE;
  let debt_val = debt_principal * borrow_index / borrow_index_at_open;
  (col_val * liq_threshold) / debt_val
  ```

#### 1D — Auction Lifecycle (Days 3-4)

- [ ] **1D.1** `start_auction(position_id, hf_proof, pa_proof)`:
  - Fetch position, verify it exists and has no active auction
  - **DEV MODE**: skip proof verification (flag in Instance storage)
  - Create Auction struct: start_price, floor_price, decay_rate, start_ledger
  - Set position.auction_state = Active
  - Pay trigger fee to caller (0.1% of collateral value)
  - Emit `AuctionStarted` event
  - Update `PositionCount` counter for escalation tracking

- [ ] **1D.2** `current_auction_price(auction_id)` view:

  ```rust
  let elapsed = current_ledger - auction.started_at_ledger;
  let discount = decay_rate_per_ledger * elapsed;
  let price = start_price * (SCALE - discount) / SCALE;
  price.max(floor_price)
  ```

- [ ] **1D.3** `bid(auction_id, bid_amount, ap_proof)`:
  - Fetch auction, check it's Active
  - Check bid_amount >= current_auction_price
  - **DEV MODE**: skip AP proof verification
  - Transfer USDC from bidder to contract
  - Transfer collateral from contract to bidder
  - Repay debt from USDC received
  - Send surplus USDC to borrower
  - Mark auction Settled
  - Emit `AuctionSettled` event

- [ ] **1D.4** `fallback_liquidate(position_id)`:
  - Check auction expired (elapsed > max_duration)
  - Execute Stellar DEX path payment to sell collateral
  - Repay debt, distribute surplus
  - Escalated trigger fee (0.5%) if re-triggered

- [ ] **1D.5** Escalating commissions logic:
  ```rust
  fn trigger_fee_bps(ledgers_liquidatable: u32) -> i128 {
      match ledgers_liquidatable {
          0..=120    => 10,   // 0.1% (0-10 min)
          121..=360  => 20,   // 0.2% (10-30 min)
          361..=720  => 50,   // 0.5% (30-60 min)
          _          => 50,   // circuit breaker fires separately
      }
  }
  ```

#### 1E — Circuit Breaker + Heartbeat (Day 4)

- [ ] **1E.1** `heartbeat(agent)`:
  - Store current ledger in Temporary storage (5 min TTL)
  - Emit HeartbeatPublished event

- [ ] **1E.2** Circuit breaker check (called at top of `borrow()`):

  ```rust
  fn check_circuit_breaker(env: &Env) {
      // If any position has been liquidatable for 60+ minutes
      // (tracked via position.became_liquidatable_at_ledger)
      // set CIRCUIT_BREAKER = true
      // emit CircuitBreakerTripped event
  }
  ```

- [ ] **1E.3** Reserve fund management:
  - Auto-fill from interest accrual (10%)
  - Auto-fill from trigger fees (10%)
  - Target: 5% of total deposits

#### 1F — Testing (Day 5)

- [ ] **1F.1** Unit tests for interest rate computation (boundary cases: 0%,
      80%, 99% util)
- [ ] **1F.2** Unit tests for health factor (healthy, exactly at threshold,
      below threshold)
- [ ] **1F.3** Integration test: deposit → borrow → accrue interest → health <
      1.0 → trigger → bid → settle
- [ ] **1F.4** Test escalating fees trigger at correct ledger counts
- [ ] **1F.5** Deploy to testnet:
      `stellar contract deploy --wasm target/wasm32.../vault.wasm`
- [ ] **1F.6** CLI smoke test: call every function at least once via
      `stellar contract invoke`

**Phase 1 Deliverable:** Vault contract deployed on testnet. Full cycle works
via CLI. No ZK yet.

---

## Phase 2 — Agent: Action Model + Chain Wiring (Days 5–7)

### Goals

- Agent runs continuously
- Scans positions, detects unsafe ones
- Triggers auctions (with mock proofs)
- Bids on auctions
- Heartbeat maintained

### Tasks

- [ ] **2.1** `agent/src/chain/soroban.ts` — Soroban RPC client wrapper:
  - `invokeContract(fn, params, keypair)` — simulate + submit + poll
  - `getContractData(key)` — read storage
  - `pollEvents(contractId, startLedger)` — event listener

- [ ] **2.2** `agent/src/chain/horizon.ts` — Horizon API wrapper:
  - `computeTWAP(asset, counterAsset, windowMs)` — fetch trades, compute
    weighted avg
  - `getAccountBalance(address, asset)` — check agent USDC balance

- [ ] **2.3** `agent/src/chain/vault.ts` — typed Vault contract interface:
  - Wrap every contract function with typed inputs/outputs
  - Parse event data from XDR

- [ ] **2.4** `agent/src/actions/monitor.ts` — all monitor actions:
  - `scan_positions` — call `vault.getPositions(cursor, limit)`
  - `fetch_prices` — call horizon.computeTWAP for each collateral asset
  - `compute_health_factors` — pure math, off-chain
  - `generate_zk_proofs` — **stub**: returns mock proof bytes for now
  - `start_auction` — call vault.startAuction with mock proofs
  - `heartbeat` — call vault.heartbeat

- [ ] **2.5** `agent/src/actions/bidder.ts` — all bidder actions:
  - `watch_auctions` — poll vault.getActiveAuctions
  - `evaluate_bids` — compute profit margin
  - `generate_ap_proof` — **stub**: returns mock proof bytes
  - `submit_bid` — call vault.bid with mock proof

- [ ] **2.6** `agent/src/scheduler.ts` — action model loop:

  ```typescript
  while (true) {
  	const state = await observeWorld()
  	const eligible = [...MONITOR_ACTIONS, ...BIDDER_ACTIONS]
  		.filter((a) => a.preconditions(state))
  		.sort((a, b) => b.priority - a.priority)
  	if (eligible[0]) await eligible[0].execute(state)
  	await sleep(LOOP_INTERVAL)
  }
  ```

- [ ] **2.7** `agent/src/index.ts` — entry point with config loading

- [ ] **2.8** Test: start agent, manually trigger a position via CLI, watch
      agent detect + trigger

**Phase 2 Deliverable:** Agent runs, detects unsafe positions, triggers auctions
autonomously (mock proofs). Visible in terminal logs.

---

## Phase 3 — ZK Circuits (Days 7–9)

### Goals

- HealthFactorProof circuit compiled + trusted setup done
- Agent generates real proofs
- Vault contract verifies real proofs
- Remove DEV_MODE bypass flag

### Tasks

#### 3A — HealthFactor Circuit

- [ ] **3A.1** `circuits/health_factor/health_factor.circom`:
  - Inputs: `collateral_value`, `debt_value` (private), `liq_threshold`, `scale`
    (public)
  - Output: `is_liquidatable` (public)
  - Use circomlib `LessThan(128)` comparator
  - Constraint: `collateral_value * liq_threshold < debt_value * scale`

- [ ] **3A.2** Compile: `circom health_factor.circom --r1cs --wasm --sym`
- [ ] **3A.3** Download pot12_final.ptau (public Ethereum ceremony artifacts)
- [ ] **3A.4** Trusted setup:
      `snarkjs groth16 setup ... && snarkjs zkey contribute ...`
- [ ] **3A.5** Export verification key:
      `snarkjs zkey export verificationkey hf_final.zkey hf_vk.json`
- [ ] **3A.6** Test proof generation in Node.js
- [ ] **3A.7** Convert `hf_vk.json` → `Bytes` format for Soroban storage

#### 3B — ZK Verifier Contract

- [ ] **3B.1** `contracts/zk-verifier/src/lib.rs`:
  - Wrap Soroban's BN254 host functions
  - Parse proof bytes (π_A as G1, π_B as G2, π_C as G1)
  - Call `env.crypto().groth16_verify(...)` (exact API from Protocol 25 release
    notes)
  - Return bool

- [ ] **3B.2** Deploy ZK Verifier contract to testnet
- [ ] **3B.3** Initialize Vault with ZK Verifier address
- [ ] **3B.4** Upload HF verification key to Vault via `set_verification_keys()`

#### 3C — Wire Agent Proof Generation

- [ ] **3C.1** `agent/src/proofs/health_factor.ts`:

  ```typescript
  async function generateHFProof(
  	position: Position,
  	price: number,
  ): Promise<Bytes> {
  	const input = {
  		collateral_value: (position.collateral_amount * price).toString(),
  		debt_value: position.currentDebt.toString(),
  		liq_threshold: LIQ_THRESHOLDS[position.asset].toString(),
  		scale: "10000000",
  	}
  	const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  		input,
  		HF_WASM_PATH,
  		HF_ZKEY_PATH,
  	)
  	return encodeProofForSoroban(proof, publicSignals)
  }
  ```

- [ ] **3C.2** `agent/src/proofs/encoding.ts`:
  - Convert snarkjs proof JSON → Soroban `Bytes` (concatenated G1+G2+G1 points)
  - Handle BN254 big-endian encoding

- [ ] **3C.3** Replace mock proofs in monitor actions with real proof generation
- [ ] **3C.4** Remove DEV_MODE bypass in Vault contract

- [ ] **3C.5** End-to-end test: agent generates proof → submits → Vault verifies
      → auction starts

#### 3D — PriceAttestation Circuit (if time permits — strong addition)

- [ ] **3D.1** `circuits/price_attestation/price_attestation.circom`:
  - Inputs: array of (price, weight) pairs (private), ledger_start, ledger_end
    (public)
  - Output: twap_price (public)
  - Constraint: correct weighted sum computation

- [ ] **3D.2** Compile + trusted setup
- [ ] **3D.3** Wire to agent's `fetch_prices` action
- [ ] **3D.4** Wire to vault's `start_auction` verification

**Phase 3 Deliverable:** Real ZK proofs flow end-to-end. Auction triggers are
cryptographically verified.

---

## Phase 4 — Frontend (Days 9–11)

### Goals

- Next.js 15 App Router dashboard showing all protocol state live
- Freighter wallet integration (client-side only, SSR-safe)
- Human can deposit, borrow, bid manually
- Agent activity feed visible

### Tasks

- [ ] **4.1**
      `pnpm create next-app frontend -- --typescript --tailwind --app --src-dir --import-alias "@/*"`
- [ ] **4.2** Configure Tailwind — already included by create-next-app; verify
      `tailwind.config.ts` content paths
- [ ] **4.3** Add `'use client'` directive to all components that use browser
      APIs (Freighter, snarkjs, event listeners) — Next.js App Router runs on
      the server by default; Soroban SDK and Freighter are client-only
- [ ] **4.4** Wrap Freighter and Soroban RPC calls in
      `dynamic(() => import(...), { ssr: false })` to prevent SSR hydration
      errors

- [ ] **4.5** `frontend/src/lib/soroban.ts` — read-only contract calls via
      @stellar/stellar-sdk (client-only)
- [ ] **4.6** `frontend/src/lib/freighter.ts` — wallet connection, signing
      (client-only, `'use client'`)
- [ ] **4.7** `frontend/src/hooks/useVault.ts` — pool stats, positions, auctions
      (polling every 5s)
- [ ] **4.8** `frontend/src/hooks/useAgent.ts` — agent status from heartbeat +
      events

- [ ] **4.9** Route structure (`src/app/`):

  ```
  app/
  ├── page.tsx              → root redirect to /dashboard
  ├── dashboard/
  │   └── page.tsx          → VaultDashboard
  ├── positions/
  │   └── page.tsx          → PositionList
  ├── auctions/
  │   └── page.tsx          → AuctionPanel
  └── agent/
      └── page.tsx          → AgentFeed
  ```

- [ ] **4.10** `VaultDashboard` component (`'use client'`):
  - Pool stats card (TVL, util%, borrow rate, reserve)
  - Deposit panel (amount input → sign with Freighter → submit)
  - Borrow panel (collateral amount → borrow amount → LTV preview)

- [ ] **4.11** `PositionList` component (`'use client'`):
  - Per-position card with health factor progress bar
  - Color: green (>1.3), yellow (1.0-1.3), red (<1.0)
  - Countdown if in auction

- [ ] **4.12** `AuctionPanel` component (`'use client'`):
  - Active auctions list
  - Current price with live countdown (per-ledger decay)
  - Bid button (human can compete with agent)

- [ ] **4.13** `AgentFeed` component (`'use client'`):
  - Pull events from contract (AuctionStarted, AuctionSettled, Heartbeat)
  - Render as activity feed with timestamps
  - Show "Agent online" / "Agent offline" based on heartbeat age

- [ ] **4.14** Deploy: `next build` + static export (`output: 'export'` in
      next.config.ts) for demo hosting, or run `next start` locally

**Phase 4 Deliverable:** Full dashboard. Demo-able in browser. Agent activity
visible in real time.

---

## Phase 5 — Integration + Demo Polish (Days 11–13)

### Goals

- Full end-to-end demo works cleanly
- Demo script rehearsed
- Edge cases handled

### Tasks

- [ ] **5.1** Demo scenario script:
  1. Show empty pool
  2. Deposit 1000 USDC as lender
  3. Deposit 1000 XLM as borrower collateral
  4. Borrow 640 USDC (64% LTV)
  5. Show health factor: safe
  6. Trigger oracle price drop (admin sets low price or use a mock oracle)
  7. Watch HF drop below 1.0 on frontend
  8. Agent detects, generates proofs (show proof generation logs)
  9. Auction starts — show on frontend
  10. Auction price decays — show countdown
  11. Bidder agent submits bid
  12. Auction settles: collateral → bidder, debt repaid, surplus → borrower
  13. Show agent earnings panel

- [ ] **5.2** Oracle mock for demo: admin function to override price temporarily
- [ ] **5.3** Error handling in agent: retry logic for failed transactions
- [ ] **5.4** Persistent storage TTL keeper: script to bump TTLs regularly
- [ ] **5.5** Load test: create 10 positions, trigger them all at once
- [ ] **5.6** README.md with setup + demo instructions
- [ ] **5.7** Record demo video (backup if live demo has issues)

---

## Stretch Goals (only if ahead of schedule)

| Feature                     | Effort | Impact                           |
| --------------------------- | ------ | -------------------------------- |
| PriceAttestation ZK proof   | Medium | High — completes ZK story        |
| AuctionPrice ZK proof       | Medium | Medium — completes auction story |
| x402 HTTP layer integration | High   | High — completes payment story   |
| BlindBidProof (sealed bids) | High   | Medium — novel feature           |
| Multi-source oracle median  | Medium | Medium — robustness              |
| sBTC collateral support     | Low    | Low — just config                |

---

## Risk Register

| Risk                                                          | Likelihood | Mitigation                                                      |
| ------------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| Soroban BN254 host API not matching expected signature        | Medium     | Research exact Protocol 25 API before writing verifier contract |
| circom circuit too large for pot12 (>4096 constraints)        | Low        | Profile constraint count early; upgrade to pot15 if needed      |
| TWAP computation has insufficient testnet liquidity data      | High       | Use mock price from Soroban storage as fallback oracle          |
| snarkjs proof encoding incompatible with Soroban Bytes format | Medium     | Build encoding test first, before full integration              |
| Persistent storage rent expires during demo                   | Medium     | Add TTL bumper script, run before demo                          |
| Freighter wallet not signing Soroban auth entries correctly   | Low        | Test Freighter integration on day 9, have backup CLI signing    |

---

## Daily Schedule

| Day | Focus                    | Target                               |
| --- | ------------------------ | ------------------------------------ |
| 1   | Phase 0 scaffold         | Toolchain + testnet accounts ready   |
| 2   | Phase 1A-1B              | Storage + lender functions           |
| 3   | Phase 1C-1D              | Borrower + auction lifecycle         |
| 4   | Phase 1D-1E              | Auction finish + circuit breaker     |
| 5   | Phase 1F + Phase 2 start | Tests pass, agent scaffold           |
| 6   | Phase 2                  | Full agent action model              |
| 7   | Phase 2 finish           | Agent triggers auctions autonomously |
| 8   | Phase 3A-3B              | HF circuit + ZK verifier contract    |
| 9   | Phase 3C                 | Real proofs flowing end-to-end       |
| 10  | Phase 4                  | Frontend scaffold + vault dashboard  |
| 11  | Phase 4                  | Auction panel + agent feed           |
| 12  | Phase 5                  | Demo script + polish                 |
| 13  | Phase 5                  | Buffer / stretch goals / submission  |
