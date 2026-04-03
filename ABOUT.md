# LiquidMind — About This Project

## What Is LiquidMind?

LiquidMind is an autonomous lending protocol built on Stellar where AI agents
replace human liquidators entirely. It is the first DeFi protocol to combine
three primitives that have never been assembled together before:

- **x402 machine payments** — agents earn autonomously inside protocol function
  calls
- **ZK cryptographic proofs** — trustless health factor and price computation
- **Action model programming** — formal, auditable, restartable agent behavior

The protocol runs on Stellar's Soroban smart contract platform on **testnet**
for the hackathon deliverable.

---

## The Core Thesis: Reframing Liquidation

Every existing lending protocol (Aave, Compound, Maker) treats liquidation as
**arbitrage**. Bots race to buy distressed collateral at a discount. The result:
MEV gas wars, chaotic liquidations, heavy borrower losses.

LiquidMind reframes liquidation as a **two-sided market**:

| Role          | What They Do                                                    | How They Earn                 |
| ------------- | --------------------------------------------------------------- | ----------------------------- |
| Monitor Agent | Detects unsafe positions, generates ZK proofs, triggers auction | 0.1% trigger fee via x402     |
| Bidder Agent  | Watches auctions, submits bids when discount is attractive      | Collateral appreciation       |
| Protocol      | Manages vault, verifies proofs, settles auctions                | 10% of interest + 10% of fees |
| Borrower      | Posts collateral, borrows USDC                                  | Gets surplus from auction     |
| Lender        | Deposits USDC, earns interest                                   | 90% of interest income        |

---

## Why Stellar Is Not Just a Deployment Choice

Stellar is structurally necessary for this design to work:

**Fixed fees eliminate the gas war problem.** On Ethereum, liquidation bots bid
up gas to be first — this is MEV. On Stellar, fees are ~$0.00001. The first
valid transaction lands. No war. Monitor agent submits → wins trigger fee
cleanly.

**Native DEX means atomic collateral liquidation.** One Soroban contract can
execute a path payment on the Stellar DEX atomically. No Uniswap, no bridging,
no external dependencies.

**Native USDC means no bridge risk.** Lender deposits, borrower debt, agent
commissions, and auction bids are all Circle-issued USDC. No wrapped tokens, no
cross-chain risk.

**X-Ray upgrade (Protocol 25) ships BN254 + Poseidon as host functions.** ZK
proof verification is a first-class, cheap, auditable operation in Soroban. This
is what makes the ZK layer practical rather than theoretical.

---

## Why Each Technology Earns Its Place

### x402

Not a payment bolt-on — the mechanism by which agents become economic actors
_inside_ the protocol. When a monitor agent calls `start_auction()`, it receives
the trigger fee **atomically in the same operation**. Payment is part of the
protocol interaction, not a separate step.

### ZK Proofs

Three circuits solving specific trust problems:

| Proof                 | Proves                                             | Prevents                          |
| --------------------- | -------------------------------------------------- | --------------------------------- |
| HealthFactorProof     | Health factor was correctly computed off-chain     | Agent lying about position safety |
| PriceAttestationProof | TWAP was correctly computed from real DEX data     | Oracle price manipulation         |
| AuctionPriceProof     | Auction price is correctly computed at this ledger | Timing exploits on Dutch auction  |

### Action Model Programming

The agent doesn't "decide" via LLM reasoning. It has a formal vocabulary of
discrete actions with defined **preconditions** and **effects**. If it crashes
and restarts, it reads on-chain state and resumes exactly where it left off.
Every transition is inspectable.

---

## What Makes This Novel

1. **Agents as protocol-native economic actors** — not third-party bots
   exploiting a side effect, but explicitly designed participants with defined
   roles and compensation via x402

2. **x402 as atomic payment inside a DeFi operation** — no existing DeFi
   protocol uses x402; payment IS the protocol interaction

3. **ZK proofs for oracle integrity** — no existing lending protocol requires ZK
   proofs for price attestation or health factor computation

4. **Self-funding agent economy** — agent earns trigger fees, auto-recharges
   operating budget, sustains itself indefinitely

5. **Borrower-protective liquidations** — borrowers lose ~5-8% vs 5-15% in Aave;
   at $10M in loans that's $300K-$700K/year returned to borrowers

---

## Protocol Name

**Liquid** — liquidations, liquidity, DeFi context  
**Mind** — autonomous agent intelligence running the protocol  
Together: a lending system with a mind of its own.

---

## Hackathon Context

13-day build targeting Stellar ecosystem hackathon. Running on Stellar testnet
throughout development and demo. Demo scenario:

1. Deposit XLM collateral → borrow USDC to 64% LTV
2. Simulate price drop via oracle
3. Agent detects health < 1.0 → generates ZK proofs → triggers auction →
   receives 0.1% fee
4. Auction opens → price decays → bidder agent submits bid → collateral
   transfers → debt repays → surplus returns to borrower
5. Entire cycle completes in under 60 seconds on Stellar testnet

**No human touched it. That's the story.**

---

## Team

Repository: `argent` (internal project name)  
Network: Stellar Testnet  
Start date: April 2026
