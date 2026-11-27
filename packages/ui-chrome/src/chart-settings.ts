export type VisibilityMode = "hover" | "always" | "never";
export type TitleDisplayMode = "symbol_and_name" | "symbol" | "description";
export type ScalesPlacementMode = "auto" | "left" | "right";
export type PriceLabelMode = "value_line" | "value" | "hidden";
export type SymbolPriceScaleMode = "according_to_scale" | "last_value";
export type BidAskMode = "hidden" | "lines_and_labels";
export type DateFormatMode = "ddd dd MMM 'yy" | "yyyy-MM-dd" | "MM/dd/yyyy" | "dd MMM 'yy";
export type WatermarkMode = "none" | "replay" | "always";
export type PnlDisplayMode = "money" | "ticks" | "percent";
export type PrecisionMode = "Default" | "1/100" | "1/1000" | "1/10000";

export interface ChartSettings {
  symbol: {
    colorBarsOnPrevClose: boolean;
    bodyEnabled: boolean;
    bodyUpColor: string;
    bodyDownColor: string;
    borderEnabled: boolean;
    borderUpColor: string;
    borderDownColor: string;
    wickEnabled: boolean;
    wickUpColor: string;
    wickDownColor: string;
    useSettlementAsCloseOnDaily: boolean;
    adjustForContractChanges: boolean;
    precision: PrecisionMode;
    timezone: string;
  };
  statusLine: {
    logo: boolean;
    title: boolean;
    titleMode: TitleDisplayMode;
    openMarketStatus: boolean;
    chartValues: boolean;
    barChangeValues: boolean;
    volume: boolean;
    lastDayChangeValues: boolean;
    buySellButtons: boolean;
    indicatorTitles: boolean;
    indicatorInputs: boolean;
    indicatorValues: boolean;
    background: boolean;
    backgroundOpacity: number;
  };
  scales: {
    currencyAndUnit: VisibilityMode;
    scaleModesButtons: VisibilityMode;
    lockPriceToBarRatio: boolean;
    priceToBarRatio: number;
    scalesPlacement: ScalesPlacementMode;
    noOverlappingLabels: boolean;
    plusButton: boolean;
    countdownToBarClose: boolean;
    symbolPriceLabel: PriceLabelMode;
    symbolPriceMode: SymbolPriceScaleMode;
    indicatorsLabel: "value" | "hidden";
    highAndLow: PriceLabelMode;
    bidAndAsk: BidAskMode;
    bidColor: string;
    askColor: string;
    dayOfWeekOnLabels: boolean;
    dateFormat: DateFormatMode;
  };
  canvas: {
    backgroundType: "solid" | "gradient";
    backgroundColor: string;
    backgroundColorBottom: string;
    vertGridLines: boolean;
    vertGridColor: string;
    horzGridLines: boolean;
    horzGridColor: string;
    crosshairColor: string;
    watermark: WatermarkMode;
    scalesTextColor: string;
    scalesFontSize: number;
    scalesLinesVisible: boolean;
    scalesLineColor: string;
    navigationButtons: VisibilityMode;
    paneButtons: VisibilityMode;
    marginTopPct: number;
    marginBottomPct: number;
    marginRightBars: number;
  };
  trading: {
    buySellButtons: boolean;
    oneClickTrading: boolean;
    executionSound: boolean;
    executionSoundVolume: number;
    executionSoundName: string;
    showOnlyRejectionNotifications: boolean;
    positionsAndOrders: boolean;
    reversePositionButton: boolean;
    tradingControls: "hover" | "always";
    projectOrderForMarketOrders: boolean;
    profitAndLossValue: boolean;
    pnlPositionsMode: PnlDisplayMode;
    pnlBracketsMode: PnlDisplayMode;
    executionMarks: boolean;
  };
  alerts: {
    alertLines: boolean;
    alertLineColor: string;
    onlyActiveAlerts: boolean;
    autoHideToasts: boolean;
  };
  events: {
    ideas: boolean;
    ideasFilter: "all" | "following" | "mine";
    continuousContractSwitch: boolean;
    contractSwitchBreaks: boolean;
    latestNews: boolean;
    newsNotification: boolean;
  };
}

export interface ChartSettingsTemplate {
  id: string;
  name: string;
  settings: ChartSettings;
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  symbol: {
    colorBarsOnPrevClose: false,
    bodyEnabled: true,
    bodyUpColor: "#8e93a2",
    bodyDownColor: "#383b47",
    borderEnabled: true,
    borderUpColor: "#5f6473",
    borderDownColor: "#5f6473",
    wickEnabled: true,
    wickUpColor: "#5f6473",
    wickDownColor: "#5f6473",
    useSettlementAsCloseOnDaily: true,
    adjustForContractChanges: false,
    precision: "Default",
    timezone: "America/Los_Angeles",
  },
  statusLine: {
    logo: true,
    title: true,
    titleMode: "symbol_and_name",
    openMarketStatus: true,
    chartValues: true,
    barChangeValues: true,
    volume: false,
    lastDayChangeValues: false,
    buySellButtons: false,
    indicatorTitles: true,
    indicatorInputs: true,
    indicatorValues: true,
    background: true,
    backgroundOpacity: 50,
  },
  scales: {
    currencyAndUnit: "hover",
    scaleModesButtons: "hover",
    lockPriceToBarRatio: false,
    priceToBarRatio: 63.3106585,
    scalesPlacement: "auto",
    noOverlappingLabels: true,
    plusButton: true,
    countdownToBarClose: true,
    symbolPriceLabel: "value_line",
    symbolPriceMode: "according_to_scale",
    indicatorsLabel: "value",
    highAndLow: "hidden",
    bidAndAsk: "hidden",
    bidColor: "#2962ff",
    askColor: "#8f3d49",
    dayOfWeekOnLabels: true,
    dateFormat: "ddd dd MMM 'yy",
  },
  canvas: {
    backgroundType: "solid",
    backgroundColor: "#131722",
    backgroundColorBottom: "#131722",
    vertGridLines: false,
    vertGridColor: "#1e222d",
    horzGridLines: false,
    horzGridColor: "#1e222d",
    crosshairColor: "#585f70",
    watermark: "replay",
    scalesTextColor: "#787b86",
    scalesFontSize: 12,
    scalesLinesVisible: false,
    scalesLineColor: "#2a2e39",
    navigationButtons: "hover",
    paneButtons: "hover",
    marginTopPct: 10,
    marginBottomPct: 8,
    marginRightBars: 10,
  },
  trading: {
    buySellButtons: false,
    oneClickTrading: false,
    executionSound: false,
    executionSoundVolume: 65,
    executionSoundName: "Hand Bell",
    showOnlyRejectionNotifications: false,
    positionsAndOrders: true,
    reversePositionButton: true,
    tradingControls: "hover",
    projectOrderForMarketOrders: true,
    profitAndLossValue: true,
    pnlPositionsMode: "money",
    pnlBracketsMode: "money",
    executionMarks: true,
  },
  alerts: {
    alertLines: true,
    alertLineColor: "#26a69a",
    onlyActiveAlerts: true,
    autoHideToasts: true,
  },
  events: {
    ideas: false,
    ideasFilter: "all",
    continuousContractSwitch: true,
    contractSwitchBreaks: false,
    latestNews: true,
    newsNotification: false,
  },
};

export function cloneChartSettings(s: ChartSettings): ChartSettings {
  return {
    symbol: { ...s.symbol },
    statusLine: { ...s.statusLine },
    scales: { ...s.scales },
    canvas: { ...s.canvas },
    trading: { ...s.trading },
    alerts: { ...s.alerts },
    events: { ...s.events },
  };
}

export const DEFAULT_CHART_TEMPLATES: readonly ChartSettingsTemplate[] = [
  {
    id: "01",
    name: "01",
    settings: cloneChartSettings(DEFAULT_CHART_SETTINGS),
  },
  {
    id: "02",
    name: "02",
    settings: {
      ...cloneChartSettings(DEFAULT_CHART_SETTINGS),
      symbol: {
        ...DEFAULT_CHART_SETTINGS.symbol,
        bodyUpColor: "#089981",
        bodyDownColor: "#f23645",
        borderUpColor: "#089981",
        borderDownColor: "#f23645",
        wickUpColor: "#089981",
        wickDownColor: "#f23645",
      },
      canvas: {
        ...DEFAULT_CHART_SETTINGS.canvas,
        vertGridLines: true,
        horzGridLines: true,
      },
    },
  },
  {
    id: "03",
    name: "03",
    settings: {
      ...cloneChartSettings(DEFAULT_CHART_SETTINGS),
      statusLine: {
        ...DEFAULT_CHART_SETTINGS.statusLine,
        volume: true,
        buySellButtons: true,
      },
      trading: {
        ...DEFAULT_CHART_SETTINGS.trading,
        buySellButtons: true,
      },
      scales: {
        ...DEFAULT_CHART_SETTINGS.scales,
        bidAndAsk: "lines_and_labels",
      },
      canvas: {
        ...DEFAULT_CHART_SETTINGS.canvas,
        marginRightBars: 14,
      },
    },
  },
];

export const TIMEZONE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "America/Los_Angeles", label: "(UTC-8) Los Angeles" },
  { value: "America/Chicago", label: "(UTC-6) Chicago" },
  { value: "America/New_York", label: "(UTC-5) New York" },
  { value: "UTC", label: "(UTC+0) UTC" },
  { value: "Europe/London", label: "(UTC+0) London" },
  { value: "Asia/Tokyo", label: "(UTC+9) Tokyo" },
];
