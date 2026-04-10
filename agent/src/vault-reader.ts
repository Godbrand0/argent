import {
	Contract,
	nativeToScVal,
	scValToNative,
	TransactionBuilder,
	BASE_FEE,
	rpc,
} from "@stellar/stellar-sdk"
import { server } from "./chain/soroban.js"
import { CONFIG } from "./config.js"

/**
 * Extract the tag name from a Soroban enum value.
 * scValToNative returns unit enum variants as { Active: null } or "Active" depending on SDK version.
 */
function enumTag(val: any): string {
	if (typeof val === "string") return val
	if (!val) return "None"
	// scValToNative returns unit enum variants as a single-element array, e.g. ["None"]
	if (Array.isArray(val)) return (val[0] as string) ?? "None"
	return Object.keys(val)[0] ?? "None"
}

/**
 * Extract the inner value from a Soroban Option<T>.
 * scValToNative returns Some(x) as [x] (vec) or x directly, and None as null/undefined.
 */
function optionValue(val: any): string | null {
	if (val === null || val === undefined) return null
	if (typeof val === "string") return val
	if (Array.isArray(val)) return (val[0] as string) ?? null
	const inner = Object.values(val)[0]
	return typeof inner === "string" ? inner : null
}

// Verified valid public key used for simulation-only reads
const DUMMY_ADDRESS = "GBV3HZAABDYP4EZQE2AH73MNDHWS322E4CZGTQ477K776UUHPKZ5I46B"
const SCALE = 10_000_000n
// Demo/testnet price: $0.08 per XLM (scaled 1e7). Matches horizon.ts getMockPrice and frontend MOCK_XLM_PRICE.
const FIXED_XLM_PRICE = 800_000n // $0.08
const LIQ_THRESHOLD = 8_000_000n // 80%

async function simulateRead(
	contractId: string,
	method: string,
	args: any[] = [],
) {
	const source = await server.getAccount(DUMMY_ADDRESS).catch(() => ({
		accountId: () => DUMMY_ADDRESS,
		sequenceNumber: () => "0",
	}))
	const contract = new Contract(contractId)
	const tx = new TransactionBuilder(source as any, {
		fee: BASE_FEE,
		networkPassphrase: CONFIG.network.networkPassphrase,
	})
		.addOperation(contract.call(method, ...args))
		.setTimeout(0)
		.build()

	const sim = await server.simulateTransaction(tx)
	if (rpc.Api.isSimulationError(sim)) {
		throw new Error(`Simulation failed for ${method}: ${sim.error}`)
	}
	const result = (sim as rpc.Api.SimulateTransactionSuccessResponse).result
	if (!result?.retval) return null
	return scValToNative(result.retval)
}

export async function getPoolStats(vaultId: string) {
	const [
		totalDeposits,
		totalBorrows,
		reserveFund,
		borrowRate,
		utilization,
		positionCount,
		auctionCount,
	] = await Promise.all([
		simulateRead(vaultId, "total_deposits"),
		simulateRead(vaultId, "total_borrows"),
		simulateRead(vaultId, "reserve_fund"),
		simulateRead(vaultId, "borrow_rate"),
		simulateRead(vaultId, "utilization"),
		simulateRead(vaultId, "position_count"),
		simulateRead(vaultId, "auction_count"),
	])
	return {
		totalDeposits,
		totalBorrows,
		reserveFund,
		borrowRate,
		utilization,
		positionCount,
		auctionCount,
	}
}

/**
 * Returns positions whose health factor is below 1.0 at the current mock price.
 * This is the paid intelligence the x402 server sells to bidder agents.
 */
export async function getAtRiskPositions(vaultId: string) {
	const [countRaw, ledgerRaw] = await Promise.all([
		simulateRead(vaultId, "position_count"),
		simulateRead(vaultId, "current_ledger").catch(() => null),
	])
	const total = BigInt(countRaw ?? 0n)
	const limit = total < 50n ? total : 50n

	// Get current ledger for maturity checks — fall back to Soroban RPC
	let currentLedger = 0
	if (ledgerRaw) {
		currentLedger = Number(ledgerRaw)
	} else {
		try {
			const { rpc } = await import("@stellar/stellar-sdk")
			const s = new rpc.Server(
				process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
			)
			const info = await s.getLatestLedger()
			currentLedger = info.sequence
		} catch {}
	}

	const atRisk: any[] = []

	for (let id = 0n; id < limit; id++) {
		try {
			const pos = await simulateRead(vaultId, "get_position", [
				nativeToScVal(id, { type: "u64" }),
			])
			if (!pos || pos.debt_principal === 0n) continue

			// Skip positions already in auction
			if (enumTag(pos.auction_state) !== "None") continue

			// Trigger 1: loan term expired
			const matured =
				pos.due_at_ledger > 0 &&
				currentLedger > 0 &&
				currentLedger >= pos.due_at_ledger

			// Trigger 2: health factor below liquidation threshold
			const colVal = (pos.collateral_amount * FIXED_XLM_PRICE) / SCALE
			const hf = (colVal * LIQ_THRESHOLD) / pos.debt_principal
			const unhealthy = hf < SCALE

			if (matured || unhealthy) {
				atRisk.push({
					id: id.toString(),
					owner: pos.owner,
					collateralAsset: pos.collateral_asset,
					collateralAmount: pos.collateral_amount.toString(),
					debtPrincipal: pos.debt_principal.toString(),
					healthFactor: (Number(hf) / 1e7).toFixed(4),
					dueAtLedger: pos.due_at_ledger,
					matured,
				})
			}
		} catch {
			// Position not found or settled — skip
		}
	}

	return { positions: atRisk, xlmPrice: Number(FIXED_XLM_PRICE) / 1e7 }
}

export async function getActiveAuctions(vaultId: string) {
	const countRaw = await simulateRead(vaultId, "auction_count")
	const total = BigInt(countRaw ?? 0n)
	const limit = total < 20n ? total : 20n

	const auctions: any[] = []
	for (let id = 0n; id < limit; id++) {
		try {
			const a = await simulateRead(vaultId, "get_auction", [
				nativeToScVal(id, { type: "u64" }),
			])
			if (a && !a.settled) {
				const p: any = await simulateRead(vaultId, "get_position", [
					nativeToScVal(BigInt(a.position_id), { type: "u64" }),
				])
				auctions.push({
					id: id.toString(),
					positionId: a.position_id.toString(),
					collateralAsset: p?.collateral_asset ?? "XLM",
					collateralAmount: p?.collateral_amount.toString() ?? "0",
					startPrice: a.start_price.toString(),
					floorPrice: a.floor_price.toString(),
					decayRatePerLedger: a.decay_rate_per_ledger.toString(),
					startedAtLedger: a.started_at_ledger,
					triggerAgent: a.trigger_agent,
					settled: a.settled,
					declaredWinner: optionValue(a.declared_winner),
				})
			}
		} catch {
			// not found
		}
	}
	return auctions
}
