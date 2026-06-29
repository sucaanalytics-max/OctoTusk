// Notifications inbox: shared types + guards. PURE + client-safe (mirrors lib/userAlerts.ts;
// no server-only imports). Rows are written SERVER-SIDE ONLY (the alerts engine writes
// 'alert_fire'; the chat route writes 'chat_mention'/'chat_reply'); the client never creates one.
// The client-facing shape OMITS user_email (every row the client sees is already its own).

export type NotificationKind = "alert_fire" | "chat_mention" | "chat_reply";

export const NOTIFICATION_KINDS: NotificationKind[] = ["alert_fire", "chat_mention", "chat_reply"];

export interface Notification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  stock_key: string | null;
  ref_id: number | null;
  read_at: string | null; // null = unread
  created_at: string;
}

export function isNotificationKind(v: unknown): v is NotificationKind {
  return typeof v === "string" && (NOTIFICATION_KINDS as string[]).includes(v);
}
