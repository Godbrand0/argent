"use client"
import { useState, useEffect, useCallback } from "react"
import {
	getPoolStats,
	getAllPositions,
	getAllActiveAuctions,
	getAllSettledAuctions,
	getCurrentAuctionPrice,
	getAuctionBids,
	type PoolStats,
	type Position,
	type Auction,
	type LimitBid,
} from "@/lib/vault"

const POLL_MS = 5000

export function usePoolStats() {
	const [stats, setStats] = useState<PoolStats | null>(null)
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		try {
			setStats(await getPoolStats())
		} catch {
			/* rpc error */
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
		try {
			const stats = await getPoolStats()
			const pos = await getAllPositions(stats.positionCount)
			setPositions(pos)
		} catch {
			setPositions([])
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
	const [bids, setBids] = useState<Record<string, LimitBid[]>>({})
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		try {
			const stats = await getPoolStats()
			const active = await getAllActiveAuctions(stats.auctionCount)
			setAuctions(active)

			const priceMap: Record<string, bigint> = {}
			const bidsMap: Record<string, LimitBid[]> = {}
			await Promise.all(
				active.map(async ([id]) => {
					try {
						priceMap[id.toString()] = await getCurrentAuctionPrice(id)
					} catch {}
					try {
						bidsMap[id.toString()] = await getAuctionBids(id)
					} catch {}
				}),
			)
			setPrices(priceMap)
			setBids(bidsMap)
		} catch {
			setAuctions([])
			setPrices({})
			setBids({})
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

	return { auctions, prices, bids, loading, refresh }
}

export function useSettledAuctions() {
	const [auctions, setAuctions] = useState<[bigint, Auction][]>([])
	const [bids, setBids] = useState<Record<string, LimitBid[]>>({})
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		try {
			const stats = await getPoolStats()
			const settled = await getAllSettledAuctions(stats.auctionCount)
			setAuctions(settled)

			const bidsMap: Record<string, LimitBid[]> = {}
			await Promise.all(
				settled.map(async ([id]) => {
					try {
						bidsMap[id.toString()] = await getAuctionBids(id)
					} catch {}
				}),
			)
			setBids(bidsMap)
		} catch {
			setAuctions([])
			setBids({})
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void refresh()
		const t = setInterval(() => void refresh(), POLL_MS)
		return () => clearInterval(t)
	}, [refresh])

	return { auctions, bids, loading, refresh }
}
