"use client"
import { useState } from "react"
import { useProfile } from "@/hooks/useProfile"
import { usePoolStats } from "@/hooks/useVault"
import { useWallet } from "@/hooks/useWallet"
import { fmt7, fmtPct } from "@/lib/config"
import {
	buildDepositCollateralTx,
	buildBorrowTx,
	buildRepayTx,
} from "@/lib/vault"

export function BorrowPage() {
	const { stats, loading: statsLoading } = usePoolStats()
	const { publicKey, connected, sign } = useWallet()

	const borrowRate = stats ? fmtPct(stats.borrowRate) : "—"
	const totalBorrowed = stats ? `$${fmt7(stats.totalBorrows, 0)}` : "—"
	const util = stats ? fmtPct(stats.utilization) : "—"

	return (
		<div className="space-y-8 max-w-2xl mx-auto">
			<div>
				<h1 className="text-2xl font-bold text-white">Borrow</h1>
				<p className="text-sm text-gray-400 mt-1">
					Deposit XLM as collateral and borrow USDC against it. Maintain a
					health factor above 1.0 to avoid liquidation.
				</p>
			</div>

			{/* Pool info */}
			<div className="grid grid-cols-3 gap-4">
				{[
					{
						label: "Borrow Rate",
						value: statsLoading ? "…" : borrowRate,
						sub: "annualized",
					},
					{
						label: "Total Borrowed",
						value: statsLoading ? "…" : totalBorrowed,
					},
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
						{s.sub && (
							<p className="text-[10px] text-gray-600 mt-0.5">{s.sub}</p>
						)}
					</div>
				))}
			</div>

			{!connected ? (
				<div className="rounded-xl border border-dashed border-gray-700 p-10 text-center">
					<p className="text-sm text-gray-500">
						Connect your Freighter wallet to manage your position.
					</p>
				</div>
			) : (
				<BorrowPanelWrapper publicKey={publicKey!} sign={sign} />
			)}

			<div className="rounded-xl border border-orange-900/30 bg-orange-950/10 p-5 space-y-2">
				<p className="text-xs font-semibold text-orange-300">
					Liquidation Risk
				</p>
				<ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
					<li>
						Your health factor = (collateral value × 0.8) ÷ debt. Must stay
						above 1.0.
					</li>
					<li>
						If health factor drops below 1.0, an agent can trigger a Dutch
						auction on your collateral.
					</li>
					<li>
						Add more XLM collateral or repay debt to improve your health factor.
					</li>
					<li>
						XLM price movements directly affect your health factor — monitor it
						regularly.
					</li>
				</ul>
			</div>
		</div>
	)
}

function BorrowPanelWrapper({
	publicKey,
	sign,
}: {
	publicKey: string
	sign: (xdr: string) => Promise<string>
}) {
	const { myPositions, loading } = useProfile(publicKey)
	if (loading)
		return <p className="text-sm text-gray-500">Loading positions…</p>
	return (
		<BorrowPanel publicKey={publicKey} sign={sign} myPositions={myPositions} />
	)
}

function BorrowPanel({
	publicKey,
	sign,
	myPositions,
}: {
	publicKey: string
	sign: (xdr: string) => Promise<string>
	myPositions: [bigint, import("@/lib/vault").Position][]
}) {
	const [tab, setTab] = useState<"collateral" | "borrow" | "repay">(
		"collateral",
	)
	const [amount, setAmount] = useState("")
	// Always derive positionId from selection; for single position it's always fixed
	const [positionId, setPositionId] = useState(() =>
		myPositions.length > 0 ? myPositions[0][0].toString() : "0",
	)
	const effectivePositionId =
		myPositions.length === 1 ? myPositions[0][0].toString() : positionId
	const price = "1.00" // Fixed protocol price — do not change
	const [loanTerm, setLoanTerm] = useState(120_960) // default 7 days
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
			const posId = BigInt(effectivePositionId)

			let xdr: string
			if (tab === "collateral") {
				xdr = await buildDepositCollateralTx(publicKey, "XLM", scaled)
			} else if (tab === "borrow") {
				xdr = await buildBorrowTx(
					publicKey,
					posId,
					scaled,
					priceScaled,
					loanTerm,
				)
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

	const TABS = [
		{ key: "collateral" as const, label: "Add Collateral" },
		{ key: "borrow" as const, label: "Borrow" },
		{ key: "repay" as const, label: "Repay" },
	]

	return (
		<div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
			<div className="flex gap-1">
				{TABS.map((t) => (
					<button
						key={t.key}
						onClick={() => setTab(t.key)}
						className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
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
					<label className="block text-xs text-gray-400 mb-1">Position</label>
					{myPositions.length === 0 ? (
						<p className="text-xs text-yellow-400">
							No positions found. Deposit XLM collateral first.
						</p>
					) : myPositions.length === 1 ? (
						<div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
							#{myPositions[0][0].toString()} —{" "}
							{fmt7(myPositions[0][1].collateral_amount, 2)}{" "}
							{myPositions[0][1].collateral_asset} collateral
							{myPositions[0][1].debt_principal > 0n
								? `, $${fmt7(myPositions[0][1].debt_principal, 2)} debt`
								: ""}
						</div>
					) : (
						<select
							value={positionId}
							onChange={(e) => setPositionId(e.target.value)}
							className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
						>
							{myPositions.map(([id, pos]) => (
								<option key={id.toString()} value={id.toString()}>
									#{id.toString()} — {fmt7(pos.collateral_amount, 2)}{" "}
									{pos.collateral_asset} collateral
									{pos.debt_principal > 0n
										? `, $${fmt7(pos.debt_principal, 2)} debt`
										: ""}
								</option>
							))}
						</select>
					)}
				</div>
			)}

			{tab === "borrow" && (
				<>
					<div>
						<label className="block text-xs text-gray-400 mb-2">
							Loan Term
						</label>
						<div className="grid grid-cols-4 gap-2">
							{(
								[
									{ label: "5 min ⚡", ledgers: 60 },
									{ label: "7 days", ledgers: 120_960 },
									{ label: "14 days", ledgers: 241_920 },
									{ label: "30 days", ledgers: 518_400 },
								] as const
							).map((opt) => (
								<button
									key={opt.ledgers}
									type="button"
									onClick={() => setLoanTerm(opt.ledgers)}
									className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
										loanTerm === opt.ledgers
											? "bg-indigo-600 text-white"
											: "bg-gray-800 text-gray-400 hover:text-white"
									}`}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>
				</>
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
				className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
			>
				{loading
					? "Processing…"
					: tab === "collateral"
						? "Deposit XLM Collateral"
						: tab === "borrow"
							? "Borrow USDC"
							: "Repay USDC"}
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
