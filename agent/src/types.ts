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
	/** Ledger at which this loan matures (0 = no term set) */
	dueAtLedger: number
	loanTermLedgers: number
	auctionState: AuctionState
	becameLiquidatableAt: number
}

export interface Auction {
	id: bigint
	positionId: bigint
	collateralAsset: string
	collateralAmount: bigint
	startPrice: bigint
	floorPrice: bigint
	decayRatePerLedger: bigint
	startedAtLedger: number
	triggerAgent: string
	settled: boolean
	/** Set when MAX_BIDS_PER_AUCTION bids are placed — only this agent may settle. */
	declaredWinner: string | null
}

export interface PoolAgent {
	owner: string
	joinedAtLedger: number
	auctionsWon: bigint
	collateralEarnedUsdc: bigint
}

export interface LimitBid {
	agent: string
	maxPrice: bigint
	placedAtLedger: number
	active: boolean
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
	/** Positions unsafe due to low HF or maturity expiry */
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
	lastAuctionScan: number
	lastHeartbeatLedger: number
	currentLedger: number
	/** IDs of auctions this agent has already placed a limit bid on */
	placedBidAuctionIds: Set<string>
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
