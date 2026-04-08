"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ──
export interface Holding {
  asset_name: string;
  quantity: number;
  avg_price: number;
  amt_invested: number;
  current_price: number;
  overall_gain: number;
  overall_gain_pct: number;
  current_value: number;
}

export interface StoredPortfolio {
  id: string;
  name: string;
  pinHash: string | null;
  holdings: Holding[];
  createdAt: string;
  updatedAt: string;
}

interface EnrichedStockMinimal {
  tikr: string;
  official_name?: string;
  companyShort: string;
  displayTikr: string;
}

interface PortfolioManagerProps {
  activePortfolioId: string;
  onPortfolioSelect: (id: string) => void;
  onHoldingsChange: (holdings: Holding[]) => void;
  tuskUnlocked: boolean;
  enrichedStocks: EnrichedStockMinimal[];
  onUploadedPinVerified: (portfolioId: string) => void;
  unlockedPortfolios: Set<string>;
}

// ── Constants ──
const STORAGE_KEY = "octotusk_portfolios";
const MAX_PORTFOLIOS = 5;

// ── Column aliases for flexible xlsx parsing ──
const COLUMN_ALIASES: Record<string, string[]> = {
  asset_name: ["asset_name", "asset name", "name", "stock", "stock name", "company", "scrip", "symbol"],
  quantity: ["quantity", "qty", "shares", "units", "no of shares", "no. of shares"],
  avg_price: ["avg_price", "avg price", "average price", "buy price", "cost", "avg cost", "average cost", "buy avg"],
  amt_invested: ["amt_invested", "amt invested", "amount invested", "invested", "investment", "total cost"],
  current_price: ["current_price", "current price", "cmp", "ltp", "last price", "market price"],
  overall_gain: ["overall_gain", "overall gain", "gain", "profit", "unrealized gain", "unrealised gain"],
  overall_gain_pct: ["overall_gain_pct", "overall gain pct", "gain %", "gain pct", "profit %", "return %"],
  current_value: ["current_value", "current value", "value", "market value", "present value"],
};

// ── Helpers ──
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function loadPortfolios(): StoredPortfolio[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function savePortfolios(portfolios: StoredPortfolio[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolios));
    return true;
  } catch {
    return false; // QuotaExceededError
  }
}

function matchColumn(header: string): string | null {
  const h = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some(a => h === a || h.replace(/[^a-z0-9]/g, "") === a.replace(/[^a-z0-9]/g, ""))) return field;
  }
  return null;
}

function computeDerivedFields(h: Partial<Holding>): Holding {
  const qty = h.quantity || 0;
  const avg = h.avg_price || 0;
  const invested = h.amt_invested ?? qty * avg;
  const price = h.current_price ?? avg;
  const value = h.current_value ?? qty * price;
  const gain = h.overall_gain ?? value - invested;
  const gainPct = h.overall_gain_pct ?? (invested > 0 ? (gain / invested) * 100 : 0);
  return {
    asset_name: h.asset_name || "",
    quantity: qty,
    avg_price: avg,
    amt_invested: invested,
    current_price: price,
    current_value: value,
    overall_gain: gain,
    overall_gain_pct: gainPct,
  };
}

// ── Component ──
export default function PortfolioManager({
  activePortfolioId,
  onPortfolioSelect,
  onHoldingsChange,
  tuskUnlocked,
  enrichedStocks,
  onUploadedPinVerified,
  unlockedPortfolios,
}: PortfolioManagerProps) {
  const [portfolios, setPortfolios] = useState<StoredPortfolio[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<{ index: number; holding: Holding } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageMenu, setShowManageMenu] = useState<string | null>(null);
  const [showRenameModal, setShowRenameModal] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [storageError, setStorageError] = useState("");

  // Upload modal state
  const [uploadName, setUploadName] = useState("");
  const [uploadPin, setUploadPin] = useState("");
  const [uploadPinConfirm, setUploadPinConfirm] = useState("");
  const [uploadPinEnabled, setUploadPinEnabled] = useState(false);
  const [parsedHoldings, setParsedHoldings] = useState<Holding[]>([]);
  const [parseError, setParseError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // PIN gate state for uploaded portfolios
  const [portfolioPin, setPortfolioPin] = useState("");
  const [portfolioPinError, setPortfolioPinError] = useState("");

  // Add holding state
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addAvgPrice, setAddAvgPrice] = useState("");
  const [addSuggestions, setAddSuggestions] = useState<EnrichedStockMinimal[]>([]);

  // Load portfolios from localStorage on mount
  useEffect(() => {
    setPortfolios(loadPortfolios());
  }, []);

  // When active portfolio changes, load its holdings
  useEffect(() => {
    if (activePortfolioId === "tusk") return;
    const p = portfolios.find(p => p.id === activePortfolioId);
    if (p && (unlockedPortfolios.has(p.id) || !p.pinHash)) {
      onHoldingsChange(p.holdings);
    }
  }, [activePortfolioId, portfolios, unlockedPortfolios]); // eslint-disable-line react-hooks/exhaustive-deps

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId);
  const needsPin = activePortfolioId !== "tusk" && activePortfolio?.pinHash && !unlockedPortfolios.has(activePortfolioId);

  // ── File parsing ──
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");
    setParsedHoldings([]);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      if (rows.length === 0) { setParseError("No data rows found in the file."); return; }

      // Map headers
      const sampleRow = rows[0];
      const headerMap: Record<string, string> = {};
      for (const key of Object.keys(sampleRow)) {
        const matched = matchColumn(key);
        if (matched) headerMap[key] = matched;
      }

      if (!Object.values(headerMap).includes("asset_name")) { setParseError("Could not find 'Asset Name' column. Check your headers."); return; }
      if (!Object.values(headerMap).includes("quantity")) { setParseError("Could not find 'Quantity' column. Check your headers."); return; }
      if (!Object.values(headerMap).includes("avg_price")) { setParseError("Could not find 'Avg Price' column. Check your headers."); return; }

      const holdings: Holding[] = [];
      let skipped = 0;
      for (const row of rows) {
        const partial: Partial<Holding> = {};
        for (const [rawKey, field] of Object.entries(headerMap)) {
          const val = row[rawKey];
          if (field === "asset_name") {
            partial.asset_name = String(val || "").trim();
          } else {
            const num = typeof val === "number" ? val : parseFloat(String(val || "").replace(/[₹,]/g, ""));
            if (!isNaN(num)) (partial as Record<string, unknown>)[field] = num;
          }
        }
        // Skip rows with empty name or zero qty+price
        if (!partial.asset_name || ((!partial.quantity || partial.quantity === 0) && (!partial.avg_price || partial.avg_price === 0))) {
          skipped++;
          continue;
        }
        holdings.push(computeDerivedFields(partial));
      }

      if (holdings.length === 0) {
        setParseError(`No valid holdings found. ${skipped} rows were skipped.`);
        return;
      }
      setParsedHoldings(holdings);
      if (!uploadName && file.name) {
        setUploadName(file.name.replace(/\.(xlsx|xls|csv)$/i, "").replace(/[_-]/g, " ").trim().slice(0, 30));
      }
    } catch (err) {
      setParseError(`Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }, [uploadName]);

  // ── Save new portfolio ──
  const handleImport = async () => {
    if (!uploadName.trim() || parsedHoldings.length === 0) return;
    if (uploadPinEnabled && uploadPin !== uploadPinConfirm) { setParseError("PINs do not match."); return; }
    if (portfolios.length >= MAX_PORTFOLIOS) { setParseError(`Maximum ${MAX_PORTFOLIOS} portfolios reached.`); return; }

    setUploading(true);
    const pinHash = uploadPinEnabled && uploadPin ? await hashPin(uploadPin) : null;
    const newPortfolio: StoredPortfolio = {
      id: crypto.randomUUID(),
      name: uploadName.trim().slice(0, 30),
      pinHash,
      holdings: parsedHoldings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...portfolios, newPortfolio];
    if (!savePortfolios(updated)) {
      setStorageError("Storage full. Delete an existing portfolio first.");
      setUploading(false);
      return;
    }

    setPortfolios(updated);
    resetUploadModal();
    setUploading(false);

    // Auto-select and unlock (no PIN needed for initial upload session)
    onPortfolioSelect(newPortfolio.id);
    onHoldingsChange(newPortfolio.holdings);
    if (pinHash) onUploadedPinVerified(newPortfolio.id);
  };

  const resetUploadModal = () => {
    setShowUploadModal(false);
    setUploadName("");
    setUploadPin("");
    setUploadPinConfirm("");
    setUploadPinEnabled(false);
    setParsedHoldings([]);
    setParseError("");
    setStorageError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Unlock uploaded portfolio ──
  const verifyPortfolioPin = async () => {
    if (!activePortfolio?.pinHash) return;
    const hash = await hashPin(portfolioPin);
    if (hash === activePortfolio.pinHash) {
      onUploadedPinVerified(activePortfolio.id);
      onHoldingsChange(activePortfolio.holdings);
      setPortfolioPin("");
      setPortfolioPinError("");
    } else {
      setPortfolioPinError("Invalid PIN");
    }
  };

  // ── CRUD ──
  const updatePortfolioHoldings = (portfolioId: string, holdings: Holding[]) => {
    const updated = portfolios.map(p =>
      p.id === portfolioId ? { ...p, holdings, updatedAt: new Date().toISOString() } : p
    );
    if (!savePortfolios(updated)) { setStorageError("Storage full."); return; }
    setPortfolios(updated);
    if (activePortfolioId === portfolioId) onHoldingsChange(holdings);
  };

  const handleDeleteHolding = (index: number) => {
    if (!activePortfolio) return;
    const updated = activePortfolio.holdings.filter((_, i) => i !== index);
    updatePortfolioHoldings(activePortfolio.id, updated);
  };

  const handleEditHolding = (index: number) => {
    if (!activePortfolio) return;
    setEditingHolding({ index, holding: { ...activePortfolio.holdings[index] } });
    setShowEditModal(true);
  };

  const saveEditHolding = () => {
    if (!activePortfolio || !editingHolding) return;
    const updated = [...activePortfolio.holdings];
    updated[editingHolding.index] = computeDerivedFields(editingHolding.holding);
    updatePortfolioHoldings(activePortfolio.id, updated);
    setShowEditModal(false);
    setEditingHolding(null);
  };

  const handleAddHolding = () => {
    if (!activePortfolio || !addName.trim()) return;
    const qty = parseFloat(addQty) || 0;
    const avg = parseFloat(addAvgPrice) || 0;
    if (qty <= 0 || avg <= 0) return;
    const newHolding = computeDerivedFields({ asset_name: addName.trim(), quantity: qty, avg_price: avg });
    const updated = [...activePortfolio.holdings, newHolding];
    updatePortfolioHoldings(activePortfolio.id, updated);
    setShowAddModal(false);
    setAddName("");
    setAddQty("");
    setAddAvgPrice("");
    setAddSuggestions([]);
  };

  // ── Portfolio management ──
  const deletePortfolio = (id: string) => {
    const updated = portfolios.filter(p => p.id !== id);
    savePortfolios(updated);
    setPortfolios(updated);
    setShowManageMenu(null);
    if (activePortfolioId === id) {
      onPortfolioSelect("tusk");
      onHoldingsChange([]);
    }
  };

  const renamePortfolio = (id: string, newName: string) => {
    const updated = portfolios.map(p => p.id === id ? { ...p, name: newName.trim().slice(0, 30), updatedAt: new Date().toISOString() } : p);
    savePortfolios(updated);
    setPortfolios(updated);
    setShowRenameModal(null);
    setRenameValue("");
  };

  // ── Template download ──
  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = ["Asset Name", "Quantity", "Avg Price", "Amt Invested", "Current Price"];
    const sampleData = [
      ["HDFC Bank", 100, 1500, 150000, 1650],
      ["Reliance Industries", 50, 2400, 120000, 2550],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Portfolio");
    XLSX.writeFile(wb, "OctoTusk_Portfolio_Template.xlsx");
  };

  // ── Autocomplete for add holding ──
  const handleAddNameChange = (val: string) => {
    setAddName(val);
    if (val.length >= 2) {
      const lower = val.toLowerCase();
      setAddSuggestions(enrichedStocks.filter(s =>
        s.tikr.toLowerCase().includes(lower) ||
        s.companyShort.toLowerCase().includes(lower) ||
        (s.official_name?.toLowerCase().includes(lower))
      ).slice(0, 8));
    } else {
      setAddSuggestions([]);
    }
  };

  // Close manage menu on outside click
  useEffect(() => {
    if (!showManageMenu) return;
    const handler = () => setShowManageMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [showManageMenu]);

  const isUploadedPortfolio = activePortfolioId !== "tusk";

  return (
    <>
      {/* ── Pill Switcher Row ── */}
      <div className="portfolio-pill-row">
        {/* Tusk Investments pill */}
        <button
          className={`portfolio-pill ${activePortfolioId === "tusk" ? "portfolio-pill-active" : ""}`}
          onClick={() => { onPortfolioSelect("tusk"); setPortfolioPin(""); setPortfolioPinError(""); }}
        >
          {!tuskUnlocked && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4, opacity: 0.6 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          )}
          Tusk Investments
        </button>

        {/* Uploaded portfolio pills */}
        {portfolios.map(p => (
          <div key={p.id} style={{ position: "relative", display: "inline-flex" }}>
            <button
              className={`portfolio-pill ${activePortfolioId === p.id ? "portfolio-pill-active" : ""}`}
              onClick={() => { onPortfolioSelect(p.id); setPortfolioPin(""); setPortfolioPinError(""); }}
            >
              {p.pinHash && !unlockedPortfolios.has(p.id) && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4, opacity: 0.6 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
              )}
              {p.name}
            </button>
            {/* Gear icon for manage */}
            <button
              className="portfolio-pill-gear"
              onClick={(e) => { e.stopPropagation(); setShowManageMenu(showManageMenu === p.id ? null : p.id); }}
              title="Manage portfolio"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
            {/* Dropdown menu */}
            {showManageMenu === p.id && (
              <div className="portfolio-manage-menu" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setShowRenameModal(p.id); setRenameValue(p.name); setShowManageMenu(null); }}>Rename</button>
                <button onClick={() => { if (confirm(`Delete "${p.name}"? This cannot be undone.`)) deletePortfolio(p.id); }} style={{ color: "var(--color-negative)" }}>Delete</button>
              </div>
            )}
          </div>
        ))}

        {/* Add button */}
        {portfolios.length < MAX_PORTFOLIOS && (
          <button className="portfolio-pill portfolio-pill-add" onClick={() => setShowUploadModal(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add
          </button>
        )}
      </div>

      {/* ── Storage Error Toast ── */}
      {storageError && (
        <div style={{ padding: "var(--space-2) var(--space-3)", background: "var(--color-negative)", color: "#fff", borderRadius: 8, marginBottom: "var(--space-3)", fontSize: "var(--text-sm)" }}>
          {storageError}
          <button onClick={() => setStorageError("")} style={{ marginLeft: 8, opacity: 0.8 }}>✕</button>
        </div>
      )}

      {/* ── PIN Gate for uploaded portfolios ── */}
      {needsPin && (
        <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
          <div className="metric-card text-center max-w-sm w-full animate-fade-in-up">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "var(--color-bg-hover)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-muted)" }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <h2 className="font-bold mb-2" style={{ fontSize: "var(--text-xl)", color: "var(--color-text-primary)" }}>{activePortfolio?.name}</h2>
            <p className="mb-6" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>Enter PIN to access this portfolio</p>
            <input type="password" placeholder="Enter PIN" value={portfolioPin} onChange={e => setPortfolioPin(e.target.value)} onKeyDown={e => e.key === "Enter" && verifyPortfolioPin()} className="input-dark w-full text-center text-lg tracking-widest mb-3" style={{ padding: "var(--space-3) var(--space-4)" }} />
            {portfolioPinError && <p className="mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-negative)" }}>{portfolioPinError}</p>}
            <button onClick={verifyPortfolioPin} disabled={!portfolioPin} className="btn btn-primary w-full" style={{ padding: "var(--space-3)" }}>Unlock</button>
          </div>
        </div>
      )}

      {/* ── CRUD toolbar for uploaded portfolios ── */}
      {isUploadedPortfolio && !needsPin && activePortfolio && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <button className="btn btn-primary" style={{ padding: "var(--space-1) var(--space-3)", fontSize: "var(--text-sm)" }} onClick={() => setShowAddModal(true)}>
            + Add Holding
          </button>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            {activePortfolio.holdings.length} holdings
          </span>
        </div>
      )}

      {/* ── Upload Modal ── */}
      {showUploadModal && (
        <div className="portfolio-modal-overlay" onClick={resetUploadModal}>
          <div className="portfolio-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
              <h2 className="font-bold" style={{ fontSize: "var(--text-lg)", color: "var(--color-text-primary)" }}>Upload Portfolio</h2>
              <button onClick={resetUploadModal} style={{ color: "var(--color-text-muted)", fontSize: 20, cursor: "pointer", background: "none", border: "none" }}>✕</button>
            </div>

            {/* Portfolio name */}
            <label className="portfolio-modal-label">Portfolio Name</label>
            <input type="text" value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. My Zerodha Portfolio" maxLength={30} className="input-dark w-full mb-3" style={{ padding: "var(--space-2) var(--space-3)" }} />

            {/* File upload */}
            <label className="portfolio-modal-label">Excel File (.xlsx)</label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="mb-3" style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }} />

            {/* Template download */}
            <button onClick={downloadTemplate} style={{ fontSize: "var(--text-xs)", color: "var(--color-accent-blue)", background: "none", border: "none", cursor: "pointer", marginBottom: "var(--space-3)", textDecoration: "underline" }}>
              Download template file
            </button>

            {/* Optional PIN */}
            <div style={{ marginBottom: "var(--space-3)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
                <input type="checkbox" checked={uploadPinEnabled} onChange={e => setUploadPinEnabled(e.target.checked)} />
                Set PIN protection
              </label>
              {uploadPinEnabled && (
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                  <input type="password" value={uploadPin} onChange={e => setUploadPin(e.target.value)} placeholder="PIN" className="input-dark" style={{ flex: 1, padding: "var(--space-2) var(--space-3)" }} />
                  <input type="password" value={uploadPinConfirm} onChange={e => setUploadPinConfirm(e.target.value)} placeholder="Confirm PIN" className="input-dark" style={{ flex: 1, padding: "var(--space-2) var(--space-3)" }} />
                </div>
              )}
            </div>

            {/* Parse errors */}
            {parseError && <p style={{ fontSize: "var(--text-sm)", color: "var(--color-negative)", marginBottom: "var(--space-2)" }}>{parseError}</p>}

            {/* Preview table */}
            {parsedHoldings.length > 0 && (
              <div style={{ marginBottom: "var(--space-3)" }}>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", marginBottom: "var(--space-2)" }}>
                  Preview: {parsedHoldings.length} holdings found
                </p>
                <div className="overflow-auto" style={{ maxHeight: 200, border: "1px solid var(--color-border)", borderRadius: 8 }}>
                  <table className="data-table w-full" style={{ fontSize: "var(--text-xs)" }}>
                    <thead><tr><th>Stock</th><th>Qty</th><th>Avg Price</th><th>Invested</th></tr></thead>
                    <tbody>
                      {parsedHoldings.slice(0, 20).map((h, i) => (
                        <tr key={i}>
                          <td>{h.asset_name}</td>
                          <td style={{ fontFamily: "var(--font-mono)" }}>{h.quantity}</td>
                          <td style={{ fontFamily: "var(--font-mono)" }}>₹{h.avg_price.toFixed(2)}</td>
                          <td style={{ fontFamily: "var(--font-mono)" }}>₹{h.amt_invested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                      {parsedHoldings.length > 20 && (
                        <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--color-text-muted)" }}>...and {parsedHoldings.length - 20} more</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Import button */}
            <button
              className="btn btn-primary w-full"
              style={{ padding: "var(--space-3)" }}
              disabled={!uploadName.trim() || parsedHoldings.length === 0 || uploading}
              onClick={handleImport}
            >
              {uploading ? "Importing..." : `Import ${parsedHoldings.length} Holdings`}
            </button>
          </div>
        </div>
      )}

      {/* ── Edit Holding Modal ── */}
      {showEditModal && editingHolding && (
        <div className="portfolio-modal-overlay" onClick={() => { setShowEditModal(false); setEditingHolding(null); }}>
          <div className="portfolio-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h2 className="font-bold mb-4" style={{ fontSize: "var(--text-lg)", color: "var(--color-text-primary)" }}>Edit Holding</h2>
            <label className="portfolio-modal-label">Stock Name</label>
            <input type="text" value={editingHolding.holding.asset_name} onChange={e => setEditingHolding({ ...editingHolding, holding: { ...editingHolding.holding, asset_name: e.target.value } })} className="input-dark w-full mb-3" style={{ padding: "var(--space-2) var(--space-3)" }} />
            <label className="portfolio-modal-label">Quantity</label>
            <input type="number" value={editingHolding.holding.quantity} onChange={e => setEditingHolding({ ...editingHolding, holding: { ...editingHolding.holding, quantity: parseFloat(e.target.value) || 0 } })} className="input-dark w-full mb-3" style={{ padding: "var(--space-2) var(--space-3)" }} />
            <label className="portfolio-modal-label">Avg Price</label>
            <input type="number" value={editingHolding.holding.avg_price} onChange={e => setEditingHolding({ ...editingHolding, holding: { ...editingHolding.holding, avg_price: parseFloat(e.target.value) || 0 } })} className="input-dark w-full mb-3" style={{ padding: "var(--space-2) var(--space-3)" }} />
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: "var(--space-2)" }} onClick={saveEditHolding}>Save</button>
              <button className="btn" style={{ flex: 1, padding: "var(--space-2)", border: "1px solid var(--color-border)" }} onClick={() => { setShowEditModal(false); setEditingHolding(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Holding Modal ── */}
      {showAddModal && (
        <div className="portfolio-modal-overlay" onClick={() => { setShowAddModal(false); setAddName(""); setAddQty(""); setAddAvgPrice(""); setAddSuggestions([]); }}>
          <div className="portfolio-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h2 className="font-bold mb-4" style={{ fontSize: "var(--text-lg)", color: "var(--color-text-primary)" }}>Add Holding</h2>
            <label className="portfolio-modal-label">Stock Name</label>
            <div style={{ position: "relative" }}>
              <input type="text" value={addName} onChange={e => handleAddNameChange(e.target.value)} placeholder="Start typing stock name..." className="input-dark w-full mb-1" style={{ padding: "var(--space-2) var(--space-3)" }} />
              {addSuggestions.length > 0 && (
                <div className="portfolio-autocomplete">
                  {addSuggestions.map(s => (
                    <button key={s.tikr} onClick={() => { setAddName(s.official_name || s.companyShort); setAddSuggestions([]); }}>
                      <span style={{ fontWeight: 600 }}>{s.displayTikr}</span>
                      <span style={{ color: "var(--color-text-muted)", marginLeft: 8 }}>{s.companyShort}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="portfolio-modal-label" style={{ marginTop: "var(--space-2)" }}>Quantity</label>
            <input type="number" value={addQty} onChange={e => setAddQty(e.target.value)} className="input-dark w-full mb-3" style={{ padding: "var(--space-2) var(--space-3)" }} />
            <label className="portfolio-modal-label">Avg Price (₹)</label>
            <input type="number" value={addAvgPrice} onChange={e => setAddAvgPrice(e.target.value)} className="input-dark w-full mb-3" style={{ padding: "var(--space-2) var(--space-3)" }} />
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: "var(--space-2)" }} disabled={!addName.trim() || !parseFloat(addQty) || !parseFloat(addAvgPrice)} onClick={handleAddHolding}>Add</button>
              <button className="btn" style={{ flex: 1, padding: "var(--space-2)", border: "1px solid var(--color-border)" }} onClick={() => { setShowAddModal(false); setAddName(""); setAddQty(""); setAddAvgPrice(""); setAddSuggestions([]); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename Modal ── */}
      {showRenameModal && (
        <div className="portfolio-modal-overlay" onClick={() => setShowRenameModal(null)}>
          <div className="portfolio-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 350 }}>
            <h2 className="font-bold mb-4" style={{ fontSize: "var(--text-lg)", color: "var(--color-text-primary)" }}>Rename Portfolio</h2>
            <input type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)} maxLength={30} className="input-dark w-full mb-3" style={{ padding: "var(--space-2) var(--space-3)" }} onKeyDown={e => { if (e.key === "Enter" && renameValue.trim()) renamePortfolio(showRenameModal, renameValue); }} />
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: "var(--space-2)" }} disabled={!renameValue.trim()} onClick={() => renamePortfolio(showRenameModal, renameValue)}>Save</button>
              <button className="btn" style={{ flex: 1, padding: "var(--space-2)", border: "1px solid var(--color-border)" }} onClick={() => setShowRenameModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Export helpers for DashboardClient ──
export { loadPortfolios, computeDerivedFields };
