"use client"
import { useState, useEffect, useCallback } from "react"
import { CONTRACTS } from "@/lib/config"
import { getClassicUsdcBalance } from "@/lib/horizon"
import {
	getPoolStats,
	getVusdcBalance,
	getUsdcBalance,
	getXlmBalance,
	getAllPositions,
	type Position,
	type PoolStats,
} from "@/lib/vault"

export interface ProfileData {
	vusdcBalance: bigint
	usdcBalance: bigint
	xlmBalance: bigint
	poolStats: PoolStats | null
	myPositions: [bigint, Position][]
	loading: boolean
}

const POLL_MS = 10_000

export function useProfile(publicKey: string | null): ProfileData {
	const [vusdcBalance, setVusdcBalance] = useState(0n)
	const [usdcBalance, setUsdcBalance] = useState(0n)
	const [xlmBalance, setXlmBalance] = useState(0n)
	const [poolStats, setPoolStats] = useState<PoolStats | null>(null)
	const [myPositions, setMyPositions] = useState<[bigint, Position][]>([])
	const [loading, setLoading] = useState(true)

	const refresh = useCallback(async () => {
		if (!publicKey || !CONTRACTS.vault) {
			setLoading(false)
			return
		}
		try {
			const [stats, vusdc, usdcSac, usdcHorizon, xlm] = await Promise.all([
				getPoolStats(),
				CONTRACTS.vusdc
					? getVusdcBalance(publicKey).catch(() => 0n)
					: Promise.resolve(0n),
				CONTRACTS.usdc
					? getUsdcBalance(publicKey).catch((err) => {
							console.warn("[useProfile] USDC SAC balance failed:", err)
							return 0n
						})
					: Promise.resolve(0n),
				getClassicUsdcBalance(publicKey),
				getXlmBalance(publicKey).catch(() => 0n),
			])
			// Prefer the SAC balance if non-zero, otherwise fall back to classic Horizon balance
			const usdc = usdcSac > 0n ? usdcSac : usdcHorizon

			setPoolStats(stats)
			setVusdcBalance(vusdc)
			setUsdcBalance(usdc)
			setXlmBalance(xlm)

			const all = await getAllPositions(stats.positionCount)
			const mine = all.filter(
				([, pos]) => pos.owner.toLowerCase() === publicKey.toLowerCase(),
			)
			setMyPositions(mine)
		} catch (err) {
			console.error("[useProfile] refresh failed:", err)
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

	return {
		vusdcBalance,
		usdcBalance,
		xlmBalance,
		poolStats,
		myPositions,
		loading,
	}
}
