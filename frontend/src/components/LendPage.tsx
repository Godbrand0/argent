"use client"
import { useState } from "react"
import { usePoolStats } from "@/hooks/useVault"
import { useWallet } from "@/hooks/useWallet"
import { fmt7, fmtPct } from "@/lib/config"
import { buildDepositTx, buildWithdrawTx } from "@/lib/vault"

export function LendPage() {
	const { stats, loading: statsLoading } = usePoolStats()
	const { publicKey, connected, sign } = useWallet()

	const apy = stats ? fmtPct(stats.borrowRate) : "—"
	const tvl = stats ? `$${fmt7(stats.totalDeposits, 0)}` : "—"
	const util = stats ? fmtPct(stats.utilization) : "—"

	return (
		<div className="space-y-8 max-w-2xl mx-auto">
			<div>
				<h1 className="text-2xl font-bold text-white">Lend</h1>
				<p className="text-sm text-gray-400 mt-1">
					Deposit USDC into the pool to earn yield. You receive vUSDC tokens
					representing your share — redeem them at any time.
				</p>
			</div>

			{/* Pool info */}
			<div className="grid grid-cols-3 gap-4">
				{[
					{ label: "Pool TVL", value: statsLoading ? "…" : tvl },
					{ label: "Lend APY", value: statsLoading ? "…" : apy },
					{ label: "Utilization", value: statsLoading ? "…" : util },
				].map((s) => (
					<div
						key={s.label}
						className="rounded-xl border border-gray-800 bg-gray-900/50 p-4"
					>
						<p className="text-[10px] text-gray-500 uppercase tracking-wider">
							{s.label}
						</p>
						<p className="text-xl font-bold text-white mt-1">{s.value}</p>
					</div>
				))}
			</div>

			{!connected ? (
				<div className="rounded-xl border border-dashed border-gray-700 p-10 text-center">
					<p className="text-sm text-gray-500">
						Connect your Freighter wallet to deposit or withdraw.
					</p>
				</div>
			) : (
				<DepositPanel publicKey={publicKey!} sign={sign} />
			)}

			<div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5 space-y-2">
				<p className="text-xs font-semibold text-gray-300">How it works</p>
				<ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
					<li>Deposit USDC → receive vUSDC at a 1:1 ratio initially.</li>
					<li>
						As borrowers pay interest, the vUSDC exchange rate increases — your
						vUSDC becomes worth more USDC over time.
					</li>
					<li>Withdraw by redeeming vUSDC back to USDC at the current rate.</li>
					<li>
						A 1% reserve of all interest is kept in the protocol reserve fund as
						a safety buffer.
					</li>
				</ul>
			</div>
		</div>
	)
}

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
			<h2 className="text-sm font-semibold text-white">
				{mode === "deposit" ? "Deposit USDC" : "Withdraw USDC"}
			</h2>

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
						{m === "deposit" ? "Deposit" : "Withdraw"}
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
				className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
			>
				{loading
					? "Processing…"
					: mode === "deposit"
						? "Deposit USDC"
						: "Withdraw USDC"}
			</button>

			{txHash && (
				<p className="text-xs text-green-400 break-all">
					Transaction confirmed: {txHash.slice(0, 20)}…
				</p>
			)}
			{error && <p className="text-xs text-red-400">{error}</p>}
		</div>
	)
}
