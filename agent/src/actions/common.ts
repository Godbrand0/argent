import { type Action } from "../types.js"

// Fixed demo price matching vault-reader.ts and frontend MOCK_XLM_PRICE
const DEMO_XLM_PRICE = 0.08

export function buildFetchPricesAction(): Action {
	return {
		name: "fetch_prices",
		priority: 60,
		preconditions: (s) => Date.now() - s.priceCache.fetchedAt > 30_000,
		execute: async (s) => {
			s.priceCache = {
				prices: { XLM: DEMO_XLM_PRICE },
				fetchedAt: Date.now(),
			}
			console.log(`[fetch_prices] XLM = $${DEMO_XLM_PRICE} (fixed demo)`)
		},
	}
}
