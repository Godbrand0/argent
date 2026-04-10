"use client"
import Link from "next/link"
import { StatCard } from "./StatCard"
import { usePoolStats, usePositions } from "@/hooks/useVault"
import { fmt7, fmtPct, SCALE } from "@/lib/config"

export function VaultDashboard() {
	const { stats, loading: statsLoading } = usePoolStats()
	const { positions, loading: posLoading } = usePositions()

	const loading = statsLoading || posLoading

	const totalDeposited = stats ? `$${fmt7(stats.totalDeposits, 0)}` : "—"
	const totalBorrowed = stats ? `$${fmt7(stats.totalBorrows, 0)}` : "—"
	const util = stats ? fmtPct(stats.utilization) : "—"
	const rate = stats ? fmtPct(stats.borrowRate) : "—"
	const reserve = stats ? `$${fmt7(stats.reserveFund)}` : "—"

	// Aggregate total XLM collateral across all positions
	const totalCollateral = positions.reduce(
		(sum, [, pos]) => sum + pos.collateral_amount,
		0n,
	)
	const totalCollateralStr = posLoading
		? "…"
		: `${fmt7(totalCollateral, 0)} XLM`

	const activePositions = positions.length
	const atRisk = positions.filter(([, pos]) => {
		if (pos.debt_principal === 0n) return false
		const LIQ_THRESHOLD = 8_000_000n
		const MOCK_XLM_PRICE = 800_000n
		const colVal = (pos.collateral_amount * MOCK_XLM_PRICE) / SCALE
		const hf = (colVal * LIQ_THRESHOLD) / pos.debt_principal
		return hf < SCALE
	}).length

	return (
		<div className="space-y-10">
			<div>
				<h1 className="text-2xl font-bold text-white">Dashboard</h1>
				<p className="text-sm text-gray-400 mt-1">
					Protocol-wide overview of the LiquidMind lending pool.
				</p>
			</div>

			{/* Primary stats */}
			<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
				<StatCard
					label="Total Deposited by Lenders"
					value={loading ? "…" : totalDeposited}
					accent
				/>
				<StatCard
					label="Total Borrowed"
					value={loading ? "…" : totalBorrowed}
				/>
				<StatCard
					label="Total Collateral Deposited"
					value={loading ? "…" : totalCollateralStr}
					sub="XLM locked by borrowers"
				/>
				<StatCard label="Utilization" value={loading ? "…" : util} />
				<StatCard
					label="Borrow Rate"
					value={loading ? "…" : rate}
					sub="annualized"
				/>
				<StatCard label="Reserve Fund" value={loading ? "…" : reserve} />
			</div>

			{/* Position health summary */}
			<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
				<div>
					<p className="text-[10px] text-gray-500 uppercase tracking-wider">
						Active Positions
					</p>
					<p className="text-2xl font-bold text-white mt-1">
						{posLoading ? "…" : activePositions}
					</p>
				</div>
				<div>
					<p className="text-[10px] text-gray-500 uppercase tracking-wider">
						Positions at Risk
					</p>
					<p
						className={`text-2xl font-bold mt-1 ${atRisk > 0 ? "text-red-400" : "text-green-400"}`}
					>
						{posLoading ? "…" : atRisk}
					</p>
				</div>
				<div>
					<p className="text-[10px] text-gray-500 uppercase tracking-wider">
						Active Auctions
					</p>
					<p className="text-2xl font-bold text-white mt-1">
						{statsLoading ? "…" : (stats?.auctionCount?.toString() ?? "0")}
					</p>
				</div>
				<div>
					<p className="text-[10px] text-gray-500 uppercase tracking-wider">
						Total Loans
					</p>
					<p className="text-2xl font-bold text-white mt-1">
						{statsLoading ? "…" : (stats?.positionCount?.toString() ?? "0")}
					</p>
				</div>
			</div>

			{/* CTA cards */}
			<div className="grid sm:grid-cols-2 gap-4">
				<div className="rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-5 flex flex-col gap-3">
					<div>
						<p className="text-sm font-semibold text-white">Lend USDC</p>
						<p className="text-xs text-gray-400 mt-1">
							Deposit USDC to earn yield from borrower interest. Receive vUSDC
							representing your share of the pool.
						</p>
					</div>
					<Link
						href="/lend"
						className="self-start px-4 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
					>
						Go to Lend →
					</Link>
				</div>
				<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 flex flex-col gap-3">
					<div>
						<p className="text-sm font-semibold text-white">Borrow USDC</p>
						<p className="text-xs text-gray-400 mt-1">
							Deposit XLM as collateral and borrow USDC against it. Keep your
							health factor above 1.0 to avoid liquidation.
						</p>
					</div>
					<Link
						href="/borrow"
						className="self-start px-4 py-1.5 text-xs font-semibold rounded-md bg-gray-700 hover:bg-gray-600 text-white transition-colors"
					>
						Go to Borrow →
					</Link>
				</div>
			</div>

			{/* Agent access callout */}
			<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 flex items-center justify-between gap-4">
				<div>
					<p className="text-sm font-medium text-gray-300">
						Programmatic Access
					</p>
					<p className="text-xs text-gray-500 mt-0.5">
						Automate liquidations and auction bidding with an autonomous agent.
					</p>
				</div>
				<Link
					href="/agent"
					className="shrink-0 px-4 py-1.5 text-xs font-medium rounded-md bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
				>
					Agent Access →
				</Link>
			</div>
		</div>
	)
}
