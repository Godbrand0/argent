"use client"
import { nativeToScVal } from "@stellar/stellar-sdk"
import { CONTRACTS } from "./config"
import { readContract, buildContractTx } from "./soroban"

export interface Position {
	auction_state: { tag: string }
	became_liquidatable_at: number
	borrow_index_at_open: bigint
	collateral_amount: bigint
	collateral_asset: string
	debt_principal: bigint
	opened_at_ledger: number
	owner: string
}

export interface Auction {
	decay_rate_per_ledger: bigint
	floor_price: bigint
	position_id: bigint
	settled: boolean
	start_price: bigint
	started_at_ledger: number
	trigger_agent: string
}

export interface PoolStats {
	totalDeposits: bigint
	totalBorrows: bigint
	reserveFund: bigint
	borrowRate: bigint
	utilization: bigint
	positionCount: bigint
	auctionCount: bigint
}

// -------------------------------------------------------------------------
// View reads
// -------------------------------------------------------------------------

export async function getPoolStats(): Promise<PoolStats> {
	const id = CONTRACTS.vault
	const [
		totalDeposits,
		totalBorrows,
		reserveFund,
		borrowRate,
		utilization,
		positionCount,
		auctionCount,
	] = await Promise.all([
		readContract<bigint>(id, "total_deposits"),
		readContract<bigint>(id, "total_borrows"),
		readContract<bigint>(id, "reserve_fund"),
		readContract<bigint>(id, "borrow_rate"),
		readContract<bigint>(id, "utilization"),
		readContract<bigint>(id, "position_count"),
		readContract<bigint>(id, "auction_count"),
	])
	return {
		totalDeposits,
		totalBorrows,
		reserveFund,
		borrowRate,
		utilization,
		positionCount,
		auctionCount,
	}
}

export async function getPosition(id: bigint): Promise<Position> {
	return readContract<Position>(CONTRACTS.vault, "get_position", [
		nativeToScVal(id, { type: "u64" }),
	])
}

export async function getAuction(id: bigint): Promise<Auction> {
	return readContract<Auction>(CONTRACTS.vault, "get_auction", [
		nativeToScVal(id, { type: "u64" }),
	])
}

export async function getHealthFactor(
	positionId: bigint,
	price: bigint,
): Promise<bigint> {
	return readContract<bigint>(CONTRACTS.vault, "health_factor", [
		nativeToScVal(positionId, { type: "u64" }),
		nativeToScVal(price, { type: "i128" }),
	])
}

export async function getCurrentAuctionPrice(
	auctionId: bigint,
): Promise<bigint> {
	return readContract<bigint>(CONTRACTS.vault, "current_auction_price", [
		nativeToScVal(auctionId, { type: "u64" }),
	])
}

export async function getHeartbeat(): Promise<number> {
	return readContract<number>(CONTRACTS.vault, "get_heartbeat")
}

/** vUSDC token balance for a wallet address (standard SEP-41 `balance` call) */
export async function getVusdcBalance(userAddress: string): Promise<bigint> {
	return readContract<bigint>(CONTRACTS.vusdc, "balance", [
		nativeToScVal(userAddress, { type: "address" }),
	])
}

export async function getAllPositions(
	count: bigint,
): Promise<[bigint, Position][]> {
	const limit = count < 50n ? count : 50n
	const results: [bigint, Position][] = []
	for (let i = 0n; i < limit; i++) {
		try {
			const pos = await getPosition(i)
			if (pos.collateral_amount > 0n || pos.debt_principal > 0n) {
				results.push([i, pos])
			}
		} catch {
			/* settled/empty */
		}
	}
	return results
}

export async function getAllActiveAuctions(
	count: bigint,
): Promise<[bigint, Auction][]> {
	const limit = count < 20n ? count : 20n
	const results: [bigint, Auction][] = []
	for (let i = 0n; i < limit; i++) {
		try {
			const a = await getAuction(i)
			if (!a.settled) results.push([i, a])
		} catch {
			/* not found */
		}
	}
	return results
}

// -------------------------------------------------------------------------
// Transaction builders (return XDR for Freighter signing)
// -------------------------------------------------------------------------

export async function buildDepositTx(
	user: string,
	amount: bigint,
): Promise<string> {
	return buildContractTx(
		CONTRACTS.vault,
		"deposit",
		[
			nativeToScVal(user, { type: "address" }),
			nativeToScVal(amount, { type: "i128" }),
		],
		user,
	)
}

export async function buildWithdrawTx(
	user: string,
	vusdcAmount: bigint,
): Promise<string> {
	return buildContractTx(
		CONTRACTS.vault,
		"withdraw",
		[
			nativeToScVal(user, { type: "address" }),
			nativeToScVal(vusdcAmount, { type: "i128" }),
		],
		user,
	)
}

export async function buildDepositCollateralTx(
	user: string,
	asset: string,
	amount: bigint,
): Promise<string> {
	return buildContractTx(
		CONTRACTS.vault,
		"deposit_collateral",
		[
			nativeToScVal(user, { type: "address" }),
			nativeToScVal(asset, { type: "symbol" }),
			nativeToScVal(amount, { type: "i128" }),
		],
		user,
	)
}

export async function buildBorrowTx(
	user: string,
	positionId: bigint,
	usdcAmount: bigint,
	price: bigint,
): Promise<string> {
	return buildContractTx(
		CONTRACTS.vault,
		"borrow",
		[
			nativeToScVal(user, { type: "address" }),
			nativeToScVal(positionId, { type: "u64" }),
			nativeToScVal(usdcAmount, { type: "i128" }),
			nativeToScVal(price, { type: "i128" }),
		],
		user,
	)
}

export async function buildRepayTx(
	user: string,
	positionId: bigint,
	amount: bigint,
): Promise<string> {
	return buildContractTx(
		CONTRACTS.vault,
		"repay",
		[
			nativeToScVal(user, { type: "address" }),
			nativeToScVal(positionId, { type: "u64" }),
			nativeToScVal(amount, { type: "i128" }),
		],
		user,
	)
}

export async function buildBidTx(
	bidder: string,
	auctionId: bigint,
	bidAmount: bigint,
): Promise<string> {
	return buildContractTx(
		CONTRACTS.vault,
		"bid",
		[
			nativeToScVal(bidder, { type: "address" }),
			nativeToScVal(auctionId, { type: "u64" }),
			nativeToScVal(bidAmount, { type: "i128" }),
			nativeToScVal(Buffer.alloc(0), { type: "bytes" }), // dev mode: empty AP proof
		],
		bidder,
	)
}
