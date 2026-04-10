import { Asset, Horizon } from "@stellar/stellar-sdk"
import { CONFIG } from "../config.js"

const horizon = new Horizon.Server(CONFIG.network.horizonUrl)

const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

const ASSET_PAIRS: Record<string, { base: string; counter: string }> = {
	XLM: { base: "native", counter: "USDC" },
	SBTC: { base: "SBTC", counter: "USDC" },
}

/**
 * Compute a simple TWAP from Horizon trade aggregations.
 * Returns price in USDC scaled to 1e7.
 */
export async function computeTWAP(
	asset: string,
	windowMs: number = 30 * 60 * 1000,
): Promise<bigint> {
	const endTime = Date.now()
	const startTime = endTime - windowMs

	const pair = ASSET_PAIRS[asset]
	if (!pair) throw new Error(`Unknown asset: ${asset}`)

	const baseAsset =
		pair.base === "native" ? Asset.native() : new Asset(pair.base, "") // SBTC issuer unknown, fallback to empty (will fail if used)

	const usdcAsset = new Asset("USDC", USDC_ISSUER)

	try {
		const trades = await horizon
			.tradeAggregation(
				baseAsset,
				usdcAsset,
				startTime,
				endTime,
				60_000, // 1-minute resolution
				0,
			)
			.call()

		if (!trades.records || trades.records.length === 0) {
			throw new Error(`No trade data for ${asset}/USDC`)
		}

		// Volume-weighted average price
		let totalVolume = 0
		let totalValue = 0
		for (const trade of trades.records) {
			const price = parseFloat(trade.avg as unknown as string)
			const volume = parseFloat(trade.base_volume as string)
			totalVolume += volume
			totalValue += price * volume
		}

		if (totalVolume === 0) throw new Error(`Zero volume for ${asset}`)

		const twap = totalValue / totalVolume
		return BigInt(Math.round(twap * 10_000_000))
	} catch (err) {
		console.error(`TWAP fetch failed for ${asset}:`, err)
		// Return a mock price for testnet where liquidity may be absent
		return getMockPrice(asset)
	}
}

export async function getAccountBalance(
	address: string,
	assetCode: string,
): Promise<bigint> {
	const account = await horizon.loadAccount(address)
	for (const balance of account.balances) {
		if (assetCode === "XLM" && balance.asset_type === "native") {
			return BigInt(Math.round(parseFloat(balance.balance) * 10_000_000))
		}
		if (
			balance.asset_type !== "native" &&
			(balance as any).asset_code === assetCode
		) {
			return BigInt(Math.round(parseFloat(balance.balance) * 10_000_000))
		}
	}
	return 0n
}

/** Testnet fallback mock prices (scaled 1e7) */
function getMockPrice(asset: string): bigint {
	const mocks: Record<string, bigint> = {
		XLM: 800_000n, // $0.08 (demo: below liquidation threshold for typical positions)
		SBTC: 960_000_000n, // $96,000 (micro-sBTC)
	}
	return mocks[asset] ?? 1_000_000n
}
