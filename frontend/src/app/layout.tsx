import { type Metadata } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { Navbar } from "@/components/Navbar"

const inter = Inter({ variable: "--font-geist-sans", subsets: ["latin"] })
const jetbrainsMono = JetBrains_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
	preload: false,
})

export const metadata: Metadata = {
	title: "Argen",
	description: "ZK-powered autonomous lending & liquidation on Stellar",
}

export default function RootLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<html
			lang="en"
			className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
		>
			<body className="min-h-screen bg-gray-950 text-gray-100">
				<Navbar />
				<main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
			</body>
		</html>
	)
}
