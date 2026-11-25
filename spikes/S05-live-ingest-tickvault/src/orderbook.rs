//! L2 Order Book maintenance with Kraken WS v2 CRC32 verification and
//! explicit `BookState` (`Initializing` / `Live` / `Stale`) tracking.

use std::collections::BTreeMap;

use crate::model::{BookLevel, BookState, StaleReason};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawLevelEntry {
    pub qty_e9: i64,
    /// Exact wire token (e.g. `"59314.3"`), preserved for Kraken CRC32 verification.
    pub raw_price: String,
    /// Exact wire token (e.g. `"0.00010000"`), preserved for Kraken CRC32 verification.
    pub raw_qty: String,
}

#[derive(Debug, Clone)]
pub struct L2OrderBook {
    pub symbol: String,
    pub state: BookState,
    pub max_depth: Option<usize>,
    pub bids: BTreeMap<i64, RawLevelEntry>,
    pub asks: BTreeMap<i64, RawLevelEntry>,
    pub updates_applied: u64,
    pub snapshots_applied: u64,
    pub crc_checks_passed: u64,
    pub crc_checks_failed: u64,
}

impl L2OrderBook {
    pub fn new(symbol: impl Into<String>, max_depth: Option<usize>) -> Self {
        Self {
            symbol: symbol.into(),
            state: BookState::Initializing,
            max_depth,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            updates_applied: 0,
            snapshots_applied: 0,
            crc_checks_passed: 0,
            crc_checks_failed: 0,
        }
    }

    pub fn invalidate(&mut self, reason: StaleReason) {
        self.state = BookState::Stale(reason);
        self.bids.clear();
        self.asks.clear();
    }

    pub fn is_live(&self) -> bool {
        self.state == BookState::Live
    }

    pub fn apply_snapshot(
        &mut self,
        bids: impl IntoIterator<Item = (i64, i64, String, String)>,
        asks: impl IntoIterator<Item = (i64, i64, String, String)>,
    ) {
        self.bids.clear();
        self.asks.clear();
        for (p, q, rp, rq) in bids {
            if q > 0 {
                self.bids.insert(
                    p,
                    RawLevelEntry {
                        qty_e9: q,
                        raw_price: rp,
                        raw_qty: rq,
                    },
                );
            }
        }
        for (p, q, rp, rq) in asks {
            if q > 0 {
                self.asks.insert(
                    p,
                    RawLevelEntry {
                        qty_e9: q,
                        raw_price: rp,
                        raw_qty: rq,
                    },
                );
            }
        }
        self.trim_depth();
        self.snapshots_applied += 1;
        self.state = BookState::Live;
    }

    pub fn apply_bid_delta(&mut self, price_e9: i64, qty_e9: i64, raw_price: String, raw_qty: String) {
        if qty_e9 <= 0 {
            self.bids.remove(&price_e9);
        } else {
            self.bids.insert(
                price_e9,
                RawLevelEntry {
                    qty_e9,
                    raw_price,
                    raw_qty,
                },
            );
        }
    }

    pub fn apply_ask_delta(&mut self, price_e9: i64, qty_e9: i64, raw_price: String, raw_qty: String) {
        if qty_e9 <= 0 {
            self.asks.remove(&price_e9);
        } else {
            self.asks.insert(
                price_e9,
                RawLevelEntry {
                    qty_e9,
                    raw_price,
                    raw_qty,
                },
            );
        }
    }

    pub fn finish_delta(&mut self) {
        self.trim_depth();
        self.updates_applied += 1;
    }

    fn trim_depth(&mut self) {
        if let Some(depth) = self.max_depth {
            while self.bids.len() > depth {
                // Remove lowest bid (furthest from touch)
                if let Some(&lowest) = self.bids.keys().next() {
                    self.bids.remove(&lowest);
                } else {
                    break;
                }
            }
            while self.asks.len() > depth {
                // Remove highest ask (furthest from touch)
                if let Some(&highest) = self.asks.keys().next_back() {
                    self.asks.remove(&highest);
                } else {
                    break;
                }
            }
        }
    }

    pub fn best_bid(&self) -> Option<BookLevel> {
        self.bids.iter().next_back().map(|(&p, v)| BookLevel {
            price_e9: p,
            qty_e9: v.qty_e9,
        })
    }

    pub fn best_ask(&self) -> Option<BookLevel> {
        self.asks.iter().next().map(|(&p, v)| BookLevel {
            price_e9: p,
            qty_e9: v.qty_e9,
        })
    }

    pub fn bbo_prices(&self) -> (i64, i64) {
        if !self.is_live() {
            return (0, 0);
        }
        (
            self.best_bid().map(|l| l.price_e9).unwrap_or(0),
            self.best_ask().map(|l| l.price_e9).unwrap_or(0),
        )
    }

    pub fn is_crossed(&self) -> bool {
        match (self.best_bid(), self.best_ask()) {
            (Some(b), Some(a)) => b.price_e9 >= a.price_e9,
            _ => false,
        }
    }

    /// Computes Kraken Spot WS v2 L2 CRC32 checksum:
    /// Top 10 asks (ascending by price) followed by top 10 bids (descending by price).
    /// Each price and qty has `.` removed and leading `'0'`s stripped.
    pub fn kraken_crc32(&self) -> u32 {
        let mut payload = String::with_capacity(512);

        for entry in self.asks.values().take(10) {
            push_kraken_token(&mut payload, &entry.raw_price);
            push_kraken_token(&mut payload, &entry.raw_qty);
        }
        for entry in self.bids.values().rev().take(10) {
            push_kraken_token(&mut payload, &entry.raw_price);
            push_kraken_token(&mut payload, &entry.raw_qty);
        }

        crc32fast::hash(payload.as_bytes())
    }

    pub fn verify_kraken_checksum(&mut self, expected: u32) -> bool {
        let computed = self.kraken_crc32();
        if computed == expected {
            self.crc_checks_passed += 1;
            true
        } else {
            self.crc_checks_failed += 1;
            self.invalidate(StaleReason::ChecksumMismatch { expected, computed });
            false
        }
    }
}

fn push_kraken_token(out: &mut String, raw: &str) {
    let mut started = false;
    for ch in raw.trim().chars() {
        if ch == '.' || ch == '"' {
            continue;
        }
        if !started && ch == '0' {
            continue;
        }
        started = true;
        out.push(ch);
    }
    if !started {
        out.push('0');
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixed_point::parse_decimal_e9;

    #[test]
    fn kraken_crc32_official_algorithm_check() {
        // Test token normalization: "45285.2" -> "452852", "0.00100000" -> "100000"
        let mut s = String::new();
        push_kraken_token(&mut s, "45285.2");
        push_kraken_token(&mut s, "0.00100000");
        assert_eq!(s, "452852100000");

        let mut book = L2OrderBook::new("BTC/USD", Some(25));
        book.apply_snapshot(
            vec![(
                parse_decimal_e9("59314.3").unwrap(),
                parse_decimal_e9("0.25288651").unwrap(),
                "59314.3".into(),
                "0.25288651".into(),
            )],
            vec![(
                parse_decimal_e9("59314.4").unwrap(),
                parse_decimal_e9("1.50000000").unwrap(),
                "59314.4".into(),
                "1.50000000".into(),
            )],
        );
        let expected_str = "59314415000000059314325288651";
        let expected_crc = crc32fast::hash(expected_str.as_bytes());
        assert_eq!(book.kraken_crc32(), expected_crc);
        assert!(book.verify_kraken_checksum(expected_crc));
        assert!(book.is_live());

        // Mismatch must immediately invalidate to Stale
        assert!(!book.verify_kraken_checksum(expected_crc ^ 1));
        assert!(matches!(
            book.state,
            BookState::Stale(StaleReason::ChecksumMismatch { .. })
        ));
    }

    #[test]
    fn book_depth_trimming_preserves_inner_touch() {
        let mut book = L2OrderBook::new("BTC/USD", Some(2));
        book.apply_snapshot(
            vec![
                (100, 10, "100".into(), "10".into()),
                (101, 10, "101".into(), "10".into()),
                (102, 10, "102".into(), "10".into()),
            ],
            vec![
                (105, 10, "105".into(), "10".into()),
                (104, 10, "104".into(), "10".into()),
                (103, 10, "103".into(), "10".into()),
            ],
        );
        assert_eq!(book.bids.len(), 2);
        assert_eq!(book.asks.len(), 2);
        assert_eq!(book.best_bid().unwrap().price_e9, 102);
        assert_eq!(book.best_ask().unwrap().price_e9, 103);
    }
}
