export const CONFIG = {
	network: {
		rpcUrl:
			process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
		horizonUrl:
			process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org",
		networkPassphrase:
			process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
	},
	contracts: {
		vault:
			process.env.VAULT_CONTRACT_ID ??
			(() => {
				throw new Error("VAULT_CONTRACT_ID not set")
			})(),
		vusdc:
			process.env.VUSDC_CONTRACT_ID ??
			(() => {
				throw new Error("VUSDC_CONTRACT_ID not set")
			})(),
		// Native XLM Stellar Asset Contract — used as collateral
		xlmSac:
			process.env.XLM_SAC_CONTRACT_ID ??
			"CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
		// USDC SAC — Circle testnet issuer
		usdc:
			process.env.USDC_CONTRACT_ID ??
			"CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
	},
	agent: {
		secretKey: process.env.AGENT_SECRET_KEY ?? "",
		/**
		 * The Stellar address of the human/entity that owns this agent.
		 * Collateral won at auction is held by the agent keypair, but the owner
		 * is recorded on-chain in the pool registry for attribution.
		 */
		ownerAddress: process.env.AGENT_OWNER_ADDRESS ?? "",
		/**
		 * "monitor"  — only scans positions and triggers auctions (earns trigger fees)
		 * "bidder"   — only watches auctions and places limit bids (earns collateral)
		 * "both"     — does both (default for single-agent setups)
		 */
		role: (process.env.AGENT_ROLE ?? "both") as "monitor" | "bidder" | "both",
		loopIntervalMs: parseInt(process.env.LOOP_INTERVAL_MS ?? "5000"),
		heartbeatIntervalLedgers: parseInt(process.env.HEARTBEAT_INTERVAL ?? "60"),
		scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS ?? "10000"),
		/**
		 * Minimum discount (as a fraction) before this agent places a limit bid.
		 * e.g. 0.05 = only bid when current Dutch price is ≥5% below market value.
		 * Lower values = more aggressive (bid earlier, less profit per auction).
		 * Higher values = more conservative (wait longer, more profit if you win).
		 */
		minProfitThreshold: parseFloat(process.env.MIN_PROFIT_THRESHOLD ?? "0.02"),
		/**
		 * Maximum USDC to spend on a single bid. 0 = no limit (use full balance).
		 * Useful when running pool agents with capped budgets.
		 */
		maxBidUsdc: parseInt(process.env.MAX_BID_USDC ?? "0"),
	},
	x402: {
		/**
		 * Base URL of the LiquidMind x402 intelligence server.
		 * Agent will pay for /opportunities and /auctions data instead of scanning the chain directly.
		 */
		serverUrl: process.env.X402_SERVER_URL ?? "http://localhost:4000",
		/**
		 * Stellar address that receives USDC payments for gated endpoints.
		 * Must match SERVER_PAYMENT_ADDRESS in the server .env.
		 */
		serverPaymentAddress: process.env.X402_SERVER_PAYMENT_ADDRESS ?? "",
	},
	zk: {
		hfWasmPath:
			process.env.HF_WASM_PATH ??
			"../circuits/health_factor/health_factor_js/health_factor.wasm",
		hfZkeyPath:
			process.env.HF_ZKEY_PATH ?? "../circuits/health_factor/hf_final.zkey",
		paWasmPath:
			process.env.PA_WASM_PATH ??
			"../circuits/price_attestation/price_attestation_js/price_attestation.wasm",
		paZkeyPath:
			process.env.PA_ZKEY_PATH ?? "../circuits/price_attestation/pa_final.zkey",
		apWasmPath:
			process.env.AP_WASM_PATH ??
			"../circuits/auction_price/auction_price_js/auction_price.wasm",
		apZkeyPath:
			process.env.AP_ZKEY_PATH ?? "../circuits/auction_price/ap_final.zkey",
	},
} as const
