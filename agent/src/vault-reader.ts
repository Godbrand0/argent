import {
	TransactionBuilder,
	Networks,
	Address,
	xdr,
	scValToNative,
	nativeToScVal,
	Contract,
} from "@stellar/stellar-sdk"
import { server } from "./chain/soroban.js"
import { CONFIG } from "./config.js"

// The "Standard" dummy account used for simulation-only reads on Stellar
const DUMMY_ADDRESS = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"

/**
 * Perform a simulation-only contract call (won't cost XLM or require signing)
 */
async function simulateContract(
	contractId: string,
	method: string,
	args: any[] = [],
) {
	const networkPassphrase = CONFIG.network.networkPassphrase

	// Build a dummy transaction for simulation
	const source = await server.getAccount(DUMMY_ADDRESS).catch(() => ({
		accountId: () => DUMMY_ADDRESS,
		sequenceNumber: () => "0",
	}))

	const contract = new Contract(contractId)
	const tx = new TransactionBuilder(source as any, {
		fee: "100",
		networkPassphrase,
	})
		.addOperation(contract.call(method, ...args.map((a) => nativeToScVal(a))))
		.setTimeout(0)
		.build()

	const simulation = await server.simulateTransaction(tx)

	if ((simulation as any).error) {
		throw new Error(
			`Simulation failed for ${method}: ${(simulation as any).error}`,
		)
	}

	// Extract return value from simulation
	const result = (simulation as any).result
	if (!result || !result.retval) {
		return null
	}

	return scValToNative(result.retval)
}

export async function getPoolStats(vaultId: string) {
	try {
		const stats = await simulateContract(vaultId, "get_stats")
		return stats
	} catch (error) {
		console.error("Error fetching pool stats:", error)
		throw error
	}
}

export async function getAtRiskPositions(vaultId: string) {
	try {
		// In LiquidMind, we might have a specific function or we might iterate over accounts.
		// For this API, we'll assume a 'get_at_risk' or similar helper in the contract,
		// or return a processed list of all positions with health < 1.0.
		const positions = await simulateContract(vaultId, "get_positions")
		if (!Array.isArray(positions)) return []

		// Filter for health < 1.0 (assuming the health factor is returned in the struct)
		return positions.filter((p: any) => p.health_factor < 1.0)
	} catch (error) {
		console.error("Error fetching at-risk positions:", error)
		throw error
	}
}

export async function getActiveAuctions(vaultId: string) {
	try {
		const auctions = await simulateContract(vaultId, "get_active_auctions")
		return auctions || []
	} catch (error) {
		console.error("Error fetching active auctions:", error)
		throw error
	}
}
