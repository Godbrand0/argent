import { rpc } from "@stellar/stellar-sdk"
import { type Request, type Response, type NextFunction } from "express"

const X_PAYMENT = "X-Payment"
const X_PAYMENT_REQUIREMENTS = "X-Payment-Requirements"

const RPC_URL =
	process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org"
const RECIPIENT = process.env.SERVER_PAYMENT_ADDRESS ?? ""
const USDC_ASSET_CODE = process.env.USDC_ASSET_CODE ?? "USDC"
const USDC_ISSUER = process.env.USDC_ISSUER ?? ""

const rpcServer = new rpc.Server(RPC_URL, { allowHttp: true })

interface RoutePrice {
	amount: string // in stroops (7 decimal places, e.g. "500000" = 0.05 USDC)
	description: string
}

const ROUTE_PRICES: Record<string, RoutePrice> = {
	"/pool": { amount: "100000", description: "Pool Statistics (0.01 USDC)" },
	"/opportunities": {
		amount: "500000",
		description: "Liquidation Opportunities (0.05 USDC)",
	},
	"/auctions": { amount: "500000", description: "Active Auctions (0.05 USDC)" },
}

/**
 * x402 middleware for Stellar USDC payments.
 *
 * Server-side flow:
 *  1. Request arrives with no X-Payment header → return 402 with requirements
 *  2. Request arrives with X-Payment: <txHash> → verify tx via Soroban RPC
 *  3. If tx succeeded → serve the resource
 */
export async function x402Middleware(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const price = ROUTE_PRICES[req.path]
	if (!price) return next() // unpriced route is free

	const txHash = req.header(X_PAYMENT)

	// No payment header — return 402 with requirements
	if (!txHash) {
		const requirements = {
			x402Version: "1.0.0",
			accepts: [
				{
					scheme: "stellar",
					network: "testnet",
					payTo: RECIPIENT,
					maxAmountRequired: price.amount,
					asset: {
						type: "credit_alphanum4",
						code: USDC_ASSET_CODE,
						issuer: USDC_ISSUER,
					},
				},
			],
			description: price.description,
		}

		res.header(
			X_PAYMENT_REQUIREMENTS,
			Buffer.from(JSON.stringify(requirements)).toString("base64"),
		)
		return res.status(402).json({
			error: "Payment Required",
			message: `Access to ${req.path} requires ${parseInt(price.amount) / 1e7} USDC.`,
			requirements,
		})
	}

	// Payment header present — verify the transaction via Soroban RPC
	try {
		let tx: any
		let attempts = 0
		while (attempts < 3) {
			try {
				tx = await rpcServer.getTransaction(txHash)
				break
			} catch (err) {
				attempts++
				if (attempts === 3) throw err
				console.warn(
					`[x402] RPC verification attempt ${attempts} failed, retrying...`,
				)
				await new Promise((r) => setTimeout(r, 1000))
			}
		}

		if (tx.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
			return res.status(402).json({
				error: "Payment Not Found",
				message: `Transaction ${txHash} not found on-chain. It may still be pending — retry shortly.`,
			})
		}

		if (tx.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
			return res.status(402).json({
				error: "Payment Failed",
				message: `Transaction ${txHash} did not succeed (status: ${tx.status}).`,
			})
		}

		// Transaction confirmed — allow through
		console.log(
			`[x402] ✓ Payment verified: ${txHash} | route: ${req.path} | amount: ${parseInt(price.amount) / 1e7} USDC`,
		)
		next()
	} catch (err) {
		console.error("[x402] RPC verification error:", err)
		res.status(500).json({ error: "Payment verification failed" })
	}
}
