import { auth, signOut } from "@/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const email = String(session?.user?.email ?? "");

  return (
    <div className="m-page">
      <header className="m-pagehead">
        <h1 className="m-title">More</h1>
      </header>

      <div className="m-card m-card--static">
        <span className="m-card-meta">Signed in as</span>
        <span className="m-card-name">{email || "—"}</span>
      </div>

      <a className="m-row-link" href="/dashboard">
        Open desktop dashboard ›
      </a>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit" className="m-signout">
          Sign out
        </button>
      </form>

      <p className="m-count">OctoTusk mobile · v1</p>
    </div>
  );
}
