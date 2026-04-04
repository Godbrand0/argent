"use client"
import { useState, useEffect, useCallback } from "react"
import { CONTRACTS } from "@/lib/config"
import { getCurrentLedger, getEvents } from "@/lib/soroban"
import { getHeartbeat, getPoolStats } from "@/lib/vault"

const HEARTBEAT_STALE_LEDGERS = 120 // ~10 min
const POLL_MS = 5000

export interface AgentEvent {
	id: string
	type: "auction_started" | "auction_settled" | "heartbeat" | "bid" | "other"
	ledger: number
	data: unknown
	timestamp: number
}

export function useAgent() {
	const [online, setOnline] = useState<boolean | null>(null)
	const [lastHeartbeatLedger, setLastHeartbeatLedger] = useState<number>(0)
	const [events, setEvents] = useState<AgentEvent[]>([])
	const [currentLedger, setCurrentLedger] = useState(0)

	const refresh = useCallback(async () => {
		if (!CONTRACTS.vault) return
		try {
			const [ledger, heartbeat] = await Promise.all([
				getCurrentLedger(),
				getHeartbeat(),
			])
			setCurrentLedger(ledger)
			setLastHeartbeatLedger(heartbeat)
			setOnline(heartbeat > 0 && ledger - heartbeat < HEARTBEAT_STALE_LEDGERS)
		} catch {}
	}, [])

	const fetchEvents = useCallback(async () => {
		if (!CONTRACTS.vault) return
		try {
			const ledger = await getCurrentLedger()
			const startLedger = Math.max(0, ledger - 1000) // last ~1.4h
			const raw = await getEvents(CONTRACTS.vault, startLedger)
			const parsed: AgentEvent[] = raw
				.slice(-50)
				.reverse()
				.map((e) => ({
					id: e.id,
					type: parseEventType(e.topic ?? []),
					ledger:
						typeof e.ledger === "number"
							? e.ledger
							: parseInt(e.ledger as unknown as string, 10),
					data: e.value,
					timestamp: Date.now(),
				}))
			setEvents(parsed)
		} catch {}
	}, [])

	useEffect(() => {
		void refresh()
		void fetchEvents()
		const t = setInterval(() => {
			void refresh()
			void fetchEvents()
		}, POLL_MS)
		return () => clearInterval(t)
	}, [refresh, fetchEvents])

	return { online, lastHeartbeatLedger, currentLedger, events }
}

function parseEventType(topics: unknown[]): AgentEvent["type"] {
	const first = String(topics?.[0] ?? "")
	if (first.includes("auction_started")) return "auction_started"
	if (first.includes("auction_settled")) return "auction_settled"
	if (first.includes("heartbeat")) return "heartbeat"
	if (first.includes("bid")) return "bid"
	return "other"
}
