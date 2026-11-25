//! Tick-Side Inference classifiers (Lee-Ready 1991 & Tick Rule) with
//! 100% integer comparisons (zero `f64`) and explicit Provenance tagging.

use crate::model::{AggressorSide, AggressorSource, NormalizedTick};

/// Pure Tick Rule classifier:
/// - Uptick (`P_t > P_{t-1}`) -> Buy
/// - Downtick (`P_t < P_{t-1}`) -> Sell
/// - Zero-tick (`P_t == P_{t-1}`) -> last non-zero direction (zero-uptick / zero-downtick)
#[derive(Debug, Default, Clone)]
pub struct TickRuleClassifier {
    last_price_e9: Option<i64>,
    last_dir: AggressorSide,
}

impl TickRuleClassifier {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn classify(&mut self, price_e9: i64) -> (AggressorSide, AggressorSource) {
        let side = match self.last_price_e9 {
            None => AggressorSide::Unknown,
            Some(prev) if price_e9 > prev => {
                self.last_dir = AggressorSide::Buy;
                AggressorSide::Buy
            }
            Some(prev) if price_e9 < prev => {
                self.last_dir = AggressorSide::Sell;
                AggressorSide::Sell
            }
            Some(_) => self.last_dir,
        };
        self.last_price_e9 = Some(price_e9);
        (side, AggressorSource::InferredTickRule)
    }
}

/// Lee & Ready (1991) classifier:
/// - Compares `price_e9` against prevailing midpoint `(best_bid + best_ask) / 2`
///   using exact integer math `2 * price` vs `best_bid + best_ask` (`i128` safe).
/// - Falls back to Tick Rule on exact midpoint trades or missing/crossed quotes.
#[derive(Debug, Default, Clone)]
pub struct LeeReadyClassifier {
    tick_rule: TickRuleClassifier,
}

impl LeeReadyClassifier {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn classify(
        &mut self,
        price_e9: i64,
        best_bid_e9: i64,
        best_ask_e9: i64,
    ) -> (AggressorSide, AggressorSource) {
        // Always update tick-rule history so midpoint fallbacks have full trade sequence
        let (tr_side, _) = self.tick_rule.classify(price_e9);

        if best_bid_e9 > 0 && best_ask_e9 > 0 && best_bid_e9 < best_ask_e9 {
            let two_p = (price_e9 as i128) * 2;
            let bid_plus_ask = (best_bid_e9 as i128) + (best_ask_e9 as i128);
            if two_p > bid_plus_ask {
                return (AggressorSide::Buy, AggressorSource::InferredLeeReady);
            } else if two_p < bid_plus_ask {
                return (AggressorSide::Sell, AggressorSource::InferredLeeReady);
            }
        }
        (tr_side, AggressorSource::InferredLeeReady)
    }
}

#[derive(Debug, Clone, Default)]
pub struct InferenceEvalReport {
    pub total_evaluated: u64,
    pub lee_ready_correct: u64,
    pub lee_ready_classified: u64,
    pub tick_rule_correct: u64,
    pub tick_rule_classified: u64,
    pub provenance_tags_verified: bool,
}

impl InferenceEvalReport {
    pub fn lee_ready_accuracy_pct(&self) -> f64 {
        if self.lee_ready_classified == 0 {
            0.0
        } else {
            (self.lee_ready_correct as f64 / self.lee_ready_classified as f64) * 100.0
        }
    }

    pub fn tick_rule_accuracy_pct(&self) -> f64 {
        if self.tick_rule_classified == 0 {
            0.0
        } else {
            (self.tick_rule_correct as f64 / self.tick_rule_classified as f64) * 100.0
        }
    }
}

/// Evaluates Lee-Ready and Tick Rule per-symbol against ground-truth exchange-signed ticks.
pub fn evaluate_inference_against_ground_truth(ticks: &[NormalizedTick]) -> InferenceEvalReport {
    use std::collections::HashMap;

    let mut lr_map: HashMap<u16, LeeReadyClassifier> = HashMap::new();
    let mut tr_map: HashMap<u16, TickRuleClassifier> = HashMap::new();
    let mut report = InferenceEvalReport {
        provenance_tags_verified: true,
        ..Default::default()
    };

    for t in ticks {
        if t.aggressor_side == AggressorSide::Unknown {
            continue;
        }
        // Only evaluate ticks that have valid non-crossed BBO quotes
        if t.best_bid_e9 <= 0 || t.best_ask_e9 <= 0 || t.best_bid_e9 >= t.best_ask_e9 {
            continue;
        }
        report.total_evaluated += 1;

        let (lr_side, lr_src) = lr_map
            .entry(t.symbol_id)
            .or_default()
            .classify(t.price_e9, t.best_bid_e9, t.best_ask_e9);
        if lr_src != AggressorSource::InferredLeeReady {
            report.provenance_tags_verified = false;
        }
        if lr_side != AggressorSide::Unknown {
            report.lee_ready_classified += 1;
            if lr_side == t.aggressor_side {
                report.lee_ready_correct += 1;
            }
        }

        let (tr_side, tr_src) = tr_map
            .entry(t.symbol_id)
            .or_default()
            .classify(t.price_e9);
        if tr_src != AggressorSource::InferredTickRule {
            report.provenance_tags_verified = false;
        }
        if tr_side != AggressorSide::Unknown {
            report.tick_rule_classified += 1;
            if tr_side == t.aggressor_side {
                report.tick_rule_correct += 1;
            }
        }
    }

    report
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lee_ready_and_tick_rule_integer_exactness() {
        let mut lr = LeeReadyClassifier::new();
        // Bid=100, Ask=102 -> midpoint=101
        assert_eq!(
            lr.classify(102, 100, 102),
            (AggressorSide::Buy, AggressorSource::InferredLeeReady)
        );
        assert_eq!(
            lr.classify(100, 100, 102),
            (AggressorSide::Sell, AggressorSource::InferredLeeReady)
        );
        // Midpoint trade at 101 -> uptick from 100 -> Buy via tick rule fallback
        assert_eq!(
            lr.classify(101, 100, 102),
            (AggressorSide::Buy, AggressorSource::InferredLeeReady)
        );
    }
}
