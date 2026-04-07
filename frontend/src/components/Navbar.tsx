"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { WalletButton } from "./WalletButton"

const NAV = [
	{ href: "/dashboard", label: "Vault" },
	{ href: "/positions", label: "Positions" },
	{ href: "/auctions", label: "Auctions" },
]

export function Navbar() {
	const path = usePathname()
	return (
		<nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
				<div className="flex items-center gap-8">
					<span className="font-bold text-lg tracking-tight text-white">
						Liquid<span className="text-indigo-400">Mind</span>
					</span>
					<div className="hidden sm:flex gap-1">
						{NAV.map((n) => (
							<Link
								key={n.href}
								href={n.href}
								className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
									path?.startsWith(n.href)
										? "bg-gray-800 text-white"
										: "text-gray-400 hover:text-white hover:bg-gray-800/60"
								}`}
							>
								{n.label}
							</Link>
						))}
					</div>
				</div>
				<WalletButton />
			</div>
		</nav>
	)
}
