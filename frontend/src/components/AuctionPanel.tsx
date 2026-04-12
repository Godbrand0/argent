"use client"
import { AuctionLeaderboard } from "./AuctionLeaderboard"
import { CopyButton } from "./CopyButton"
import { InfoTooltip } from "./InfoTooltip"
import { useAuctions, useSettledAuctions } from "@/hooks/useVault"
import { fmt7 } from "@/lib/config"
import { type Auction, type LimitBid } from "@/lib/vault"

function DecayCurve({
	auction,
	currentPrice,
}: {
	auction: Auction
	currentPrice: bigint
}) {
	const floorPct =
		(Number(auction.floor_price) / Number(auction.start_price)) * 100
	const currentPct = (Number(currentPrice) / Number(auction.start_price)) * 100

	return (
		<div className="mt-4 relative h-16 group/curve">
			<svg
				className="w-full h-full"
				viewBox="0 0 200 64"
				preserveAspectRatio="none"
			>
				{/* background track */}
				<rect x="0" y="31" width="200" height="2" fill="#1f2937" rx="1" />
				{/* decay line */}
				<line
					x1="0"
					y1="8"
					x2="200"
					y2={64 - 64 * (floorPct / 100)}
					stroke="#6366f1"
					strokeWidth="2"
					strokeDasharray="4,2"
					className="opacity-40"
				/>
				{/* current price marker */}
				<circle
					cx={`${currentPct}%`}
					cy={64 - 64 * (currentPct / 100)}
					r="5"
					fill="#f59e0b"
					className="shadow-xl"
				/>
			</svg>
			<div className="absolute -top-1 left-0 text-[10px] text-gray-500 font-medium">
				START: ${fmt7(auction.start_price, 0)}
			</div>
			<div className="absolute -bottom-1 left-0 text-[10px] text-gray-500 font-medium tracking-tighter">
				FLOOR: ${fmt7(auction.floor_price, 0)}
			</div>
			<div
				className="absolute top-1/2 -translate-y-1/2 text-[10px] text-yellow-500 font-bold bg-gray-900 px-1 py-0.5 rounded border border-yellow-500/20 shadow-lg transition-all group-hover/curve:scale-110"
				style={{ left: `${currentPct}%` }}
			>
				NOW
			</div>
		</div>
	)
}

function BidBook({ bids }: { bids: LimitBid[] }) {
	const activeBids = bids.filter((b) => b.active)
	if (activeBids.length === 0) return null

	return (
		<div className="border-t border-gray-800/50 pt-4 space-y-2">
			<p className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center">
				Limit Bids ({activeBids.length})
				<InfoTooltip text="Active limit bids placed by registered agents. The highest bid at or above the Dutch price wins when settle_auction is called." />
			</p>
			<div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
				{activeBids
					.sort((a, b) => Number(b.max_price - a.max_price))
					.map((bid, i) => (
						<div
							key={bid.agent + i}
							className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2"
						>
							<div className="flex items-center gap-1.5">
								{i === 0 && (
									<span className="text-[9px] font-bold text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded-full">
										BEST
									</span>
								)}
								<span className="text-[11px] font-mono text-gray-300">
									{bid.agent.slice(0, 8)}…
								</span>
								<CopyButton value={bid.agent} />
							</div>
							<span className="text-[11px] font-semibold text-green-400">
								≤ ${fmt7(bid.max_price, 2)}
							</span>
						</div>
					))}
			</div>
		</div>
	)
}

function AuctionCard({
	id,
	auction,
	currentPrice,
	bids,
}: {
	id: bigint
	auction: Auction
	currentPrice: bigint
	bids: LimitBid[]
}) {
	const discount =
		auction.start_price > 0n
			? (
					(Number(auction.start_price - currentPrice) /
						Number(auction.start_price)) *
					100
				).toFixed(1)
			: "0.0"

	return (
		<div className="rounded-2xl border border-gray-800 bg-gray-900/50 hover:border-orange-500/30 transition-all duration-300 p-6 space-y-6">
			<div className="flex items-start justify-between">
				<div>
					<h3 className="text-sm font-semibold text-gray-100 flex items-center">
						Auction #{id.toString()}
						<InfoTooltip text="LiquidMind uses Dutch Auctions to settle defaulted debt. The price drops over time." />
					</h3>
					<p className="text-[11px] text-gray-500 mt-0.5">
						Targeting Position #{auction.position_id.toString()}
					</p>
				</div>
				<div className="text-right">
					<p className="text-xs text-gray-500 uppercase tracking-widest flex items-center justify-end">
						Discount
						<InfoTooltip text="The current profit margin available for an agent to settle this auction." />
					</p>
					<p className="text-xl font-black text-green-400">{discount}%</p>
				</div>
			</div>

			<div>
				<p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 flex items-center">
					Settlement Price
					<InfoTooltip text="The amount of USDC an agent must pay to claim the discounted XLM collateral." />
				</p>
				<p className="text-3xl font-bold text-white tracking-tight">
					${fmt7(currentPrice, 2)}
				</p>
			</div>

			<DecayCurve auction={auction} currentPrice={currentPrice} />

			<div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800/50">
				<div>
					<p className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center">
						Agent
						<InfoTooltip text="The autonomous liquidator that identified this opportunity and triggered the auction." />
					</p>
					<div className="flex items-center gap-1.5 mt-0.5">
						<span className="text-[11px] font-mono text-gray-300">
							{auction.trigger_agent.slice(0, 8)}…
						</span>
						<CopyButton value={auction.trigger_agent} />
					</div>
				</div>
				<div className="flex flex-col items-end">
					<p className="text-[10px] text-gray-500 uppercase tracking-widest">
						Status
					</p>
					{auction.declared_winner ? (
						<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
							<span className="w-1 h-1 rounded-full bg-green-400 mr-1.5" />
							WINNER DECLARED
						</span>
					) : (
						<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
							<span className="w-1 h-1 rounded-full bg-yellow-500 mr-1.5 animate-pulse" />
							ACTIVE
						</span>
					)}
				</div>
			</div>

			{auction.declared_winner && (
				<div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 space-y-1">
					<p className="text-[10px] text-green-400 font-semibold uppercase tracking-widest">
						Winner Declared
					</p>
					<div className="flex items-center gap-1.5">
						<span className="text-[11px] font-mono text-gray-300">
							{auction.declared_winner.slice(0, 8)}…
						</span>
						<CopyButton value={auction.declared_winner} />
					</div>
					<p className="text-[10px] text-gray-500">
						Bid limit reached. Awaiting settlement at current Dutch price.
					</p>
				</div>
			)}

			<BidBook bids={bids} />

			<div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3">
				<p className="text-[10px] text-blue-400 font-medium leading-relaxed">
					Note: Manual bidding is disabled. This auction is being monitored by
					the LiquidMind agent network.
				</p>
			</div>
		</div>
	)
}

export function AuctionPanel() {
	const { auctions, prices, bids, loading } = useAuctions()
	const {
		auctions: settledAuctions,
		bids: settledBids,
		loading: loadingSettled,
	} = useSettledAuctions()

	return (
		<div className="space-y-8 max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
			<div className="border-b border-gray-800 pb-6">
				<h1 className="text-3xl font-bold text-white tracking-tight">
					Auctions
				</h1>
				<p className="text-sm text-gray-400 mt-2 max-w-2xl">
					The protocol marketplace for discounted collateral. Prices decay over
					time until an autonomous agent strikes a profitable deal.
				</p>
			</div>

			<div className="grid lg:grid-cols-4 gap-8">
				{/* Main Content Area (Active Auctions & Leaderboard) */}
				<div className="lg:col-span-3 space-y-8">
					{loading ? (
						<div className="flex flex-col items-center justify-center py-24 space-y-4">
							<div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
							<p className="text-xs text-gray-500 animate-pulse">
								Reading auction book...
							</p>
						</div>
					) : auctions.length === 0 ? (
						<div className="text-center py-20 bg-gray-900/30 rounded-3xl border border-dashed border-gray-800">
							<p className="text-gray-500 text-sm">
								No active auctions right now.
							</p>
							<p className="text-[11px] text-gray-600 mt-1">
								Healthy protocols have empty auction books.
							</p>
						</div>
					) : (
						<div className="grid sm:grid-cols-2 gap-8">
							{auctions.map(([id, auction]) => (
								<AuctionCard
									key={id.toString()}
									id={id}
									auction={auction}
									currentPrice={prices[id.toString()] ?? auction.start_price}
									bids={bids[id.toString()] ?? []}
								/>
							))}
						</div>
					)}

					{/* Agent leaderboard */}
					<div className="border-t border-gray-800 pt-8">
						<AuctionLeaderboard />
					</div>
				</div>

				{/* Right Sidebar (Concluded Auctions) */}
				<div className="lg:col-span-1 lg:pl-6 lg:border-l border-gray-800 space-y-4">
					<h2 className="text-sm font-semibold text-gray-100 uppercase tracking-widest flex items-center">
						Concluded
						<InfoTooltip text="Successfully settled auctions where collateral was claimed by an agent." />
					</h2>

					{loadingSettled ? (
						<div className="py-8 flex justify-center">
							<div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
						</div>
					) : settledAuctions.length === 0 ? (
						<div className="text-center py-8 bg-gray-900/20 rounded-xl border border-dashed border-gray-800">
							<p className="text-xs text-gray-500">No concluded auctions.</p>
						</div>
					) : (
						<div className="space-y-3 max-h-[800px] overflow-y-auto pr-2">
							{settledAuctions.map(([id, auction]) => {
								const winner = auction.declared_winner || auction.trigger_agent
								const auctionBids = settledBids[id.toString()] ?? []
								const winnerBid = auctionBids
									.filter((b) => b.agent === winner)
									.sort((a, b) => Number(b.max_price - a.max_price))[0]

								const highestBid = [...auctionBids].sort((a, b) =>
									Number(b.max_price - a.max_price),
								)[0]
								const displayBid = winnerBid || highestBid

								return (
									<div
										key={id.toString()}
										className="bg-gray-900/40 border border-gray-800 rounded-xl p-4 transition-all hover:border-gray-700"
									>
										<div className="flex justify-between items-center mb-2">
											<p className="text-xs font-semibold text-gray-200">
												Auction #{id.toString()}
											</p>
											<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-gray-800 text-gray-400">
												SETTLED
											</span>
										</div>
										<div className="space-y-1">
											<p className="text-[10px] text-gray-500 flex justify-between items-center">
												<span>Winner:</span>
												<span className="font-mono text-green-400 flex items-center gap-1">
													{winner.slice(0, 8)}…
													<CopyButton value={winner} />
												</span>
											</p>
											<p className="text-[10px] text-gray-500 flex justify-between items-center">
												<span>Max Bid Placed:</span>
												<span className="font-mono text-gray-300">
													{displayBid
														? `$${fmt7(displayBid.max_price, 2)} USDC`
														: "--"}
												</span>
											</p>
										</div>
									</div>
								)
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
