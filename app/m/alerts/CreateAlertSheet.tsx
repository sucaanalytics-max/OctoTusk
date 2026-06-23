"use client";
import { useEffect, useMemo, useState } from "react";
import type { MobileStock } from "@/lib/mobile/types";
import { useQuotes } from "@/lib/mobile/useQuotes";
import { fmtRupee, fmtPctRaw } from "@/lib/format";
import { getCompanyShort } from "@/lib/companyName";
import {
  ALERT_METRICS,
  ALERT_METRIC_LABELS,
  ALERT_TARGET_LABELS,
  metricUnit,
  metricNeedsTarget,
  type AlertMetric,
  type AlertTargetType,
} from "@/lib/userAlerts";
import type { CreateAlertInput } from "@/lib/mobile/useUserAlerts";

const TARGETS: AlertTargetType[] = ["bear", "base", "bull", "target1y"];

export default function CreateAlertSheet({
  stocks,
  onCreate,
  onClose,
}: {
  stocks: MobileStock[];
  onCreate: (input: CreateAlertInput) => Promise<string | null>;
  onClose: () => void;
}) {
  const { quotes } = useQuotes();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<MobileStock | null>(null);
  const [metric, setMetric] = useState<AlertMetric>("price_above");
  const [targetType, setTargetType] = useState<AlertTargetType>("base");
  const [threshold, setThreshold] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return stocks
      .filter((s) => s.name.toLowerCase().includes(t) || s.tikr.toLowerCase().includes(t))
      .slice(0, 8);
  }, [q, stocks]);

  const quote = picked ? quotes[picked.tikr] : undefined;
  const cmp = picked ? (quote?.price ?? picked.cmp ?? null) : null;
  const unit = metricUnit(metric);

  const submit = async () => {
    if (!picked) return setErr("Pick a stock.");
    const n = Number(threshold);
    if (!Number.isFinite(n) || threshold.trim() === "") return setErr("Enter a threshold.");
    setSaving(true);
    setErr(null);
    const e = await onCreate({
      tikr: picked.tikr,
      stock_name: getCompanyShort({ official_name: picked.name, tikr: picked.tikr }),
      metric,
      target_type: metricNeedsTarget(metric) ? targetType : null,
      threshold: n,
      one_shot: !repeat,
    });
    setSaving(false);
    if (e) setErr(e);
    else onClose();
  };

  return (
    <div className="m-sheet-root" role="dialog" aria-modal="true" aria-label="New alert">
      <button className="m-sheet-backdrop" aria-label="Close" onClick={onClose} />
      <div className="m-sheet">
        <div className="m-sheet-grab" aria-hidden />
        <div className="m-sheet-head">
          <span className="m-sheet-title">New alert</span>
          <button className="m-sheet-reset" onClick={onClose}>
            Cancel
          </button>
        </div>

        <div className="m-sheet-body">
          <section className="m-fgroup">
            <span className="m-flabel">Stock</span>
            {picked ? (
              <button className="m-chip is-active" onClick={() => setPicked(null)}>
                {getCompanyShort({ official_name: picked.name, tikr: picked.tikr })} ✕
              </button>
            ) : (
              <>
                <input
                  className="m-composer-input"
                  placeholder="Search company / ticker"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search stock"
                />
                {results.length > 0 && (
                  <div className="m-chipwrap">
                    {results.map((s) => (
                      <button
                        key={s.tikr}
                        className="m-chip"
                        onClick={() => {
                          setPicked(s);
                          setQ("");
                        }}
                      >
                        {getCompanyShort({ official_name: s.name, tikr: s.tikr })}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {picked && cmp != null && (
              <span className="m-count" style={{ textAlign: "left" }}>
                Now {fmtRupee(cmp)}
                {quote ? ` · ${fmtPctRaw(quote.changePct)} today` : ""}
              </span>
            )}
          </section>

          <section className="m-fgroup">
            <span className="m-flabel">Condition</span>
            <div className="m-chipwrap">
              {ALERT_METRICS.map((m) => (
                <button
                  key={m}
                  className={`m-chip${metric === m ? " is-active" : ""}`}
                  onClick={() => setMetric(m)}
                >
                  {ALERT_METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          </section>

          {metricNeedsTarget(metric) && (
            <section className="m-fgroup">
              <span className="m-flabel">Target</span>
              <div className="m-chipwrap">
                {TARGETS.map((t) => (
                  <button
                    key={t}
                    className={`m-chip${targetType === t ? " is-active" : ""}`}
                    onClick={() => setTargetType(t)}
                  >
                    {ALERT_TARGET_LABELS[t]}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="m-fgroup">
            <span className="m-flabel">{unit === "₹" ? "Price (₹)" : "Percent (%)"}</span>
            <input
              className="m-composer-input"
              type="number"
              inputMode="decimal"
              placeholder={unit === "₹" ? "e.g. 400" : "e.g. 5"}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              aria-label="Threshold"
            />
          </section>

          <section className="m-fgroup m-ftoggles">
            <label className="m-toggle">
              <span>Repeat (otherwise fires once)</span>
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            </label>
          </section>

          {err && <p className="m-note-err">{err}</p>}
        </div>

        <div className="m-sheet-foot">
          <button className="m-sheet-apply" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Create alert"}
          </button>
        </div>
      </div>
    </div>
  );
}
