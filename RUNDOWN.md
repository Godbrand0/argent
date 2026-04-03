# LiquidMind — Project Rundown & Status Tracker

Last updated: April 2, 2026  
Network: Stellar Testnet  
Current Day: Pre-development (Day 0)

---

## Current Status: PLANNING ✦ NOT STARTED

```
Phase 0 — Scaffold          [ ] NOT STARTED
Phase 1 — Vault Contract    [ ] NOT STARTED
Phase 2 — Agent             [ ] NOT STARTED
Phase 3 — ZK Proofs         [ ] NOT STARTED
Phase 4 — Frontend          [ ] NOT STARTED
Phase 5 — Demo Polish       [ ] NOT STARTED
```

---

## What's Been Done

- [x] Full project design and architecture documented
- [x] Research compiled across all tech stack components:
  - Soroban SDK (v23.4.1), storage types, SEP-41, auth patterns
  - BN254 / X-Ray Protocol 25 ZK host functions
  - circom + snarkjs Groth16 pipeline
  - Stellar SDK v14.4.3, Horizon API, Soroban RPC
  - x402 payment protocol, Built-on-Stellar facilitator
  - Action model architecture
- [x] ABOUT.md — project overview and thesis
- [x] RESEARCH.md — full findings with code patterns
- [x] ARCHITECTURE.md — system design, data flows, component tree
- [x] IMPLEMENTATION.md — phased 13-day build plan
- [x] RUNDOWN.md — this file

---

## What's Next (Immediate)

```
→ Phase 0: Set up project scaffold and toolchain (Day 1)
  0.1 Create directory structure
  0.2 Install Rust + Soroban CLI
  0.3 Fund testnet accounts
  0.4 Install Node.js toolchain
  0.5 Install circom + snarkjs
  0.6 Find USDC testnet contract ID
  0.7 Scaffold deploy scripts
```

---

## Blockers / Open Questions

| Item                                                 | Status             | Notes                                                           |
| ---------------------------------------------------- | ------------------ | --------------------------------------------------------------- |
| Soroban BN254 exact API (`groth16_verify` signature) | 🔴 UNKNOWN         | Need to find from Protocol 25 release / CAP-0074 implementation |
| USDC contract ID on Stellar testnet                  | 🔴 UNKNOWN         | Find on StellarExpert testnet                                   |
| Proof encoding format (snarkjs → Soroban Bytes)      | 🟡 PARTIALLY KNOWN | Know the math, need exact byte layout                           |
| x402 `x402-flash-stellar-sdk` API                    | 🟡 PARTIALLY KNOWN | Package exists, need to read source                             |
| Testnet XLM collateral pricing                       | 🟡 PARTIALLY KNOWN | DEX TWAP may have thin liquidity on testnet                     |

---

## Key Contract Addresses (Testnet)

| Contract    | Address | Status                  |
| ----------- | ------- | ----------------------- |
| Vault       | TBD     | Not deployed            |
| vUSDC Token | TBD     | Not deployed            |
| ZK Verifier | TBD     | Not deployed            |
| USDC (SAC)  | TBD     | Existing — need to find |

---

## Key Agent Accounts (Testnet)

| Account       | Purpose                       | Status      |
| ------------- | ----------------------------- | ----------- |
| Admin         | Deploy + initialize contracts | Not created |
| Monitor Agent | Scan + trigger auctions       | Not created |
| Bidder Agent  | Bid on auctions               | Not created |
| Test Borrower | Demo borrower account         | Not created |
| Test Lender   | Demo lender account           | Not created |

---

## Phase Completion Checklist

### Phase 0 — Scaffold

- [ ] Directory structure created
- [ ] Rust + Soroban CLI installed
- [ ] Testnet accounts funded
- [ ] USDC contract ID captured
- [ ] Build scripts work

### Phase 1 — Vault Contract

- [ ] 1A: Storage + data structures
- [ ] 1B: Lender functions (deposit, withdraw)
- [ ] 1C: Borrower functions (collateral, borrow, repay)
- [ ] 1D: Auction lifecycle (start, bid, settle, fallback)
- [ ] 1E: Circuit breaker + heartbeat
- [ ] 1F: Tests pass + deployed to testnet

### Phase 2 — Agent

- [ ] Chain interface (soroban.ts, horizon.ts, vault.ts)
- [ ] Monitor action model (scan, prices, health, trigger, heartbeat)
- [ ] Bidder action model (watch, evaluate, bid)
- [ ] Scheduler loop
- [ ] Agent triggers auction autonomously (mock proofs)

### Phase 3 — ZK Proofs

- [ ] HealthFactor circuit compiled + setup done
- [ ] ZK Verifier contract deployed
- [ ] Agent generates real HF proofs
- [ ] Vault verifies real proofs
- [ ] DEV_MODE bypass removed
- [ ] (Optional) PriceAttestation circuit

### Phase 4 — Frontend

- [ ] Next.js 15 App Router scaffold
- [ ] Freighter wallet connection
- [ ] Vault dashboard (deposit, borrow)
- [ ] Position list with HF meter
- [ ] Auction panel with live price
- [ ] Agent activity feed

### Phase 5 — Demo

- [ ] Demo script rehearsed
- [ ] Mock oracle price drop working
- [ ] Full cycle < 60 seconds
- [ ] Recording/backup ready

---

## Architecture Quick Reference

```
Vault Contract (Rust/Soroban)
  └── stores: positions, auctions, pool state, verification keys
  └── calls: USDC SAC, vUSDC token, ZK Verifier contract

ZK Verifier Contract (Rust/Soroban)
  └── wraps: Soroban BN254 host functions (Protocol 25)
  └── verifies: Groth16 proofs from agent

Agent (TypeScript/Node.js)
  └── uses: @stellar/stellar-sdk, snarkjs
  └── reads: Soroban RPC, Horizon API
  └── writes: Vault contract (start_auction, bid, heartbeat)

Frontend (Next.js 15 / App Router / Tailwind)
  └── reads: Vault contract (read-only Soroban calls)
  └── signs: Freighter wallet (for human interactions)
  └── displays: positions, auctions, agent feed
```

---

## Critical Dependencies

```
Soroban SDK 23.4.1  ──────────────► Vault Contract
Protocol 25 X-Ray   ──────────────► ZK Verifier (BN254)
circom + snarkjs    ──────────────► ZK Circuits
@stellar/sdk 14.4.3 ──────────────► Agent + Frontend
Freighter wallet    ──────────────► Frontend signing
x402 / Built-on-Stellar ──────────► Payment layer (stretch)
```

---

## Links

| Resource                 | URL                                                       |
| ------------------------ | --------------------------------------------------------- |
| Stellar Testnet Explorer | https://stellar.expert/explorer/testnet                   |
| Soroban Testnet RPC      | https://soroban-testnet.stellar.org                       |
| Horizon Testnet          | https://horizon-testnet.stellar.org                       |
| Friendbot                | https://friendbot-testnet.stellar.org                     |
| Soroban Dev Docs         | https://developers.stellar.org/docs/build/smart-contracts |
| x402 Stellar Docs        | https://developers.stellar.org/docs/build/apps/x402       |
| circom Docs              | https://docs.circom.io                                    |
| snarkjs GitHub           | https://github.com/iden3/snarkjs                          |
| slender (reference impl) | https://github.com/eq-lab/slender                         |
| StellarExpert Testnet    | https://stellar.expert/explorer/testnet                   |

---

## Notes / Decisions Log

| Date  | Decision                                         | Reason                                                                                                                                  |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Apr 2 | Use soroban-sdk 23.4.1 (not 25.x rc)             | Stable, Protocol 25 features already in testnet                                                                                         |
| Apr 2 | Mock ZK proofs in Phase 1-2 via DEV_MODE flag    | Unblock contract dev; plug in real proofs at Phase 3                                                                                    |
| Apr 2 | Use Built-on-Stellar public facilitator for x402 | No self-hosting needed, reduces scope                                                                                                   |
| Apr 2 | x402 HTTP layer is stretch goal                  | On-chain atomic payment is the core primitive; HTTP layer adds complexity                                                               |
| Apr 2 | Single agent does both monitor + bidder roles    | Simpler for demo; first-mover advantage on both trigger fee and early auction price                                                     |
| Apr 2 | Testnet USDC from day 1 (not mock token)         | Real integration is more impressive; SAC already deployed                                                                               |
| Apr 2 | Next.js 15 (App Router) instead of React + Vite  | File-based routing, better deploy story, SSR-safe architecture; Freighter + Soroban SDK marked `'use client'` to avoid hydration issues |
