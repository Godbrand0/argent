pragma circom 2.1.6;

include "../../node_modules/circomlib/circuits/comparators.circom";

/*
 * HealthFactorProof
 *
 * Proves that a position is liquidatable without revealing collateral/debt values.
 *
 * Private inputs:
 *   collateral_value  — collateral in USDC, scaled 1e7
 *   debt_value        — current debt in USDC, scaled 1e7
 *
 * Public inputs:
 *   liq_threshold     — liquidation threshold, scaled 1e7 (e.g. 8000000 = 80%)
 *   scale             — 10000000 (1e7)
 *
 * Public output:
 *   is_liquidatable   — 1 if health factor < 1.0, 0 otherwise
 *
 * Constraint:
 *   is_liquidatable = (collateral_value * liq_threshold < debt_value * scale)
 */
template HealthFactorProof() {
    // Private inputs
    signal input collateral_value;
    signal input debt_value;

    // Public inputs
    signal input liq_threshold;
    signal input scale;

    // Output
    signal output is_liquidatable;

    // Compute both sides of the inequality
    signal col_side;
    signal debt_side;

    col_side <== collateral_value * liq_threshold;
    debt_side <== debt_value * scale;

    // LessThan(128): outputs 1 if col_side < debt_side
    component lt = LessThan(128);
    lt.in[0] <== col_side;
    lt.in[1] <== debt_side;

    is_liquidatable <== lt.out;

    // Constraint: must be liquidatable (proof is only generated when HF < 1)
    is_liquidatable === 1;
}

component main {public [liq_threshold, scale]} = HealthFactorProof();
