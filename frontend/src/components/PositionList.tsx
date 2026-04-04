"use client"
import { usePositions } from "@/hooks/useVault"
import { fmt7, hfColor, hfBarPct, SCALE } from "@/lib/config"
import { type Position } from "@/lib/vault"

// XLM/USDC mock price for HF display (replace with live oracle feed later)
const MOCK_XLM_PRICE = 1_100_000n // $0.11 in 1e7

function computeHF(pos: Position): bigint {
	if (pos.debt_principal === 0n) return 999n * SCALE
	const LIQ_THRESHOLD = 8_000_000n
	const colVal = (pos.collateral_amount * MOCK_XLM_PRICE) / SCALE
	return (colVal * LIQ_THRESHOLD) / pos.debt_principal
}

function AuctionBadge({ state }: { state: string }) {
	const colors: Record<string, string> = {
		None: "bg-gray-700 text-gray-300",
		Active: "bg-orange-500/20 text-orange-300 border border-orange-500/40",
		Settled: "bg-green-500/20 text-green-300",
		Expired: "bg-red-500/20 text-red-300",
	}
	return (
		<span
			className={`px-2 py-0.5 rounded text-xs font-medium ${colors[state] ?? colors.None}`}
		>
			{state}
		</span>
	)
}

function PositionCard({ id, pos }: { id: bigint; pos: Position }) {
	const hf = computeHF(pos)
	const hfStr =
		pos.debt_principal === 0n ? "∞" : (Number(hf) / 10_000_000).toFixed(3)
	const atRisk = hf < SCALE && pos.debt_principal > 0n
	const colStr = `${fmt7(pos.collateral_amount, 2)} ${pos.collateral_asset}`
	const debtStr = `$${fmt7(pos.debt_principal, 2)}`

	return (
		<div
			className={`rounded-xl border p-5 space-y-4 ${atRisk ? "border-red-500/50 bg-red-950/10" : "border-gray-800 bg-gray-900"}`}
		>
			{atRisk && (
				<div className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 rounded-md px-3 py-2">
					At risk of liquidation — Health Factor below 1.0
				</div>
			)}

			<div className="flex items-start justify-between">
				<div>
					<p className="text-xs text-gray-400">Position #{id.toString()}</p>
					<p className="text-sm font-mono text-gray-300 mt-0.5">
						{pos.owner.slice(0, 6)}…{pos.owner.slice(-4)}
					</p>
				</div>
				<AuctionBadge state={pos.auction_state.tag} />
			</div>

			<div className="grid grid-cols-2 gap-3 text-sm">
				<div>
					<p className="text-xs text-gray-400">Collateral</p>
					<p className="text-white font-medium">{colStr}</p>
				</div>
				<div>
					<p className="text-xs text-gray-400">Debt</p>
					<p className="text-white font-medium">{debtStr}</p>
				</div>
			</div>

			{/* Health Factor */}
			<div>
				<div className="flex justify-between text-xs mb-1">
					<span className="text-gray-400">Health Factor</span>
					<span className={`font-semibold ${hfColor(hf)}`}>{hfStr}</span>
				</div>
				<div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
					<div
						className={`h-full rounded-full transition-all ${
							hf >= (SCALE * 13n) / 10n
								? "bg-green-500"
								: hf >= SCALE
									? "bg-yellow-500"
									: "bg-red-500"
						}`}
						style={{ width: `${hfBarPct(hf)}%` }}
					/>
				</div>
				<div className="flex justify-between text-xs text-gray-600 mt-0.5">
					<span>0</span>
					<span>1.0 liq</span>
					<span>1.3 safe</span>
				</div>
			</div>

			<p className="text-xs text-gray-500">
				Opened at ledger {pos.opened_at_ledger}
			</p>
		</div>
	)
}

export function PositionList() {
	const { positions, loading } = usePositions()

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-white">Positions</h1>
				<p className="text-sm text-gray-400 mt-1">
					All open borrowing positions on the protocol.
				</p>
			</div>

			{loading && (
				<div className="text-center py-16 text-gray-500">
					Loading positions…
				</div>
			)}

			{!loading && positions.length === 0 && (
				<div className="text-center py-16 text-gray-500">
					No open positions yet.{" "}
					<a href="/dashboard" className="text-indigo-400 hover:underline">
						Deposit collateral
					</a>{" "}
					to open one.
				</div>
			)}

			<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{positions.map(([id, pos]) => (
					<PositionCard key={id.toString()} id={id} pos={pos} />
				))}
			</div>
		</div>
	)
}
