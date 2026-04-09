import {
	nativeToScVal,
	scValToNative,
	type Keypair,
} from "@stellar/stellar-sdk"
import { invokeContract, simulateContractRead } from "../chain/soroban.js"
import { CONFIG } from "../config.js"
import { type Action, type AgentState, type Auction } from "../types.js"

const SCALE = 10_000_000n

export function buildBidderActions(keypair: Keypair): Action[] {
	return [
		// -----------------------------------------------------------------------
		// Place limit bids on all biddable auctions we haven't bid on yet.
		// The contract will settle the best bid when settle_auction is called.
		// -----------------------------------------------------------------------
		{
			name: "place_limit_bids",
			priority: 90,
			preconditions: (s) =>
				s.biddableAuctions.length > 0 &&
				s.agentBudget > 0n &&
				s.biddableAuctions.some(
					(a) => !s.placedBidAuctionIds.has(a.id.toString()),
				),
			execute: async (s) => {
				for (const auction of s.biddableAuctions) {
					if (s.placedBidAuctionIds.has(auction.id.toString())) continue

					// Our max price = current market value minus our profit threshold.
					// e.g. market = 100, threshold = 5% → maxPrice = 95.
					// We're willing to pay up to 95 but will actually pay whatever
					// the Dutch price is when settle_auction fires (could be less).
					// TODO: for multi-asset collateral, look up the asset from s.positions
					const marketPrice = BigInt(
						Math.round((s.priceCache.prices["XLM"] ?? 0) * 10_000_000),
					)

					if (marketPrice === 0n) continue

					const thresholdScaled = BigInt(
						Math.round(CONFIG.agent.minProfitThreshold * 10_000_000),
					)
					const maxPrice = (marketPrice * (SCALE - thresholdScaled)) / SCALE

					// Respect max bid cap if configured
					const maxBidCap =
						CONFIG.agent.maxBidUsdc > 0
							? BigInt(CONFIG.agent.maxBidUsdc) * SCALE
							: maxPrice
					const effectiveMaxPrice = maxPrice < maxBidCap ? maxPrice : maxBidCap

					if (effectiveMaxPrice <= 0n) continue

					console.log(
						`[place_limit_bid] auction ${auction.id}: ` +
							`maxPrice=${Number(effectiveMaxPrice) / 1e7} USDC ` +
							`(market=${Number(marketPrice) / 1e7}, ` +
							`threshold=${CONFIG.agent.minProfitThreshold * 100}%)`,
					)

					try {
						await invokeContract(
							CONFIG.contracts.vault,
							"place_limit_bid",
							[
								nativeToScVal(keypair.publicKey(), { type: "address" }),
								nativeToScVal(auction.id, { type: "u64" }),
								nativeToScVal(effectiveMaxPrice, { type: "i128" }),
							],
							keypair,
						)
						s.placedBidAuctionIds.add(auction.id.toString())
						console.log(`[place_limit_bid] bid placed on auction ${auction.id}`)
					} catch (err) {
						// Could fail if trigger agent tries to bid (contract rejects) or
						// if already placed. Just log and continue.
						console.warn(
							`[place_limit_bid] failed for auction ${auction.id}:`,
							err,
						)
					}
				}
			},
		},

		// -----------------------------------------------------------------------
		// Try to settle auctions where the Dutch price has dropped to meet bids.
		// Anyone can call settle_auction; the contract picks the best bid.
		// -----------------------------------------------------------------------
		{
			name: "settle_ready_auctions",
			priority: 85,
			preconditions: (s) =>
				s.biddableAuctions.some((a) =>
					s.placedBidAuctionIds.has(a.id.toString()),
				),
			execute: async (s) => {
				for (const auction of s.biddableAuctions) {
					if (!s.placedBidAuctionIds.has(auction.id.toString())) continue

					const currentPrice = computeCurrentPrice(
						auction,
						BigInt(s.currentLedger),
					)
					const marketPrice = BigInt(
						Math.round((s.priceCache.prices["XLM"] ?? 0) * 10_000_000),
					)
					if (marketPrice === 0n) continue

					// Only call settle if price has dropped enough to be profitable
					const discount =
						Number(marketPrice - currentPrice) / Number(marketPrice)
					if (discount < CONFIG.agent.minProfitThreshold) continue

					console.log(
						`[settle_auction] calling settle on auction ${auction.id} ` +
							`at price ${Number(currentPrice) / 1e7} USDC ` +
							`(discount ${(discount * 100).toFixed(2)}%)`,
					)

					try {
						await invokeContract(
							CONFIG.contracts.vault,
							"settle_auction",
							[nativeToScVal(auction.id, { type: "u64" })],
							keypair,
						)
						console.log(`[settle_auction] settled auction ${auction.id}`)
						s.placedBidAuctionIds.delete(auction.id.toString())
					} catch (err) {
						// May fail if our bid isn't the best or auction already settled
						console.warn(
							`[settle_auction] failed for auction ${auction.id}:`,
							err,
						)
					}
				}
			},
		},

		// -----------------------------------------------------------------------
		// Evaluate which active auctions are worth bidding on.
		// -----------------------------------------------------------------------
		{
			name: "evaluate_bids",
			priority: 70,
			preconditions: (s) => s.activeAuctions.length > 0,
			execute: async (s) => {
				s.biddableAuctions = s.activeAuctions.filter((auction) => {
					// Never bid on auctions we triggered (contract enforces this too)
					if (
						auction.triggerAgent.toLowerCase() ===
						keypair.publicKey().toLowerCase()
					) {
						return false
					}

					const currentPrice = computeCurrentPrice(
						auction,
						BigInt(s.currentLedger),
					)
					const marketPrice = BigInt(
						Math.round((s.priceCache.prices["XLM"] ?? 0) * 10_000_000),
					)
					if (marketPrice === 0n) return false

					// Include if there's any discount (we'll calibrate the max_price)
					return currentPrice < marketPrice
				})
				console.log(
					`[evaluate_bids] ${s.biddableAuctions.length} biddable auctions`,
				)
			},
		},

		// -----------------------------------------------------------------------
		// Watch all active (unsettled) auctions.
		// -----------------------------------------------------------------------
		{
			name: "watch_auctions",
			priority: 60,
			preconditions: (s) =>
				Date.now() - s.lastAuctionScan > CONFIG.agent.scanIntervalMs,
			execute: async (s) => {
				const countRaw = await simulateContractRead(
					CONFIG.contracts.vault,
					"auction_count",
					[],
				)
				const total = scValToNative(countRaw) as bigint
				const auctions: Auction[] = []

				const limit = total < 20n ? total : 20n
				for (let id = 0n; id < limit; id++) {
					try {
						const raw = await simulateContractRead(
							CONFIG.contracts.vault,
							"get_auction",
							[nativeToScVal(id, { type: "u64" })],
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

				// Clean up placed bids for auctions that are now settled
				for (const id of s.placedBidAuctionIds) {
					if (!auctions.find((a) => a.id.toString() === id)) {
						s.placedBidAuctionIds.delete(id)
					}
				}

				s.activeAuctions = auctions
				s.lastAuctionScan = Date.now()
				console.log(`[watch_auctions] ${auctions.length} active auctions`)
			},
		},
	]
}

function computeCurrentPrice(auction: Auction, currentLedger: bigint): bigint {
	const elapsed = currentLedger - BigInt(auction.startedAtLedger)
	const discount = auction.decayRatePerLedger * elapsed
	const price = (auction.startPrice * (SCALE - discount)) / SCALE
	return price < auction.floorPrice ? auction.floorPrice : price
}
