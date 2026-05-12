import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Octopus · Tusk Coverage",
  description: "Always-on market view of Tusk Investments' research coverage.",
};

export default function OctopusLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
