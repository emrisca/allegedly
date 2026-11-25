use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// 5-Level Settings-as-Code TOML Delta Cascade (SV-06, SV-07, ADR-0010):
/// Hardcoded Defaults -> Global -> Workspace -> Template -> Instance.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ConfigLayer {
    pub values: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ConfigCascade {
    pub defaults: ConfigLayer,
    pub global: ConfigLayer,
    pub workspace: ConfigLayer,
    pub template: ConfigLayer,
    pub instance: ConfigLayer,
}

impl ConfigCascade {
    pub fn resolve(&self, key: &str) -> Option<&str> {
        self.instance
            .values
            .get(key)
            .or_else(|| self.template.values.get(key))
            .or_else(|| self.workspace.values.get(key))
            .or_else(|| self.global.values.get(key))
            .or_else(|| self.defaults.values.get(key))
            .map(String::as_str)
    }

    pub fn set_instance_override(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.instance.values.insert(key.into(), value.into());
    }

    pub fn reset_to_inherited(&mut self, key: &str) {
        self.instance.values.remove(key);
    }

    pub fn modified_instance_keys(&self) -> Vec<&str> {
        self.instance.values.keys().map(String::as_str).collect()
    }

    /// Deterministic sorted-key TOML export for SV-06 byte-exact round-trip & minimal git diffs.
    pub fn export_instance_toml(&self) -> String {
        let mut out = String::new();
        for (k, v) in &self.instance.values {
            out.push_str(k);
            out.push_str(" = ");
            out.push_str(v);
            out.push('\n');
        }
        out
    }
}
