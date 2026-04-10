import {
	Contract,
	type Keypair,
	nativeToScVal,
	rpc,
	TransactionBuilder,
	BASE_FEE,
} from "@stellar/stellar-sdk"
import { server } from "./chain/soroban.js"
import { CONFIG } from "./config.js"

const X_PAYMENT_REQUIREMENTS = "X-Payment-Requirements"
const X_PAYMENT = "X-Payment"

export class X402Client {
	private keypair: Keypair

	constructor(keypair: Keypair) {
		this.keypair = keypair
	}

	/**
	 * Fetches an HTTP resource and natively handles HTTP 402 Payment Required
	 * responses by paying with USDC on Stellar.
	 *
	 * Flow:
	 *  1. Initial request (no payment header)
	 *  2. On 402: parse requirements, send USDC on-chain, get tx hash
	 *  3. Retry with X-Payment: <txHash>
	 *  4. Server verifies tx via Soroban RPC, serves resource
	 */
	async fetch(url: string, init?: RequestInit): Promise<Response> {
		// 1. Initial request without payment
		let response = await fetch(url, init)

		if (response.status !== 402) return response

		// 2. Parse payment requirements from response body
		let body: any
		try {
			body = await response.json()
		} catch {
			console.error("[x402] Could not parse 402 response body")
			return response
		}

		const requirements = body?.requirements
		const stellarReq = requirements?.accepts?.find(
			(a: any) => a.scheme === "stellar",
		)

		if (!stellarReq) {
			console.warn("[x402] No stellar payment scheme in 402 response")
			return response
		}

		const { payTo, maxAmountRequired } = stellarReq
		const amount = BigInt(maxAmountRequired)

		console.log(
			`[x402] 402 received for ${url} — paying ${Number(amount) / 1e7} USDC to ${payTo}`,
		)

		// 3. Send USDC on-chain
		let txHash: string
		try {
			txHash = await this.payWithUsdc(payTo, amount)
			console.log(`[x402] Payment sent. tx: ${txHash}`)
		} catch (err) {
			console.error("[x402] Payment failed:", err)
			return response
		}

		// 4. Retry with payment proof
		response = await fetch(url, {
			...init,
			headers: {
				...(init?.headers ?? {}),
				[X_PAYMENT]: txHash,
			},
		})

		return response
	}

	/**
	 * Transfer USDC via the USDC Stellar Asset Contract (SEP-41 token).
	 * Returns the confirmed transaction hash.
	 */
	private async payWithUsdc(
		recipient: string,
		amountStroops: bigint,
	): Promise<string> {
		const account = await server.getAccount(this.keypair.publicKey())
		const contract = new Contract(CONFIG.contracts.usdc)

		const tx = new TransactionBuilder(account, {
			fee: BASE_FEE,
			networkPassphrase: CONFIG.network.networkPassphrase,
		})
			.addOperation(
				contract.call(
					"transfer",
					nativeToScVal(this.keypair.publicKey(), { type: "address" }),
					nativeToScVal(recipient, { type: "address" }),
					nativeToScVal(amountStroops, { type: "i128" }),
				),
			)
			.setTimeout(300)
			.build()

		const simResult = await server.simulateTransaction(tx)
		if (rpc.Api.isSimulationError(simResult)) {
			throw new Error(`USDC payment simulation failed: ${simResult.error}`)
		}

		const preparedTx = rpc.assembleTransaction(tx, simResult).build()
		preparedTx.sign(this.keypair)

		let sendResult = await server.sendTransaction(preparedTx)

		// If bad seq, retry once after a small delay
		const isBadSeq =
			sendResult.status === "ERROR" &&
			(JSON.stringify(sendResult).includes("txBadSeq") ||
				(sendResult as any).errorResultXdr?.includes("txBadSeq"))

		if (isBadSeq) {
			console.warn("[x402] txBadSeq detected, retrying after 2s...")
			await sleep(2000)
			const freshAccount = await server.getAccount(this.keypair.publicKey())
			const retryTx = new TransactionBuilder(freshAccount, {
				fee: BASE_FEE,
				networkPassphrase: CONFIG.network.networkPassphrase,
			})
				.addOperation(
					contract.call(
						"transfer",
						nativeToScVal(this.keypair.publicKey(), { type: "address" }),
						nativeToScVal(recipient, { type: "address" }),
						nativeToScVal(amountStroops, { type: "i128" }),
					),
				)
				.setTimeout(300)
				.build()
			const retrySim = await server.simulateTransaction(retryTx)
			const finalTx = rpc.assembleTransaction(retryTx, retrySim).build()
			finalTx.sign(this.keypair)
			sendResult = await server.sendTransaction(finalTx)
		}

		if (sendResult.status === "ERROR") {
			throw new Error(
				`USDC payment send failed: ${JSON.stringify(sendResult.errorResult)}`,
			)
		}

		// Poll for ledger confirmation
		let getResult = await server.getTransaction(sendResult.hash)
		let attempts = 0
		while (
			getResult.status === rpc.Api.GetTransactionStatus.NOT_FOUND &&
			attempts < 20
		) {
			await sleep(1000)
			getResult = await server.getTransaction(sendResult.hash)
			attempts++
		}

		if (getResult.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
			throw new Error(`USDC payment tx failed: ${getResult.status}`)
		}

		return sendResult.hash
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
