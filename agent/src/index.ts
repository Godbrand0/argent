import { Keypair } from "@stellar/stellar-sdk"
import { CONFIG } from "./config.js"
import { runScheduler } from "./scheduler.js"
import { X402Client } from "./x402.js"

function validateConfig() {
	if (!CONFIG.agent.secretKey) {
		throw new Error("AGENT_SECRET_KEY not set")
	}
	if (!CONFIG.contracts.vault) {
		throw new Error("VAULT_CONTRACT_ID not set")
	}
}

async function main() {
	validateConfig()
	const keypair = Keypair.fromSecret(CONFIG.agent.secretKey)
	console.log(`Agent public key: ${keypair.publicKey()}`)

	// Initialize the x402 client to handle API payments autonomously
	const x402 = new X402Client(keypair)
	console.log(`[x402] Client initialized with Agent keypair`)

	// We pass x402 client to the scheduler down the line, e.g.,
	// runScheduler(keypair, x402);
	// For now, we keep the signature identical
	await runScheduler(keypair)
}

main().catch((err) => {
	console.error("Fatal error:", err)
	process.exit(1)
})
