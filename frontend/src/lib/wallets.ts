"use client"
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit"
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils"
import { NETWORK } from "./config"

export type WalletId = string

let initialized = false

export function initKit() {
	if (typeof window !== "undefined" && !initialized) {
		StellarWalletsKit.init({
			network: NETWORK.passphrase.includes("Test")
				? Networks.TESTNET
				: NETWORK.passphrase.includes("Public")
					? Networks.PUBLIC
					: Networks.FUTURENET,
			selectedWalletId: "freighter",
			modules: defaultModules(),
		})
		initialized = true
	}
}

export { StellarWalletsKit }
