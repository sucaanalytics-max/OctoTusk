// Auth is inherited from app/m/layout.tsx (which calls auth() + redirect).
// This page only needs force-dynamic so it is never statically cached.
export const dynamic = "force-dynamic";

import NotificationsClient from "./NotificationsClient";

export default function NotificationsPage() {
  return <NotificationsClient />;
}
