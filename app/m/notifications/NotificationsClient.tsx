"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/notifications";
import { useNotifications } from "@/lib/mobile/useNotifications";
import { useNotificationsCount } from "@/app/m/NotificationsCountContext";
import { SkeletonRows } from "@/app/m/components/Skeleton";

// ── Helpers ────────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function kindLabel(kind: Notification["kind"]): string {
  switch (kind) {
    case "alert_fire":
      return "Alert";
    case "chat_mention":
      return "Mention";
    case "chat_reply":
      return "Reply";
    default:
      return "Activity";
  }
}

// ── NotifCard ──────────────────────────────────────────────────────────────────

interface NotifCardProps {
  item: Notification;
  onTap: (item: Notification) => void;
}

function NotifCard({ item, onTap }: NotifCardProps) {
  const isUnread = item.read_at === null;
  const label = `${item.title}. ${item.body}. ${relTime(item.created_at)}.${isUnread ? " Unread." : ""}`;

  return (
    <button
      type="button"
      className={`m-notif-card${isUnread ? " m-notif--unread" : ""}`}
      onClick={() => onTap(item)}
      aria-label={label}
    >
      <div className="m-notif-header">
        <span className="m-notif-kind">{kindLabel(item.kind)}</span>
        <span className="m-card-meta">{relTime(item.created_at)}</span>
      </div>
      <span className="m-notif-title">{item.title}</span>
      {item.body ? <span className="m-notif-body">{item.body}</span> : null}
    </button>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function NotificationsClient() {
  const router = useRouter();
  const { items, unreadCount, loading, error, markRead, markAllRead } = useNotifications();
  const { refreshCount } = useNotificationsCount();

  const handleMarkAllRead = useCallback(async () => {
    await markAllRead();
    refreshCount();
  }, [markAllRead, refreshCount]);

  const handleTap = useCallback(
    async (item: Notification) => {
      if (item.read_at === null) {
        await markRead(item.id);
        refreshCount();
      }
      router.push(item.url);
    },
    [markRead, refreshCount, router],
  );

  return (
    <div className="m-page">
      <header className="m-pagehead">
        <h1 className="m-title">Notifications</h1>
        <button
          type="button"
          className="m-chip"
          disabled={unreadCount === 0}
          onClick={handleMarkAllRead}
          aria-label={
            unreadCount === 0
              ? "All notifications read"
              : `Mark all ${unreadCount} notifications as read`
          }
        >
          Mark all read
        </button>
      </header>

      {error && (
        <p className="m-note-err" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <SkeletonRows count={4} />
      ) : items.length === 0 ? (
        <p className="m-empty">No notifications yet.</p>
      ) : (
        <div className="m-cardlist">
          {items.map((item) => (
            <NotifCard key={item.id} item={item} onTap={handleTap} />
          ))}
        </div>
      )}

      {!loading && items.length > 0 && (
        <p className="m-count">
          {items.length} notification{items.length !== 1 ? "s" : ""}
          {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
        </p>
      )}
    </div>
  );
}
