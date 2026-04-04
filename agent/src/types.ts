// ---------------------------------------------------------------------------
// On-chain types (mirrors Rust structs)
// ---------------------------------------------------------------------------

export type AuctionState = "None" | "Active" | "Settled" | "Expired"

export interface Position {
	id: bigint
	owner: string
	collateralAsset: string
	collateralAmount: bigint
	debtPrincipal: bigint
	borrowIndexAtOpen: bigint
	openedAtLedger: number
	auctionState: AuctionState
	becameLiquidatableAt: number
}

export interface Auction {
	id: bigint
	positionId: bigint
	startPrice: bigint
	floorPrice: bigint
	decayRatePerLedger: bigint
	startedAtLedger: number
	triggerAgent: string
	settled: boolean
}

// ---------------------------------------------------------------------------
// Agent state (passed to precondition evaluators)
// ---------------------------------------------------------------------------

export interface PriceCache {
	prices: Record<string, number> // asset symbol → price in USDC (float)
	fetchedAt: number // Date.now()
}

export interface ZkProofSet {
	hfProof: Uint8Array
	paProof: Uint8Array
}

export interface AgentState {
	positions: Position[]
	activeAuctions: Auction[]
	atRiskPositions: Position[]
	biddableAuctions: Auction[]
	priceCache: PriceCache
	zkProofs: Record<string, ZkProofSet> // keyed by position id string
	apProofs: Record<string, Uint8Array> // keyed by auction id string
	zkProofsReady: boolean
	apProofsReady: boolean
	agentUsdcBalance: bigint
	agentBudget: bigint
	lastScan: number
	ledgerSinceHeartbeat: number
	currentLedger: number
}

// ---------------------------------------------------------------------------
// Action model
// ---------------------------------------------------------------------------

export interface Action {
	name: string
	priority: number
	preconditions: (state: AgentState) => boolean
	execute: (state: AgentState) => Promise<void>
}
