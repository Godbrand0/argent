import {
	encodePaymentRequiredHeader,
	decodePaymentSignatureHeader,
} from "@x402/core/http"

const X_PAYMENT_REQUIREMENTS = "X-Payment-Requirements"
const X_PAYMENT = "X-Payment"
const X_PAYMENT_RESPONSE = "X-Payment-Response"
import { type Request, type Response, type NextFunction } from "express"

const FACILITATOR_URL =
	process.env.X402_FACILITATOR_URL ||
	"https://channels.openzeppelin.com/x402/testnet"
const RECIPIENT = process.env.SERVER_PAYMENT_ADDRESS
const USDC_ASSET_CODE = process.env.USDC_ASSET_CODE || "USDC"
const USDC_ISSUER = process.env.USDC_ISSUER

export interface RoutePrice {
	amount: string // in atomic units (stroops)
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
 * x402 Middleware to gate routes behind payments
 */
export async function x402Middleware(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	const path = req.path
	const price = ROUTE_PRICES[path]

	// If path is not priced, it's free
	if (!price) {
		return next()
	}

	const paymentHeader = req.header(X_PAYMENT)

	// If no payment header, return 402 Payment Required
	if (!paymentHeader) {
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
			encodePaymentRequiredHeader(requirements as any),
		)
		return res.status(402).json({
			error: "Payment Required",
			message: `Access to ${path} requires a payment of ${parseInt(price.amount) / 10 ** 7} USDC.`,
			requirements,
		})
	}

	try {
		// Verify payment with facilitator
		const verificationResponse = await fetch(`${FACILITATOR_URL}/verify`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				payment: paymentHeader,
				requirements: {
					payTo: RECIPIENT,
					amount: price.amount,
				},
			}),
		})

		if (!verificationResponse.ok) {
			const errorData = await verificationResponse.json()
			return res.status(402).json({
				error: "Payment Verification Failed",
				details: errorData,
			})
		}

		// Settle payment with facilitator
		const settlementResponse = await fetch(`${FACILITATOR_URL}/settle`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ payment: paymentHeader }),
		})

		const settlementData = await settlementResponse.json()
		res.header(X_PAYMENT_RESPONSE, JSON.stringify(settlementData))

		// If settlement is broad enough or verified, proceed
		next()
	} catch (error) {
		console.error("x402 Verification Error:", error)
		res
			.status(500)
			.json({ error: "Internal Server Error during payment verification" })
	}
}
