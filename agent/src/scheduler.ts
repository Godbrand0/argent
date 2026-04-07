import { type Keypair } from "@stellar/stellar-sdk"
import { buildBidderActions } from "./actions/bidder.js"
import { buildMonitorActions } from "./actions/monitor.js"
import { getAccountBalance } from "./chain/horizon.js"
import { getCurrentLedger } from "./chain/soroban.js"
import { CONFIG } from "./config.js"
import { type Action, type AgentState } from "./types.js"

export type AgentRole = "monitor" | "bidder" | "both"

export async function runScheduler(
	keypair: Keypair,
	role: AgentRole = "both",
): Promise<never> {
	const monitorActions = role !== "bidder" ? buildMonitorActions(keypair) : []
	const bidderActions = role !== "monitor" ? buildBidderActions(keypair) : []

	const allActions: Action[] = [...monitorActions, ...bidderActions].sort(
		(a, b) => b.priority - a.priority,
	)

	const state: AgentState = {
		positions: [],
		activeAuctions: [],
		atRiskPositions: [],
		biddableAuctions: [],
		priceCache: { prices: {}, fetchedAt: 0 },
		zkProofs: {},
		apProofs: {},
		zkProofsReady: false,
		apProofsReady: false,
		agentUsdcBalance: 0n,
		agentBudget: 0n,
		lastScan: 0,
		ledgerSinceHeartbeat: 999,
		currentLedger: 0,
		placedBidAuctionIds: new Set(),
	}

	console.log(
		`LiquidMind agent running (role: ${role}, ` +
			`${allActions.length} actions loaded)`,
	)

	while (true) {
		try {
			state.currentLedger = await getCurrentLedger()
			state.agentUsdcBalance = await getAccountBalance(
				keypair.publicKey(),
				"USDC",
			)

			const eligible = allActions.filter((a) => {
				try {
					return a.preconditions(state)
				} catch {
					return false
				}
			})

			if (eligible.length > 0) {
				const action = eligible[0]!
				console.log(
					`[scheduler] executing: ${action.name} (priority ${action.priority})`,
				)
				await action.execute(state)
			}
		} catch (err) {
			console.error("[scheduler] error:", err)
		}

		await sleep(CONFIG.agent.loopIntervalMs)
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
