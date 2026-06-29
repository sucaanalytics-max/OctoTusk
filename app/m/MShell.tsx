"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import TabBar from "./components/TabBar";
import { NotificationsCountProvider, useNotificationsCount } from "./NotificationsCountContext";

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { unreadCount } = useNotificationsCount();

  // Re-apply a stored theme preference over the server-rendered dark default
  // (the Settings toggle writes octotusk-theme; default stays OLED-dark).
  useEffect(() => {
    try {
      const v = sessionStorage.getItem("octotusk-theme");
      if (v === "light" || v === "dark") {
        document.querySelector("[data-mroot]")?.setAttribute("data-theme", v);
      }
    } catch {
      /* private mode */
    }
  }, []);

  return (
    <div className="m-shell">
      <main className="m-main">{children}</main>
      <TabBar pathname={pathname} unreadCount={unreadCount} />
    </div>
  );
}

export default function MShell({ children }: { children: React.ReactNode }) {
  return (
    <NotificationsCountProvider>
      <ShellInner>{children}</ShellInner>
    </NotificationsCountProvider>
  );
}
