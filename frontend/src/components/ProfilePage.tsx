"use client"
import Link from "next/link"
import { useState } from "react"
import { CopyButton } from "./CopyButton"
import { InfoTooltip } from "./InfoTooltip"
import { useProfile } from "@/hooks/useProfile"
import { useWallet } from "@/hooks/useWallet"
import { fmt7, fmtPct, hfColor, hfBarPct, SCALE } from "@/lib/config"
import { type Position } from "@/lib/vault"

// XLM/USDC mock price (same as PositionList)
const MOCK_XLM_PRICE = 1_100_000n

function computeHF(pos: Position): bigint {
	if (pos.debt_principal === 0n) return 999n * SCALE
	const LIQ_THRESHOLD = 8_000_000n
	const colVal = (pos.collateral_amount * MOCK_XLM_PRICE) / SCALE
	return (colVal * LIQ_THRESHOLD) / pos.debt_principal
}

function StatusBadge({ state }: { state: string }) {
	if (state === "None") return null
	return (
		<span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
			Auction {state}
		</span>
	)
}

function PositionCard({ id, pos }: { id: bigint; pos: Position }) {
	const hf = computeHF(pos)
	const hfStr =
		pos.debt_principal === 0n ? "∞" : (Number(hf) / 10_000_000).toFixed(2)
	const atRisk = hf < SCALE && pos.debt_principal > 0n

	return (
		<div
			className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
				atRisk
					? "border-red-500/40 bg-red-950/5 shadow-lg shadow-red-900/10"
					: "border-gray-800 bg-gray-900/50 hover:border-gray-700"
			}`}
		>
			<div className="p-5 space-y-4">
				<div className="flex justify-between items-center">
					<div>
						<h3 className="text-sm font-semibold text-gray-100">
							Loan #{id.toString()}
						</h3>
						<p className="text-[10px] text-gray-600 mt-0.5">
							Opened at ledger {pos.opened_at_ledger}
						</p>
					</div>
					<StatusBadge state={pos.auction_state.tag} />
				</div>

				<div className="grid grid-cols-2 gap-4 border-t border-gray-800/50 pt-4">
					<div>
						<p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center">
							Collateral
							<InfoTooltip text="XLM locked as collateral for this loan." />
						</p>
						<p className="text-sm font-medium text-white">
							{fmt7(pos.collateral_amount, 0)} {pos.collateral_asset}
						</p>
					</div>
					<div>
						<p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center">
							Debt
							<InfoTooltip text="USDC borrowed against your collateral." />
						</p>
						<p className="text-sm font-medium text-white">
							${fmt7(pos.debt_principal, 2)}
						</p>
					</div>
				</div>

				<div>
					<div className="flex justify-between items-end mb-1.5">
						<span className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center">
							Health Factor
							<InfoTooltip text="Below 1.0 triggers liquidation. Add collateral or repay debt to improve it." />
						</span>
						<span className={`text-sm font-bold ${hfColor(hf)}`}>{hfStr}</span>
					</div>
					<div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
						<div
							className={`h-full rounded-full transition-all duration-500 ${
								hf >= (SCALE * 13n) / 10n
									? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"
									: hf >= SCALE
										? "bg-yellow-500"
										: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
							}`}
							style={{ width: `${hfBarPct(hf)}%` }}
						/>
					</div>
				</div>

				<Link
					href="/borrow"
					className="block text-center text-xs font-semibold py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
				>
					Manage Position →
				</Link>
			</div>
		</div>
	)
}

export function ProfilePage() {
	const { publicKey, connected } = useWallet()
	const { vusdcBalance, poolStats, myPositions, loading } = useProfile(
		publicKey ?? null,
	)
	const [tab, setTab] = useState<"lender" | "borrower">("lender")

	if (!connected || !publicKey) {
		return (
			<div className="flex flex-col items-center justify-center py-32 space-y-4">
				<div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center">
					<svg
						className="w-7 h-7 text-gray-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.5}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
						/>
					</svg>
				</div>
				<p className="text-gray-400 text-sm font-medium">
					Connect your wallet to view your profile
				</p>
				<p className="text-gray-600 text-xs">
					Your lending deposits and borrow positions will appear here.
				</p>
			</div>
		)
	}

	// Pool share % = (vusdcBalance / totalDeposits) * 100
	const shareStr =
		poolStats && poolStats.totalDeposits > 0n
			? (
					(Number(vusdcBalance) / Number(poolStats.totalDeposits)) *
					100
				).toFixed(2) + "%"
			: "—"

	const totalCollateral = myPositions.reduce(
		(sum, [, pos]) => sum + pos.collateral_amount,
		0n,
	)
	const totalDebt = myPositions.reduce(
		(sum, [, pos]) => sum + pos.debt_principal,
		0n,
	)
	const atRiskCount = myPositions.filter(([, pos]) => {
		if (pos.debt_principal === 0n) return false
		return computeHF(pos) < SCALE
	}).length

	return (
		<div className="space-y-8 max-w-4xl mx-auto">
			{/* Header */}
			<div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
				<div className="flex items-start justify-between gap-4 flex-wrap">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-full bg-indigo-950 border border-indigo-900/60 flex items-center justify-center shrink-0">
							<svg
								className="w-6 h-6 text-indigo-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={1.5}
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
								/>
							</svg>
						</div>
						<div>
							<p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
								Connected Wallet
							</p>
							<div className="flex items-center gap-2 flex-wrap">
								<code className="text-sm font-mono text-indigo-300">
									{publicKey.slice(0, 12)}…{publicKey.slice(-8)}
								</code>
								<CopyButton value={publicKey} />
							</div>
						</div>
					</div>

					{/* Quick stats */}
					<div className="flex gap-6">
						<div className="text-right">
							<p className="text-[10px] text-gray-500 uppercase tracking-wider">
								Positions
							</p>
							<p className="text-xl font-bold text-white">
								{loading ? "…" : myPositions.length}
							</p>
						</div>
						{atRiskCount > 0 && (
							<div className="text-right">
								<p className="text-[10px] text-red-500 uppercase tracking-wider">
									At Risk
								</p>
								<p className="text-xl font-bold text-red-400">{atRiskCount}</p>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Tabs */}
			<div className="flex gap-2 border-b border-gray-800 pb-0">
				{(["lender", "borrower"] as const).map((t) => (
					<button
						key={t}
						onClick={() => setTab(t)}
						className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
							tab === t
								? "border-indigo-500 text-white"
								: "border-transparent text-gray-500 hover:text-gray-300"
						}`}
					>
						{t === "lender" ? "Lender" : "Borrower"}
					</button>
				))}
			</div>

			{/* Lender tab */}
			{tab === "lender" && (
				<div className="space-y-6">
					<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
						<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
							<p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
								vUSDC Balance
								<InfoTooltip text="Your vUSDC tokens represent your share of the lending pool. They increase in value as borrowers pay interest." />
							</p>
							<p className="text-2xl font-bold text-white mt-1">
								{loading ? "…" : fmt7(vusdcBalance, 2)}
							</p>
							<p className="text-[10px] text-gray-600 mt-0.5">vUSDC</p>
						</div>
						<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
							<p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
								Pool Share
								<InfoTooltip text="Your share of the total USDC deposited in the pool." />
							</p>
							<p className="text-2xl font-bold text-white mt-1">
								{loading ? "…" : shareStr}
							</p>
							<p className="text-[10px] text-gray-600 mt-0.5">of total pool</p>
						</div>
						<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
							<p className="text-[10px] text-gray-500 uppercase tracking-wider">
								Current APY
							</p>
							<p className="text-2xl font-bold text-indigo-400 mt-1">
								{loading || !poolStats ? "…" : fmtPct(poolStats.borrowRate)}
							</p>
							<p className="text-[10px] text-gray-600 mt-0.5">annualized</p>
						</div>
					</div>

					{vusdcBalance === 0n && !loading ? (
						<div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-10 text-center space-y-3">
							<p className="text-gray-500 text-sm">
								You have no active deposits.
							</p>
							<Link
								href="/lend"
								className="inline-block px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
							>
								Deposit USDC →
							</Link>
						</div>
					) : (
						<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 flex items-center justify-between gap-4">
							<div>
								<p className="text-sm font-medium text-gray-300">
									Manage your deposit
								</p>
								<p className="text-xs text-gray-500 mt-0.5">
									Deposit more USDC or withdraw by redeeming vUSDC.
								</p>
							</div>
							<Link
								href="/lend"
								className="shrink-0 px-4 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
							>
								Go to Lend →
							</Link>
						</div>
					)}
				</div>
			)}

			{/* Borrower tab */}
			{tab === "borrower" && (
				<div className="space-y-6">
					{myPositions.length > 0 && (
						<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
							<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
								<p className="text-[10px] text-gray-500 uppercase tracking-wider">
									Total Collateral
								</p>
								<p className="text-2xl font-bold text-white mt-1">
									{loading ? "…" : `${fmt7(totalCollateral, 0)} XLM`}
								</p>
							</div>
							<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
								<p className="text-[10px] text-gray-500 uppercase tracking-wider">
									Total Debt
								</p>
								<p className="text-2xl font-bold text-white mt-1">
									{loading ? "…" : `$${fmt7(totalDebt, 2)}`}
								</p>
							</div>
							<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
								<p className="text-[10px] text-gray-500 uppercase tracking-wider">
									Open Positions
								</p>
								<p className="text-2xl font-bold text-white mt-1">
									{myPositions.length}
								</p>
							</div>
						</div>
					)}

					{loading ? (
						<div className="flex flex-col items-center justify-center py-16 space-y-3">
							<div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
							<p className="text-xs text-gray-500 animate-pulse">
								Loading positions…
							</p>
						</div>
					) : myPositions.length === 0 ? (
						<div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-10 text-center space-y-3">
							<p className="text-gray-500 text-sm">
								You have no active borrow positions.
							</p>
							<Link
								href="/borrow"
								className="inline-block px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
							>
								Open a Position →
							</Link>
						</div>
					) : (
						<div className="grid sm:grid-cols-2 gap-5">
							{myPositions.map(([id, pos]) => (
								<PositionCard key={id.toString()} id={id} pos={pos} />
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
}
