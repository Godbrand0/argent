"use client"
import { InfoTooltip } from "./InfoTooltip"
import { usePositions } from "@/hooks/useVault"
import { fmt7, hfColor, hfBarPct, SCALE } from "@/lib/config"
import { type Position } from "@/lib/vault"

// XLM/USDC mock price for HF display
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
	const colStr = `${fmt7(pos.collateral_amount, 0)} ${pos.collateral_asset}`
	const debtStr = `$${fmt7(pos.debt_principal, 0)}`

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
						<h3 className="text-sm font-semibold text-gray-100 flex items-center">
							Loan #{id.toString()}
							<InfoTooltip text="The unique ID for this position on the Stellar network." />
						</h3>
						<p className="text-[11px] font-mono text-gray-500 mt-0.5">
							{pos.owner.slice(0, 8)}...{pos.owner.slice(-4)}
						</p>
					</div>
					<StatusBadge state={pos.auction_state.tag} />
				</div>

				<div className="grid grid-cols-2 gap-4 border-t border-gray-800/50 pt-4">
					<div>
						<p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center">
							Locked
							<InfoTooltip text="The amount of XLM deposited as collateral for this loan." />
						</p>
						<p className="text-sm font-medium text-white">{colStr}</p>
					</div>
					<div>
						<p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center">
							Borrowed
							<InfoTooltip text="The amount of USDC debt outstanding for this position." />
						</p>
						<p className="text-sm font-medium text-white">{debtStr}</p>
					</div>
				</div>

				<div>
					<div className="flex justify-between items-end mb-1.5">
						<span className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center">
							Safety Score
							<InfoTooltip text="Calculated based on collateral value vs debt. If this drops below 1.0, an agent can trigger a liquidation auction." />
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
			</div>
		</div>
	)
}

export function PositionList() {
	const { positions, loading } = usePositions()

	return (
		<div className="space-y-8 max-w-6xl mx-auto py-4">
			<div className="border-b border-gray-800 pb-6">
				<h1 className="text-3xl font-bold text-white tracking-tight">
					Positions
				</h1>
				<p className="text-sm text-gray-400 mt-2 max-w-2xl">
					Global overview of active protocol loans. These positions are
					monitored 24/7 by autonomous agents to ensure protocol solvency.
				</p>
			</div>

			{loading ? (
				<div className="flex flex-col items-center justify-center py-24 space-y-4">
					<div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
					<p className="text-xs text-gray-500 animate-pulse">
						Reading ledger state...
					</p>
				</div>
			) : positions.length === 0 ? (
				<div className="text-center py-20 bg-gray-900/30 rounded-3xl border border-dashed border-gray-800">
					<p className="text-gray-500 text-sm">No active positions found.</p>
					<a
						href="/dashboard"
						className="mt-4 inline-block px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-full transition-colors"
					>
						Open first position
					</a>
				</div>
			) : (
				<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
					{positions.map(([id, pos]) => (
						<PositionCard key={id.toString()} id={id} pos={pos} />
					))}
				</div>
			)}
		</div>
	)
}
