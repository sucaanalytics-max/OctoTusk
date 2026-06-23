"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import TabBar from "./components/TabBar";

export default function MShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
      <TabBar pathname={pathname} />
    </div>
  );
}
