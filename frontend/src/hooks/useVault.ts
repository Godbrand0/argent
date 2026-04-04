"use client"
import { useState, useEffect, useCallback } from "react"
import { CONTRACTS } from "@/lib/config"
import {
	getPoolStats,
	getAllPositions,
	getAllActiveAuctions,
	getCurrentAuctionPrice,
	type PoolStats,
	type Position,
	type Auction,
} from "@/lib/vault"

const POLL_MS = 5000

export function usePoolStats() {
	const [stats, setStats] = useState<PoolStats | null>(null)
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		if (!CONTRACTS.vault) return
		try {
			setStats(await getPoolStats())
		} catch {
			/* rpc not configured yet */
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void refresh()
		const t = setInterval(() => {
			void refresh()
		}, POLL_MS)
		return () => clearInterval(t)
	}, [refresh])

	return { stats, loading, refresh }
}

export function usePositions() {
	const [positions, setPositions] = useState<[bigint, Position][]>([])
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		if (!CONTRACTS.vault) return
		try {
			const stats = await getPoolStats()
			const pos = await getAllPositions(stats.positionCount)
			setPositions(pos)
		} catch {
			/* rpc not configured */
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void refresh()
		const t = setInterval(() => {
			void refresh()
		}, POLL_MS)
		return () => clearInterval(t)
	}, [refresh])

	return { positions, loading, refresh }
}

export function useAuctions() {
	const [auctions, setAuctions] = useState<[bigint, Auction][]>([])
	const [prices, setPrices] = useState<Record<string, bigint>>({})
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		if (!CONTRACTS.vault) return
		try {
			const stats = await getPoolStats()
			const active = await getAllActiveAuctions(stats.auctionCount)
			setAuctions(active)
			const priceMap: Record<string, bigint> = {}
			await Promise.all(
				active.map(async ([id]) => {
					try {
						priceMap[id.toString()] = await getCurrentAuctionPrice(id)
					} catch {}
				}),
			)
			setPrices(priceMap)
		} catch {
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void refresh()
		const t = setInterval(() => {
			void refresh()
		}, 3000) // faster for live price decay
		return () => clearInterval(t)
	}, [refresh])

	return { auctions, prices, loading, refresh }
}
