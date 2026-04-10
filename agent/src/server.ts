import dotenv from "dotenv"
import express from "express"
import * as VaultReader from "./vault-reader.js"
import { x402Middleware } from "./x402-middleware.js"

dotenv.config()

const app = express()
const port = process.env.PORT || 4000
const VAULT_ID = process.env.VAULT_CONTRACT_ID

app.use(express.json())

// Apply x402 middleware with debug bypass
app.use((req, res, next) => {
	if (req.header("X-Debug-Bypass") === "true") {
		return next()
	}
	void x402Middleware(req, res, next)
})

/**
 * GET /
 * API Information (Free)
 */
app.get("/", (req, res) => {
	res.json({
		name: "LiquidMind Agentic API",
		version: "1.0.0",
		description: "X402-gated marketplace for liquidation data on Stellar.",
		endpoints: {
			"/pool": "Pool statistics (0.01 USDC)",
			"/opportunities": "Liquidation opportunities (0.05 USDC)",
			"/auctions": "Active Dutch auctions (0.05 USDC)",
		},
		facilitator:
			process.env.X402_FACILITATOR_URL ||
			"https://channels.openzeppelin.com/x402/testnet",
	})
})

/**
 * GET /pool
 * Paid: 0.01 USDC
 */
app.get("/pool", async (req, res) => {
	try {
		const stats = await VaultReader.getPoolStats(VAULT_ID!)
		res.json(stats)
	} catch (error) {
		res.status(500).json({ error: "Failed to fetch pool stats" })
	}
})

/**
 * GET /opportunities
 * Paid: 0.05 USDC
 */
app.get("/opportunities", async (req, res) => {
	try {
		const result = await VaultReader.getAtRiskPositions(VAULT_ID!)
		res.json({
			count: result.positions.length,
			opportunities: result.positions,
			xlmPrice: result.xlmPrice,
		})
	} catch (error) {
		res.status(500).json({ error: "Failed to fetch opportunities" })
	}
})

/**
 * GET /auctions
 * Paid: 0.05 USDC
 */
app.get("/auctions", async (req, res) => {
	try {
		const auctions = await VaultReader.getActiveAuctions(VAULT_ID!)
		res.json({
			count: auctions.length,
			auctions,
		})
	} catch (error) {
		res.status(500).json({ error: "Failed to fetch active auctions" })
	}
})

app.listen(port, () => {
	console.log(`LiquidMind x402 Server listening at http://localhost:${port}`)
	console.log(`Gated endpoints: /pool, /opportunities, /auctions`)
})
