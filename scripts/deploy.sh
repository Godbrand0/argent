#!/usr/bin/env bash
# deploy.sh — build and deploy vault + vUSDC. ZK Verifier is reused from .env.
# After first deploy, subsequent vault-only redeployments call set_vault on
# the existing vUSDC instead of redeploying it.
set -euo pipefail

NETWORK="testnet"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
RPC_URL="https://soroban-testnet.stellar.org"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

# ---------------------------------------------------------------------------
# Load ZK Verifier ID from root .env (always reused)
# ---------------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found."
  exit 1
fi

ZK_ID=$(grep -E '^ZK_VERIFIER_CONTRACT_ID=' "$ENV_FILE" | cut -d= -f2 | tr -d ' ')
if [ -z "$ZK_ID" ]; then
  echo "ERROR: ZK_VERIFIER_CONTRACT_ID missing from .env"
  exit 1
fi
echo "Reusing ZK verifier: $ZK_ID"

# ---------------------------------------------------------------------------
# Build vault + vUSDC
# ---------------------------------------------------------------------------
echo ""
echo "=== Building contracts ==="
cd "$(dirname "$0")/../contracts"
cargo build -p vault -p vusdc --target wasm32-unknown-unknown --release 2>&1 | tail -5

VAULT_WASM="$(pwd)/../target/wasm32-unknown-unknown/release/vault.wasm"
VUSDC_WASM="$(pwd)/../target/wasm32-unknown-unknown/release/vusdc.wasm"

# ---------------------------------------------------------------------------
# Resolve static SAC addresses
# ---------------------------------------------------------------------------
echo ""
echo "=== Resolving SAC addresses ==="

XLM_SAC=$(stellar contract id asset \
  --asset native \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "XLM SAC:  $XLM_SAC"

USDC_SAC=$(stellar contract id asset \
  --asset "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "USDC SAC: $USDC_SAC"

ADMIN=$(stellar keys address admin)

# ---------------------------------------------------------------------------
# Deploy vault
# ---------------------------------------------------------------------------
echo ""
echo "=== Deploying vault ==="
VAULT_ID=$(stellar contract deploy \
  --wasm "$VAULT_WASM" \
  --source admin \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "VAULT_CONTRACT_ID=$VAULT_ID"

# ---------------------------------------------------------------------------
# Deploy vUSDC
# ---------------------------------------------------------------------------
echo ""
echo "=== Deploying vUSDC ==="
VUSDC_ID=$(stellar contract deploy \
  --wasm "$VUSDC_WASM" \
  --source admin \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$NETWORK_PASSPHRASE")
echo "VUSDC_CONTRACT_ID=$VUSDC_ID"

# ---------------------------------------------------------------------------
# Initialize vUSDC (points to new vault)
# ---------------------------------------------------------------------------
echo ""
echo "=== Initializing vUSDC ==="
stellar contract invoke --id "$VUSDC_ID" --source admin \
  --network "$NETWORK" --rpc-url "$RPC_URL" --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize --admin "$ADMIN" --vault "$VAULT_ID"

# ---------------------------------------------------------------------------
# Initialize vault
# ---------------------------------------------------------------------------
echo ""
echo "=== Initializing vault ==="
stellar contract invoke --id "$VAULT_ID" --source admin \
  --network "$NETWORK" --rpc-url "$RPC_URL" --network-passphrase "$NETWORK_PASSPHRASE" \
  -- initialize \
    --admin "$ADMIN" \
    --usdc "$USDC_SAC" \
    --vusdc "$VUSDC_ID" \
    --hf_verifier "$ZK_ID"

# ---------------------------------------------------------------------------
# Set collateral config: XLM
#   65% max LTV, 80% liq threshold
#   4167/ledger decay → 15% over 360-ledger (30 min) window, hits 2% at ~4 min
#   85% floor, 360 ledger max auction
# ---------------------------------------------------------------------------
echo ""
echo "=== Setting collateral config (XLM) ==="
stellar contract invoke --id "$VAULT_ID" --source admin \
  --network "$NETWORK" --rpc-url "$RPC_URL" --network-passphrase "$NETWORK_PASSPHRASE" \
  -- set_collateral_config \
    --asset XLM \
    --token_address "$XLM_SAC" \
    --max_ltv 6500000 \
    --liq_threshold 8000000 \
    --decay_rate_per_ledger 4167 \
    --floor_ratio 8500000 \
    --max_auction_ledgers 360

# ---------------------------------------------------------------------------
# Patch root .env and write frontend/.env.local
# ---------------------------------------------------------------------------
echo ""
echo "=== Updating .env files ==="
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

sed -i "s|^VAULT_CONTRACT_ID=.*|VAULT_CONTRACT_ID=$VAULT_ID|" "$ENV_FILE"
sed -i "s|^VUSDC_CONTRACT_ID=.*|VUSDC_CONTRACT_ID=$VUSDC_ID|" "$ENV_FILE"
sed -i "s|^NEXT_PUBLIC_VAULT_CONTRACT_ID=.*|NEXT_PUBLIC_VAULT_CONTRACT_ID=$VAULT_ID|" "$ENV_FILE"
sed -i "s|^NEXT_PUBLIC_VUSDC_CONTRACT_ID=.*|NEXT_PUBLIC_VUSDC_CONTRACT_ID=$VUSDC_ID|" "$ENV_FILE"
echo "Patched $ENV_FILE"

# Next.js only reads env files from its own directory, not the repo root
cat > "$REPO_ROOT/frontend/.env.local" <<EOF
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

NEXT_PUBLIC_XLM_SAC_CONTRACT_ID=$XLM_SAC
NEXT_PUBLIC_USDC_CONTRACT_ID=$USDC_SAC
NEXT_PUBLIC_VAULT_CONTRACT_ID=$VAULT_ID
NEXT_PUBLIC_VUSDC_CONTRACT_ID=$VUSDC_ID
NEXT_PUBLIC_ZK_VERIFIER_CONTRACT_ID=$ZK_ID
EOF
echo "Wrote $REPO_ROOT/frontend/.env.local"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Done ==="
echo ""
echo "VAULT_CONTRACT_ID=$VAULT_ID"
echo "VUSDC_CONTRACT_ID=$VUSDC_ID"
echo "ZK_VERIFIER_CONTRACT_ID=$ZK_ID (unchanged)"
