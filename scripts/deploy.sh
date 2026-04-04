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
USDC_ID="${USDC_CONTRACT_ID:?Set USDC_CONTRACT_ID env var}"

stellar contract invoke --id "$ZK_ID" --source admin --network "$NETWORK" \
  -- initialize --admin "$ADMIN"

stellar contract invoke --id "$VUSDC_ID" --source admin --network "$NETWORK" \
  -- initialize --admin "$ADMIN" --vault "$VAULT_ID"

stellar contract invoke --id "$VAULT_ID" --source admin --network "$NETWORK" \
  -- initialize \
    --admin "$ADMIN" \
    --usdc "$USDC_ID" \
    --vusdc "$VUSDC_ID" \
    --hf_verifier "$ZK_ID"

echo ""
echo "=== Setting default collateral configs ==="

# XLM: 65% max LTV, 80% liq threshold, 30min auction, 85% floor
stellar contract invoke --id "$VAULT_ID" --source admin --network "$NETWORK" \
  -- set_collateral_config \
    --asset XLM \
    --max_ltv 6500000 \
    --liq_threshold 8000000 \
    --decay_rate_per_ledger 83 \
    --floor_ratio 8500000 \
    --max_auction_ledgers 360

echo ""
echo "=== Deployment complete ==="
echo "VAULT_CONTRACT_ID=$VAULT_ID"
echo "VUSDC_CONTRACT_ID=$VUSDC_ID"
echo "ZK_VERIFIER_CONTRACT_ID=$ZK_ID"
echo ""
echo "Add these to your .env file."
