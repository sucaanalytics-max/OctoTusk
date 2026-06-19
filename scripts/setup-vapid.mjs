// Generates a VAPID keypair for Web Push and writes it to .env.local (idempotent).
// Prints ONLY the public key + subject (the private key is never echoed).
// Run: node scripts/setup-vapid.mjs
import webpush from "web-push";
import { appendFileSync, readFileSync } from "node:fs";

const SUBJECT = "mailto:jay.bansal@tuskinvest.com";
const ENV = ".env.local";

let cur = "";
try {
  cur = readFileSync(ENV, "utf8");
} catch {
  /* file may not exist */
}
if (cur.includes("VAPID_PRIVATE_KEY=")) {
  const pub = (cur.match(/^VAPID_PUBLIC_KEY=(.*)$/m) || [])[1] || "(present)";
  console.log("VAPID already in .env.local — keeping existing keypair.");
  console.log("PUBLIC KEY:", pub);
  process.exit(0);
}

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
appendFileSync(
  ENV,
  `\n# Web Push (VAPID) — same keypair must be used across all environments\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\nVAPID_SUBJECT=${SUBJECT}\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}\n`
);
console.log("VAPID keypair generated and written to .env.local ✓");
console.log("PUBLIC KEY:", publicKey);
console.log("SUBJECT   :", SUBJECT);
console.log("(private key stored in .env.local only — not printed)");
