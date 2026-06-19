"use client";
import Link from "next/link";

const TABS = [
  { href: "/m/watchlist", label: "Watch", icon: "◎" },
  { href: "/m/portfolio", label: "Folio", icon: "▦" },
  { href: "/m/alerts", label: "Alerts", icon: "◔" },
  { href: "/m/settings", label: "More", icon: "≡" },
];

export default function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav className="m-tabbar" aria-label="Primary">
      {TABS.map((t) => {
        const active =
          pathname === t.href ||
          pathname.startsWith(t.href + "/") ||
          (t.href === "/m/watchlist" && pathname === "/m");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`m-tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="m-tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span className="m-tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
