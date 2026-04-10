import {
	nativeToScVal,
	scValToNative,
	type Keypair,
} from "@stellar/stellar-sdk"
import { invokeContract, simulateContractRead } from "../chain/soroban.js"
import { CONFIG } from "../config.js"
import { type Action, type AgentState, type Auction } from "../types.js"
import { type X402Client } from "../x402.js"
import { buildFetchPricesAction } from "./common.js"

const SCALE = 10_000_000n

export function buildBidderActions(
	keypair: Keypair,
	x402: X402Client,
): Action[] {
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
					// Market Price Per Unit (scaled 1e7)
					const marketPricePerUnit = BigInt(
						Math.round(
							(s.priceCache.prices[auction.collateralAsset] ?? 0) * 10_000_000,
						),
					)
					if (marketPricePerUnit === 0n) continue

					// Total Market Value = (Price/Unit * Units) / SCALE
					const totalMarketValue =
						(marketPricePerUnit * auction.collateralAmount) / SCALE

					const thresholdScaled = BigInt(
						Math.round(CONFIG.agent.minProfitThreshold * 10_000_000),
					)
					const maxPrice =
						(totalMarketValue * (SCALE - thresholdScaled)) / SCALE

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
							`(market=${Number(totalMarketValue) / 1e7}, ` +
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
					} catch (err: any) {
						const msg = String(err?.message ?? err)
						if (msg.includes("already has an active bid")) {
							// Bid is on-chain but we missed the confirmation — mark as placed
							s.placedBidAuctionIds.add(auction.id.toString())
							console.log(
								`[place_limit_bid] bid already on-chain for auction ${auction.id}, marking placed`,
							)
						} else {
							console.warn(
								`[place_limit_bid] failed for auction ${auction.id}:`,
								err,
							)
						}
					}
				}
			},
		},

		// -----------------------------------------------------------------------
		// Settle auctions where we are the declared winner (bid limit reached)
		// OR where the Dutch price has decayed enough and we hold the best bid.
		// -----------------------------------------------------------------------
		{
			name: "settle_ready_auctions",
			priority: 85,
			preconditions: (s) => {
				const myKey = keypair.publicKey()
				return s.activeAuctions.some((a) => {
					if (a.settled) return false
					// Case 1: we are the declared winner — settle regardless of local bid memory
					if (a.declaredWinner === myKey) return true
					// Case 2: we have a bid and the Dutch price has discounted enough
					if (!s.placedBidAuctionIds.has(a.id.toString())) return false
					if (a.declaredWinner !== null) return false // someone else won
					const marketPricePerUnit = BigInt(
						Math.round(
							(s.priceCache.prices[a.collateralAsset] ?? 0) * 10_000_000,
						),
					)
					if (marketPricePerUnit === 0n) return false
					const SCALE = 10_000_000n
					const totalMarketValue =
						(marketPricePerUnit * a.collateralAmount) / SCALE
					const elapsed = BigInt(s.currentLedger) - BigInt(a.startedAtLedger)
					const discount = a.decayRatePerLedger * elapsed
					const currentPrice = (a.startPrice * (SCALE - discount)) / SCALE
					const finalPrice =
						currentPrice < a.floorPrice ? a.floorPrice : currentPrice
					return (
						Number(totalMarketValue - finalPrice) / Number(totalMarketValue) >=
						CONFIG.agent.minProfitThreshold
					)
				})
			},
			execute: async (s) => {
				const myKey = keypair.publicKey()

				for (const auction of s.activeAuctions) {
					const isDeclaredWinner = auction.declaredWinner === myKey
					if (
						!isDeclaredWinner &&
						!s.placedBidAuctionIds.has(auction.id.toString())
					)
						continue

					const currentPrice = computeCurrentPrice(
						auction,
						BigInt(s.currentLedger),
					)

					// --- Path 1: bid limit reached, winner already declared on-chain ---
					if (auction.declaredWinner !== null) {
						if (auction.declaredWinner !== myKey) {
							console.log(
								`[settle_auction] auction ${auction.id}: declared winner is ` +
									`${auction.declaredWinner.slice(0, 8)}… — not us, skipping`,
							)
							continue
						}
						console.log(
							`[settle_auction] auction ${auction.id}: we are the declared winner! ` +
								`settling at Dutch price ${Number(currentPrice) / 1e7} USDC`,
						)
					} else {
						// --- Path 2: no declared winner yet, wait for profit threshold ---
						const marketPricePerUnit = BigInt(
							Math.round(
								(s.priceCache.prices[auction.collateralAsset] ?? 0) *
									10_000_000,
							),
						)
						if (marketPricePerUnit === 0n) continue

						const totalMarketValue =
							(marketPricePerUnit * auction.collateralAmount) / SCALE
						const discount =
							Number(totalMarketValue - currentPrice) / Number(totalMarketValue)

						if (discount < CONFIG.agent.minProfitThreshold) continue

						console.log(
							`[settle_auction] auction ${auction.id}: profit threshold met ` +
								`(discount ${(discount * 100).toFixed(2)}%) — settling`,
						)
					}

					try {
						await invokeContract(
							CONFIG.contracts.vault,
							"settle_auction",
							[
								nativeToScVal(auction.id, { type: "u64" }),
								nativeToScVal(myKey, { type: "address" }),
							],
							keypair,
						)
						console.log(`[settle_auction] settled auction ${auction.id}`)
						s.placedBidAuctionIds.delete(auction.id.toString())
						auction.settled = true
					} catch (err) {
						console.warn(
							`[settle_auction] failed for auction ${auction.id}:`,
							err,
						)
						// If simulation traps (e.g. already settled, or we aren't the highest bidder),
						// mark it locally as settled to prevent immediate retry loops.
						// watch_auctions will fetch the true state later.
						auction.settled = true
						s.placedBidAuctionIds.delete(auction.id.toString())
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
			preconditions: (s) =>
				s.activeAuctions.length > 0 &&
				Date.now() - s.lastAuctionScan < CONFIG.agent.scanIntervalMs * 2,
			execute: async (s) => {
				// Place limit bids on any active auction we didn't trigger —
				// the contract picks the winner when MAX_BIDS_PER_AUCTION is reached.
				// Settling is gated separately by the profit threshold in settle_ready_auctions.
				s.biddableAuctions = s.activeAuctions.filter((auction) => {
					if (auction.settled) return false
					if (auction.declaredWinner !== null) return false
					// Never bid on auctions we triggered (contract enforces this too)
					if (
						auction.triggerAgent.toLowerCase() ===
						keypair.publicKey().toLowerCase()
					) {
						return false
					}
					return true
				})
				console.log(
					`[evaluate_bids] ${s.biddableAuctions.length} biddable auctions`,
				)
			},
		},

		buildFetchPricesAction(),

		// -----------------------------------------------------------------------
		// Watch all active (unsettled) auctions.
		// -----------------------------------------------------------------------
		{
			name: "watch_auctions",
			priority: 60,
			preconditions: (s) =>
				Date.now() - s.lastAuctionScan > CONFIG.agent.scanIntervalMs,
			execute: async (s) => {
				// Pay 0.05 USDC for the active auction list (x402 intelligence)
				console.log(
					`[watch_auctions] fetching auctions from ${CONFIG.x402.serverUrl}/auctions (x402)...`,
				)
				const response = await x402.fetch(`${CONFIG.x402.serverUrl}/auctions`)

				if (!response.ok) {
					console.warn(
						`[watch_auctions] x402 server returned ${response.status} — falling back to direct chain scan`,
					)
					await watchDirectly(s)
					return
				}

				const body = await response.json()
				const auctions: any[] = body.auctions ?? []

				const activeAuctions: Auction[] = auctions.map((a: any) => ({
					id: BigInt(a.id),
					positionId: BigInt(a.positionId),
					collateralAsset: a.collateralAsset,
					collateralAmount: BigInt(a.collateralAmount),
					startPrice: BigInt(a.startPrice),
					floorPrice: BigInt(a.floorPrice),
					decayRatePerLedger: BigInt(a.decayRatePerLedger ?? 0),
					startedAtLedger: a.startedAtLedger,
					triggerAgent: a.triggerAgent,
					settled: a.settled ?? false,
					declaredWinner: a.declaredWinner ?? null,
				}))

				// Clean up placed bids for auctions that are now settled/gone
				for (const id of s.placedBidAuctionIds) {
					if (!activeAuctions.find((a) => a.id.toString() === id)) {
						s.placedBidAuctionIds.delete(id)
					}
				}

				// Recover bid state after restart: if we're the declared winner
				// or can detect our bid on-chain, restore the local tracking set.
				const myKey = keypair.publicKey()
				for (const a of activeAuctions) {
					if (a.declaredWinner === myKey) {
						s.placedBidAuctionIds.add(a.id.toString())
					}
				}

				s.activeAuctions = activeAuctions
				s.lastAuctionScan = Date.now()
				console.log(
					`[watch_auctions] x402 paid ✓ — ${activeAuctions.length} active auctions`,
				)
			},
		},
	]
}

async function watchDirectly(s: AgentState) {
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
				const posRaw = await simulateContractRead(
					CONFIG.contracts.vault,
					"get_position",
					[nativeToScVal(native.position_id, { type: "u64" })],
				)
				const pos = scValToNative(posRaw) as any
				auctions.push({
					id,
					positionId: native.position_id,
					collateralAsset: pos.collateral_asset,
					collateralAmount: pos.collateral_amount,
					startPrice: native.start_price,
					floorPrice: native.floor_price,
					decayRatePerLedger: native.decay_rate_per_ledger,
					startedAtLedger: native.started_at_ledger,
					triggerAgent: native.trigger_agent,
					settled: native.settled,
					declaredWinner: native.declared_winner ?? null,
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
	console.log(
		`[watch_auctions] direct scan — ${auctions.length} active auctions`,
	)
}

function computeCurrentPrice(auction: Auction, currentLedger: bigint): bigint {
	const elapsed = currentLedger - BigInt(auction.startedAtLedger)
	const discount = auction.decayRatePerLedger * elapsed
	const price = (auction.startPrice * (SCALE - discount)) / SCALE
	return price < auction.floorPrice ? auction.floorPrice : price
}
