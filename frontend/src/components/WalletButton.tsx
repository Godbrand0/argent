"use client"
import { useWallet } from "@/hooks/useWallet"

function shortKey(key: string) {
	return `${key.slice(0, 4)}…${key.slice(-4)}`
}

export function WalletButton() {
	const {
		publicKey,
		connecting,
		connected,
		activeWallet,
		connect,
		disconnect,
	} = useWallet()

	// Connected
	if (connected && publicKey) {
		return (
			<div className="flex items-center gap-2">
				{activeWallet && (
					<span className="text-xs text-gray-500">{activeWallet.name}</span>
				)}
				<span className="text-xs font-mono text-gray-300 bg-gray-800 px-2 py-1 rounded">
					{shortKey(publicKey)}
				</span>
				<button
					onClick={disconnect}
					className="text-xs text-gray-400 hover:text-red-400 transition-colors"
				>
					Disconnect
				</button>
			</div>
		)
	}

	// Not connected — just show Wallet Kit connect button which opens modal
	return (
		<button
			onClick={() => connect()}
			disabled={connecting}
			className="px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-md transition-colors"
		>
			{connecting ? "Connecting…" : "Connect Wallet"}
		</button>
	)
}
