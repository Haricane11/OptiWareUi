"use client";

import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow, parseISO } from "date-fns";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

export function NotificationIcon() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications?read=false`);
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data = await res.json();
      
      setNotifications(data);
      setUnreadCount(data.length);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchNotifications();
  }, []);

  const markAsRead = async (id) => {
    try {
      // Ensure this URL also matches your backend's expected trailing slash pattern if needed
      const res = await fetch(`${API_BASE}/notifications/${id}/read/`, {
        method: "PATCH",
      });
      
      if (!res.ok) throw new Error("Failed to mark notification as read");
      
      // Local update to UI for instant feedback before the next poll
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between p-4">
          <h4 className="text-sm font-medium">Notifications</h4>
        </div>
        <Separator />
        <ScrollArea className="h-72">
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No new notifications.</p>
          ) : (
            <div key="notification-list-wrapper">
              {notifications.map((notification) => (
                <div key={notification.id} className="p-4 hover:bg-gray-50">
                  <p className="text-sm">{notification.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {notification.created_at 
                      ? formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true })
                      : "Just now"}
                  </p>
                  {!notification.read && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs mt-2"
                      onClick={() => markAsRead(notification.id)}
                    >
                      Mark as Read
                    </Button>
                  )}
                  <Separator className="mt-2" />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}