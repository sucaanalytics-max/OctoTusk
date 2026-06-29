"use client";
import Link from "next/link";

const TABS = [
  { href: "/m/watchlist", label: "Watch", icon: "◎" },
  { href: "/m/portfolio", label: "Folio", icon: "▦" },
  { href: "/m/alerts", label: "Alerts", icon: "◔" },
  { href: "/m/notifications", label: "Activity", icon: "🔔" },
  { href: "/m/settings", label: "More", icon: "≡" },
];

export default function TabBar({
  pathname,
  unreadCount = 0,
}: {
  pathname: string;
  unreadCount?: number;
}) {
  return (
    <nav className="m-tabbar m-tabbar--5" aria-label="Primary">
      {TABS.map((t) => {
        const active =
          pathname === t.href ||
          pathname.startsWith(t.href + "/") ||
          (t.href === "/m/watchlist" && pathname === "/m");
        const isNotif = t.href === "/m/notifications";
        const badge = isNotif && unreadCount > 0 ? unreadCount : 0;
        const ariaLabel = isNotif && badge > 0
          ? `Activity, ${badge > 9 ? "9+" : badge} unread`
          : t.label;

        return (
          <Link
            key={t.href}
            href={t.href}
            className={`m-tab${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-label={ariaLabel}
          >
            <span className="m-tab-icon" aria-hidden>
              {t.icon}
              {badge > 0 && (
                <span className="m-tabbadge" aria-hidden>
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </span>
            <span className="m-tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
