import {
	Contract,
	type Keypair,
	Networks,
	rpc,
	Transaction,
	TransactionBuilder,
	BASE_FEE,
	xdr,
} from "@stellar/stellar-sdk"
import { CONFIG } from "../config.js"

const server = new rpc.Server(CONFIG.network.rpcUrl, { allowHttp: false })

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
		.setTimeout(30)
		.build()

	const simResult = await server.simulateTransaction(tx)

	if (rpc.Api.isSimulationError(simResult)) {
		throw new Error(`Simulation failed: ${simResult.error}`)
	}

	const preparedTx = rpc.assembleTransaction(tx, simResult).build()
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
		throw new Error(`Transaction failed: ${getResult.status}`)
	}

	return getResult.returnValue ?? xdr.ScVal.scvVoid()
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
