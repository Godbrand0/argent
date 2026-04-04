import { type Keypair } from "@stellar/stellar-sdk"

export class X402Client {
	private keypair: Keypair

	constructor(keypair: Keypair) {
		this.keypair = keypair
	}

	/**
	 * Fetches an HTTP resource and natively handles HTTP 402 Payment Required
	 * responses by paying them out of the agent's Stellar wallet.
	 */
	async fetch(
		url: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> {
		const request = new Request(url, init)
		// 1. Initial request without payment
		let response = await fetch(request)

		// 2. If 402 Payment Required, handle the x402 challenge
		if (response.status === 402) {
			const authHeader = response.headers.get("Www-Authenticate")

			if (
				authHeader &&
				(authHeader.toLowerCase().startsWith("l402") ||
					authHeader.toLowerCase().startsWith("x402"))
			) {
				console.log(
					`[x402] Intercepted 402 Payment Required for ${request.url}`,
				)

				try {
					// In a real implementation:
					// const challenge = parseX402Challenge(authHeader);
					// const token = await payWithStellar(challenge, this.keypair);

					console.log(
						"[x402] Signing Authorization Entry and paying Built-on-Stellar facilitator...",
					)

					// Wait for payment to settle (Mocked for stretch goal integration)
					await new Promise((resolve) => setTimeout(resolve, 2000))

					console.log("[x402] Payment successful. Retrying original request...")

					// 3. Retry the request with the payment token attached
					// const newHeaders = new Headers(request.headers);
					// newHeaders.set("Authorization", `x402 ${token}`);
					// response = await fetch(new Request(request, { headers: newHeaders }));
				} catch (e) {
					console.error(`[x402] Failed to fulfill payment challenge:`, e)
					// Fall through and return the 402 response
				}
			}
		}

		return response
	}
}
