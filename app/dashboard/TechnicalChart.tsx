"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi } from "lightweight-charts";

export interface ChartPoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

const TechnicalChart = ({ data, height = 280, onRangeChange, activeRange, loading }: {
  data: ChartPoint[];
  height?: number;
  onRangeChange: (range: string) => void;
  activeRange: string;
  loading?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maRef = useRef<ISeriesApi<"Line"> | null>(null);

  const ranges = [
    { key: "1mo", label: "1M" },
    { key: "3mo", label: "3M" },
    { key: "6mo", label: "6M" },
    { key: "1y", label: "1Y" },
    { key: "3y", label: "3Y" },
    { key: "5y", label: "5Y" },
  ];

  // Calculate 20-period moving average
  const calcMA = (points: ChartPoint[], period: number) => {
    const result: { time: string; value: number }[] = [];
    const closes = points.map(p => p.close).filter((c): c is number => c != null);
    for (let i = period - 1; i < points.length; i++) {
      const slice = closes.slice(i - period + 1, i + 1);
      if (slice.length === period) {
        result.push({ time: points[i].date, value: slice.reduce((a, b) => a + b, 0) / period });
      }
    }
    return result;
  };

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    // Detect theme
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const bg = isDark ? "#0F1117" : "#FFFFFF";
    const textColor = isDark ? "#9CA3AF" : "#6B7280";
    const gridColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
    const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

    // Create or reuse chart
    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: bg }, textColor, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: 11 },
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor, autoScale: true },
      timeScale: { borderColor, timeVisible: false, rightOffset: 2 },
    });
    chartRef.current = chart;

    // Candlestick series
    const candles = chart.addCandlestickSeries({
      upColor: "#059669",
      downColor: "#DC2626",
      borderDownColor: "#DC2626",
      borderUpColor: "#059669",
      wickDownColor: "#DC2626",
      wickUpColor: "#059669",
    });
    candleRef.current = candles;

    const candleData = data.filter(d => d.open != null && d.high != null && d.low != null && d.close != null).map(d => ({
      time: d.date as string,
      open: d.open!,
      high: d.high!,
      low: d.low!,
      close: d.close!,
    }));
    candles.setData(candleData as any);

    // Volume histogram
    const volume = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeRef.current = volume;

    const volData = data.filter(d => d.volume != null && d.close != null && d.open != null).map(d => ({
      time: d.date as string,
      value: d.volume!,
      color: (d.close! >= d.open!) ? "rgba(5,150,105,0.25)" : "rgba(220,38,38,0.25)",
    }));
    volume.setData(volData as any);

    // Moving average line (20-period)
    const maData = calcMA(data, 20);
    if (maData.length > 0) {
      const maSeries = chart.addLineSeries({
        color: "#2563EB",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      maSeries.setData(maData as any);
      maRef.current = maSeries;
    }

    chart.timeScale().fitContent();

    // Responsive
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w && chart) chart.applyOptions({ width: w });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height]);

  return (
    <div>
      {/* Range selector */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold uppercase tracking-wider" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>Price Chart</h3>
        <div className="flex gap-1">
          {ranges.map(r => (
            <button key={r.key} onClick={() => onRangeChange(r.key)}
              className="px-3 py-1 rounded-md font-semibold transition-all"
              style={{
                fontSize: "var(--text-xs)",
                fontFamily: "var(--font-mono)",
                background: activeRange === r.key ? "var(--color-accent-blue)" : "transparent",
                color: activeRange === r.key ? "#fff" : "var(--color-text-muted)",
                border: activeRange === r.key ? "none" : "1px solid var(--color-border-subtle)",
              }}
            >{r.label}</button>
          ))}
        </div>
      </div>
      {/* Chart container */}
      <div style={{ position: "relative", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--color-border-subtle)" }}>
        {loading && (
          <div className="flex items-center justify-center" style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(0,0,0,0.03)" }}>
            <div className="skeleton" style={{ width: "80%", height: height - 40 }} />
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height }} />
      </div>
    </div>
  );
};

export default TechnicalChart;
