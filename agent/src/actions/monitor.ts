import {
	xdr,
	scValToNative,
	nativeToScVal,
	type Keypair,
} from "@stellar/stellar-sdk"
import { computeTWAP } from "../chain/horizon.js"
import { invokeContract } from "../chain/soroban.js"
import { CONFIG } from "../config.js"
import { type Action, AgentState, type Position } from "../types.js"

const SCALE = 10_000_000n
const HF_THRESHOLD = SCALE // 1.0

export function buildMonitorActions(keypair: Keypair): Action[] {
	return [
		{
			name: "heartbeat",
			priority: 100,
			preconditions: (s) =>
				s.ledgerSinceHeartbeat > CONFIG.agent.heartbeatIntervalLedgers,
			execute: async () => {
				console.log("[heartbeat] sending...")
				await invokeContract(
					CONFIG.contracts.vault,
					"heartbeat",
					[nativeToScVal(keypair.publicKey(), { type: "address" })],
					keypair,
				)
				console.log("[heartbeat] sent")
			},
		},
		{
			name: "start_auction",
			priority: 90,
			preconditions: (s) => s.atRiskPositions.length > 0 && s.zkProofsReady,
			execute: async (s) => {
				for (const pos of s.atRiskPositions) {
					const proofSet = s.zkProofs[pos.id.toString()]
					const price = BigInt(
						Math.round(
							(s.priceCache.prices[pos.collateralAsset] ?? 0) * 10_000_000,
						),
					)
					console.log(`[start_auction] triggering position ${pos.id}...`)
					await invokeContract(
						CONFIG.contracts.vault,
						"start_auction",
						[
							nativeToScVal(keypair.publicKey(), { type: "address" }),
							nativeToScVal(pos.id, { type: "u64" }),
							nativeToScVal(proofSet.hfProof, { type: "bytes" }),
							nativeToScVal(proofSet.paProof, { type: "bytes" }),
							nativeToScVal(price, { type: "i128" }),
						],
						keypair,
					)
					console.log(`[start_auction] auction started for position ${pos.id}`)
				}
			},
		},
		{
			name: "generate_zk_proofs",
			priority: 80,
			preconditions: (s) => s.atRiskPositions.length > 0 && !s.zkProofsReady,
			execute: async (s) => {
				// Phase 2: mock proofs (empty bytes)
				// Phase 3: replace with snarkjs.groth16.fullProve(...)
				console.log("[generate_zk_proofs] generating mock proofs...")
				for (const pos of s.atRiskPositions) {
					s.zkProofs[pos.id.toString()] = {
						hfProof: new Uint8Array(0),
						paProof: new Uint8Array(0),
					}
				}
				s.zkProofsReady = true
				console.log("[generate_zk_proofs] done")
			},
		},
		{
			name: "compute_health_factors",
			priority: 70,
			preconditions: (s) =>
				s.positions.length > 0 && Object.keys(s.priceCache.prices).length > 0,
			execute: async (s) => {
				const LIQ_THRESHOLD: Record<string, bigint> = {
					XLM: 8_000_000n, // 80%
					SBTC: 8_500_000n, // 85%
				}
				s.atRiskPositions = s.positions.filter((pos) => {
					if (pos.debtPrincipal === 0n) return false

					// Trigger 1: loan term expired without repayment
					if (pos.dueAtLedger > 0 && s.currentLedger >= pos.dueAtLedger) {
						console.log(
							`[health_factor] position ${pos.id} MATURED ` +
								`(due=${pos.dueAtLedger}, now=${s.currentLedger})`,
						)
						return true
					}

					// Trigger 2: health factor below liquidation threshold
					const price = BigInt(
						Math.round(
							(s.priceCache.prices[pos.collateralAsset] ?? 0) * 10_000_000,
						),
					)
					const threshold = LIQ_THRESHOLD[pos.collateralAsset] ?? SCALE
					const colVal = (pos.collateralAmount * price) / SCALE
					const hf = (colVal * threshold) / pos.debtPrincipal
					if (hf < SCALE) {
						console.log(
							`[health_factor] position ${pos.id} HF = ${Number(hf) / 1e7}`,
						)
						return true
					}
					return false
				})
				s.zkProofsReady = false
			},
		},
		{
			name: "fetch_prices",
			priority: 60,
			preconditions: (s) => Date.now() - s.priceCache.fetchedAt > 30_000,
			execute: async (s) => {
				console.log("[fetch_prices] fetching...")
				const xlmPrice = await computeTWAP("XLM")
				s.priceCache = {
					prices: {
						XLM: Number(xlmPrice) / 10_000_000,
					},
					fetchedAt: Date.now(),
				}
				console.log(
					`[fetch_prices] XLM = $${s.priceCache.prices["XLM"]?.toFixed(4)}`,
				)
			},
		},
		{
			name: "scan_positions",
			priority: 50,
			preconditions: (s) =>
				Date.now() - s.lastScan > CONFIG.agent.scanIntervalMs,
			execute: async (s) => {
				console.log("[scan_positions] scanning...")
				const count = await invokeContract(
					CONFIG.contracts.vault,
					"position_count",
					[],
					keypair,
				)
				const total = scValToNative(count) as bigint
				const positions: Position[] = []

				// Fetch up to 50 positions per scan
				const limit = total < 50n ? total : 50n
				for (let id = 0n; id < limit; id++) {
					try {
						const raw = await invokeContract(
							CONFIG.contracts.vault,
							"get_position",
							[nativeToScVal(id, { type: "u64" })],
							keypair,
						)
						const native = scValToNative(raw) as any
						positions.push({
							id,
							owner: native.owner,
							collateralAsset: native.collateral_asset,
							collateralAmount: native.collateral_amount,
							debtPrincipal: native.debt_principal,
							borrowIndexAtOpen: native.borrow_index_at_open,
							openedAtLedger: native.opened_at_ledger,
							dueAtLedger: native.due_at_ledger ?? 0,
							loanTermLedgers: native.loan_term_ledgers ?? 0,
							auctionState: native.auction_state,
							becameLiquidatableAt: native.became_liquidatable_at,
						})
					} catch {
						// Position may be settled/expired
					}
				}

				s.positions = positions
				s.lastScan = Date.now()
				console.log(`[scan_positions] found ${positions.length} positions`)
			},
		},
	]
}
