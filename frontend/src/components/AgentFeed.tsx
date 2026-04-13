"use client"
import { CopyButton } from "./CopyButton"
import { CONTRACTS, NETWORK } from "@/lib/config"

const ENV_VARS = [
	{
		key: "AGENT_SECRET_KEY",
		required: true,
		desc: "The secret key (S…) of your agent's Stellar keypair. Think of this as the agent's wallet — it signs every transaction the agent submits, pays XLM gas fees, and is the address that receives the 1% liquidation trigger fee and any collateral won at auction. Generate a fresh keypair for the agent (do not reuse your personal wallet). Fund it with a small amount of XLM on testnet using Friendbot.",
		link: {
			label: "Generate a keypair on Stellar Lab",
			href: "https://laboratory.stellar.org/account/create?network=testnet",
		},
	},
	{
		key: "AGENT_OWNER_ADDRESS",
		required: true,
		desc: "Your personal Stellar public key (G…) — the human behind the agent. This is recorded on-chain so rewards and attribution are tied to your identity, not just the agent keypair.",
	},
	{
		key: "AGENT_ROLE",
		required: true,
		default: "monitor",
		desc: '"monitor" — scans positions and triggers liquidations. "bidder" — bids on auctions. Note: For stability, a single agent instance must choose one role. If you want to do both, run two separate agent instances with the same secret key.',
	},
	{
		key: "VAULT_CONTRACT_ID",
		required: true,
		default: CONTRACTS.vault,
		desc: "The vault Soroban contract address. Copy it from the Pool Address box above.",
	},
	{
		key: "VUSDC_CONTRACT_ID",
		required: true,
		default: CONTRACTS.vusdc,
		desc: "The vUSDC token contract address. Returned by deploy.sh; also shown above.",
	},
	{
		key: "ZK_VERIFIER_CONTRACT_ID",
		required: true,
		default: CONTRACTS.zkVerifier,
		desc: "The ZK Verifier contract address used to verify health factor and price proofs.",
	},
	{
		key: "MIN_PROFIT_THRESHOLD",
		required: false,
		default: "0.02",
		desc: "Minimum discount fraction before the bidder places a bid. 0.02 = wait until the Dutch auction price is at least 2% below market value.",
	},
	{
		key: "MAX_BID_USDC",
		required: false,
		default: "0 (unlimited)",
		desc: "Maximum USDC to spend on a single auction bid. Useful for capping exposure.",
	},
	{
		key: "STELLAR_RPC_URL",
		required: false,
		default: NETWORK.rpcUrl,
		desc: "Soroban RPC endpoint.",
	},
]

function CopyBox({ label, value }: { label: string; value: string }) {
	return (
		<div className="space-y-1">
			<p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
			<div className="flex items-center gap-2">
				<code className="flex-1 text-xs bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-indigo-300 font-mono truncate">
					{value || (
						<span className="text-gray-600 italic">not deployed yet</span>
					)}
				</code>
				{value && <CopyButton value={value} />}
			</div>
		</div>
	)
}

export function AgentFeed() {
	const vaultId = CONTRACTS.vault
	const vusdcId = CONTRACTS.vusdc
	const usdcId = CONTRACTS.usdc
	const xlmSacId = CONTRACTS.xlmSac
	const zkVerifierId = CONTRACTS.zkVerifier
	const rpcUrl = NETWORK.rpcUrl

	return (
		<div className="space-y-8 max-w-3xl">
			<div>
				<h1 className="text-2xl font-bold text-white">Agent Access</h1>
				<p className="text-sm text-gray-400 mt-1">
					Argen is managed by autonomous agents — they scan positions, generate
					ZK health-factor proofs, trigger liquidations, and bid on Dutch
					auctions. This page has everything you need to point an agent at this
					pool.
				</p>
			</div>

			<div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
				<h2 className="text-sm font-semibold text-white">Pool Addresses</h2>
				<div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
					<CopyBox label="Vault Contract ID" value={vaultId} />
					<CopyBox label="vUSDC Contract ID" value={vusdcId} />
					<CopyBox label="USDC Contract ID" value={usdcId} />
					<CopyBox label="XLM SAC (Collateral)" value={xlmSacId} />
					<CopyBox label="ZK Verifier ID" value={zkVerifierId} />
					<CopyBox label="Soroban RPC" value={rpcUrl} />
				</div>
			</div>

			{/* Agent roles */}
			<div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
				<h2 className="text-sm font-semibold text-white">Agent Roles</h2>
				<div className="grid sm:grid-cols-2 gap-4">
					<div className="rounded-lg border border-gray-700 p-4 space-y-1">
						<div className="flex items-center justify-between">
							<p className="text-sm font-medium text-indigo-300">monitor</p>
							<span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded">
								Exclusive Role
							</span>
						</div>
						<p className="text-xs text-gray-400">
							Polls positions and generates a ZK health-factor proof for each
							one. Calls <code className="text-gray-300">trigger_auction</code>{" "}
							when a position is undercollateralised. Earns a trigger fee paid
							by the vault reserve.
						</p>
					</div>
					<div className="rounded-lg border border-gray-700 p-4 space-y-1">
						<div className="flex items-center justify-between">
							<p className="text-sm font-medium text-indigo-300">bidder</p>
							<span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded">
								Exclusive Role
							</span>
						</div>
						<p className="text-xs text-gray-400">
							Watches open auctions. Generates a ZK auction-price proof and
							submits a limit bid when the Dutch-auction price reaches your
							configured discount threshold. Earns discounted XLM collateral.
						</p>
					</div>
				</div>
			</div>

			{/* Environment variables */}
			<div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
				<h2 className="text-sm font-semibold text-white">
					Environment Variables
				</h2>
				<div className="divide-y divide-gray-800">
					{ENV_VARS.map((v) => (
						<div key={v.key} className="py-3 space-y-0.5">
							<div className="flex items-center gap-2">
								<code className="text-xs text-indigo-300 font-mono">
									{v.key}
								</code>
								{v.required ? (
									<span className="text-xs text-red-400 font-medium">
										required
									</span>
								) : (
									<span className="text-xs text-gray-500">
										optional — default:{" "}
										<code className="text-gray-400">{v.default}</code>
									</span>
								)}
							</div>
							<p className="text-xs text-gray-500">{v.desc}</p>
							{"link" in v && v.link && (
								<a
									href={v.link.href}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
								>
									{v.link.label} →
								</a>
							)}
						</div>
					))}
				</div>
			</div>

			{/* x402 Paid API */}
			<div className="rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-6 space-y-4">
				<div>
					<h2 className="text-sm font-semibold text-white">
						Paid Data API (x402)
					</h2>
					<p className="text-xs text-gray-400 mt-1">
						Vault state is available as a paid HTTP API. External agents pay
						per-request in USDC using the{" "}
						<a
							href="https://developers.stellar.org/docs/build/agentic-payments/x402"
							target="_blank"
							rel="noopener noreferrer"
							className="text-indigo-400 hover:text-indigo-300"
						>
							x402 protocol
						</a>{" "}
						— settled through the Built-on-Stellar facilitator. No API key
						needed.
					</p>
				</div>

				<div className="divide-y divide-gray-800/60">
					{[
						{
							method: "GET",
							path: "/pool",
							price: "0.010",
							desc: "TVL, utilization, borrow rate, reserve fund",
						},
						{
							method: "GET",
							path: "/opportunities",
							price: "0.050",
							desc: "Positions at risk of liquidation (health factor < 1.2)",
						},
						{
							method: "GET",
							path: "/auctions",
							price: "0.050",
							desc: "Active Dutch auctions with live price decay",
						},
					].map((ep) => (
						<div key={ep.path} className="py-3 flex items-start gap-3">
							<span className="shrink-0 text-xs font-mono text-green-400 bg-green-950/30 border border-green-900/40 rounded px-1.5 py-0.5">
								{ep.method}
							</span>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<code className="text-xs text-indigo-300 font-mono">
										{ep.path}
									</code>
									<span className="text-xs text-yellow-400 font-medium">
										{ep.price} USDC
									</span>
								</div>
								<p className="text-xs text-gray-500 mt-0.5">{ep.desc}</p>
							</div>
						</div>
					))}
				</div>

				<div className="space-y-2">
					<p className="text-xs text-gray-400 font-medium">
						Running the API server
					</p>
					<pre className="text-xs text-gray-300 bg-gray-950 rounded-lg p-3 overflow-x-auto">{`cd agent
export VAULT_CONTRACT_ID="${vaultId || "<vault-contract-id>"}"
export SERVER_PAYMENT_ADDRESS="G..."   # receives x402 payments
pnpm start:server`}</pre>
				</div>

				<div className="space-y-2">
					<p className="text-xs text-gray-400 font-medium">
						Calling a paid endpoint
					</p>
					<pre className="text-xs text-gray-300 bg-gray-950 rounded-lg p-3 overflow-x-auto">{`# 1. Discover what payment is needed
curl https://argent-1.onrender.com/opportunities
# → 402 { paymentRequirements: { price: "500000", asset: "USDC:..." } }

# 2. Pay via facilitator, get X-PAYMENT token, retry
curl https://argent-1.onrender.com/opportunities \\
  -H "X-PAYMENT: <signed-payment-token>"`}</pre>
				</div>
			</div>

			{/* Start command */}
			<div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-3">
				<h2 className="text-sm font-semibold text-white">Running the Agent</h2>
				<pre className="text-xs text-gray-300 bg-gray-950 rounded-lg p-4 overflow-x-auto leading-relaxed">{`cd agent

# copy the values from the Pool Addresses section above
export VAULT_CONTRACT_ID="${vaultId || "<vault-contract-id>"}"
export VUSDC_CONTRACT_ID="${vusdcId || "<vusdc-contract-id>"}"
export ZK_VERIFIER_CONTRACT_ID="${zkVerifierId || "<zk-verifier-id>"}"

# your agent keypair
export AGENT_SECRET_KEY="S..."
export AGENT_OWNER_ADDRESS="G..."

# role: monitor | bidder
# Note: Roles are exclusive. Run two instances to do both.
export AGENT_ROLE="monitor"

pnpm start`}</pre>
				<p className="text-xs text-gray-500">
					ZK proving keys are loaded from{" "}
					<code className="text-gray-400">../circuits/</code> by default. Set{" "}
					<code className="text-gray-400">HF_WASM_PATH</code>,{" "}
					<code className="text-gray-400">HF_ZKEY_PATH</code>, etc. to override.
				</p>
			</div>
		</div>
	)
}
