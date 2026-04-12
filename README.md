# Argen: Agentic Liquidation Protocol

Argen is an autonomous lending protocol on Stellar that leverages **ZK-Proofs**
and **x402 payments** to enable a self-sustaining, hyper-efficient agentic
economy.

---

## 🔗 Deployed Contracts (Stellar Testnet)

You can explore our deployed smart contracts directly on stellar.expert:

- **Vault:**
  [`CBNXMW4QDJS77SRB6URZKFF4ZDAQXYLMRTLLPIJEBZYI3U3EJSPZU4BG`](https://stellar.expert/explorer/testnet/contract/CBNXMW4QDJS77SRB6URZKFF4ZDAQXYLMRTLLPIJEBZYI3U3EJSPZU4BG)
- **vUSDC:**
  [`CDEMATCS43COZGOQJFC5UZEA7GOY5CUQATKMFMJGKIP7B2USBS3RJ6KZ`](https://stellar.expert/explorer/testnet/contract/CDEMATCS43COZGOQJFC5UZEA7GOY5CUQATKMFMJGKIP7B2USBS3RJ6KZ)
- **ZK Verifier:**
  [`CDGYLCFDRHFUIGJ2A2BZ3X5BJRHVBLSEJ4DYHGRBPAYJ7YQLOVW72XR5`](https://stellar.expert/explorer/testnet/contract/CDGYLCFDRHFUIGJ2A2BZ3X5BJRHVBLSEJ4DYHGRBPAYJ7YQLOVW72XR5)
- **USDC (Circle Testnet):**
  [`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA)
- **XLM SAC:**
  [`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC)

---

## 🎯 End-to-End User Flows

Argen seamlessly orchestrates operations between three major user archetypes.

### As a Lender 💰

1. **Deposit:** Lenders connect their wallet and deposit USDC into the Argen
   vault using the frontend.
2. **Receive vUSDC:** They receive `vUSDC` (Vault USDC), a yield-bearing token,
   representing their proportional share of the pool.
3. **Earn Yield:** As borrowers pay daily interest and automated agents
   successfully execute liquidations, the underlying USDC reserves
   grow—constantly scaling up the redemption value of `vUSDC`.
4. **Withdraw:** A lender can redeem their `vUSDC` tokens at any time to claim
   back their base USDC + all algorithmic yield generated.

### As a Borrower 🛡️

1. **Collateralize:** Borrowers deposit native XLM into the protocol via the
   frontend dashboard.
2. **Borrow:** Borrowers take out a USDC loan against their XLM, locked strictly
   down to a specific mathematical Loan-To-Value (LTV) limit.
3. **Monitor Safety:** Borrowers use the dashboard to check their fluctuating
   "Health Factor." If they drop below a Health Factor of `1.0` during a market
   crash, their collateral is seized and sent to auction.
4. **Repay:** At any point, borrowers can repay the principal loan alongside
   accrued interest to release and retrieve their locked XLM.

### As an Agent (Automation / Profit) 🤖

1. **Purchase Alpha via x402:** External Agents constantly scout for bad debt by
   calling `GET /opportunities` on the protocol's server. They receive a
   `402 Payment Required` HTTP challenge and autonomously execute a
   micro-payment via Stellar in real-time to access high-risk position data.
2. **ZK Proofs & Triggering:** Once bad debt is identified, the agent creates an
   off-chain Zero-Knowledge (ZK) Proof cryptographically proving the account is
   strictly undercollateralized. They call `trigger_auction` on the Soroban
   smart contract with the proof and are immediately rewarded a **1% Trigger
   Fee**.
3. **Dutch Auction Bidding:** Once an auction triggers, the price of the seized
   XLM drops monotonically (Dutch Auction). External bidding agents wait until
   their mathematically calculated `MIN_PROFIT_THRESHOLD` is hit, submitting the
   winning transaction and claiming discounted collateral to immediately
   arbitrage for a profit!

---

## 🆚 Argen vs. Aave: The Next Evolution of DeFi

In traditional borrowing/lending systems like **Aave**:

- **Oracle Bloat:** Aave heavily relies on continuously pushing expensive, rigid
  Oracle updates directly onto the chain so the smart contracts can calculate
  the health factor of every single borrower recursively.
- **Free-Rider Problem:** Multi-million dollar protocols usually host extremely
  expensive infrastructure and free API endpoints just to allow MEV bots and
  indexers to scout their data for free.

**How Argen Changes the Game with ZK and x402:**

1. **Zero-Knowledge Local Computations:** Argen explicitly offloads the heavy
   mathematical evaluations completely off-chain. Agents individually compute
   borrower health factors using `health_factor.wasm` proofs! The Soroban
   contract no longer calculates prices—it strictly acts as an ultra-fast **ZK
   Verifier**. This entirely eliminates "Oracle bloat" and saves vast amounts of
   transaction fees on the network.
2. **x402 Micro-Monetization:** Instead of giving away indexing and position
   data for free via open subgraphs, Argen pioneers the `x402` payment standard.
   It transforms the protocol into a decentralized data-marketplace,
   fundamentally forcing AI agents and arbitrage bots to pay microscopic
   Stellar-based fees upfront just to _read_ the data required to perform their
   liquidations.
3. **Crowd-Sourced Subcontracting:** We transform MEV extractors from parasitic
   front-runners into paying customers and decentralized workers working
   explicitly to keep the protocol seamlessly solvent!

---

## 🤖 The Ultimate Agent Stack: Connecting Your Own Agent

Argen is built to be permissionlessly extensible. Since the entire protocol is
driven by **x402 Payments & Agents**, external developers are highly
incentivized to connect their own automated trading bots!

### 1. Configure the Environment

Clone the repository and inject the main contract hashes into your environment.

```bash
cp .env.example .env
npm install
```

### 2. Autonomously Obtain Data

Rather than writing an intensive indexer that scans the entire Stellar node for
days, your agent simply hits our proprietary x402 endpoints! Utilizing our
internally built
[x402-flash-stellar-sdk](https://www.npmjs.com/package/x402-flash-stellar-sdk),
your programmatic bot will intercept `402 Payment Required` responses, instantly
sign and submit the micro-transaction via the OpenZeppelin Facilitator, and
download the `opportunities` payload flawlessly without user intervention.

### 3. Generate Native ZK Proofs Off-Chain

Once your custom agent spots a target, use the `snarkjs` toolkit alongside the
protocol's publicly distributed `.zkey` files to generate a cryptographically
solid Proof that validates the XLM token crashed versus USDC without depending
on any on-chain Oracles.

### 4. Run & Profit

Launch your Bidder or Monitor script into production:

```bash
cd agent
# Run the internal proprietary monitor / bidder agent:
pnpm run start:agent
```

Sit back, monitor logs, and collect completely autonomous arbitrage profits!

---

## ⚡️ Quick Start Reference

### 1. Smart Contracts

Deploy the protocol locally or to Stellar Testnet:

```bash
sh deploy.sh
```

### 2. Autonomous Agent & x402 Server

```bash
cd agent
pnpm run start:server   # Starts the gated x402 protocol API!
pnpm run start:agent    # Fire up your autonomous loops
```

### 3. Frontend Dashboard

```bash
cd frontend
pnpm run dev
```
