"use client"
import {
	Contract,
	Networks,
	rpc,
	Transaction,
	TransactionBuilder,
	BASE_FEE,
	type xdr,
	scValToNative,
	nativeToScVal,
} from "@stellar/stellar-sdk"
import { NETWORK, CONTRACTS } from "./config"

// -------------------------------------------------------------------------
// Read-only RPC client (no signing required)
// -------------------------------------------------------------------------

let _server: rpc.Server | null = null

function getServer(): rpc.Server {
	if (!_server) {
		_server = new rpc.Server(NETWORK.rpcUrl, { allowHttp: false })
	}
	return _server
}

// A valid testnet account used as a dummy source for read-only simulations.
// (USDC issuer on testnet — known to exist and has a valid checksum)
const DUMMY_SOURCE = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

/** Simulate a read-only contract call and return the native JS value */
export async function readContract<T = unknown>(
	contractId: string,
	method: string,
	args: xdr.ScVal[] = [],
	sourceAccount = DUMMY_SOURCE,
): Promise<T> {
	const server = getServer()
	const account = await server.getAccount(sourceAccount).catch(
		() =>
			({
				accountId: () => sourceAccount,
				sequenceNumber: () => "0",
				incrementSequenceNumber: () => {},
			}) as unknown as ReturnType<typeof server.getAccount> extends Promise<
				infer R
			>
				? R
				: never,
	)

	const contract = new Contract(contractId)
	const tx = new TransactionBuilder(account as any, {
		fee: BASE_FEE,
		networkPassphrase: NETWORK.passphrase,
	})
		.addOperation(contract.call(method, ...args))
		.setTimeout(30)
		.build()

	const sim = await server.simulateTransaction(tx)
	if (rpc.Api.isSimulationError(sim)) {
		throw new Error(`Simulation error: ${sim.error}`)
	}
	if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
		throw new Error("Simulation returned no result")
	}
	return scValToNative(sim.result.retval) as T
}

/** Submit a signed XDR transaction and wait for confirmation */
export async function submitTransaction(signedXdr: string): Promise<string> {
	const server = getServer()
	const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase)
	const send = await server.sendTransaction(tx)
	if (send.status === "ERROR") {
		throw new Error(`Send failed: ${JSON.stringify(send.errorResult)}`)
	}
	let result = await server.getTransaction(send.hash)
	let attempts = 0
	while (
		result.status === rpc.Api.GetTransactionStatus.NOT_FOUND &&
		attempts < 30
	) {
		await new Promise((r) => setTimeout(r, 1000))
		result = await server.getTransaction(send.hash)
		attempts++
	}
	if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
		throw new Error(`Transaction ${send.hash} failed: ${result.status}`)
	}
	return send.hash
}

/** Build and simulate a contract call, returning prepared XDR for signing */
export async function buildContractTx(
	contractId: string,
	method: string,
	args: xdr.ScVal[],
	signerPublicKey: string,
): Promise<string> {
	const server = getServer()
	const account = await server.getAccount(signerPublicKey)
	const contract = new Contract(contractId)

	const tx = new TransactionBuilder(account, {
		fee: BASE_FEE,
		networkPassphrase: NETWORK.passphrase,
	})
		.addOperation(contract.call(method, ...args))
		.setTimeout(300)
		.build()

	const sim = await server.simulateTransaction(tx)
	if (rpc.Api.isSimulationError(sim)) {
		throw new Error(`Simulation error: ${sim.error}`)
	}

	return rpc.assembleTransaction(tx, sim).build().toXDR()
}

export async function getCurrentLedger(): Promise<number> {
	return (await getServer().getLatestLedger()).sequence
}

export async function getEvents(
	contractId: string,
	startLedger: number,
): Promise<rpc.Api.EventResponse[]> {
	const result = await getServer().getEvents({
		startLedger,
		filters: [{ type: "contract", contractIds: [contractId] }],
	})
	return result.events
}
