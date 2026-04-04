pragma circom 2.1.6;

/*
 * AuctionPriceProof
 *
 * Proves that a bid price matches the correct Dutch auction decay formula
 * at the claimed ledger, without revealing auction internals.
 *
 * Private inputs:
 *   start_price        — auction start price, scaled 1e7
 *   floor_price        — auction floor price, scaled 1e7
 *   decay_rate         — decay rate per ledger, scaled 1e7
 *
 * Public inputs:
 *   elapsed_ledgers    — ledgers since auction start
 *   current_price      — claimed price at elapsed_ledgers
 *   scale              — 10000000 (1e7)
 *
 * Constraint:
 *   current_price == max(floor_price, start_price * (scale - decay_rate * elapsed) / scale)
 *
 * Note: max() requires a comparison component from circomlib in full impl.
 *       This version constrains the non-floored case for simplicity.
 */

pragma circom 2.1.6;

template AuctionPriceProof() {
    // Private
    signal input start_price;
    signal input floor_price;
    signal input decay_rate;

    // Public
    signal input elapsed_ledgers;
    signal input current_price;
    signal input scale;

    // Compute decayed price
    signal total_discount;
    signal decayed_price;

    total_discount <== decay_rate * elapsed_ledgers;
    decayed_price <== start_price * (scale - total_discount);

    // Constraint: current_price * scale == decayed_price (non-floored)
    // Full implementation would add floor comparison via LessThan
    current_price * scale === decayed_price;
}

component main {public [elapsed_ledgers, current_price, scale]} = AuctionPriceProof();
