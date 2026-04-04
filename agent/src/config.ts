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
		vault: process.env.VAULT_CONTRACT_ID ?? "",
		vusdc: process.env.VUSDC_CONTRACT_ID ?? "",
		usdc: process.env.USDC_CONTRACT_ID ?? "",
	},
	agent: {
		secretKey: process.env.AGENT_SECRET_KEY ?? "",
		loopIntervalMs: parseInt(process.env.LOOP_INTERVAL_MS ?? "5000"),
		heartbeatIntervalLedgers: parseInt(process.env.HEARTBEAT_INTERVAL ?? "60"),
		scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS ?? "10000"),
		minProfitThreshold: parseFloat(process.env.MIN_PROFIT_THRESHOLD ?? "0.02"),
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
