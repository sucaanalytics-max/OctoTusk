/**
 * Display-name helpers shared by the dashboard and the alerts engine.
 * Moved out of DashboardClient so server routes can render the same
 * short names (vF standalone tikrs can be 40+ char official names).
 */

export const cleanTikr = (tikr: string | null | undefined): string => {
  if (!tikr || typeof tikr !== "string") return "";
  if (tikr.includes("(XNSE:")) { const m = tikr.match(/\(XNSE:(\w+)\)/); return m ? m[1] : tikr; }
  if (tikr.includes("(XBOM:")) { const m = tikr.match(/\(XBOM:(\w+)\)/); return m ? m[1] : tikr; }
  if (tikr.startsWith("XNSE:")) return tikr.replace("XNSE:", "");
  if (tikr.startsWith("XBOM:")) return tikr.replace("XBOM:", "");
  if (tikr.includes(" ")) return tikr.split(" ")[0];
  return tikr;
};

export const toTitleCase = (str: string): string => {
  const lower = ["and", "of", "the", "in", "for", "at", "by", "to", "or"];
  const upper = ["AMC", "REIT", "ETF", "IT", "LTD", "NBFC", "PSU", "SBI", "ICICI", "HDFC", "IDFC", "PNB", "IIFL", "CSB", "BSE", "MCX", "IEX", "NSE", "CDSL", "REC", "PFC", "HUDCO", "NTPC", "CESC", "BPCL", "IOC", "SPML", "GPT", "E2E", "JM", "PCBL", "VBL", "SML", "TMB", "LIC"];
  return str.split(" ").map((w, i) => {
    const u = w.toUpperCase();
    if (upper.includes(u)) return u;
    if (i > 0 && lower.includes(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
};

export const getCompanyShort = (stock: { official_name?: string | null; tikr?: string | null }): string => {
  const name = String(stock.official_name || stock.tikr || "");
  if (!name) return cleanTikr(stock.tikr);
  return toTitleCase(name.replace(/ LIMITED$/i, "").replace(/ LTD$/i, "").replace(/ PRIVATE$/i, "").replace(/ CORPORATION LIMITED$/i, "").replace(/ CORPORATION$/i, "").trim());
};
