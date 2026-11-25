use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Authoritative Workspace State Hub with strictly monotonic state_rev: u64 (ST-08 / RT3-09).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceState {
    pub state_rev: u64,
    pub link_group_symbols: BTreeMap<char, String>,
    pub active_theme: String,
    pub live_armed: bool,
    pub selected_object_id: Option<String>,
}

impl Default for WorkspaceState {
    fn default() -> Self {
        let mut link_group_symbols = BTreeMap::new();
        link_group_symbols.insert('A', "BTC/USD".to_string());
        Self {
            state_rev: 0,
            link_group_symbols,
            active_theme: "allegedly-dark".to_string(),
            live_armed: false,
            selected_object_id: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspacePatch {
    pub observed_rev: u64,
    pub set_link_symbol: Option<(char, String)>,
    pub set_theme: Option<String>,
    pub set_selected_object: Option<Option<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspacePatchResult {
    pub accepted: bool,
    pub current_rev: u64,
}

#[derive(Debug, Default)]
pub struct WorkspaceStateHub {
    state: WorkspaceState,
}

impl WorkspaceStateHub {
    pub fn snapshot(&self) -> WorkspaceState {
        self.state.clone()
    }

    /// Optimistic concurrency control: rejects stale patches where observed_rev < current state_rev.
    pub fn apply_patch(&mut self, patch: WorkspacePatch) -> WorkspacePatchResult {
        if patch.observed_rev < self.state.state_rev {
            return WorkspacePatchResult {
                accepted: false,
                current_rev: self.state.state_rev,
            };
        }
        if let Some((group, sym)) = patch.set_link_symbol {
            self.state.link_group_symbols.insert(group, sym);
        }
        if let Some(theme) = patch.set_theme {
            self.state.active_theme = theme;
        }
        if let Some(sel) = patch.set_selected_object {
            self.state.selected_object_id = sel;
        }
        self.state.state_rev += 1;
        WorkspacePatchResult {
            accepted: true,
            current_rev: self.state.state_rev,
        }
    }
}
