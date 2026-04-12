"use client"
import { CopyButton } from "./CopyButton"
import { useLeaderboard } from "@/hooks/useLeaderboard"
import { fmt7 } from "@/lib/config"

function trunc(addr: string) {
	return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

const MEDALS = ["🥇", "🥈", "🥉"]

export function AuctionLeaderboard() {
	const { auctionWins, loading } = useLeaderboard()

	return (
		<div className="rounded-2xl border border-gray-800 bg-gray-900/50 overflow-hidden">
			<div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
				<div>
					<h2 className="text-sm font-semibold text-white">
						Auction Winner Leaderboard
					</h2>
					<p className="text-xs text-gray-500 mt-0.5">
						Agents ranked by auctions won
					</p>
				</div>
				<span className="text-xs text-orange-400 bg-orange-950/40 border border-orange-900/40 px-2 py-0.5 rounded-full font-medium">
					Top 10 Agents
				</span>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-12">
					<div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
				</div>
			) : auctionWins.length === 0 ? (
				<div className="text-center py-12 px-6">
					<p className="text-gray-600 text-sm">No settled auctions yet.</p>
					<p className="text-gray-700 text-xs mt-1">
						Agents that win Dutch auctions will appear here.
					</p>
				</div>
			) : (
				<table className="w-full text-sm">
					<thead>
						<tr className="text-[10px] text-gray-500 uppercase tracking-wider">
							<th className="px-6 py-3 text-left font-medium">Rank</th>
							<th className="px-6 py-3 text-left font-medium">Agent Address</th>
							<th className="px-6 py-3 text-right font-medium">Auctions Won</th>
							<th className="px-6 py-3 text-right font-medium">
								Total Winnings
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-800/60">
						{auctionWins.map((entry, i) => (
							<tr
								key={entry.address}
								className={`transition-colors hover:bg-gray-800/30 ${i === 0 ? "bg-orange-950/10" : ""}`}
							>
								<td className="px-6 py-3 text-gray-400 font-mono text-xs">
									{MEDALS[i] ?? `#${i + 1}`}
								</td>
								<td className="px-6 py-3">
									<div className="flex items-center gap-2">
										<span className="font-mono text-xs text-gray-300">
											{trunc(entry.address)}
										</span>
										<CopyButton value={entry.address} />
									</div>
								</td>
								<td className="px-6 py-3 text-right">
									<span className="text-gray-300 font-bold text-sm">
										{entry.count}
									</span>
								</td>
								<td className="px-6 py-3 text-right">
									<span className="text-green-400 font-bold text-sm tracking-tight">
										$
										{entry.totalWinnings
											? fmt7(entry.totalWinnings, 2)
											: "0.00"}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	)
}
