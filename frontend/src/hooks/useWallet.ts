"use client"
import { useState, useCallback, useEffect } from "react"
import { NETWORK } from "@/lib/config"
import { submitTransaction } from "@/lib/soroban"
import { StellarWalletsKit, initKit } from "@/lib/wallets"

const STORAGE_KEY = "argent:wallet"

export function useWallet() {
	const [publicKey, setPublicKey] = useState<string | null>(null)
	const [connecting, setConnecting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Initialize Kit and restore session
	useEffect(() => {
		initKit()
		const storedId = localStorage.getItem(STORAGE_KEY)
		if (storedId) {
			try {
				StellarWalletsKit.setWallet(storedId)
				StellarWalletsKit.getAddress()
					.then(({ address }) => {
						if (address) {
							setPublicKey(address)
						}
					})
					.catch(() => {
						/* ignore */
					})
			} catch (e) {
				console.error("Failed to restore wallet", e)
			}
		}
	}, [])

	const connect = useCallback(async () => {
		setConnecting(true)
		setError(null)
		try {
			// Initiates the UI modal to connect
			const { address } = await StellarWalletsKit.authModal()
			setPublicKey(address)
			const mod = StellarWalletsKit.selectedModule
			if (mod) localStorage.setItem(STORAGE_KEY, mod.productId)
		} catch (e) {
			if (typeof e === "object" && e && "message" in e) {
				setError(String(e.message))
			} else {
				setError(String(e))
			}
		} finally {
			setConnecting(false)
		}
	}, [])

	const disconnect = useCallback(async () => {
		try {
			await StellarWalletsKit.disconnect()
		} catch (e) {}
		setPublicKey(null)
		localStorage.removeItem(STORAGE_KEY)
	}, [])

	const sign = useCallback(
		async (xdr: string): Promise<string> => {
			if (!publicKey) throw new Error("No wallet connected")
			// Use kit to sign
			const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
				networkPassphrase: NETWORK.passphrase,
			})
			return submitTransaction(signedTxXdr)
		},
		[publicKey],
	)

	return {
		publicKey,
		connecting,
		connected: !!publicKey,
		activeWallet: publicKey
			? { name: StellarWalletsKit.selectedModule?.productName || "Wallet" }
			: null,
		error,
		connect,
		disconnect,
		sign,
	}
}
