use crate::state::OrderState;
use crate::types::{
    ClientOrderId, FillEvent, OrderIntent, OrderType, PriceTicks, ProtectiveLegMode, Qty,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum JournalError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("json serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Canonical append-only OMS journal events persisted in SQLite WAL.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum JournalEvent {
    IntentLogged {
        intent: OrderIntent,
        protective_leg_mode: ProtectiveLegMode,
    },
    StateTransition {
        client_order_id: ClientOrderId,
        broker_order_id: Option<String>,
        new_state: OrderState,
        reason: Option<String>,
    },
    FillApplied {
        fill: FillEvent,
    },
    OrderReplaced {
        client_order_id: ClientOrderId,
        new_qty: Option<Qty>,
        new_order_type: Option<OrderType>,
    },
    BracketRegistered {
        entry_client_id: ClientOrderId,
        take_profit_price: PriceTicks,
        stop_loss_price: PriceTicks,
        mode: ProtectiveLegMode,
    },
    BracketLegsUpdated {
        entry_client_id: ClientOrderId,
        take_profit_client_id: Option<ClientOrderId>,
        stop_loss_client_id: Option<ClientOrderId>,
        protected_qty: Qty,
        closed_by_leg: Option<ClientOrderId>,
    },
    KillSwitchTriggered {
        reason: String,
        canceled_orders: usize,
        flattened_positions: usize,
    },
    ReconciliationNote {
        summary: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JournalRow {
    pub seq: i64,
    pub ts_ns: i64,
    pub event: JournalEvent,
}

/// Append-only SQLite WAL event store for deterministic OMS crash recovery.
pub struct SqliteWalJournal {
    path: PathBuf,
    conn: Connection,
}

impl SqliteWalJournal {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, JournalError> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
        let conn = Connection::open(&path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "FULL")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS oms_events (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                ts_ns INTEGER NOT NULL,
                client_order_id TEXT,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_oms_events_cid ON oms_events(client_order_id);",
        )?;
        Ok(Self { path, conn })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn journal_mode(&self) -> Result<String, JournalError> {
        let mode: String = self
            .conn
            .pragma_query_value(None, "journal_mode", |row| row.get(0))?;
        Ok(mode)
    }

    /// Append a single OMS event durably to the WAL before or upon state mutation.
    pub fn append(&self, ts_ns: i64, event: &JournalEvent) -> Result<i64, JournalError> {
        let (cid, etype) = match event {
            JournalEvent::IntentLogged { intent, .. } => {
                (Some(intent.client_order_id.as_str()), "intent_logged")
            }
            JournalEvent::StateTransition {
                client_order_id, ..
            } => (Some(client_order_id.as_str()), "state_transition"),
            JournalEvent::FillApplied { fill } => {
                (Some(fill.client_order_id.as_str()), "fill_applied")
            }
            JournalEvent::OrderReplaced {
                client_order_id, ..
            } => (Some(client_order_id.as_str()), "order_replaced"),
            JournalEvent::BracketRegistered {
                entry_client_id, ..
            } => (Some(entry_client_id.as_str()), "bracket_registered"),
            JournalEvent::BracketLegsUpdated {
                entry_client_id, ..
            } => (Some(entry_client_id.as_str()), "bracket_legs_updated"),
            JournalEvent::KillSwitchTriggered { .. } => (None, "kill_switch_triggered"),
            JournalEvent::ReconciliationNote { .. } => (None, "reconciliation_note"),
        };
        let payload_json = serde_json::to_string(event)?;
        self.conn.execute(
            "INSERT INTO oms_events (ts_ns, client_order_id, event_type, payload_json)
             VALUES (?1, ?2, ?3, ?4)",
            params![ts_ns, cid, etype, payload_json],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// Read all journal events in strict append order (`seq ASC`) for deterministic replay.
    pub fn read_all(&self) -> Result<Vec<JournalRow>, JournalError> {
        let mut stmt = self
            .conn
            .prepare("SELECT seq, ts_ns, payload_json FROM oms_events ORDER BY seq ASC")?;
        let iter = stmt.query_map([], |row| {
            let seq: i64 = row.get(0)?;
            let ts_ns: i64 = row.get(1)?;
            let payload: String = row.get(2)?;
            Ok((seq, ts_ns, payload))
        })?;
        let mut rows = Vec::new();
        for item in iter {
            let (seq, ts_ns, payload) = item?;
            let event: JournalEvent = serde_json::from_str(&payload)?;
            rows.push(JournalRow { seq, ts_ns, event });
        }
        Ok(rows)
    }

    pub fn count_events(&self) -> Result<i64, JournalError> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM oms_events", [], |r| r.get(0))?;
        Ok(count)
    }
}
