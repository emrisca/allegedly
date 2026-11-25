//! Allegedly Phase 2 Spike S06 — Deterministic Fixed-Point OMS, Local Paper Simulator,
//! SQLite WAL Crash Recovery & Wire-Compatible Alpaca Paper Adapter (Paper/Sandbox ONLY).
//!
//! Safety rails:
//! - Zero IEEE-754 floating-point (`f32`/`f64`) fields in OMS core types (`01-Charter/Constraints.md` §1.7).
//! - Live trading is disabled at compile time unless `allow-live-trading` feature is explicitly enabled,
//!   and `LIVE_ARMED` always boots `false`.
//! - Zero prop-firm DO-NOT-BUILD adapters (hard denylist enforced in `adapter::verify_adapter_allowed`).

pub mod adapter;
pub mod journal;
pub mod mock_alpaca;
pub mod oms;
pub mod risk;
pub mod state;
pub mod types;
