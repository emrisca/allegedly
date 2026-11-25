use allegedly_core::{AggressorSide, PriceE9, ProvenanceTier};

/// Lee-Ready / Tick-Rule fallback aggressor classifier tagging honest ProvenanceTier (SV-10).
#[derive(Debug, Default)]
pub struct SideClassifier {
    last_price: Option<PriceE9>,
    last_side: AggressorSide,
}

impl SideClassifier {
    pub fn classify(
        &mut self,
        price: PriceE9,
        bid: Option<PriceE9>,
        ask: Option<PriceE9>,
    ) -> (AggressorSide, ProvenanceTier) {
        if let (Some(b), Some(a)) = (bid, ask) {
            if a.0 > b.0 {
                let mid_x2 = i128::from(b.0) + i128::from(a.0);
                let p_x2 = i128::from(price.0) * 2;
                if p_x2 > mid_x2 {
                    self.last_price = Some(price);
                    self.last_side = AggressorSide::Buy;
                    return (AggressorSide::Buy, ProvenanceTier::EstimatedL1Quote);
                } else if p_x2 < mid_x2 {
                    self.last_price = Some(price);
                    self.last_side = AggressorSide::Sell;
                    return (AggressorSide::Sell, ProvenanceTier::EstimatedL1Quote);
                }
            }
        }
        // Tick rule fallback
        let side = match self.last_price {
            Some(prev) if price.0 > prev.0 => AggressorSide::Buy,
            Some(prev) if price.0 < prev.0 => AggressorSide::Sell,
            _ => {
                if self.last_side == AggressorSide::Unknown {
                    AggressorSide::Buy
                } else {
                    self.last_side
                }
            }
        };
        self.last_price = Some(price);
        self.last_side = side;
        (side, ProvenanceTier::EstimatedTickRule)
    }
}
