"use client"
import { useState } from "react"
import { useAuctions } from "@/hooks/useVault"
import { useWallet } from "@/hooks/useWallet"
import { fmt7, SCALE } from "@/lib/config"
import { buildBidTx, type Auction } from "@/lib/vault"

const SCALE_N = 10_000_000

function DecayCurve({
	auction,
	currentPrice,
}: {
	auction: Auction
	currentPrice: bigint
}) {
	const startPct = 100
	const floorPct =
		(Number(auction.floor_price) / Number(auction.start_price)) * 100
	const currentPct = (Number(currentPrice) / Number(auction.start_price)) * 100

	return (
		<div className="mt-3 relative h-12">
			<svg
				className="w-full h-full"
				viewBox="0 0 200 48"
				preserveAspectRatio="none"
			>
				{/* decay line */}
				<line
					x1="0"
					y1="4"
					x2="200"
					y2={48 - 48 * (floorPct / 100)}
					stroke="#6366f1"
					strokeWidth="2"
					strokeDasharray="4,2"
				/>
				{/* floor */}
				<line
					x1="0"
					y1={48 - 48 * (floorPct / 100)}
					x2="200"
					y2={48 - 48 * (floorPct / 100)}
					stroke="#374151"
					strokeWidth="1"
				/>
				{/* current price marker */}
				<circle
					cx={`${currentPct}%`}
					cy={48 - 48 * (currentPct / 100)}
					r="4"
					fill="#f59e0b"
				/>
			</svg>
			<div className="absolute top-0 left-0 text-xs text-gray-500">
				Start: ${fmt7(auction.start_price)}
			</div>
			<div className="absolute bottom-0 left-0 text-xs text-gray-500">
				Floor: ${fmt7(auction.floor_price)}
			</div>
			<div className="absolute top-1/2 -translate-y-1/2 right-0 text-xs text-yellow-400">
				Now: ${fmt7(currentPrice)}
			</div>
		</div>
	)
}

function AuctionCard({
	id,
	auction,
	currentPrice,
}: {
	id: bigint
	auction: Auction
	currentPrice: bigint
}) {
	const { publicKey, connected, sign } = useWallet()
	const [bidding, setBidding] = useState(false)
	const [txHash, setTxHash] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const discount =
		auction.start_price > 0n
			? (
					(Number(auction.start_price - currentPrice) /
						Number(auction.start_price)) *
					100
				).toFixed(1)
			: "0.0"

	async function placeBid() {
		if (!publicKey) return
		setBidding(true)
		setError(null)
		try {
			const xdr = await buildBidTx(publicKey, id, currentPrice)
			const hash = await sign(xdr)
			setTxHash(hash)
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setBidding(false)
		}
	}

	return (
		<div className="rounded-xl border border-orange-500/30 bg-gray-900 p-5 space-y-4">
			<div className="flex items-start justify-between">
				<div>
					<p className="text-xs text-gray-400">Auction #{id.toString()}</p>
					<p className="text-sm text-gray-300 mt-0.5">
						Position #{auction.position_id.toString()}
					</p>
				</div>
				<div className="text-right">
					<p className="text-lg font-semibold text-yellow-400">
						${fmt7(currentPrice)}
					</p>
					<p className="text-xs text-green-400">{discount}% discount</p>
				</div>
			</div>

			<DecayCurve auction={auction} currentPrice={currentPrice} />

			<div className="grid grid-cols-2 gap-3 text-sm">
				<div>
					<p className="text-xs text-gray-400">Start Price</p>
					<p className="text-white">${fmt7(auction.start_price)}</p>
				</div>
				<div>
					<p className="text-xs text-gray-400">Floor Price</p>
					<p className="text-white">${fmt7(auction.floor_price)}</p>
				</div>
				<div>
					<p className="text-xs text-gray-400">Triggered by</p>
					<p className="text-white font-mono text-xs">
						{auction.trigger_agent.slice(0, 6)}…
						{auction.trigger_agent.slice(-4)}
					</p>
				</div>
				<div>
					<p className="text-xs text-gray-400">Started at ledger</p>
					<p className="text-white">{auction.started_at_ledger}</p>
				</div>
			</div>

			{connected && (
				<button
					onClick={placeBid}
					disabled={bidding}
					className="w-full py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
				>
					{bidding ? "Bidding…" : `Bid $${fmt7(currentPrice)}`}
				</button>
			)}
			{txHash && (
				<p className="text-xs text-green-400 break-all">
					Settled! Tx: {txHash.slice(0, 16)}…
				</p>
			)}
			{error && <p className="text-xs text-red-400">{error}</p>}
		</div>
	)
}

export function AuctionPanel() {
	const { auctions, prices, loading } = useAuctions()

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-white">Auctions</h1>
				<p className="text-sm text-gray-400 mt-1">
					Dutch auctions for undercollateralized positions. Price decays over
					time — bid when profitable.
				</p>
			</div>

			{loading && (
				<div className="text-center py-16 text-gray-500">Loading auctions…</div>
			)}

			{!loading && auctions.length === 0 && (
				<div className="text-center py-16 text-gray-500">
					No active auctions. All positions are healthy.
				</div>
			)}

			<div className="grid sm:grid-cols-2 gap-4">
				{auctions.map(([id, auction]) => (
					<AuctionCard
						key={id.toString()}
						id={id}
						auction={auction}
						currentPrice={prices[id.toString()] ?? auction.start_price}
					/>
				))}
			</div>
		</div>
	)
}
