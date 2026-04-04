"use client"
import { NETWORK } from "./config"

// Dynamically import freighter to avoid SSR issues
let freighterApi: typeof import("@stellar/freighter-api") | null = null

async function getFreighter() {
	if (!freighterApi) {
		freighterApi = await import("@stellar/freighter-api")
	}
	return freighterApi
}

export async function isFreighterInstalled(): Promise<boolean> {
	try {
		const f = await getFreighter()
		return f.isConnected().then((r) => r.isConnected)
	} catch {
		return false
	}
}

export async function connectWallet(): Promise<string> {
	const f = await getFreighter()
	const result = await f.requestAccess()
	if (result.error) throw new Error(result.error)
	return result.address
}

export async function getPublicKey(): Promise<string | null> {
	try {
		const f = await getFreighter()
		const result = await f.getAddress()
		return result.address || null
	} catch {
		return null
	}
}

export async function signTransaction(xdr: string): Promise<string> {
	const f = await getFreighter()
	const result = await f.signTransaction(xdr, {
		networkPassphrase: NETWORK.passphrase,
	})
	if (result.error) throw new Error(result.error)
	return result.signedTxXdr
}

export async function getNetworkPassphrase(): Promise<string> {
	const f = await getFreighter()
	const result = await f.getNetwork()
	return result.networkPassphrase || NETWORK.passphrase
}
