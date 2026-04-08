"use client"
import { useState, useEffect, useCallback } from "react"
import { CONTRACTS } from "@/lib/config"
import { getCurrentLedger, getEvents } from "@/lib/soroban"
import { getAllActiveAuctions, getPoolStats } from "@/lib/vault"

export interface LeaderboardEntry {
	address: string
	count: number
}

export interface LeaderboardData {
	liquidations: LeaderboardEntry[] // agents that triggered liquidations
	auctionWins: LeaderboardEntry[] // agents that won auctions
	loading: boolean
}

/** Try to extract a Stellar public key (G…, 56 chars) from any value */
function extractStellarAddress(val: unknown): string | null {
	if (typeof val === "string" && val.startsWith("G") && val.length === 56) {
		return val
	}
	if (val && typeof val === "object") {
		if (Array.isArray(val)) {
			for (const item of val) {
				const addr = extractStellarAddress(item)
				if (addr) return addr
			}
		} else {
			for (const key of Object.keys(val as object)) {
				const addr = extractStellarAddress(
					(val as Record<string, unknown>)[key],
				)
				if (addr) return addr
			}
		}
	}
	return null
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
			// ---- Liquidation triggers ----
			// 1. Active auctions — each has a trigger_agent
			const stats = await getPoolStats()
			const activeAuctions = await getAllActiveAuctions(stats.auctionCount)
			const triggerAddrs: string[] = activeAuctions.map(
				([, auction]) => auction.trigger_agent,
			)

			// 2. Contract events — auction_started events (covers settled auctions too)
			const ledger = await getCurrentLedger()
			const startLedger = Math.max(1, ledger - 5000) // last ~7h of ledgers
			const events = await getEvents(CONTRACTS.vault, startLedger)

			const winnerAddrs: string[] = []

			for (const ev of events) {
				const topicStr = String(ev.topic ?? "")
				const isStarted = topicStr.includes("auction_started")
				const isSettled = topicStr.includes("auction_settled")

				if (isStarted) {
					// Try to extract trigger agent from event topics or value
					const addrFromTopics = extractStellarAddress(ev.topic)
					const addrFromValue = extractStellarAddress(ev.value)
					const addr = addrFromTopics ?? addrFromValue
					if (addr) triggerAddrs.push(addr)
				}

				if (isSettled) {
					// Try to extract winning bidder
					const addrFromTopics = extractStellarAddress(ev.topic)
					const addrFromValue = extractStellarAddress(ev.value)
					const addr = addrFromTopics ?? addrFromValue
					if (addr) winnerAddrs.push(addr)
				}
			}

			setLiquidations(aggregate(triggerAddrs))
			setAuctionWins(aggregate(winnerAddrs))
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
