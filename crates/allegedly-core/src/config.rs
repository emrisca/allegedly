use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// 5-Level Settings-as-Code TOML Delta Cascade (SV-06, SV-07, ADR-0010):
/// Hardcoded Defaults -> Global -> Workspace -> Template -> Instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigLayerKind {
    Defaults,
    Global,
    Workspace,
    Template,
    Instance,
}

impl ConfigLayerKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Defaults => "defaults",
            Self::Global => "global",
            Self::Workspace => "workspace",
            Self::Template => "template",
            Self::Instance => "instance",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResolvedSetting {
    pub key: String,
    pub value: String,
    pub source_layer: ConfigLayerKind,
    pub inherited_value: Option<String>,
    pub is_overridden: bool,
    pub locked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ConfigLayer {
    pub values: BTreeMap<String, String>,
}

impl ConfigLayer {
    /// Parse a deterministic flat `key = value` TOML layer (comments `#` and blank lines ignored).
    pub fn parse_toml(input: &str) -> Self {
        let mut values = BTreeMap::new();
        for raw_line in input.lines() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with('[') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                let key = k.trim();
                let val = v.trim();
                if !key.is_empty() && !val.is_empty() {
                    values.insert(key.to_string(), val.to_string());
                }
            }
        }
        Self { values }
    }

    /// Export sorted `key = value\n` TOML lines for SV-06 byte-exact round-trip & minimal git diffs.
    pub fn export_toml(&self) -> String {
        let mut out = String::new();
        for (k, v) in &self.values {
            out.push_str(k);
            out.push_str(" = ");
            out.push_str(v);
            out.push('\n');
        }
        out
    }
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
    /// Canonical v0.1 defaults enforcing SV-01 offline boot & ADR-0009 Paper/Sim safety locks.
    pub fn with_v01_defaults() -> Self {
        let mut cascade = Self::default();
        let d = &mut cascade.defaults.values;
        d.insert("updates.checkOnStartup".into(), "false".into());
        d.insert("execution.live_armed".into(), "false".into());
        d.insert("execution.mode".into(), "\"paper_sim\"".into());
        d.insert("chart.max_active_bars".into(), "6000".into());
        d.insert("chart.trim_target_bars".into(), "5000".into());
        d.insert("orderflow.imbalance_ratio_bps".into(), "30000".into());
        d.insert("orderflow.vrvp_value_area_bps".into(), "7000".into());
        d.insert("orderflow.tpo_period_minutes".into(), "30".into());
        d.insert("study.global_memory_cap_mib".into(), "64".into());
        d.insert("ui.density".into(), "\"compact\"".into());
        d.insert("ui.provenance_badge".into(), "true".into());
        cascade
    }

    pub fn is_safety_locked_key(key: &str) -> bool {
        matches!(key, "updates.checkOnStartup" | "execution.live_armed")
    }

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

    pub fn resolve_inherited(&self, key: &str) -> Option<&str> {
        self.template
            .values
            .get(key)
            .or_else(|| self.workspace.values.get(key))
            .or_else(|| self.global.values.get(key))
            .or_else(|| self.defaults.values.get(key))
            .map(String::as_str)
    }

    pub fn resolve_with_source(&self, key: &str) -> Option<(ConfigLayerKind, &str)> {
        if let Some(v) = self.instance.values.get(key) {
            return Some((ConfigLayerKind::Instance, v.as_str()));
        }
        if let Some(v) = self.template.values.get(key) {
            return Some((ConfigLayerKind::Template, v.as_str()));
        }
        if let Some(v) = self.workspace.values.get(key) {
            return Some((ConfigLayerKind::Workspace, v.as_str()));
        }
        if let Some(v) = self.global.values.get(key) {
            return Some((ConfigLayerKind::Global, v.as_str()));
        }
        self.defaults
            .values
            .get(key)
            .map(|v| (ConfigLayerKind::Defaults, v.as_str()))
    }

    pub fn set_instance_override(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.instance.values.insert(key.into(), value.into());
    }

    /// Safety-checked instance override rejecting attempts to unlock SV-01 / ADR-0009 locks in v0.1.
    pub fn try_set_instance_override(
        &mut self,
        key: impl Into<String>,
        value: impl Into<String>,
    ) -> Result<(), String> {
        let k = key.into();
        let v = value.into();
        if Self::is_safety_locked_key(&k) && v.trim() != "false" {
            return Err(format!(
                "Safety invariant lock: '{k}' is fixed to false in v0.1 (SV-01 / ADR-0009)"
            ));
        }
        self.instance.values.insert(k, v);
        Ok(())
    }

    pub fn reset_to_inherited(&mut self, key: &str) {
        self.instance.values.remove(key);
    }

    pub fn modified_instance_keys(&self) -> Vec<&str> {
        self.instance.values.keys().map(String::as_str).collect()
    }

    /// Return all known keys across all 5 cascade layers sorted lexicographically.
    pub fn resolved_settings(&self) -> Vec<ResolvedSetting> {
        let mut keys = BTreeSet::new();
        for layer in [
            &self.defaults,
            &self.global,
            &self.workspace,
            &self.template,
            &self.instance,
        ] {
            for k in layer.values.keys() {
                keys.insert(k.as_str());
            }
        }
        keys.into_iter()
            .filter_map(|k| {
                let (source_layer, value) = self.resolve_with_source(k)?;
                let inherited_value = self.resolve_inherited(k).map(str::to_string);
                Some(ResolvedSetting {
                    key: k.to_string(),
                    value: value.to_string(),
                    source_layer,
                    inherited_value,
                    is_overridden: source_layer == ConfigLayerKind::Instance,
                    locked: Self::is_safety_locked_key(k),
                })
            })
            .collect()
    }

    /// Deterministic sorted-key TOML export for SV-06 byte-exact round-trip & minimal git diffs.
    pub fn export_instance_toml(&self) -> String {
        self.instance.export_toml()
    }

    /// Canonical `.atworkspace.toml` serializer storing workspace metadata + sparse delta layers (SV-06).
    pub fn export_atworkspace_toml(&self, name: &str, symbol: &str, timeframe: &str) -> String {
        let mut out = String::new();
        out.push_str("# Allegedly Workspace Settings-as-Code (.atworkspace.toml)\n");
        out.push_str("schema_version = 1\n");
        out.push_str(&format!("workspace_name = \"{}\"\n", name.replace('"', "")));
        out.push_str(&format!(
            "active_symbol = \"{}\"\n",
            symbol.replace('"', "")
        ));
        out.push_str(&format!(
            "active_timeframe = \"{}\"\n\n",
            timeframe.replace('"', "")
        ));

        out.push_str("[workspace]\n");
        out.push_str(&self.workspace.export_toml());
        out.push_str("\n[template]\n");
        out.push_str(&self.template.export_toml());
        out.push_str("\n[instance]\n");
        out.push_str(&self.instance.export_toml());
        out
    }

    /// Parse sparse `[workspace]`, `[template]`, and `[instance]` sections from `.atworkspace.toml`.
    pub fn import_atworkspace_toml(&mut self, input: &str) {
        let mut active: Option<ConfigLayerKind> = None;
        self.workspace.values.clear();
        self.template.values.clear();
        self.instance.values.clear();

        for raw_line in input.lines() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if line == "[workspace]" {
                active = Some(ConfigLayerKind::Workspace);
                continue;
            }
            if line == "[template]" {
                active = Some(ConfigLayerKind::Template);
                continue;
            }
            if line == "[instance]" {
                active = Some(ConfigLayerKind::Instance);
                continue;
            }
            if line.starts_with('[') {
                active = None;
                continue;
            }
            if let (Some(section), Some((k, v))) = (active, line.split_once('=')) {
                let key = k.trim().to_string();
                let val = v.trim().to_string();
                if Self::is_safety_locked_key(&key) && val != "false" {
                    continue;
                }
                match section {
                    ConfigLayerKind::Workspace => {
                        self.workspace.values.insert(key, val);
                    }
                    ConfigLayerKind::Template => {
                        self.template.values.insert(key, val);
                    }
                    ConfigLayerKind::Instance => {
                        self.instance.values.insert(key, val);
                    }
                    ConfigLayerKind::Defaults | ConfigLayerKind::Global => {}
                }
            }
        }
    }
}
