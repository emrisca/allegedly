use crate::atvault::StorageError;
use rusqlite::{Connection, params};
use std::path::Path;

/// SQLite WAL metadata catalog for .atvault and Parquet partitions (ADR-0006).
pub struct CatalogDb {
    conn: Connection,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartitionEntry {
    pub symbol: String,
    pub start_ts_ns: i64,
    pub end_ts_ns: i64,
    pub row_count: i64,
    pub file_path: String,
}

impl CatalogDb {
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             CREATE TABLE IF NOT EXISTS partitions (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 symbol TEXT NOT NULL,
                 start_ts_ns INTEGER NOT NULL,
                 end_ts_ns INTEGER NOT NULL,
                 row_count INTEGER NOT NULL,
                 file_path TEXT NOT NULL UNIQUE
             );
             CREATE INDEX IF NOT EXISTS idx_partitions_sym_ts ON partitions(symbol, start_ts_ns, end_ts_ns);",
        )?;
        Ok(Self { conn })
    }

    pub fn register_partition(&self, entry: &PartitionEntry) -> Result<(), StorageError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO partitions (symbol, start_ts_ns, end_ts_ns, row_count, file_path)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                entry.symbol,
                entry.start_ts_ns,
                entry.end_ts_ns,
                entry.row_count,
                entry.file_path
            ],
        )?;
        Ok(())
    }

    pub fn query_overlapping(
        &self,
        symbol: &str,
        start_ts_ns: i64,
        end_ts_ns: i64,
    ) -> Result<Vec<PartitionEntry>, StorageError> {
        let mut stmt = self.conn.prepare(
            "SELECT symbol, start_ts_ns, end_ts_ns, row_count, file_path
             FROM partitions
             WHERE symbol = ?1 AND end_ts_ns >= ?2 AND start_ts_ns <= ?3
             ORDER BY start_ts_ns ASC",
        )?;
        let rows = stmt.query_map(params![symbol, start_ts_ns, end_ts_ns], |r| {
            Ok(PartitionEntry {
                symbol: r.get(0)?,
                start_ts_ns: r.get(1)?,
                end_ts_ns: r.get(2)?,
                row_count: r.get(3)?,
                file_path: r.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }
}
