use crate::state::{OrderRecord, OrderSide, OrderState, OrderType};
use allegedly_core::{InstrumentId, PriceE9, QtyE9, TimestampNs};
use rusqlite::{Connection, params};
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum JournalError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JournalMode {
    PaperSim,
    BrokerLive,
}

/// Crash-safe SQLite WAL OMS journal with macOS APFS PRAGMA fullfsync = ON batched Kill-Switch support (ADR-0009, UV-02).
pub struct OrderJournal {
    conn: Connection,
    mode: JournalMode,
}

impl OrderJournal {
    pub fn open(path: &Path, mode: JournalMode) -> Result<Self, JournalError> {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open(path)?;
        let sync_pragma = match mode {
            JournalMode::PaperSim => "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;",
            JournalMode::BrokerLive => {
                "PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA fullfsync = ON;"
            }
        };
        conn.execute_batch(sync_pragma)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS orders (
                client_order_id TEXT PRIMARY KEY,
                instrument_id INTEGER NOT NULL,
                side TEXT NOT NULL,
                order_type TEXT NOT NULL,
                qty_e9 INTEGER NOT NULL,
                filled_qty_e9 INTEGER NOT NULL,
                limit_price_e9 INTEGER,
                reduce_only INTEGER NOT NULL,
                state TEXT NOT NULL,
                updated_ns INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS positions (
                instrument_id INTEGER PRIMARY KEY,
                qty_e9 INTEGER NOT NULL,
                updated_ns INTEGER NOT NULL
            );",
        )?;
        Ok(Self { conn, mode })
    }

    pub fn mode(&self) -> JournalMode {
        self.mode
    }

    pub fn upsert_order(&self, rec: &OrderRecord) -> Result<(), JournalError> {
        let side_str = match rec.side {
            OrderSide::Buy => "BUY",
            OrderSide::Sell => "SELL",
        };
        let type_str = match rec.order_type {
            OrderType::Market => "MARKET",
            OrderType::Limit => "LIMIT",
            OrderType::Stop => "STOP",
            OrderType::StopLimit => "STOP_LIMIT",
        };
        self.conn.execute(
            "INSERT INTO orders (
                client_order_id, instrument_id, side, order_type, qty_e9,
                filled_qty_e9, limit_price_e9, reduce_only, state, updated_ns
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(client_order_id) DO UPDATE SET
                filled_qty_e9 = excluded.filled_qty_e9,
                limit_price_e9 = excluded.limit_price_e9,
                state = excluded.state,
                updated_ns = excluded.updated_ns",
            params![
                rec.client_order_id.to_string(),
                rec.instrument_id.0,
                side_str,
                type_str,
                rec.qty.0,
                rec.filled_qty.0,
                rec.limit_price.map(|p| p.0),
                i32::from(rec.reduce_only),
                rec.state.as_str(),
                rec.updated_ns.0,
            ],
        )?;
        Ok(())
    }

    /// Atomically persist an order and updated instrument position in a single SQLite WAL transaction.
    pub fn commit_order_and_position(
        &mut self,
        rec: &OrderRecord,
        new_pos_e9: i64,
        now_ns: TimestampNs,
    ) -> Result<(), JournalError> {
        let side_str = match rec.side {
            OrderSide::Buy => "BUY",
            OrderSide::Sell => "SELL",
        };
        let type_str = match rec.order_type {
            OrderType::Market => "MARKET",
            OrderType::Limit => "LIMIT",
            OrderType::Stop => "STOP",
            OrderType::StopLimit => "STOP_LIMIT",
        };
        let tx = self.conn.transaction()?;
        tx.execute(
            "INSERT INTO orders (
                client_order_id, instrument_id, side, order_type, qty_e9,
                filled_qty_e9, limit_price_e9, reduce_only, state, updated_ns
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(client_order_id) DO UPDATE SET
                filled_qty_e9 = excluded.filled_qty_e9,
                limit_price_e9 = excluded.limit_price_e9,
                state = excluded.state,
                updated_ns = excluded.updated_ns",
            params![
                rec.client_order_id.to_string(),
                rec.instrument_id.0,
                side_str,
                type_str,
                rec.qty.0,
                rec.filled_qty.0,
                rec.limit_price.map(|p| p.0),
                i32::from(rec.reduce_only),
                rec.state.as_str(),
                rec.updated_ns.0,
            ],
        )?;
        tx.execute(
            "INSERT INTO positions (instrument_id, qty_e9, updated_ns)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(instrument_id) DO UPDATE SET
                qty_e9 = excluded.qty_e9,
                updated_ns = excluded.updated_ns",
            params![rec.instrument_id.0, new_pos_e9, now_ns.0],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn upsert_position(
        &self,
        instrument_id: u32,
        qty_e9: i64,
        now_ns: TimestampNs,
    ) -> Result<(), JournalError> {
        self.conn.execute(
            "INSERT INTO positions (instrument_id, qty_e9, updated_ns)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(instrument_id) DO UPDATE SET
                qty_e9 = excluded.qty_e9,
                updated_ns = excluded.updated_ns",
            params![instrument_id, qty_e9, now_ns.0],
        )?;
        Ok(())
    }

    /// Batched single-transaction Kill-Switch cancel commit (1 fsync across all working orders; RT3-10 / UV-02).
    ///
    /// - `BrokerLive`: persists `PendingCancel` (awaiting venue cancel ack).
    /// - `PaperSim`: atomically cancels working orders to `Canceled` and flattens open positions to `0`
    ///   so in-memory state and post-crash SQLite reload are 100% consistent (RTSD-09).
    pub fn commit_kill_switch_batch(
        &mut self,
        ids: &[Uuid],
        target_state: OrderState,
        flatten_positions: bool,
        now_ns: TimestampNs,
    ) -> Result<usize, JournalError> {
        let tx = self.conn.transaction()?;
        let mut updated = 0usize;
        {
            let mut stmt = tx.prepare(
                "UPDATE orders SET state = ?1, updated_ns = ?2 WHERE client_order_id = ?3",
            )?;
            let state_str = target_state.as_str();
            for id in ids {
                updated += stmt.execute(params![state_str, now_ns.0, id.to_string()])?;
            }
        }
        if flatten_positions {
            tx.execute(
                "UPDATE positions SET qty_e9 = 0, updated_ns = ?1",
                params![now_ns.0],
            )?;
        }
        tx.commit()?;
        Ok(updated)
    }

    fn decode_order_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<OrderRecord> {
        let id_str: String = r.get(0)?;
        let side_str: String = r.get(2)?;
        let type_str: String = r.get(3)?;
        let state_str: String = r.get(8)?;
        Ok(OrderRecord {
            client_order_id: Uuid::parse_str(&id_str).unwrap_or_else(|_| Uuid::nil()),
            instrument_id: InstrumentId(r.get(1)?),
            side: if side_str == "BUY" {
                OrderSide::Buy
            } else {
                OrderSide::Sell
            },
            order_type: match type_str.as_str() {
                "MARKET" => OrderType::Market,
                "STOP" => OrderType::Stop,
                "STOP_LIMIT" => OrderType::StopLimit,
                _ => OrderType::Limit,
            },
            qty: QtyE9(r.get(4)?),
            filled_qty: QtyE9(r.get(5)?),
            limit_price: r.get::<_, Option<i64>>(6)?.map(PriceE9),
            reduce_only: r.get::<_, i32>(7)? != 0,
            state: OrderState::parse(&state_str).unwrap_or(OrderState::UnknownReconciling),
            updated_ns: TimestampNs(r.get(9)?),
        })
    }

    pub fn load_working_orders(&self) -> Result<Vec<OrderRecord>, JournalError> {
        let mut stmt = self.conn.prepare(
            "SELECT client_order_id, instrument_id, side, order_type, qty_e9,
                    filled_qty_e9, limit_price_e9, reduce_only, state, updated_ns
             FROM orders
             WHERE state IN ('PendingLocal', 'Submitted', 'Acked', 'PartiallyFilled', 'PendingCancel', 'PendingReplace', 'UnknownReconciling')
             ORDER BY updated_ns DESC",
        )?;
        let rows = stmt.query_map([], Self::decode_order_row)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn load_all_orders(&self, limit: usize) -> Result<Vec<OrderRecord>, JournalError> {
        let mut stmt = self.conn.prepare(
            "SELECT client_order_id, instrument_id, side, order_type, qty_e9,
                    filled_qty_e9, limit_price_e9, reduce_only, state, updated_ns
             FROM orders
             ORDER BY updated_ns DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], Self::decode_order_row)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn load_positions(&self) -> Result<HashMap<u32, i64>, JournalError> {
        let mut stmt = self
            .conn
            .prepare("SELECT instrument_id, qty_e9 FROM positions WHERE qty_e9 != 0")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, u32>(0)?, r.get::<_, i64>(1)?)))?;
        let mut out = HashMap::new();
        for r in rows {
            let (inst, qty) = r?;
            out.insert(inst, qty);
        }
        Ok(out)
    }
}
