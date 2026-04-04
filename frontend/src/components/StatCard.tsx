interface StatCardProps {
	label: string
	value: string
	sub?: string
	accent?: boolean
}

export function StatCard({ label, value, sub, accent }: StatCardProps) {
	return (
		<div
			className={`rounded-xl border p-5 ${accent ? "border-indigo-500/40 bg-indigo-950/30" : "border-gray-800 bg-gray-900"}`}
		>
			<p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
				{label}
			</p>
			<p className="text-2xl font-semibold text-white">{value}</p>
			{sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
		</div>
	)
}
