"use client"
import { useState, useEffect, useCallback } from "react"
import { CONTRACTS } from "@/lib/config"
import {
	getPoolStats,
	getVusdcBalance,
	getAllPositions,
	type Position,
	type PoolStats,
} from "@/lib/vault"

export interface ProfileData {
	vusdcBalance: bigint
	poolStats: PoolStats | null
	myPositions: [bigint, Position][]
	loading: boolean
}

const POLL_MS = 10_000

export function useProfile(publicKey: string | null): ProfileData {
	const [vusdcBalance, setVusdcBalance] = useState(0n)
	const [poolStats, setPoolStats] = useState<PoolStats | null>(null)
	const [myPositions, setMyPositions] = useState<[bigint, Position][]>([])
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		if (!publicKey || !CONTRACTS.vault) {
			setLoading(false)
			return
		}
		try {
			const [stats, balance] = await Promise.all([
				getPoolStats(),
				CONTRACTS.vusdc
					? getVusdcBalance(publicKey).catch(() => 0n)
					: Promise.resolve(0n),
			])

			setPoolStats(stats)
			setVusdcBalance(balance)

			// Filter all positions by owner
			const all = await getAllPositions(stats.positionCount)
			const mine = all.filter(
				([, pos]) => pos.owner.toLowerCase() === publicKey.toLowerCase(),
			)
			setMyPositions(mine)
		} catch {
			/* rpc error — keep previous state */
		} finally {
			setLoading(false)
		}
	}, [publicKey])

	useEffect(() => {
		setLoading(true)
		void refresh()
		const t = setInterval(() => void refresh(), POLL_MS)
		return () => clearInterval(t)
	}, [refresh])

	return { vusdcBalance, poolStats, myPositions, loading }
}
