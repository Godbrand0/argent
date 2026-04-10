export const NETWORK = {
	rpcUrl:
		process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
	horizonUrl:
		process.env.NEXT_PUBLIC_HORIZON_URL ??
		"https://horizon-testnet.stellar.org",
	passphrase:
		process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
		"Test SDF Network ; September 2015",
}

export const CONTRACTS = {
	vault: process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID ?? "",
	vusdc: process.env.NEXT_PUBLIC_VUSDC_CONTRACT_ID ?? "",
	// Native XLM Stellar Asset Contract — deposited as collateral to borrow USDC
	xlmSac:
		process.env.NEXT_PUBLIC_XLM_SAC_CONTRACT_ID ??
		"CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
	// USDC SAC — Circle testnet (issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5)
	usdc:
		process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ??
		"CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
	zkVerifier:
		process.env.NEXT_PUBLIC_ZK_VERIFIER_CONTRACT_ID ??
		"CDGYLCFDRHFUIGJ2A2BZ3X5BJRHVBLSEJ4DYHGRBPAYJ7YQLOVW72XR5",
}

export const SCALE = 10_000_000n
export const SCALE_N = 10_000_000

/** Format a scaled-1e7 bigint as a human-readable decimal string */
export function fmt7(val: bigint, decimals = 2): string {
	const n = Number(val) / SCALE_N
	return n.toLocaleString(undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	})
}

/** Format as a percentage (val/1e7 * 100) */
export function fmtPct(val: bigint, decimals = 2): string {
	return `${((Number(val) / SCALE_N) * 100).toFixed(decimals)}%`
}

/** Health factor colour */
export function hfColor(hf: bigint): string {
	const v = Number(hf) / SCALE_N
	if (v >= 1.3) return "text-green-400"
	if (v >= 1.0) return "text-yellow-400"
	return "text-red-400"
}

/** Health factor bar fill % (clamped 0-100) */
export function hfBarPct(hf: bigint): number {
	return Math.min(100, Math.max(0, (Number(hf) / SCALE_N) * 70))
}
