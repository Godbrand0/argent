import { type Position, type Auction } from "./vault"

export const MOCK_OWNER =
	"GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
export const MOCK_AGENT =
	"GD2U3BQ4P4M5W6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F1G2H3I4J5K6L"

export const MOCK_POSITIONS: [bigint, Position][] = [
	[
		101n,
		{
			owner: MOCK_OWNER,
			collateral_asset: "XLM",
			collateral_amount: 80000_0000000n, // 80,000 XLM (~$8,800)
			debt_principal: 1000_0000000n, // 1,000 USDC
			opened_at_ledger: 110000,
			borrow_index_at_open: 10000000n,
			became_liquidatable_at: 0,
			auction_state: { tag: "None" },
		},
	],
	[
		102n,
		{
			owner: "GCM7W5R7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H2I3J4K5L6M7N8O9P",
			collateral_asset: "XLM",
			collateral_amount: 25000_0000000n, // 25,000 XLM (~$2,750)
			debt_principal: 2000_0000000n, // 2,000 USDC
			opened_at_ledger: 123460,
			borrow_index_at_open: 10000000n,
			became_liquidatable_at: 0,
			auction_state: { tag: "None" },
		},
	],
	[
		103n,
		{
			owner: "GDH3I4J5K6L7M8N9O0P1Q2R3S4T5U6V7W8X9Y0Z1A2B3C4D5E6F7G",
			collateral_asset: "XLM",
			collateral_amount: 21000_0000000n, // 21,000 XLM (~$2,310) -> HF ~1.15
			debt_principal: 2000_0000000n, // 2,000 USDC
			opened_at_ledger: 124500,
			borrow_index_at_open: 10000000n,
			became_liquidatable_at: 0,
			auction_state: { tag: "None" },
		},
	],
	[
		104n,
		{
			owner: "GBQ1R2S3T4U5V6W7X8Y9Z0A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P",
			collateral_asset: "XLM",
			collateral_amount: 18000_0000000n, // 18,000 XLM (~$1,980) -> HF ~0.99
			debt_principal: 2000_0000000n, // 2,000 USDC
			opened_at_ledger: 125000,
			borrow_index_at_open: 10000000n,
			became_liquidatable_at: 125800,
			auction_state: { tag: "None" },
		},
	],
	[
		105n,
		{
			owner: "GDT6U7V8W9X0Y1Z2A3B4C5D6E7F8G9H0I1J2K3L4M5N6O7P8Q9R0S",
			collateral_asset: "XLM",
			collateral_amount: 15000_0000000n, // 15,000 XLM (~$1,650)
			debt_principal: 2000_0000000n, // 2,000 USDC
			opened_at_ledger: 123000,
			borrow_index_at_open: 10000000n,
			became_liquidatable_at: 124000,
			auction_state: { tag: "Active" },
		},
	],
]

export const MOCK_AUCTIONS: [bigint, Auction][] = [
	[
		50n,
		{
			position_id: 105n,
			trigger_agent: MOCK_AGENT,
			start_price: 2200_0000000n,
			floor_price: 1800_0000000n,
			decay_rate_per_ledger: 2000000n,
			started_at_ledger: 126000,
			settled: false,
		},
	],
	[
		51n,
		{
			position_id: 104n,
			trigger_agent: "GD111222333444555666777888999000AAABBBCCCDDDEEEFFFGGG",
			start_price: 2150_0000000n,
			floor_price: 1950_0000000n,
			decay_rate_per_ledger: 500000n,
			started_at_ledger: 126500,
			settled: false,
		},
	],
]

export const MOCK_PRICES: Record<string, bigint> = {
	"50": 1850_0000000n, // Near floor
	"51": 2145_0000000n, // Freshly started
}
