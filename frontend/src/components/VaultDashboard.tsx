"use client"
import { useState } from "react"
import { StatCard } from "./StatCard"
import { usePoolStats } from "@/hooks/useVault"
import { useWallet } from "@/hooks/useWallet"
import { fmt7, fmtPct, SCALE } from "@/lib/config"
import {
	buildDepositTx,
	buildWithdrawTx,
	buildDepositCollateralTx,
	buildBorrowTx,
	buildRepayTx,
} from "@/lib/vault"

export function VaultDashboard() {
	const { stats, loading } = usePoolStats()
	const { publicKey, connected, sign } = useWallet()

	const tvl = stats ? fmt7(stats.totalDeposits, 0) : "—"
	const util = stats ? fmtPct(stats.utilization) : "—"
	const rate = stats ? fmtPct(stats.borrowRate) : "—"
	const reserve = stats ? fmt7(stats.reserveFund) : "—"

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-2xl font-bold text-white">Vault</h1>
				<p className="text-sm text-gray-400 mt-1">
					Deposit USDC to earn yield, or borrow against XLM collateral.
				</p>
			</div>

			{/* Pool Stats */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				<StatCard label="TVL" value={loading ? "…" : `$${tvl}`} accent />
				<StatCard label="Utilization" value={loading ? "…" : util} />
				<StatCard
					label="Borrow Rate"
					value={loading ? "…" : rate}
					sub="annualized"
				/>
				<StatCard label="Reserve Fund" value={loading ? "…" : `$${reserve}`} />
			</div>

			{!connected && (
				<p className="text-sm text-gray-500 text-center py-4">
					Connect your Freighter wallet to interact.
				</p>
			)}

			{connected && publicKey && (
				<div className="grid sm:grid-cols-2 gap-6">
					<DepositPanel publicKey={publicKey} sign={sign} />
					<BorrowPanel publicKey={publicKey} sign={sign} />
				</div>
			)}
		</div>
	)
}

// -------------------------------------------------------------------------
// Deposit / Withdraw
// -------------------------------------------------------------------------

function DepositPanel({
	publicKey,
	sign,
}: {
	publicKey: string
	sign: (xdr: string) => Promise<string>
}) {
	const [amount, setAmount] = useState("")
	const [mode, setMode] = useState<"deposit" | "withdraw">("deposit")
	const [loading, setLoading] = useState(false)
	const [txHash, setTxHash] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	async function submit() {
		if (!amount || parseFloat(amount) <= 0) return
		setLoading(true)
		setError(null)
		setTxHash(null)
		try {
			const scaled = BigInt(Math.round(parseFloat(amount) * 10_000_000))
			const xdr =
				mode === "deposit"
					? await buildDepositTx(publicKey, scaled)
					: await buildWithdrawTx(publicKey, scaled)
			const hash = await sign(xdr)
			setTxHash(hash)
			setAmount("")
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
			<div className="flex gap-2">
				{(["deposit", "withdraw"] as const).map((m) => (
					<button
						key={m}
						onClick={() => setMode(m)}
						className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
							mode === m
								? "bg-indigo-600 text-white"
								: "bg-gray-800 text-gray-400 hover:text-white"
						}`}
					>
						{m.charAt(0).toUpperCase() + m.slice(1)}
					</button>
				))}
			</div>
			<div>
				<label className="block text-xs text-gray-400 mb-1">
					{mode === "deposit" ? "USDC Amount" : "vUSDC Amount"}
				</label>
				<input
					type="number"
					min="0"
					step="0.01"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					placeholder="0.00"
					className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
				/>
			</div>
			<button
				onClick={submit}
				disabled={loading || !amount}
				className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
			>
				{loading
					? "Processing…"
					: mode === "deposit"
						? "Deposit USDC"
						: "Withdraw USDC"}
			</button>
			{txHash && (
				<p className="text-xs text-green-400 break-all">
					Tx: {txHash.slice(0, 16)}…
				</p>
			)}
			{error && <p className="text-xs text-red-400">{error}</p>}
		</div>
	)
}

// -------------------------------------------------------------------------
// Deposit Collateral / Borrow / Repay
// -------------------------------------------------------------------------

function BorrowPanel({
	publicKey,
	sign,
}: {
	publicKey: string
	sign: (xdr: string) => Promise<string>
}) {
	const [tab, setTab] = useState<"collateral" | "borrow" | "repay">(
		"collateral",
	)
	const [amount, setAmount] = useState("")
	const [positionId, setPositionId] = useState("0")
	const [price, setPrice] = useState("0.11") // XLM price in USDC
	const [loading, setLoading] = useState(false)
	const [txHash, setTxHash] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	async function submit() {
		if (!amount || parseFloat(amount) <= 0) return
		setLoading(true)
		setError(null)
		setTxHash(null)
		try {
			const scaled = BigInt(Math.round(parseFloat(amount) * 10_000_000))
			const priceScaled = BigInt(Math.round(parseFloat(price) * 10_000_000))
			const posId = BigInt(positionId)

			let xdr: string
			if (tab === "collateral") {
				xdr = await buildDepositCollateralTx(publicKey, "XLM", scaled)
			} else if (tab === "borrow") {
				xdr = await buildBorrowTx(publicKey, posId, scaled, priceScaled)
			} else {
				xdr = await buildRepayTx(publicKey, posId, scaled)
			}
			const hash = await sign(xdr)
			setTxHash(hash)
			setAmount("")
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e))
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
			<div className="flex gap-1">
				{(
					[
						{ key: "collateral", label: "Add Collateral" },
						{ key: "borrow", label: "Borrow" },
						{ key: "repay", label: "Repay" },
					] as const
				).map((t) => (
					<button
						key={t.key}
						onClick={() => setTab(t.key)}
						className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
							tab === t.key
								? "bg-indigo-600 text-white"
								: "bg-gray-800 text-gray-400 hover:text-white"
						}`}
					>
						{t.label}
					</button>
				))}
			</div>

			{tab !== "collateral" && (
				<div>
					<label className="block text-xs text-gray-400 mb-1">
						Position ID
					</label>
					<input
						type="number"
						min="0"
						value={positionId}
						onChange={(e) => setPositionId(e.target.value)}
						className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
					/>
				</div>
			)}

			{tab === "borrow" && (
				<div>
					<label className="block text-xs text-gray-400 mb-1">
						XLM/USDC Price
					</label>
					<input
						type="number"
						step="0.001"
						value={price}
						onChange={(e) => setPrice(e.target.value)}
						className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
					/>
				</div>
			)}

			<div>
				<label className="block text-xs text-gray-400 mb-1">
					{tab === "collateral"
						? "XLM Amount"
						: tab === "borrow"
							? "USDC to Borrow"
							: "USDC to Repay"}
				</label>
				<input
					type="number"
					min="0"
					step="0.01"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					placeholder="0.00"
					className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
				/>
			</div>

			<button
				onClick={submit}
				disabled={loading || !amount}
				className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
			>
				{loading
					? "Processing…"
					: tab === "collateral"
						? "Deposit XLM"
						: tab === "borrow"
							? "Borrow USDC"
							: "Repay USDC"}
			</button>
			{txHash && (
				<p className="text-xs text-green-400 break-all">
					Tx: {txHash.slice(0, 16)}…
				</p>
			)}
			{error && <p className="text-xs text-red-400">{error}</p>}
		</div>
	)
}
