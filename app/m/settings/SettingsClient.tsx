"use client";
import Link from "next/link";
import { useTheme } from "@/lib/mobile/useTheme";
import PushOptInM from "../alerts/PushOptInM";

export default function SettingsClient() {
  const { theme, setTheme } = useTheme();

  return (
    <>
      <div className="m-fgroup">
        <span className="m-flabel">Appearance</span>
        <div className="m-seg">
          <button
            className={`m-seg-btn${theme === "dark" ? " is-active" : ""}`}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme("dark")}
          >
            Dark
          </button>
          <button
            className={`m-seg-btn${theme === "light" ? " is-active" : ""}`}
            aria-pressed={theme === "light"}
            onClick={() => setTheme("light")}
          >
            Light
          </button>
        </div>
      </div>

      <div className="m-fgroup">
        <span className="m-flabel">Notifications</span>
        <PushOptInM />
      </div>

      <div className="m-fgroup">
        <span className="m-flabel">Team</span>
        <Link href="/m/marketplace" className="m-row-link">
          Browse team alerts ›
        </Link>
      </div>
    </>
  );
}
