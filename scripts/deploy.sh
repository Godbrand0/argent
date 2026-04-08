#!/usr/bin/env bash
# deploy.sh — build and deploy all contracts to Stellar testnet
set -euo pipefail

NETWORK="testnet"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
RPC_URL="https://soroban-testnet.stellar.org"

echo "=== Building contracts ==="
cargo build --target wasm32-unknown-unknown --release

VAULT_WASM="target/wasm32-unknown-unknown/release/vault.wasm"
VUSDC_WASM="target/wasm32-unknown-unknown/release/vusdc.wasm"
ZK_WASM="target/wasm32-unknown-unknown/release/zk_verifier.wasm"

echo "=== Resolving asset contract addresses ==="

# Native XLM Stellar Asset Contract (SAC)
XLM_SAC=$(stellar contract id asset \
  --asset native \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "XLM_SAC_CONTRACT_ID=$XLM_SAC"

# USDC SAC — Circle testnet USDC issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
USDC_SAC=$(stellar contract id asset \
  --asset "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "USDC_CONTRACT_ID=$USDC_SAC"

echo "=== Deploying ZK Verifier ==="
ZK_ID=$(stellar contract deploy \
  --wasm "$ZK_WASM" \
  --source admin \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "ZK_VERIFIER_CONTRACT_ID=$ZK_ID"

echo "=== Deploying vUSDC ==="
VUSDC_ID=$(stellar contract deploy \
  --wasm "$VUSDC_WASM" \
  --source admin \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "VUSDC_CONTRACT_ID=$VUSDC_ID"

echo "=== Deploying Vault ==="
VAULT_ID=$(stellar contract deploy \
  --wasm "$VAULT_WASM" \
  --source admin \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "VAULT_CONTRACT_ID=$VAULT_ID"

echo ""
echo "=== Initializing contracts ==="
ADMIN=$(stellar keys address admin)

stellar contract invoke --id "$ZK_ID" --source admin \
  --network "$NETWORK" --rpc-url "$RPC_URL" --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize --admin "$ADMIN"

stellar contract invoke --id "$VUSDC_ID" --source admin \
  --network "$NETWORK" --rpc-url "$RPC_URL" --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize --admin "$ADMIN" --vault "$VAULT_ID"

stellar contract invoke --id "$VAULT_ID" --source admin \
  --network "$NETWORK" --rpc-url "$RPC_URL" --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize \
    --admin "$ADMIN" \
    --usdc "$USDC_SAC" \
    --vusdc "$VUSDC_ID" \
    --hf_verifier "$ZK_ID"

echo ""
echo "=== Setting collateral configs ==="

# XLM: 65% max LTV, 80% liq threshold, 30-min auction (~360 ledgers at 5s),
#       ~0.0083%/ledger decay, 85% floor
stellar contract invoke --id "$VAULT_ID" --source admin \
  --network "$NETWORK" --rpc-url "$RPC_URL" --network-passphrase "$NETWORK_PASSPHRASE" \
  -- set_collateral_config \
    --asset XLM \
    --token_address "$XLM_SAC" \
    --max_ltv 6500000 \
    --liq_threshold 8000000 \
    --decay_rate_per_ledger 83 \
    --floor_ratio 8500000 \
    --max_auction_ledgers 360

echo ""
echo "=== Deployment complete ==="
echo ""
echo "Copy these into your .env files:"
echo ""
echo "# Agent (.env in /agent)"
echo "VAULT_CONTRACT_ID=$VAULT_ID"
echo "VUSDC_CONTRACT_ID=$VUSDC_ID"
echo "USDC_CONTRACT_ID=$USDC_SAC"
echo "XLM_SAC_CONTRACT_ID=$XLM_SAC"
echo ""
echo "# Frontend (.env.local in /frontend)"
echo "NEXT_PUBLIC_VAULT_CONTRACT_ID=$VAULT_ID"
echo "NEXT_PUBLIC_VUSDC_CONTRACT_ID=$VUSDC_ID"
echo "NEXT_PUBLIC_USDC_CONTRACT_ID=$USDC_SAC"
echo "NEXT_PUBLIC_XLM_SAC_CONTRACT_ID=$XLM_SAC"
