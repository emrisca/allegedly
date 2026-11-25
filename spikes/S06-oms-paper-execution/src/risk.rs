use crate::types::{
    BboQuote, Bps, ExecutionEnv, InstrumentSpec, MoneyMicros, OrderIntent, OrderType,
    Qty, Side,
};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use thiserror::Error;
use url::Url;

/// Credentials bound strictly to an `ExecutionEnv`.
/// Secrets are redacted in `Debug` & `Display` and intentionally do NOT implement `Serialize`
/// so credentials can never be written to SQLite journals, workspace TOML, or logs (`S06-T6`).
#[derive(Clone, PartialEq, Eq)]
pub struct ApiCredentials {
    pub env: ExecutionEnv,
    key_id: String,
    secret_key: String,
}

impl ApiCredentials {
    pub fn paper_mock(key_id: impl Into<String>, secret_key: impl Into<String>) -> Self {
        Self {
            env: ExecutionEnv::BrokerSandbox,
            key_id: key_id.into(),
            secret_key: secret_key.into(),
        }
    }

    pub fn new(
        env: ExecutionEnv,
        key_id: impl Into<String>,
        secret_key: impl Into<String>,
    ) -> Self {
        Self {
            env,
            key_id: key_id.into(),
            secret_key: secret_key.into(),
        }
    }

    pub fn key_id(&self) -> &str {
        &self.key_id
    }

    pub fn secret_key(&self) -> &str {
        &self.secret_key
    }

    /// Validates that a destination URL's host is strictly allowed for this credential's environment.
    /// Enforces `S06-T6` (sandbox credentials can NEVER build a request targeting a live host).
    pub fn validate_target_url(&self, raw_url: &str) -> Result<Url, RiskError> {
        let parsed = Url::parse(raw_url)
            .map_err(|e| RiskError::DisallowedHost(format!("invalid url {raw_url}: {e}")))?;
        let host = parsed
            .host_str()
            .ok_or_else(|| RiskError::DisallowedHost(format!("missing host in {raw_url}")))?
            .to_ascii_lowercase();

        match self.env {
            ExecutionEnv::LocalPaper => {
                if host == "127.0.0.1" || host == "localhost" || host == "::1" {
                    Ok(parsed)
                } else {
                    Err(RiskError::CrossEnvHostViolation {
                        cred_env: self.env,
                        host,
                    })
                }
            }
            ExecutionEnv::BrokerSandbox => {
                // Disjoint allowlist: paper/sandbox/local-mock hosts ONLY.
                // Live hosts like `api.alpaca.markets` or `api.tastyworks.com` are rejected.
                let allowed = host == "paper-api.alpaca.markets"
                    || host == "api.cert.tastyworks.com"
                    || host == "127.0.0.1"
                    || host == "localhost"
                    || host == "::1";
                if allowed {
                    Ok(parsed)
                } else {
                    Err(RiskError::CrossEnvHostViolation {
                        cred_env: self.env,
                        host,
                    })
                }
            }
            ExecutionEnv::BrokerLive => {
                // Live trading is disabled at compile time unless `allow-live-trading` feature is set.
                #[cfg(not(feature = "allow-live-trading"))]
                {
                    let _ = host;
                    Err(RiskError::LiveTradingCompileDisabled)
                }
                #[cfg(feature = "allow-live-trading")]
                {
                    if host == "api.alpaca.markets" || host == "api.tastyworks.com" {
                        Ok(parsed)
                    } else {
                        Err(RiskError::CrossEnvHostViolation {
                            cred_env: self.env,
                            host,
                        })
                    }
                }
            }
        }
    }
}

impl fmt::Debug for ApiCredentials {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ApiCredentials")
            .field("env", &self.env)
            .field("key_id", &"[REDACTED]")
            .field("secret_key", &"[REDACTED]")
            .finish()
    }
}

impl fmt::Display for ApiCredentials {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ApiCredentials(env={:?}, key=[REDACTED])", self.env)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RiskConfig {
    /// Enforces paper/sandbox only at runtime.
    pub paper_only_mode: bool,
    pub max_order_qty: Qty,
    pub max_position_qty: Qty,
    /// Maximum allowed daily drawdown (positive magnitude, e.g., $2,000 = 2_000_000_000 micros).
    pub max_daily_loss_micros: MoneyMicros,
    /// Maximum price deviation from BBO in integer basis points (e.g., 500 bps = 5.00%).
    pub fat_finger_collar_bps: Bps,
    /// Duplicate-order throttle window in milliseconds for identical (symbol, side, qty, order_type).
    pub duplicate_window_ms: i64,
    /// Maximum order submissions permitted in any 1-second sliding window.
    pub max_orders_per_sec: usize,
    /// If true, rejects orders that create opposing positions in the same `product_group` (CME Rule 534).
    pub anti_hedging_enabled: bool,
}

impl Default for RiskConfig {
    fn default() -> Self {
        Self {
            paper_only_mode: true,
            max_order_qty: Qty(100),
            max_position_qty: Qty(200),
            max_daily_loss_micros: MoneyMicros::from_dollars(2_500),
            fat_finger_collar_bps: Bps(500), // 5.00%
            duplicate_window_ms: 250,
            max_orders_per_sec: 100,
            anti_hedging_enabled: true,
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum RiskError {
    #[error("live trading is disabled at compile time (PaperOnly build)")]
    LiveTradingCompileDisabled,
    #[error("live trading rejected: paper_only_mode is active or LIVE_ARMED is false")]
    LiveNotArmed,
    #[error("cross-environment host violation: credentials for {cred_env:?} cannot connect to host '{host}'")]
    CrossEnvHostViolation {
        cred_env: ExecutionEnv,
        host: String,
    },
    #[error("disallowed host: {0}")]
    DisallowedHost(String),
    #[error("order quantity {qty} must be > 0 and <= max_order_qty {max_qty}")]
    MaxOrderSizeExceeded { qty: i64, max_qty: i64 },
    #[error("projected position {projected} exceeds max_position_qty {max_pos} for {symbol}")]
    MaxPositionSizeExceeded {
        symbol: String,
        projected: i64,
        max_pos: i64,
    },
    #[error("daily loss limit breached: total_pnl={total_pnl_micros} < -limit={limit_micros}")]
    DailyLossLimitBreached {
        total_pnl_micros: i128,
        limit_micros: i128,
    },
    #[error("fat-finger price collar breached for {symbol}: order={order_ticks} vs ref={ref_ticks} (max {collar_bps} bps)")]
    FatFingerCollarBreached {
        symbol: String,
        order_ticks: i64,
        ref_ticks: i64,
        collar_bps: i64,
    },
    #[error("duplicate order throttled within {window_ms}ms window for {symbol}")]
    DuplicateOrderThrottled { symbol: String, window_ms: i64 },
    #[error("order rate limit exceeded: {count} orders in 1s (max {max})")]
    RateLimitExceeded { count: usize, max: usize },
    #[error("anti-hedging violation (CME Rule 534): opposing exposure in product_group '{product_group}'")]
    AntiHedgingViolation { product_group: String },
    #[error("OMS is halted (kill-switch active)")]
    OmsHalted,
    #[error("OMS is reconciling; new order entry blocked until reconciliation completes")]
    OmsReconciling,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RecentFingerprint {
    ts_ms: i64,
    symbol: String,
    side: Side,
    qty: Qty,
    order_type: OrderType,
}

/// Deterministic pre-trade risk gate (100% fixed-point integer checks, zero floats).
pub struct RiskGate {
    config: RiskConfig,
    /// Per-session `LIVE_ARMED` switch — ALWAYS resets to `false` on every boot (`R04` §3.4 & `S06-T6`).
    live_armed: AtomicBool,
    recent_timestamps_ms: VecDeque<i64>,
    recent_fingerprints: VecDeque<RecentFingerprint>,
}

impl RiskGate {
    pub fn new(config: RiskConfig) -> Self {
        Self {
            config,
            live_armed: AtomicBool::new(false),
            recent_timestamps_ms: VecDeque::new(),
            recent_fingerprints: VecDeque::new(),
        }
    }

    pub fn config(&self) -> &RiskConfig {
        &self.config
    }

    pub fn is_live_armed(&self) -> bool {
        self.live_armed.load(Ordering::SeqCst)
    }

    /// Attempting to arm live trading fails in default PaperOnly builds.
    pub fn arm_live(&self) -> Result<(), RiskError> {
        #[cfg(not(feature = "allow-live-trading"))]
        {
            Err(RiskError::LiveTradingCompileDisabled)
        }
        #[cfg(feature = "allow-live-trading")]
        {
            if self.config.paper_only_mode {
                return Err(RiskError::LiveNotArmed);
            }
            self.live_armed.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    pub fn disarm_live(&self) {
        self.live_armed.store(false, Ordering::SeqCst);
    }

    /// Evaluate all pre-trade risk guards strictly in fixed-point integer math.
    #[allow(clippy::too_many_arguments)]
    pub fn check_pre_trade(
        &mut self,
        intent: &OrderIntent,
        spec: &InstrumentSpec,
        current_net_pos: Qty,
        working_same_side_qty: Qty,
        correlated_group_net_qty: Qty,
        daily_realized_plus_unrealized: MoneyMicros,
        bbo: Option<BboQuote>,
        now_ms: i64,
        is_protective_exit: bool,
    ) -> Result<(), RiskError> {
        // 1. Hard PaperOnly & LIVE_ARMED guard
        if intent.env == ExecutionEnv::BrokerLive {
            #[cfg(not(feature = "allow-live-trading"))]
            {
                return Err(RiskError::LiveTradingCompileDisabled);
            }
            #[cfg(feature = "allow-live-trading")]
            {
                if self.config.paper_only_mode || !self.is_live_armed() {
                    return Err(RiskError::LiveNotArmed);
                }
            }
        }

        // 2. Max order size
        if intent.qty.0 <= 0 || intent.qty.0 > self.config.max_order_qty.0 {
            return Err(RiskError::MaxOrderSizeExceeded {
                qty: intent.qty.0,
                max_qty: self.config.max_order_qty.0,
            });
        }

        // 3. Max daily realized + unrealized loss (allow pure risk-reducing protective exits)
        if !is_protective_exit
            && daily_realized_plus_unrealized.0 <= -self.config.max_daily_loss_micros.0
        {
            return Err(RiskError::DailyLossLimitBreached {
                total_pnl_micros: daily_realized_plus_unrealized.0,
                limit_micros: self.config.max_daily_loss_micros.0,
            });
        }

        // 4. Max net position size (current + working same-side + new intent)
        if !is_protective_exit {
            let signed_delta = intent.side.sign() * (working_same_side_qty.0 + intent.qty.0);
            let projected = current_net_pos.0 + signed_delta;
            if projected.abs() > self.config.max_position_qty.0 {
                return Err(RiskError::MaxPositionSizeExceeded {
                    symbol: intent.symbol.clone(),
                    projected,
                    max_pos: self.config.max_position_qty.0,
                });
            }
        }

        // 5. Anti-hedging / correlated product-group guard (CME Rule 534)
        if self.config.anti_hedging_enabled && !is_protective_exit {
            let intent_sign = intent.side.sign();
            // Opposing exposure across different symbols in the same product group (e.g. long ES, selling MES)
            // Only flag when current_net_pos on THIS symbol is 0 (so closing this symbol's own position is allowed)
            // while another symbol in the same product_group holds the opposite direction.
            if current_net_pos.0 == 0
                && correlated_group_net_qty.0 != 0
                && correlated_group_net_qty.0.signum() != intent_sign
            {
                return Err(RiskError::AntiHedgingViolation {
                    product_group: spec.product_group.clone(),
                });
            }
        }

        // 6. Fat-finger price collar in exact integer basis points (zero float)
        if let Some(quote) = bbo {
            let check_price = match intent.order_type {
                OrderType::Limit { limit_price } => Some(limit_price),
                OrderType::Stop { stop_price } => Some(stop_price),
                OrderType::StopLimit { limit_price, .. } => Some(limit_price),
                OrderType::Market | OrderType::TrailingStop { .. } => None,
            };
            if let Some(order_ticks) = check_price {
                let ref_ticks = match intent.side {
                    Side::Buy => quote.ask,
                    Side::Sell => quote.bid,
                };
                if ref_ticks.0 > 0 {
                    let diff = (order_ticks.0 as i128 - ref_ticks.0 as i128).abs();
                    // Check: diff / ref_ticks <= collar_bps / 10_000
                    // Exact integer cross-multiplication: diff * 10_000 <= ref_ticks * collar_bps
                    let lhs = diff * 10_000_i128;
                    let rhs = (ref_ticks.0 as i128) * (self.config.fat_finger_collar_bps.0 as i128);
                    if lhs > rhs {
                        return Err(RiskError::FatFingerCollarBreached {
                            symbol: intent.symbol.clone(),
                            order_ticks: order_ticks.0,
                            ref_ticks: ref_ticks.0,
                            collar_bps: self.config.fat_finger_collar_bps.0,
                        });
                    }
                }
            }
        }

        // 7. Duplicate-order throttle & rate limiter (skipped for auto-managed protective legs)
        if !is_protective_exit {
            while let Some(&front) = self.recent_timestamps_ms.front() {
                if now_ms - front >= 1_000 {
                    self.recent_timestamps_ms.pop_front();
                } else {
                    break;
                }
            }
            if self.recent_timestamps_ms.len() >= self.config.max_orders_per_sec {
                return Err(RiskError::RateLimitExceeded {
                    count: self.recent_timestamps_ms.len(),
                    max: self.config.max_orders_per_sec,
                });
            }

            if self.config.duplicate_window_ms > 0 {
                while let Some(front) = self.recent_fingerprints.front() {
                    if now_ms - front.ts_ms > self.config.duplicate_window_ms {
                        self.recent_fingerprints.pop_front();
                    } else {
                        break;
                    }
                }
                let is_dup = self.recent_fingerprints.iter().any(|fp| {
                    fp.symbol == intent.symbol
                        && fp.side == intent.side
                        && fp.qty == intent.qty
                        && fp.order_type == intent.order_type
                });
                if is_dup {
                    return Err(RiskError::DuplicateOrderThrottled {
                        symbol: intent.symbol.clone(),
                        window_ms: self.config.duplicate_window_ms,
                    });
                }
                self.recent_fingerprints.push_back(RecentFingerprint {
                    ts_ms: now_ms,
                    symbol: intent.symbol.clone(),
                    side: intent.side,
                    qty: intent.qty,
                    order_type: intent.order_type,
                });
            }

            self.recent_timestamps_ms.push_back(now_ms);
        }

        Ok(())
    }

    pub fn clear_throttle_history(&mut self) {
        self.recent_timestamps_ms.clear();
        self.recent_fingerprints.clear();
    }
}
