import { rpc } from "@stellar/stellar-sdk"
import dotenv from "dotenv"
dotenv.config()

const RPC_SDF = "https://soroban-testnet.stellar.org"
const RPC_PUBLIC = "https://soroban-testnet.publicnode.com"
const publicKey = "GA5PKI5WJQTLCMRWFQO4O2GGWTVTHIK5E2GJT7HBRN2Q4DAAMCIEJEM3"

async function check(url: string) {
	const server = new rpc.Server(url)
	try {
		console.log(`Checking account ${publicKey} on ${url}...`)
		const acc = await server.getAccount(publicKey)
		console.log(`[${url}] Account found!`)
	} catch (err: any) {
		console.log(`[${url}] Error: ${err.message}`)
	}
}

async function test() {
	await check(RPC_SDF)
	await check(RPC_PUBLIC)
}
void test()
