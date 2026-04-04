"use client"
import { StatCard } from "./StatCard"
import { useAgent, type AgentEvent } from "@/hooks/useAgent"
import { usePoolStats } from "@/hooks/useVault"

const EVENT_ICONS: Record<AgentEvent["type"], string> = {
	auction_started: "⚡",
	auction_settled: "✅",
	heartbeat: "💓",
	bid: "🏷️",
	other: "•",
}

const EVENT_LABELS: Record<AgentEvent["type"], string> = {
	auction_started: "Auction triggered",
	auction_settled: "Auction settled",
	heartbeat: "Heartbeat",
	bid: "Bid submitted",
	other: "Event",
}

const EVENT_COLORS: Record<AgentEvent["type"], string> = {
	auction_started: "border-l-orange-400",
	auction_settled: "border-l-green-400",
	heartbeat: "border-l-indigo-400",
	bid: "border-l-yellow-400",
	other: "border-l-gray-600",
}

function EventRow({ event }: { event: AgentEvent }) {
	return (
		<div className={`border-l-2 pl-4 py-2 ${EVENT_COLORS[event.type]}`}>
			<div className="flex items-center gap-2">
				<span>{EVENT_ICONS[event.type]}</span>
				<span className="text-sm font-medium text-gray-200">
					{EVENT_LABELS[event.type]}
				</span>
				<span className="text-xs text-gray-500 ml-auto">
					ledger {event.ledger}
				</span>
			</div>
			<p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
				{JSON.stringify(event.data)}
			</p>
		</div>
	)
}

export function AgentFeed() {
	const { online, lastHeartbeatLedger, currentLedger, events } = useAgent()
	const { stats } = usePoolStats()

	const staleLedgers = currentLedger - lastHeartbeatLedger

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-white">Agent</h1>
				<p className="text-sm text-gray-400 mt-1">
					LiquidMind autonomous agent — scans positions, generates ZK proofs,
					triggers liquidations.
				</p>
			</div>

			{/* Status */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
				<div
					className={`rounded-xl border p-5 ${
						online === true
							? "border-green-500/40 bg-green-950/20"
							: online === false
								? "border-red-500/40 bg-red-950/20"
								: "border-gray-800 bg-gray-900"
					}`}
				>
					<p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
						Agent Status
					</p>
					<div className="flex items-center gap-2">
						<div
							className={`w-2 h-2 rounded-full ${
								online === true
									? "bg-green-400 animate-pulse"
									: online === false
										? "bg-red-400"
										: "bg-gray-600"
							}`}
						/>
						<p className="text-lg font-semibold">
							{online === null ? "—" : online ? "Online" : "Offline"}
						</p>
					</div>
				</div>
				<StatCard
					label="Last Heartbeat"
					value={lastHeartbeatLedger ? `#${lastHeartbeatLedger}` : "—"}
					sub={lastHeartbeatLedger ? `${staleLedgers} ledgers ago` : undefined}
				/>
				<StatCard
					label="Current Ledger"
					value={currentLedger ? `#${currentLedger}` : "—"}
				/>
				<StatCard
					label="Open Positions"
					value={stats ? stats.positionCount.toString() : "—"}
					sub={stats ? `${stats.auctionCount} auctions` : undefined}
				/>
			</div>

			{/* Event feed */}
			<div className="rounded-xl border border-gray-800 bg-gray-900">
				<div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
					<h2 className="text-sm font-semibold text-white">Activity Feed</h2>
					<span className="text-xs text-gray-500">
						{events.length} recent events
					</span>
				</div>
				<div className="divide-y divide-gray-800/50 px-5">
					{events.length === 0 ? (
						<p className="text-sm text-gray-500 py-8 text-center">
							{online === null
								? "Loading…"
								: "No events yet. Start the agent to see activity."}
						</p>
					) : (
						events.map((e) => <EventRow key={e.id} event={e} />)
					)}
				</div>
			</div>

			{/* Agent startup instructions */}
			<div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-2">
				<h2 className="text-sm font-semibold text-white">Running the Agent</h2>
				<pre className="text-xs text-gray-400 bg-gray-950 rounded-lg p-3 overflow-x-auto">{`cd agent
AGENT_SECRET_KEY=<your_key> \\
VAULT_CONTRACT_ID=<vault_id> \\
pnpm start`}</pre>
				<p className="text-xs text-gray-500">
					The agent runs the action model loop: scan positions → fetch prices →
					generate ZK proofs → trigger auctions → bid → heartbeat.
				</p>
			</div>
		</div>
	)
}
