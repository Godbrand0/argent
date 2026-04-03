# LiquidMind — Research Findings

Last updated: April 2026  
Status: Compiled from deep research across Stellar ecosystem, ZK tooling, and
agent frameworks

---

## 1. Soroban Smart Contracts (Rust)

### SDK Version

- **soroban-sdk**: `23.4.1` (latest stable, Jan 2026) — use this for all
  contracts
- Pre-release `25.0.0-rc` exists but not stable yet
- Key crates: `soroban-sdk`, `soroban-token-sdk`, `soroban-fixed-point-math`

### Contract Structure Pattern

```rust
#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    pub fn deposit(env: Env, user: Address, amount: i128) { ... }
    pub fn borrow(env: Env, user: Address, amount: i128) { ... }
    pub fn start_auction(env: Env, position_id: u64, hf_proof: Bytes, price_proof: Bytes) { ... }
    pub fn bid(env: Env, auction_id: u64, bid_amount: i128, price_proof: Bytes) { ... }
}
```

### Storage Types — When to Use Each

| Type       | TTL                  | Use For                                   | Notes                                              |
| ---------- | -------------------- | ----------------------------------------- | -------------------------------------------------- |
| Instance   | Contract lifetime    | Admin config, pool totals, interest index | Limited to ~100KB                                  |
| Persistent | Rentable, archivable | User positions, balances, auctions        | Must pay rent; max TTL ~535,679 ledgers (~30 days) |
| Temporary  | Deleted on expiry    | Price cache, short auth                   | NOT recoverable after expiry                       |

**Critical:** All Persistent data must have TTL extended regularly. Build a
keeper job for this.

### SEP-41 Token Interface (for USDC, vUSDC)

```rust
// Key functions to implement/call:
fn transfer(env: Env, from: Address, to: Address, amount: i128)
fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128)
fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32)
fn balance(env: Env, id: Address) -> i128
fn mint(env: Env, to: Address, amount: i128)  // custom, not in SEP-41
fn burn(env: Env, from: Address, amount: i128)
```

USDC on Stellar is a Stellar Asset Contract (SAC) — wrap it via
`token::Client::new(&env, &usdc_contract_id)`.

### Authorization Patterns

- Direct caller → contract: automatic, no extra setup
- Contract → token contract (transfer on behalf of user): user must call
  `approve()` first
- Contract → contract (multi-hop): use `authorize_as_curr_contract` for deeper
  nesting
- Always call `user.require_auth()` at the start of state-changing functions

### Fixed-Point Math

```rust
// All monetary values in i128 with 7 decimal places (Stellar standard)
// USDC: 7 decimals → 1 USDC = 10_000_000
// Interest rates stored as scaled integers (5% APR = 500_0000 at 7dp)
use soroban_fixed_point_math::SorobanFixedPoint;

// Health factor: scale everything to avoid division
// HF = (collateral_value * liq_threshold) / debt_value
// In i128: (col_val * liq_threshold_scaled) / SCALE
```

### Events System

```rust
// Emit events for all state changes
env.events().publish(
    (Symbol::new(&env, "AuctionStarted"), position_id),
    (collateral_amount, debt_amount, start_price)
);
```

Topics: up to 4, max 32 bytes each. Data: any XDR-serializable value.

---

## 2. BN254 & ZK on Soroban (X-Ray / Protocol 25)

### What Shipped in Protocol 25 (X-Ray)

- **CAP-0074**: Native BN254 elliptic curve host functions
  - G1 point addition (`g1_add`)
  - Scalar multiplication
  - Multi-pairing check for Groth16 verification
- **CAP-0075**: Native Poseidon and Poseidon2 hash permutations
  - Operates on BN254 Fr scalar field
  - Much cheaper than SHA-256 inside ZK circuits

### Groth16 Verification on Soroban

- Boundless deployed Groth16 verifier on Soroban with Nethermind + RISC Zero
- Stellar shipped open-source "private payments" prototype using Groth16
- Full verification via a single `groth16_verify` host function call

**Proof format (Groth16 on BN254):**

- `π_A` — G1 point (64 bytes uncompressed)
- `π_B` — G2 point (128 bytes uncompressed)
- `π_C` — G1 point (64 bytes uncompressed)
- Total proof: **256 bytes uncompressed**, 128 bytes compressed
- Public inputs: 32 bytes each

**Verification key** (stored in contract):

- `alpha_g1` — G1 point
- `beta_g2` — G2 point
- `gamma_g2` — G2 point
- `delta_g2` — G2 point
- `gamma_abc_g1` — array of G1 points (one per public input + 1)

### BN254 Field Parameters

```
Field prime p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
Curve order r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
Curve: Y² = X³ + 3 (mod p)
```

---

## 3. circom + snarkjs — ZK Proof Pipeline

### Toolchain

- **circom** — DSL for writing arithmetic circuits
- **snarkjs** — JS library for trusted setup, proof generation, verification
- **circomlib** — standard library of circuit components (comparators, hashes,
  etc.)

### Full Workflow

```bash
# 1. Compile circuit
circom health_factor.circom --r1cs --wasm --sym --output ./build

# 2. Powers of Tau (Phase 1) — reusable, download from Ethereum ceremony
# For hackathon: pot12 is sufficient (2^12 = 4096 constraints max)
snarkjs powersoftau new bn128 12 pot12_0000.ptau
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="LiquidMind"
snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau

# 3. Circuit-specific setup (Phase 2)
snarkjs groth16 setup health_factor.r1cs pot12_final.ptau hf_0000.zkey
snarkjs zkey contribute hf_0000.zkey hf_final.zkey --name="LiquidMind"
snarkjs zkey export verificationkey hf_final.zkey hf_vkey.json

# 4. Generate proof (TypeScript runtime)
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  { collateral_value, debt_value, threshold },
  "./build/health_factor.wasm",
  "./circuits/hf_final.zkey"
);

# 5. Verify on-chain (Soroban)
# Contract calls groth16_verify host function with π_A, π_B, π_C, public_inputs, vk
```

### Health Factor Circuit Design

```circom
pragma circom 2.1.0;
include "circomlib/circuits/comparators.circom";

// Proves: (collateral_value * liquidation_threshold) < (debt_value * SCALE)
// i.e., health factor < 1.0 → position is liquidatable
template HealthFactorCircuit() {
    // Private inputs
    signal input collateral_value;   // collateral in USD (7dp scaled)
    signal input debt_value;          // debt in USD (7dp scaled)

    // Public inputs (verifier knows these)
    signal input liq_threshold;       // e.g., 7500000 = 75% at 7dp
    signal input scale;               // 10_000_000 (7dp denominator)

    // Output (public)
    signal output is_liquidatable;    // 1 = unsafe, 0 = safe

    // Compute: lhs = collateral * liq_threshold, rhs = debt * scale
    signal lhs <== collateral_value * liq_threshold;
    signal rhs <== debt_value * scale;

    // Check lhs < rhs → position unsafe
    component lt = LessThan(128);
    lt.in[0] <== lhs;
    lt.in[1] <== rhs;
    is_liquidatable <== lt.out;
}

component main { public [liq_threshold, scale] } = HealthFactorCircuit();
```

### Price Attestation Circuit Design

```circom
// Proves: TWAP was correctly computed from Stellar DEX trade data
// Inputs: array of (price, time_weight) pairs
// Output: twap_price (public), ledger_range_hash (public)
// Key insight: verifier checks twap_price is within acceptable range
template PriceTWAP(N) {
    signal input prices[N];        // private: individual trade prices
    signal input weights[N];       // private: time weights for each trade
    signal input total_weight;     // private: sum of weights
    signal input ledger_start;     // public: which ledgers were covered
    signal input ledger_end;       // public
    signal output twap_price;      // public: the computed TWAP

    // Compute weighted sum
    signal weighted_sum;
    // ... (accumulator pattern in circom)

    twap_price <== weighted_sum / total_weight;  // via intermediate signal
}
```

### Hackathon Trusted Setup Note

- Download public Powers of Tau from Ethereum ceremony (pot12_final.ptau)
- Single contributor acceptable for testnet/hackathon
- Document clearly: "This uses a dev trusted setup — not for mainnet"

---

## 4. Stellar JavaScript SDK & Agent Runtime

### Packages

```json
{
	"@stellar/stellar-sdk": "^14.4.3",
	"snarkjs": "^0.7.x",
	"typescript": "^5.x"
}
```

### Key Classes

```typescript
import {
	rpc,
	Horizon,
	Networks,
	TransactionBuilder,
	Operation,
	Asset,
	Keypair,
	nativeToScVal,
} from "@stellar/stellar-sdk"

// Two servers: Horizon (classic) + Soroban RPC
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org")
const soroban = new rpc.Server("https://soroban-testnet.stellar.org")
```

### Network Endpoints (Testnet)

| Service            | URL                                       |
| ------------------ | ----------------------------------------- |
| Horizon API        | `https://horizon-testnet.stellar.org`     |
| Soroban RPC        | `https://soroban-testnet.stellar.org`     |
| Friendbot          | `https://friendbot-testnet.stellar.org`   |
| Explorer           | `https://stellar.expert/explorer/testnet` |
| Network passphrase | `"Test SDF Network ; September 2015"`     |

### Submitting a Soroban Transaction

```typescript
async function invokeContract(
	fn: string,
	params: xdr.ScVal[],
	keypair: Keypair,
) {
	const account = await soroban.getAccount(keypair.publicKey())

	const tx = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase: Networks.TESTNET,
	})
		.addOperation(
			Operation.invokeContractFunction({
				contract: CONTRACT_ID,
				function: fn,
				args: params,
			}),
		)
		.setTimeout(30)
		.build()

	// Simulate to get resource footprint
	const simResult = await soroban.simulateTransaction(tx)
	if (rpc.Api.isSimulationError(simResult)) throw new Error(simResult.error)

	const prepared = rpc.assembleTransaction(tx, simResult).build()
	prepared.sign(keypair)

	const sendResult = await soroban.sendTransaction(prepared)

	// Poll for completion
	let getResult = await soroban.getTransaction(sendResult.hash)
	while (getResult.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
		await sleep(1000)
		getResult = await soroban.getTransaction(sendResult.hash)
	}

	return getResult
}
```

### Polling Contract Events

```typescript
async function pollEvents(contractId: string, startLedger: number) {
	const result = await soroban.getEvents({
		startLedger,
		filters: [
			{
				type: "contract",
				contractIds: [contractId],
			},
		],
		pagination: { limit: 1000 },
	})
	return result.events
}
```

### TWAP Computation

```typescript
async function compute30MinTWAP(base: Asset, counter: Asset): Promise<number> {
	const trades = await horizon
		.trades()
		.forAssetPair(base, counter)
		.limit(200)
		.call()

	const cutoff = Date.now() - 30 * 60 * 1000
	const recent = trades.records.filter(
		(t) => new Date(t.created_at).getTime() > cutoff,
	)

	if (recent.length < 2) throw new Error("Insufficient trade data for TWAP")

	let weightedSum = 0,
		totalTime = 0
	for (let i = 0; i < recent.length - 1; i++) {
		const price = parseFloat(recent[i].price)
		const dt =
			new Date(recent[i + 1].created_at).getTime() -
			new Date(recent[i].created_at).getTime()
		weightedSum += price * dt
		totalTime += dt
	}

	return weightedSum / totalTime
}
```

---

## 5. x402 Payment Protocol

### What x402 Is

x402 is Coinbase's open specification for machine-to-machine HTTP payments using
the HTTP 402 "Payment Required" status code.

- **Core repo**: github.com/coinbase/x402
- **Spec**: github.com/coinbase/x402/blob/main/specs/x402-specification.md
- **Official site**: x402.org

Standard HTTP flow:

```
Client → Server: GET /resource
Server → Client: 402 + {price, network, facilitator_url, payment_address}
Client evaluates cost → signs payment payload
Client → Server: GET /resource + PAYMENT-SIGNATURE header
Server → Facilitator: POST /verify (verify signature + params)
Facilitator → Blockchain: settles payment (~5s on Stellar)
Server → Client: 200 OK + resource
```

### x402 on Stellar — Official Support

Stellar is an official x402 settlement layer:

- **Docs**: developers.stellar.org/docs/build/apps/x402
- **Stellar blog**: stellar.org/blog/foundation-news/x402-on-stellar
- **Built-on-Stellar Facilitator**: Production-ready, OpenZeppelin-powered, no
  setup required
- **Facilitator docs**:
  developers.stellar.org/docs/build/apps/x402/built-on-stellar

x402 on Stellar works via **Soroban authorization entries**:

- Client signs a Soroban auth entry (not a full transaction)
- Facilitator's /verify endpoint checks the signature
- Facilitator's /settle endpoint executes the on-chain USDC transfer
- Settlement: ~5 seconds, ~$0.00001 fee

### Key npm Packages

```json
"x402": "npm core package",
"@x402/core": "transport-agnostic client/server/facilitator components",
"x402-flash-stellar-sdk": "Stellar-specific SDK for x402 micropayments on Soroban"
```

### The Facilitator Pattern

The facilitator is a bridge between HTTP and blockchain:

- Does NOT custody funds — only broadcasts client-signed transactions
- Manages nonce tracking to prevent replay attacks
- `POST /verify` — verify payment signature
- `POST /settle` — execute on-chain settlement
- Can use Built-on-Stellar public facilitator (no self-hosting needed for
  hackathon)

### LiquidMind's Hybrid Architecture

x402 fundamentally requires HTTP — it cannot be purely on-chain. LiquidMind uses
a **hybrid approach**:

**Layer 1: HTTP x402 (payment attribution)**

- Monitor agent's action model calls the protocol's API endpoint
- Protocol responds 402 with trigger fee amount
- Agent signs Soroban auth entry as payment proof
- Built-on-Stellar facilitator verifies + settles USDC transfer

**Layer 2: Soroban Atomic Execution (liquidation)**

- In parallel / same ledger: `start_auction()` invocation executes
- Contract verifies ZK proofs + creates auction
- Payment settlement + auction creation batched in same ledger sequence

**Fallback for Hackathon (if x402 HTTP infra is not ready):** The contract
implements the economic intent directly:

```rust
// Inside start_auction() — atomic trigger fee payment:
let trigger_fee = (position.collateral_value * TRIGGER_FEE_BPS) / 10000;
token_client.transfer(&env.current_contract_address(), &caller, &trigger_fee);
```

Agent receives payment as part of the function call. No separate claim. No trust
required. This is the x402 primitive — payment embedded in the service
interaction.

> **Hackathon priority**: Implement on-chain atomic payment first (Layer 2).
> Wire x402 HTTP layer (Layer 1) if time permits.

---

## 6. Action Model Architecture

### What an Action Model Is

A formal system where agent behavior is defined as a set of **actions**, each
with:

- **Preconditions**: facts that must be true before the action fires
- **Effects**: state changes that result from firing
- **Cost**: resources consumed

The agent runs a loop: observe world state → find actions whose preconditions
are satisfied → execute highest-priority action → repeat.

### Why This Matters

- **Restartability**: crash and restart by re-evaluating preconditions against
  current on-chain state
- **Auditability**: every action transition is inspectable
- **Determinism**: no LLM "reasoning" — pure state machine
- **Testability**: mock the state, verify which actions fire

### Agent Loop (TypeScript)

```typescript
interface Action {
	name: string
	preconditions: (state: WorldState) => boolean
	execute: (state: WorldState) => Promise<void>
	priority: number
}

class AgentScheduler {
	private actions: Action[]

	async runLoop() {
		while (true) {
			const state = await this.observeWorld()

			const eligible = this.actions
				.filter((a) => a.preconditions(state))
				.sort((a, b) => b.priority - a.priority)

			if (eligible.length > 0) {
				await eligible[0].execute(state)
			}

			await sleep(LOOP_INTERVAL_MS) // ~5 seconds
		}
	}
}
```

---

## 7. Dutch Auction Mechanics

### Price Decay Formula

```
current_price(t) = start_price × (1 - decay_rate × elapsed_ledgers)

XLM:  decay_rate = 1% per minute  ≈ 0.01/12 per ledger (5s ledgers)
sBTC: decay_rate = 0.5% per minute ≈ 0.005/12 per ledger

Floor protection:
  XLM:  min price = 85% of market value
  sBTC: min price = 90% of market value
```

### Auction States

```
NONE → ACTIVE (when start_auction() called with valid proofs)
ACTIVE → SETTLED (when bid() called and first valid bid lands)
ACTIVE → EXPIRED → FALLBACK (if no bid in 30/60 min)
```

### Escalating Trigger Fees

```
0-10 min liquidatable:   0.1% trigger fee
10-30 min liquidatable:  0.2% trigger fee
30-60 min liquidatable:  0.5% trigger fee
60+ min:                 circuit breaker fires, new borrows paused
```

---

## 8. Interest Rate Model

### Kinked Utilization Curve

```
utilization = total_borrowed / total_deposited

if utilization <= OPTIMAL (80%):
    rate = BASE_RATE + (utilization / OPTIMAL) × SLOPE1
    // rises from 0% to 8% APR

if utilization > OPTIMAL:
    rate = BASE_RATE + SLOPE1 + ((utilization - OPTIMAL) / (1 - OPTIMAL)) × SLOPE2
    // rises from 8% to 48% APR

SLOPE1 = 8%
SLOPE2 = 40%  (steep — forces repayment)
```

### Per-Ledger Interest Accrual

```
// Approximate: Stellar = ~5 second ledgers = ~6,307,200 ledgers/year
rate_per_ledger = annual_rate / 6_307_200

// Index-based accounting (no per-user loops):
new_index = old_index × (1 + rate_per_ledger)
user_balance = user_principal × (current_index / deposit_index)
```

---

## 9. Resilience Layers

| Layer                  | Mechanism                                              | Trigger                                     |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------- |
| Conservative LTV       | 65% max, 75% liquidation threshold                     | First line — most positions never liquidate |
| Escalating commissions | 0.1% → 0.2% → 0.5% over time                           | Economic incentive self-rescues protocol    |
| Reserve fund           | 10% interest + 10% fees → target 5% of deposits        | Covers bad debt                             |
| Bad debt socialization | MakerDAO-style spread across lenders                   | Black swan fallback                         |
| Circuit breaker        | New borrows paused if position liquidatable 60+ min    | Stops accumulation of risk                  |
| Agent heartbeat        | On-chain every 5 min; tier-2 agents activate at 15 min | Ensures coverage continuity                 |

---

## 10. Key Reference Implementations to Study

| Project                  | What to Learn                                      | Link                       |
| ------------------------ | -------------------------------------------------- | -------------------------- |
| slender                  | Soroban lending protocol (most complete reference) | github.com/eq-lab/slender  |
| Stellar private payments | Groth16 on Soroban                                 | stellar.org blog           |
| Boundless x Nethermind   | Groth16 verifier on Soroban                        | X-Ray upgrade docs         |
| circomlib                | Standard circuit components                        | github.com/iden3/circomlib |
| snarkjs                  | Proof generation + verification                    | github.com/iden3/snarkjs   |

---

## 11. Open Questions / Items Needing Further Research

- [ ] Exact Soroban host function API for `groth16_verify` — need function
      signature from Protocol 25 release
- [ ] x402 npm package exact API for Stellar facilitator integration
- [ ] BN254 point encoding format expected by Soroban host functions (big-endian
      vs little-endian bytes)
- [ ] Maximum bytes allowed in a Soroban transaction argument (for passing ZK
      proofs as `Bytes`)
- [ ] USDC testnet contract ID on Stellar testnet
- [ ] Stellar testnet Friendbot exact funding amount (XLM provided per request)
- [ ] Storage rent cost calculation — how often must Persistent entries be
      refreshed?
