"use client"
import { useState } from "react"

interface Props {
	text: string
}

export function InfoTooltip({ text }: Props) {
	const [visible, setVisible] = useState(false)

	return (
		<span className="relative inline-block ml-1 group">
			<button
				onMouseEnter={() => setVisible(true)}
				onMouseLeave={() => setVisible(false)}
				className="text-gray-500 hover:text-indigo-400 focus:outline-none transition-colors"
				aria-label="More information"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 16v-4" />
					<path d="M12 8h.01" />
				</svg>
			</button>

			{visible && (
				<span
					className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 border border-gray-700 text-gray-200 text-[10px] leading-tight rounded shadow-xl z-50 pointer-events-none"
					style={{ display: "block" }}
				>
					{text}
					<span
						className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-800"
						style={{ display: "block" }}
					/>
				</span>
			)}
		</span>
	)
}
