#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, String, Symbol,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Vault,    // only the vault contract can mint/burn
    Decimals,
    Name,
    Symbol,
    Balance(Address),
    TotalSupply,
    Allowance(Address, Address),
}


// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct VUsdcContract;

#[contractimpl]
impl VUsdcContract {
    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    pub fn initialize(env: Env, admin: Address, vault: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Vault, &vault);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
    }

    // -----------------------------------------------------------------------
    // SEP-41 token interface
    // -----------------------------------------------------------------------

    pub fn name(_env: Env) -> String {
        // SEP-41 requires returning token name
        // Note: String::from_str requires env reference; hardcoded for now
        panic!("call name() with env")
    }

    pub fn symbol(_env: Env) -> String {
        panic!("call symbol() with env")
    }

    pub fn decimals(_env: Env) -> u32 {
        7
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    pub fn balance(env: Env, account: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(account))
            .unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        assert!(amount > 0, "amount must be positive");
        Self::_transfer(&env, &from, &to, amount);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        assert!(allowance >= amount, "insufficient allowance");
        let new_allowance = allowance - amount;
        env.storage()
            .persistent()
            .set(&DataKey::Allowance(from.clone(), spender), &new_allowance);
        Self::_transfer(&env, &from, &to, amount);
    }

    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, _expiration_ledger: u32) {
        from.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Allowance(from.clone(), spender.clone()), &amount);
        env.events().publish(
            (Symbol::new(&env, "approve"),),
            (from, spender, amount),
        );
    }

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Allowance(from, spender))
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Vault-only mint / burn
    // -----------------------------------------------------------------------

    /// Mint vUSDC to `to`. Only callable by the vault contract.
    pub fn mint(env: Env, to: Address, amount: i128) {
        let vault: Address = env.storage().instance().get(&DataKey::Vault).unwrap();
        vault.require_auth();
        assert!(amount > 0, "amount must be positive");

        let bal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(bal + amount));

        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply, &(supply + amount));

        env.events().publish((Symbol::new(&env, "mint"),), (to, amount));
    }

    /// Burn vUSDC from `from`. Only callable by the vault contract.
    pub fn burn(env: Env, from: Address, amount: i128) {
        let vault: Address = env.storage().instance().get(&DataKey::Vault).unwrap();
        vault.require_auth();
        assert!(amount > 0, "amount must be positive");

        let bal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(from.clone()))
            .unwrap_or(0);
        assert!(bal >= amount, "insufficient balance");
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(bal - amount));

        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply - amount));

        env.events().publish((Symbol::new(&env, "burn"),), (from, amount));
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    fn _transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
        let from_bal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(from.clone()))
            .unwrap_or(0);
        assert!(from_bal >= amount, "insufficient balance");

        let to_bal: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(to.clone()))
            .unwrap_or(0);

        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_bal - amount));
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(to_bal + amount));

        env.events().publish(
            (Symbol::new(env, "transfer"),),
            (from.clone(), to.clone(), amount),
        );
    }
}
