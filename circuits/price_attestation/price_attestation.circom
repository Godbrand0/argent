pragma circom 2.1.6;

/*
 * PriceAttestationProof
 *
 * Proves that a TWAP was computed correctly from a set of price/volume samples
 * without revealing individual prices or volumes.
 *
 * Private inputs:
 *   prices[n]   — individual trade prices, scaled 1e7
 *   volumes[n]  — individual trade volumes, scaled 1e7
 *   n           — number of samples (fixed at compile time: N = 30)
 *
 * Public inputs:
 *   twap_price  — the claimed TWAP result, scaled 1e7
 *   total_volume — sum of all volumes (for verification)
 *
 * Constraint:
 *   sum(prices[i] * volumes[i]) / total_volume == twap_price
 *   (multiplied out: sum(prices[i] * volumes[i]) == twap_price * total_volume)
 */

pragma circom 2.1.6;

template PriceAttestationProof(N) {
    // Private inputs
    signal input prices[N];
    signal input volumes[N];

    // Public inputs
    signal input twap_price;
    signal input total_volume;

    // Compute volume-weighted sum
    signal weighted[N];
    signal cumulative[N+1];
    cumulative[0] <== 0;

    for (var i = 0; i < N; i++) {
        weighted[i] <== prices[i] * volumes[i];
        cumulative[i+1] <== cumulative[i] + weighted[i];
    }

    // Constraint: weighted sum == twap_price * total_volume
    cumulative[N] === twap_price * total_volume;
}

component main {public [twap_price, total_volume]} = PriceAttestationProof(30);
