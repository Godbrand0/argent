"use client"
import { useState } from "react"

interface CopyButtonProps {
	value: string
	/** Optional extra class on the button */
	className?: string
}

export function CopyButton({ value, className = "" }: CopyButtonProps) {
	const [copied, setCopied] = useState(false)

	function handleCopy() {
		void navigator.clipboard.writeText(value).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		})
	}

	return (
		<button
			onClick={handleCopy}
			title={copied ? "Copied!" : "Copy to clipboard"}
			className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all duration-200 ${
				copied
					? "text-green-400 bg-green-950/40 border border-green-800/40"
					: "text-gray-500 hover:text-gray-300 bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/40 hover:border-gray-600/60"
			} ${className}`}
		>
			{copied ? (
				<>
					<svg
						className="w-3 h-3"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2.5}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M5 13l4 4L19 7"
						/>
					</svg>
					Copied
				</>
			) : (
				<>
					<svg
						className="w-3 h-3"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
					>
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
						<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
					</svg>
					Copy
				</>
			)}
		</button>
	)
}
