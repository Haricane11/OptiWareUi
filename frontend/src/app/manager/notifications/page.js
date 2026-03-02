"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Bell } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // all | unread | read

  const load = async (flt = filter) => {
    try {
      setLoading(true);
      setError("");
      const base = `${API_BASE.replace(/\/$/, "")}/notifications`;
      const qs =
        flt === "unread" ? "?read=false" : flt === "read" ? "?read=true" : "";
      const res = await fetch(`${base}${qs}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await fetch(`${API_BASE.replace(/\/$/, "")}/notifications/${id}/read`, { method: "PATCH" });
      load("unread");
    } catch {}
  };

  const markAllAsRead = async () => {
    const unread = items.filter((n) => !n.read);
    for (const n of unread) {
      try {
        // Fire and forget to speed up
        fetch(`${API_BASE.replace(/\/$/, "")}/notifications/${n.id}/read`, { method: "PATCH" });
      } catch {}
    }
    // Quick UI feedback
    load(filter);
  };

  useEffect(() => {
    load("all");
  }, []);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Bell size={18} />
          Notifications
        </h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/50">
            {["all", "unread", "read"].map((f) => (
              <button
                key={f}
                className={`px-3 py-1.5 text-sm rounded-md ${filter === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                onClick={() => {
                  setFilter(f);
                  load(f);
                }}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => load(filter)} disabled={loading}>
            Refresh
          </Button>
          <Button variant="outline" onClick={markAllAsRead} disabled={items.every((n) => n.read)}>
            Mark all as read
          </Button>
        </div>
      </div>
      <Separator className="mb-4" />
      {error && <div className="text-sm text-destructive mb-3">{error}</div>}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No notifications.</div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <div key={n.id} className="rounded-lg border border-border p-4 bg-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />}
                    <div className="text-sm">{n.message}</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {n.created_at ? formatDistanceToNow(parseISO(n.created_at), { addSuffix: true }) : ""}
                  </div>
                </div>
                {!n.read && (
                  <Button size="sm" variant="outline" onClick={() => markAsRead(n.id)}>
                    Mark as read
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
