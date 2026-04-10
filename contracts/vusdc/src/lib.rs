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
// TTL constants (in ledgers, ~5s each)
// ---------------------------------------------------------------------------

/// 30 days — for balance and allowance entries
const PERSISTENT_TTL: u32 = 518_400;

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

    /// Update the vault address. Admin only — called after a vault redeploy.
    pub fn set_vault(env: Env, new_vault: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Vault, &new_vault);
    }

    // -----------------------------------------------------------------------
    // SEP-41 token interface
    // -----------------------------------------------------------------------

    pub fn name(env: Env) -> String {
        String::from_str(&env, "Vault USDC")
    }

    pub fn symbol(env: Env) -> String {
        String::from_str(&env, "vUSDC")
    }

    pub fn decimals(_env: Env) -> u32 {
        7
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    pub fn balance(env: Env, account: Address) -> i128 {
        let key = DataKey::Balance(account);
        let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if bal > 0 {
            env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);
        }
        bal
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        assert!(amount > 0, "amount must be positive");
        Self::_transfer(&env, &from, &to, amount);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowance_key = DataKey::Allowance(from.clone(), spender.clone());
        let allowance: i128 = env.storage().persistent().get(&allowance_key).unwrap_or(0);
        assert!(allowance >= amount, "insufficient allowance");
        let new_allowance = allowance - amount;
        env.storage().persistent().set(&allowance_key, &new_allowance);
        env.storage().persistent().extend_ttl(&allowance_key, PERSISTENT_TTL, PERSISTENT_TTL);
        Self::_transfer(&env, &from, &to, amount);
    }

    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, _expiration_ledger: u32) {
        from.require_auth();
        let key = DataKey::Allowance(from.clone(), spender.clone());
        env.storage().persistent().set(&key, &amount);
        env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);
        env.events().publish(
            (Symbol::new(&env, "approve"),),
            (from, spender, amount),
        );
    }

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let key = DataKey::Allowance(from, spender);
        let val: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if val > 0 {
            env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);
        }
        val
    }

    // -----------------------------------------------------------------------
    // Vault-only mint / burn
    // -----------------------------------------------------------------------

    /// Mint vUSDC to `to`. Only callable by the vault contract.
    pub fn mint(env: Env, to: Address, amount: i128) {
        let vault: Address = env.storage().instance().get(&DataKey::Vault).unwrap();
        vault.require_auth();
        assert!(amount > 0, "amount must be positive");

        let key = DataKey::Balance(to.clone());
        let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(bal + amount));
        env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);

        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply, &(supply + amount));

        env.events().publish((Symbol::new(&env, "mint"),), (to, amount));
    }

    /// Burn vUSDC from `from`. Only callable by the vault contract.
    pub fn burn(env: Env, from: Address, amount: i128) {
        let vault: Address = env.storage().instance().get(&DataKey::Vault).unwrap();
        vault.require_auth();
        assert!(amount > 0, "amount must be positive");

        let key = DataKey::Balance(from.clone());
        let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        assert!(bal >= amount, "insufficient balance");
        env.storage().persistent().set(&key, &(bal - amount));
        env.storage().persistent().extend_ttl(&key, PERSISTENT_TTL, PERSISTENT_TTL);

        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply, &(supply - amount));

        env.events().publish((Symbol::new(&env, "burn"),), (from, amount));
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    fn _transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
        let from_key = DataKey::Balance(from.clone());
        let from_bal: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        assert!(from_bal >= amount, "insufficient balance");

        let to_key = DataKey::Balance(to.clone());
        let to_bal: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);

        env.storage().persistent().set(&from_key, &(from_bal - amount));
        env.storage().persistent().extend_ttl(&from_key, PERSISTENT_TTL, PERSISTENT_TTL);

        env.storage().persistent().set(&to_key, &(to_bal + amount));
        env.storage().persistent().extend_ttl(&to_key, PERSISTENT_TTL, PERSISTENT_TTL);

        env.events().publish(
            (Symbol::new(env, "transfer"),),
            (from.clone(), to.clone(), amount),
        );
    }
}
