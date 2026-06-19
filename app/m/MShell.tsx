"use client";
import { usePathname } from "next/navigation";
import TabBar from "./components/TabBar";

export default function MShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="m-shell">
      <main className="m-main">{children}</main>
      <TabBar pathname={pathname} />
    </div>
  );
}
