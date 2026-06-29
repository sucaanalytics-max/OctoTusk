"use client";
import { useState } from "react";
import Link from "next/link";
import type { MobileStock } from "@/lib/mobile/types";
import { useUserAlerts } from "@/lib/mobile/useUserAlerts";
import { ALERT_METRIC_LABELS, ALERT_TARGET_LABELS, metricUnit, type UserAlert } from "@/lib/userAlerts";
import { fmtRupee } from "@/lib/format";
import { SkeletonRows } from "../components/Skeleton";
import PushOptInM from "./PushOptInM";
import CreateAlertSheet from "./CreateAlertSheet";

function describe(a: UserAlert): string {
  const val = metricUnit(a.metric) === "₹" ? fmtRupee(a.threshold, 0) : `${a.threshold}%`;
  switch (a.metric) {
    case "price_above":
      return `Price ≥ ${val}`;
    case "price_below":
      return `Price ≤ ${val}`;
    case "target_near":
      return `Within ${a.threshold}% of ${a.target_type ? ALERT_TARGET_LABELS[a.target_type] : "target"}`;
    case "upside_above":
      return `Base upside ≥ ${a.threshold}%`;
    case "pct_move_abs":
      return `Day move ≥ ${a.threshold}%`;
    default:
      return ALERT_METRIC_LABELS[a.metric];
  }
}

export default function AlertsClient({ stocks }: { stocks: MobileStock[] }) {
  const { alerts, loading, error, create, toggle, remove } = useUserAlerts();
  const [pushOn, setPushOn] = useState(false);
  const [creating, setCreating] = useState(false);

  return (
    <div className="m-page">
      <header className="m-pagehead">
        <h1 className="m-title">Alerts</h1>
        <div style={{ display: "flex", gap: "var(--space-2, 8px)", alignItems: "center" }}>
          <Link href="/m/marketplace" className="m-note-add" aria-label="Browse team alerts">
            Team alerts
          </Link>
          <button className="m-note-add" onClick={() => setCreating(true)}>
            + New
          </button>
        </div>
      </header>

      <PushOptInM onSubscribedChange={setPushOn} />
      {!pushOn && alerts.length > 0 && (
        <p className="m-note-err" style={{ fontSize: "var(--text-xs, 12px)" }}>
          Alerts are saved but won&apos;t notify until notifications are on (above).
        </p>
      )}

      {error && <p className="m-note-err" role="alert">{error}</p>}

      {loading ? (
        <SkeletonRows count={3} />
      ) : alerts.length === 0 ? (
        <p className="m-empty">No alerts yet. Tap “+ New” to set a price, target, upside, or day-move alert.</p>
      ) : (
        <div className="m-cardlist">
          {alerts.map((a) => (
            <div key={a.id} className="m-card m-card--static">
              <div className="m-card-row1">
                <div className="m-card-id">
                  <span className="m-card-name">{a.stock_name || a.original_tikr}</span>
                  <span className="m-card-meta">
                    {describe(a)} · {a.one_shot ? "once" : "repeat"}
                  </span>
                </div>
                <span className={`m-alert-state ${a.active ? "is-on" : "is-off"}`}>{a.active ? "On" : "Off"}</span>
              </div>
              <div className="m-alert-actions">
                <button className="m-chip" onClick={() => toggle(a.id, !a.active)}>
                  {a.active ? "Pause" : "Resume"}
                </button>
                <button className="m-chip" onClick={() => remove(a.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <CreateAlertSheet stocks={stocks} onCreate={create} onClose={() => setCreating(false)} />}
    </div>
  );
}
