import { Keypair, nativeToScVal, scValToNative } from "@stellar/stellar-sdk"
import dotenv from "dotenv"
import { invokeContract, server } from "./chain/soroban.js"
import { CONFIG } from "./config.js"
import { runScheduler } from "./scheduler.js"
import { X402Client } from "./x402.js"

dotenv.config()

function validateConfig() {
	if (!CONFIG.agent.secretKey) {
		throw new Error("AGENT_SECRET_KEY not set")
	}
	if (!CONFIG.contracts.vault) {
		throw new Error("VAULT_CONTRACT_ID not set")
	}
	if (!CONFIG.agent.ownerAddress && CONFIG.agent.role !== "monitor") {
		throw new Error(
			"AGENT_OWNER_ADDRESS must be set for bidder agents. " +
				"This is the Stellar address of the human who owns this agent.",
		)
	}
}

/**
 * Register this agent in the vault's bidder pool if not already registered.
 * The agent must be registered before it can trigger auctions or place limit bids.
 */
async function ensureRegistered(keypair: Keypair): Promise<void> {
	console.log("[init] checking pool registration...")

	try {
		const raw = await invokeContract(
			CONFIG.contracts.vault,
			"is_registered_agent",
			[nativeToScVal(keypair.publicKey(), { type: "address" })],
			keypair,
		)
		const isRegistered = scValToNative(raw) as boolean

		if (isRegistered) {
			console.log("[init] already registered in pool")
			return
		}
	} catch {
		// Contract may not support this query yet (dev mode) — proceed
	}

	const ownerAddress = CONFIG.agent.ownerAddress || keypair.publicKey()
	console.log(`[init] registering agent with owner ${ownerAddress}...`)

	await invokeContract(
		CONFIG.contracts.vault,
		"register_agent",
		[
			nativeToScVal(keypair.publicKey(), { type: "address" }),
			nativeToScVal(ownerAddress, { type: "address" }),
		],
		keypair,
	)

	console.log(`[init] registered. Owner: ${ownerAddress}`)
}

/**
 * Ensure the agent account exists on the network.
 * If not found and on testnet, attempts to fund via Friendbot.
 */
async function ensureAccountExists(publicKey: string): Promise<void> {
	const maxRetries = 3
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			await server.getAccount(publicKey)
			console.log("[init] agent account found on-chain")
			return
		} catch (err: any) {
			const isNotFound =
				err?.response?.status === 404 ||
				err?.message?.includes("Account not found")

			// Only auto-fund if it's a 404/Not Found and we're on Testnet
			const isTestnet = CONFIG.network.rpcUrl.includes("testnet")
			if (isNotFound && isTestnet) {
				if (attempt === 1) {
					console.log(
						`[init] account ${publicKey} not found. Funding via Friendbot...`,
					)
					const response = await fetch(
						`https://friendbot-testnet.stellar.org/?addr=${publicKey}`,
					)
					if (!response.ok) {
						console.error(
							`[init] Friendbot funding failed: ${response.statusText}`,
						)
					} else {
						console.log("[init] funded successfully")
					}
				}

				if (attempt < maxRetries) {
					console.log(
						`[init] waiting for ingestion (attempt ${attempt}/${maxRetries})...`,
					)
					await new Promise((resolve) => setTimeout(resolve, 5000))
					continue
				}
			}

			// If we're here, it's either not a 404, or we've exhausted retries
			if (isNotFound && isTestnet) {
				throw new Error(
					`Account ${publicKey} still not found after funding and ${maxRetries} attempts. ` +
						`This might be due to RPC ingestion lag. Try using a different RPC URL or wait a moment.`,
				)
			}
			throw err
		}
	}
}

async function main() {
	validateConfig()

	const keypair = Keypair.fromSecret(CONFIG.agent.secretKey)
	console.log(`Agent public key : ${keypair.publicKey()}`)
	console.log(`Agent role       : ${CONFIG.agent.role}`)
	console.log(`Owner address    : ${CONFIG.agent.ownerAddress || "(self)"}`)
	console.log(
		`Profit threshold : ${(CONFIG.agent.minProfitThreshold * 100).toFixed(1)}%`,
	)

	// Initialize x402 client for atomic on-chain payments
	const x402 = new X402Client(keypair)
	console.log("[x402] client initialized")

	// 1. Ensure account exists (and fund if testnet + missing)
	await ensureAccountExists(keypair.publicKey())

	// 2. Register in the pool before starting the action loop
	await ensureRegistered(keypair)

	await runScheduler(keypair, CONFIG.agent.role)
}

main().catch((err) => {
	console.error("Fatal error:", err)
	process.exit(1)
})
