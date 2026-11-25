import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

export interface LwcPaintSnapshot {
  timestampMs: number;
  mediaWidth: number;
  mediaHeight: number;
  bitmapWidth: number;
  bitmapHeight: number;
  horizontalPixelRatio: number;
  verticalPixelRatio: number;
  anchorPhysX: number | null;
  anchorPhysY: number | null;
  lwcCanvas: HTMLCanvasElement | null;
}

class SyncPaneRenderer implements IPrimitivePaneRenderer {
  private parent: LwcSyncPrimitive;
  constructor(parent: LwcSyncPrimitive) {
    this.parent = parent;
  }

  draw(target: DrawTarget): void {
    target.useBitmapCoordinateSpace((scope) => {
      const { context, bitmapSize, mediaSize, horizontalPixelRatio, verticalPixelRatio } = scope;
      let anchorPhysX: number | null = null;
      let anchorPhysY: number | null = null;

      const anchor = this.parent.calibrationAnchor;
      if (anchor && this.parent.chart && this.parent.series) {
        const xCss = this.parent.chart.timeScale().logicalToCoordinate(anchor.barIndex as any);
        const yCss = this.parent.series.priceToCoordinate(anchor.price);
        if (xCss !== null && yCss !== null) {
          anchorPhysX = Math.round(xCss * horizontalPixelRatio);
          anchorPhysY = Math.round(yCss * verticalPixelRatio);
          // Draw bright cyan (#00ffff) 10x10 physical px calibration fiducial on LWC's own Canvas2D
          context.save();
          context.fillStyle = '#00ffff';
          context.fillRect(anchorPhysX - 5, anchorPhysY - 5, 10, 10);
          context.restore();
        }
      }

      const snap: LwcPaintSnapshot = {
        timestampMs: performance.now(),
        mediaWidth: mediaSize.width,
        mediaHeight: mediaSize.height,
        bitmapWidth: bitmapSize.width,
        bitmapHeight: bitmapSize.height,
        horizontalPixelRatio,
        verticalPixelRatio,
        anchorPhysX,
        anchorPhysY,
        lwcCanvas: context.canvas,
      };
      this.parent.lastSnapshot = snap;
      this.parent.onLwcPaint(snap);
    });
  }
}

class SyncPaneView implements IPrimitivePaneView {
  private rendererImpl: SyncPaneRenderer;
  constructor(parent: LwcSyncPrimitive) {
    this.rendererImpl = new SyncPaneRenderer(parent);
  }
  renderer(): IPrimitivePaneRenderer {
    return this.rendererImpl;
  }
  zOrder(): 'top' {
    return 'top';
  }
}

export class LwcSyncPrimitive implements ISeriesPrimitive<Time> {
  public chart: IChartApi | null = null;
  public series: ISeriesApi<'Candlestick'> | null = null;
  public calibrationAnchor: { barIndex: number; price: number } | null = null;
  public lastSnapshot: LwcPaintSnapshot | null = null;
  public onLwcPaint: (snap: LwcPaintSnapshot) => void;
  private views: SyncPaneView[];

  constructor(onLwcPaint: (snap: LwcPaintSnapshot) => void) {
    this.onLwcPaint = onLwcPaint;
    this.views = [new SyncPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }
}
