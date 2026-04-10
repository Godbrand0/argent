import {
	Address,
	authorizeEntry,
	Contract,
	type Keypair,
	Networks,
	rpc,
	scValToNative,
	type Transaction,
	TransactionBuilder,
	BASE_FEE,
	xdr,
} from "@stellar/stellar-sdk"
import { CONFIG } from "../config.js"

// Verified valid public key used for simulation-only reads (no signing required)
const DUMMY_ADDRESS = "GBV3HZAABDYP4EZQE2AH73MNDHWS322E4CZGTQ477K776UUHPKZ5I46B"

export const server = new rpc.Server(CONFIG.network.rpcUrl, {
	allowHttp: false,
})

export async function invokeContract(
	contractId: string,
	method: string,
	args: xdr.ScVal[],
	keypair: Keypair,
): Promise<xdr.ScVal> {
	const account = await server.getAccount(keypair.publicKey())
	const contract = new Contract(contractId)

	const tx = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase: CONFIG.network.networkPassphrase,
	})
		.addOperation(contract.call(method, ...args))
		.setTimeout(300)
		.build()

	const simResult = await server.simulateTransaction(tx)

	if (rpc.Api.isSimulationError(simResult)) {
		throw new Error(`Simulation failed: ${simResult.error}`)
	}
	if ((simResult as any).error) {
		throw new Error(`Simulation failed: ${(simResult as any).error}`)
	}

	// Build the transaction with the simulation's Soroban footprint + auth entries.
	// Soroban simulation does NOT enforce auth signatures; real execution does.
	// Nested calls inside a contract (e.g. token.transfer(winner, ...)) generate
	// SOROBAN_CREDENTIALS_ADDRESS auth entries that must be explicitly signed with
	// authorizeEntry — they are NOT covered by the outer transaction signature alone.
	let preparedTx = rpc.assembleTransaction(tx, simResult).build()

	const txEnv = xdr.TransactionEnvelope.fromXDR(preparedTx.toXDR(), "base64")
	const authList = txEnv
		.v1()
		.tx()
		.operations()[0]
		.body()
		.invokeHostFunctionOp()
		.auth()

	if (
		authList.some(
			(e) => e.credentials().switch().name === "sorobanCredentialsAddress",
		)
	) {
		// Convert any sorobanCredentialsAddress entry for the tx source to
		// sorobanCredentialsSourceAccount. This prevents auth failures when
		// contract sub-invocations (e.g. token.transfer inside settle_auction)
		// use a dynamic amount that differs between simulation and execution
		// ledgers (Dutch auction price decay). SourceAccount auth is blanket
		// and does not check exact invocation arguments.
		const sourceKey = keypair.publicKey()
		const convertedAuth = authList.map((entry) => {
			if (entry.credentials().switch().name !== "sorobanCredentialsAddress")
				return entry
			try {
				const scAddr = entry.credentials().address().address()
				if (Address.fromScAddress(scAddr).toString() === sourceKey) {
					return new xdr.SorobanAuthorizationEntry({
						credentials:
							xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
						rootInvocation: entry.rootInvocation(),
					})
				}
			} catch {
				// not an account address — keep as-is
			}
			return entry
		})

		// Sign any remaining sorobanCredentialsAddress entries (non-source accounts)
		const latestLedger = await server.getLatestLedger()
		const validUntilLedger = latestLedger.sequence + 100
		const signedAuth = await Promise.all(
			convertedAuth.map((entry) =>
				entry.credentials().switch().name === "sorobanCredentialsAddress"
					? authorizeEntry(
							entry,
							keypair,
							validUntilLedger,
							CONFIG.network.networkPassphrase,
						)
					: Promise.resolve(entry),
			),
		)
		txEnv
			.v1()
			.tx()
			.operations()[0]
			.body()
			.invokeHostFunctionOp()
			.auth(signedAuth)
		preparedTx = TransactionBuilder.fromXDR(
			txEnv.toXDR("base64"),
			CONFIG.network.networkPassphrase,
		) as Transaction
	}

	preparedTx.sign(keypair)

	const sendResult = await server.sendTransaction(preparedTx)
	if (sendResult.status === "ERROR") {
		throw new Error(`Send failed: ${JSON.stringify(sendResult.errorResult)}`)
	}

	// Poll for confirmation
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
		let detail = ""
		try {
			const resultXdr = (getResult as any).resultXdr as
				| xdr.TransactionResult
				| undefined
			if (resultXdr) {
				const txCode = resultXdr.result().switch().name
				const opResults = resultXdr.result().results?.() ?? []
				const opCode = opResults[0]
					?.tr?.()
					?.invokeHostFunctionResult?.()
					?.switch?.()?.name
				detail = ` [${txCode}${opCode ? ` / ${opCode}` : ""}]`
			}
		} catch {
			/* ignore XDR decode errors */
		}

		// Extract diagnostic events (contract panic messages)
		try {
			const events: any[] =
				(getResult as any).resultMetaXdr
					?.v3?.()
					?.sorobanMeta?.()
					?.diagnosticEvents?.() ?? []
			for (const ev of events) {
				try {
					const native = scValToNative(ev.event().body().v0().data())
					detail += ` | diag: ${JSON.stringify(native)}`
				} catch {}
			}
		} catch {}

		throw new Error(`Transaction failed: ${getResult.status}${detail}`)
	}

	return getResult.returnValue ?? xdr.ScVal.scvVoid()
}

/**
 * Simulate a read-only contract call. Does not submit a transaction,
 * costs no XLM, and does not require the keypair to sign.
 */
export async function simulateContractRead(
	contractId: string,
	method: string,
	args: xdr.ScVal[],
): Promise<xdr.ScVal> {
	const source = await server.getAccount(DUMMY_ADDRESS).catch(() => ({
		accountId: () => DUMMY_ADDRESS,
		sequenceNumber: () => "0",
	}))
	const contract = new Contract(contractId)
	const tx = new TransactionBuilder(source as any, {
		fee: BASE_FEE,
		networkPassphrase: CONFIG.network.networkPassphrase,
	})
		.addOperation(contract.call(method, ...args))
		.setTimeout(0)
		.build()

	const sim = await server.simulateTransaction(tx)
	if (rpc.Api.isSimulationError(sim)) {
		throw new Error(`Simulation failed: ${sim.error}`)
	}
	return (
		(sim as rpc.Api.SimulateTransactionSuccessResponse).result?.retval ??
		xdr.ScVal.scvVoid()
	)
}

export async function readContractData(
	contractId: string,
	key: xdr.ScVal,
): Promise<xdr.ScVal | null> {
	try {
		const result = await server.getContractData(contractId, key)
		return (result as any).val as unknown as xdr.ScVal
	} catch {
		return null
	}
}

export async function getCurrentLedger(): Promise<number> {
	const info = await server.getLatestLedger()
	return info.sequence
}

export async function pollEvents(
	contractId: string,
	startLedger: number,
): Promise<rpc.Api.EventResponse[]> {
	const result = await server.getEvents({
		startLedger,
		filters: [{ type: "contract", contractIds: [contractId] }],
	})
	return result.events
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
