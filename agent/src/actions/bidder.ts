import {
	nativeToScVal,
	scValToNative,
	type Keypair,
} from "@stellar/stellar-sdk"
import { invokeContract } from "../chain/soroban.js"
import { CONFIG } from "../config.js"
import { type Action, AgentState, type Auction } from "../types.js"

const SCALE = 10_000_000n

export function buildBidderActions(keypair: Keypair): Action[] {
	return [
		{
			name: "submit_bid",
			priority: 90,
			preconditions: (s) =>
				s.biddableAuctions.length > 0 &&
				s.apProofsReady &&
				s.agentUsdcBalance >= (s.biddableAuctions[0]?.startPrice ?? 0n),
			execute: async (s) => {
				const auction = s.biddableAuctions[0]!
				const apProof = s.apProofs[auction.id.toString()] ?? new Uint8Array(0)
				const currentPrice = computeCurrentPrice(
					auction,
					BigInt(s.currentLedger),
				)
				console.log(
					`[submit_bid] bidding on auction ${auction.id} at price ${Number(currentPrice) / 1e7}`,
				)
				await invokeContract(
					CONFIG.contracts.vault,
					"bid",
					[
						nativeToScVal(keypair.publicKey(), { type: "address" }),
						nativeToScVal(auction.id, { type: "u64" }),
						nativeToScVal(currentPrice, { type: "i128" }),
						nativeToScVal(apProof, { type: "bytes" }),
					],
					keypair,
				)
				console.log(`[submit_bid] bid submitted for auction ${auction.id}`)
			},
		},
		{
			name: "generate_ap_proof",
			priority: 80,
			preconditions: (s) => s.biddableAuctions.length > 0 && !s.apProofsReady,
			execute: async (s) => {
				// Phase 2: mock proofs; Phase 3: snarkjs
				console.log("[generate_ap_proof] generating mock AP proofs...")
				for (const auction of s.biddableAuctions) {
					s.apProofs[auction.id.toString()] = new Uint8Array(0)
				}
				s.apProofsReady = true
			},
		},
		{
			name: "evaluate_bids",
			priority: 70,
			preconditions: (s) => s.activeAuctions.length > 0,
			execute: async (s) => {
				s.biddableAuctions = s.activeAuctions.filter((auction) => {
					const currentPrice = computeCurrentPrice(
						auction,
						BigInt(s.currentLedger),
					)
					const marketPrice = BigInt(
						Math.round((s.priceCache.prices["XLM"] ?? 0) * 10_000_000),
					)
					if (marketPrice === 0n) return false
					// Profitable if discount > MIN_PROFIT_THRESHOLD
					const discount =
						Number(marketPrice - currentPrice) / Number(marketPrice)
					return discount > CONFIG.agent.minProfitThreshold
				})
				s.apProofsReady = false
				console.log(
					`[evaluate_bids] ${s.biddableAuctions.length} biddable auctions`,
				)
			},
		},
		{
			name: "watch_auctions",
			priority: 60,
			preconditions: () => true,
			execute: async (s) => {
				const countRaw = await invokeContract(
					CONFIG.contracts.vault,
					"auction_count",
					[],
					keypair,
				)
				const total = scValToNative(countRaw) as bigint
				const auctions: Auction[] = []

				const limit = total < 20n ? total : 20n
				for (let id = 0n; id < limit; id++) {
					try {
						const raw = await invokeContract(
							CONFIG.contracts.vault,
							"get_auction",
							[nativeToScVal(id, { type: "u64" })],
							keypair,
						)
						const native = scValToNative(raw) as any
						if (!native.settled) {
							auctions.push({
								id,
								positionId: native.position_id,
								startPrice: native.start_price,
								floorPrice: native.floor_price,
								decayRatePerLedger: native.decay_rate_per_ledger,
								startedAtLedger: native.started_at_ledger,
								triggerAgent: native.trigger_agent,
								settled: native.settled,
							})
						}
					} catch {
						// Auction may not exist yet
					}
				}

				s.activeAuctions = auctions
				console.log(`[watch_auctions] ${auctions.length} active auctions`)
			},
		},
	]
}

function computeCurrentPrice(auction: Auction, currentLedger: bigint): bigint {
	const elapsed = currentLedger - BigInt(auction.startedAtLedger)
	const discount = auction.decayRatePerLedger * elapsed
	const SCALE = 10_000_000n
	const price = (auction.startPrice * (SCALE - discount)) / SCALE
	return price < auction.floorPrice ? auction.floorPrice : price
}
