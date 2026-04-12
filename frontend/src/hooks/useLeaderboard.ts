"use client"
import { useState, useEffect, useCallback } from "react"
import { CONTRACTS } from "@/lib/config"
import {
	getAllActiveAuctions,
	getAllSettledAuctions,
	getAuctionBids,
	getPoolStats,
} from "@/lib/vault"

export interface LeaderboardEntry {
	address: string
	count: number
	totalWinnings?: bigint
}

export interface LeaderboardData {
	liquidations: LeaderboardEntry[] // agents that triggered liquidations
	auctionWins: LeaderboardEntry[] // agents that won auctions
	loading: boolean
}

function aggregate(addresses: string[]): LeaderboardEntry[] {
	const counts: Record<string, number> = {}
	for (const addr of addresses) {
		counts[addr] = (counts[addr] ?? 0) + 1
	}
	return Object.entries(counts)
		.map(([address, count]) => ({ address, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10)
}

const POLL_MS = 10_000

export function useLeaderboard(): LeaderboardData {
	const [liquidations, setLiquidations] = useState<LeaderboardEntry[]>([])
	const [auctionWins, setAuctionWins] = useState<LeaderboardEntry[]>([])
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		if (!CONTRACTS.vault) {
			setLoading(false)
			return
		}
		try {
			const stats = await getPoolStats()

			// 1. Fetch all auctions (active + settled)
			const [activeAuctions, settledAuctions] = await Promise.all([
				getAllActiveAuctions(stats.auctionCount),
				getAllSettledAuctions(stats.auctionCount),
			])

			// 2. Liquidation triggers are simply the combined trigger_agents
			const triggerAddrs = [
				...activeAuctions.map(([, a]) => a.trigger_agent),
				...settledAuctions.map(([, a]) => a.trigger_agent),
			]

			// 3. Settled auctions for winnings
			const winData: Record<string, { count: number; totalWinnings: bigint }> =
				{}

			await Promise.all(
				settledAuctions.map(async ([id, auction]) => {
					const winner = auction.declared_winner || auction.trigger_agent
					let winningAmt = 0n
					try {
						const auctionBids = await getAuctionBids(id)
						const winnerBid = auctionBids.find((b) => b.agent === winner)
						if (winnerBid) {
							winningAmt = winnerBid.max_price
						} else if (auctionBids.length > 0) {
							const maxBid = [...auctionBids].sort((a, b) =>
								Number(b.max_price - a.max_price),
							)[0]
							winningAmt = maxBid.max_price
						} else {
							winningAmt = auction.floor_price // fallback if no bids exist
						}
					} catch {}

					if (!winData[winner]) {
						winData[winner] = { count: 0, totalWinnings: 0n }
					}
					winData[winner].count += 1
					winData[winner].totalWinnings += winningAmt
				}),
			)

			const auctionWinsList: LeaderboardEntry[] = Object.entries(winData)
				.map(([address, data]) => ({
					address,
					count: data.count,
					totalWinnings: data.totalWinnings,
				}))
				.sort((a, b) => Number(b.totalWinnings! - a.totalWinnings!))
				.slice(0, 10)

			setLiquidations(aggregate(triggerAddrs))
			setAuctionWins(auctionWinsList)
		} catch {
			// silently fail — leaderboard is non-critical
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void refresh()
		const t = setInterval(() => void refresh(), POLL_MS)
		return () => clearInterval(t)
	}, [refresh])

	return { liquidations, auctionWins, loading }
}
