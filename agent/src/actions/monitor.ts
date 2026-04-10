import {
	scValToNative,
	nativeToScVal,
	type Keypair,
} from "@stellar/stellar-sdk"
import { invokeContract, simulateContractRead } from "../chain/soroban.js"
import { CONFIG } from "../config.js"
import { type Action, type Position } from "../types.js"
import { type X402Client } from "../x402.js"
import { buildFetchPricesAction } from "./common.js"

const SCALE = 10_000_000n

export function buildMonitorActions(
	keypair: Keypair,
	x402: X402Client,
): Action[] {
	// Positions that have been successfully triggered — skip re-queueing until
	// the x402 server catches up to the on-chain auction state (avoids retry spam).
	const triggeredPositionIds = new Set<string>()

	return [
		{
			name: "heartbeat",
			priority: 100,
			preconditions: (s) =>
				s.currentLedger - s.lastHeartbeatLedger >
				CONFIG.agent.heartbeatIntervalLedgers,
			execute: async (s) => {
				console.log("[heartbeat] sending...")
				await invokeContract(
					CONFIG.contracts.vault,
					"heartbeat",
					[nativeToScVal(keypair.publicKey(), { type: "address" })],
					keypair,
				)
				s.lastHeartbeatLedger = s.currentLedger
				console.log("[heartbeat] sent")
			},
		},
		{
			name: "start_auction",
			priority: 90,
			preconditions: (s) => s.atRiskPositions.length > 0 && s.zkProofsReady,
			execute: async (s) => {
				const succeeded: bigint[] = []
				for (const pos of s.atRiskPositions) {
					const proofSet = s.zkProofs[pos.id.toString()]
					const price = BigInt(
						Math.round(
							(s.priceCache.prices[pos.collateralAsset] ?? 0) * 10_000_000,
						),
					)
					console.log(`[start_auction] triggering position ${pos.id}...`)
					try {
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
						console.log(
							`[start_auction] auction started for position ${pos.id}`,
						)
						succeeded.push(pos.id)
						triggeredPositionIds.add(pos.id.toString())
					} catch (err) {
						// Remove from current batch but do NOT blacklist — let the next
						// scan re-queue it so a transient RPC error doesn't permanently
						// suppress the position.
						console.warn(`[start_auction] failed for position ${pos.id}:`, err)
						succeeded.push(pos.id)
					}
				}
				// Remove processed positions so we don't retry them next tick
				s.atRiskPositions = s.atRiskPositions.filter(
					(p) => !succeeded.includes(p.id),
				)
				s.zkProofsReady = false
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
				s.positions.length > 0 &&
				Object.keys(s.priceCache.prices).length > 0 &&
				!s.zkProofsReady,
			execute: async (s) => {
				const LIQ_THRESHOLD: Record<string, bigint> = {
					XLM: 8_000_000n, // 80%
					SBTC: 8_500_000n, // 85%
				}
				s.atRiskPositions = s.positions.filter((pos) => {
					if (pos.debtPrincipal === 0n) return false
					// Skip positions already in auction — bidder handles those
					const rawState = pos.auctionState as any
					const auctionTag =
						typeof rawState === "string"
							? rawState
							: Array.isArray(rawState)
								? ((rawState[0] as string) ?? "None")
								: (Object.keys(rawState ?? {})[0] ?? "None")
					if (auctionTag !== "None") return false

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
				// Clear so we don't re-evaluate until the next scan_positions cycle
				s.positions = []
			},
		},
		buildFetchPricesAction(),
		{
			name: "scan_positions",
			priority: 50,
			preconditions: (s) =>
				Date.now() - s.lastScan > CONFIG.agent.scanIntervalMs,
			execute: async (s) => {
				// Pay 0.05 USDC to the x402 intelligence server for the at-risk position list.
				// The server does the chain scanning; this agent pays for the intelligence.
				console.log(
					`[scan_positions] fetching opportunities from ${CONFIG.x402.serverUrl}/opportunities (x402)...`,
				)
				const response = await x402.fetch(
					`${CONFIG.x402.serverUrl}/opportunities`,
				)

				if (!response.ok) {
					console.warn(
						`[scan_positions] x402 server returned ${response.status} — falling back to direct chain scan`,
					)
					await scanDirectly(s)
					return
				}

				const body = await response.json()
				const opportunities: any[] = body.opportunities ?? []

				// Sync price cache to the server's attested price so start_auction
				// submits the same price the server used to evaluate health factors.
				if (typeof body.xlmPrice === "number" && body.xlmPrice > 0) {
					s.priceCache.prices["XLM"] = body.xlmPrice
					s.priceCache.fetchedAt = Date.now()
				}

				// x402 server already validated health factors — trust it and populate
				// atRiskPositions directly, skipping the local compute_health_factors step.
				const mapped = opportunities.map((o: any) => ({
					id: BigInt(o.id),
					owner: o.owner,
					collateralAsset: o.collateralAsset,
					collateralAmount: BigInt(o.collateralAmount),
					debtPrincipal: BigInt(o.debtPrincipal),
					borrowIndexAtOpen: 0n,
					openedAtLedger: 0,
					dueAtLedger: o.dueAtLedger ?? 0,
					loanTermLedgers: 0,
					auctionState: "None" as const,
					becameLiquidatableAt: 0,
				}))

				// Merge with any positions already queued (avoid duplicates and already-triggered)
				const existingIds = new Set(
					s.atRiskPositions.map((p) => p.id.toString()),
				)
				for (const p of mapped) {
					if (
						!existingIds.has(p.id.toString()) &&
						!triggeredPositionIds.has(p.id.toString())
					) {
						s.atRiskPositions.push(p)
					}
				}

				s.lastScan = Date.now()
				console.log(
					`[scan_positions] x402 paid ✓ — ${mapped.length} at-risk positions`,
				)
			},
		},
	]
}

/**
 * Fallback: scan positions directly from the chain when the x402 server is unavailable.
 */
async function scanDirectly(s: { positions: Position[]; lastScan: number }) {
	const count = await simulateContractRead(
		CONFIG.contracts.vault,
		"position_count",
		[],
	)
	const total = scValToNative(count) as bigint
	const positions: Position[] = []
	const limit = total < 50n ? total : 50n

	for (let id = 0n; id < limit; id++) {
		try {
			const raw = await simulateContractRead(
				CONFIG.contracts.vault,
				"get_position",
				[nativeToScVal(id, { type: "u64" })],
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
			// settled or not found
		}
	}

	s.positions = positions
	s.lastScan = Date.now()
	console.log(`[scan_positions] direct scan — ${positions.length} positions`)
}
