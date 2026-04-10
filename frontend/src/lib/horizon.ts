"use client"
import { Horizon } from "@stellar/stellar-sdk"
import { NETWORK, SCALE_N } from "./config"

const horizon = new Horizon.Server(NETWORK.horizonUrl)

// Circle testnet USDC issuer
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

/**
 * Fetch the native XLM balance for a given address from Horizon.
 * Returns the balance scaled to 1e7 as a bigint.
 */
export async function getNativeBalance(address: string): Promise<bigint> {
	try {
		const account = await horizon.loadAccount(address)
		const nativeBalance = account.balances.find(
			(b) => b.asset_type === "native",
		)
		if (nativeBalance) {
			return BigInt(Math.round(parseFloat(nativeBalance.balance) * SCALE_N))
		}
		return 0n
	} catch (err) {
		console.error("Failed to fetch XLM balance from Horizon:", err)
		return 0n
	}
}

/**
 * Fetch the Circle testnet USDC balance for a given address from Horizon.
 * Returns the balance scaled to 1e7 as a bigint.
 */
export async function getClassicUsdcBalance(address: string): Promise<bigint> {
	try {
		const account = await horizon.loadAccount(address)
		const usdcBalance = account.balances.find(
			(b) =>
				b.asset_type === "credit_alphanum4" &&
				(b as Horizon.HorizonApi.BalanceLine<"credit_alphanum4">).asset_code ===
					"USDC" &&
				(b as Horizon.HorizonApi.BalanceLine<"credit_alphanum4">)
					.asset_issuer === USDC_ISSUER,
		)
		if (usdcBalance) {
			return BigInt(Math.round(parseFloat(usdcBalance.balance) * SCALE_N))
		}
		return 0n
	} catch (err) {
		console.error("Failed to fetch USDC balance from Horizon:", err)
		return 0n
	}
}
