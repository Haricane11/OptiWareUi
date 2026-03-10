"use client";

import { useEffect, useState } from "react";
import { Plus, Search, User, X, Trash2, Pencil, Warehouse } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

function apiBase() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) msg = typeof data.detail === "string" ? data.detail : msg;
    } catch { }
    throw new Error(msg);
  }
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) msg = typeof data.detail === "string" ? data.detail : msg;
    } catch { }
    throw new Error(msg);
  }
  return res.json();
}

async function putJson(url, body) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) msg = typeof data.detail === "string" ? data.detail : msg;
    } catch { }
    throw new Error(msg);
  }
  return res.json();
}

async function deleteJson(url) {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    let msg = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.detail) msg = typeof data.detail === "string" ? data.detail : msg;
    } catch { }
    throw new Error(msg);
  }
  return res.json();
}

export default function StaffManagement() {
  const { toast } = useToast();
  const [staff, setStaff] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("All");

  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    warehouse_id: "",
    zone_id: "",
    team: "",
    status: "active",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [users, whs] = await Promise.all([
        fetchJson(`${apiBase()}/users`),
        fetchJson(`${apiBase()}/warehouses`),
      ]);
      setStaff(users);
      setWarehouses(whs);
    } catch (e) {
      setError(e.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm({ 
      username: "", 
      password: "", 
      warehouse_id: "", 
      zone_id: "",
      team: (selectedTeam !== "All" && selectedTeam !== "No Team") ? selectedTeam : "", 
      status: "active" 
    });
    setOpenModal(true);
  };

  const handleOpenEdit = (user) => {
    setEditingId(user.id);
    setForm({
      username: user.username,
      password: "",
      warehouse_id: String(user.warehouse_id),
      zone_id: user.zone_id ? String(user.zone_id) : "",
      team: user.team || "",
      status: user.status,
    });
    setOpenModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const payload = { 
        ...form, 
        warehouse_id: Number(form.warehouse_id),
        zone_id: form.zone_id ? Number(form.zone_id) : null
      };
      if (editingId) {
        if (!payload.password) delete payload.password;
        await putJson(`${apiBase()}/users/${editingId}`, payload);
        toast({ title: "Success", description: "Staff updated successfully." });
      } else {
        await postJson(`${apiBase()}/users`, payload);
        toast({ title: "Success", description: "Staff created successfully." });
      }
      setOpenModal(false);
      loadData();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      setDeletingId(id);
      await deleteJson(`${apiBase()}/users/${id}`);
      toast({ title: "Success", description: "Staff deleted successfully." });
      loadData();
    } catch (e) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const teamOptions = ["Inbound", "Outbound", "Inventory", "Maintenance", "Management"];
  // Dynamically get unique teams from staff that aren't in teamOptions
  const dynamicTeams = Array.from(new Set(staff.map(s => s.team).filter(t => t && !teamOptions.includes(t))));
  
  const teams = [
    "All", 
    ...teamOptions,
    ...dynamicTeams,
    ...(staff.some(s => !s.team) ? ["No Team"] : [])
  ];

  const filteredStaff = staff.filter(s =>
    s.username.toLowerCase().includes(search.toLowerCase()) &&
    (selectedTeam === "All" || 
     (selectedTeam === "No Team" ? !s.team : s.team === selectedTeam))
  );

  const getWarehouseName = (id) => {
    return warehouses.find(w => w.id === id)?.name || "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Loading staff..." : `${staff.length} staff accounts`}
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Add Staff
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="relative max-w-sm flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex p-1.5 rounded-2xl bg-muted/50 border border-border/50 backdrop-blur-sm">
            {teams.map(team => (
              <button
                key={team}
                onClick={() => setSelectedTeam(team)}
                className={cn(
                  "px-8 py-3 rounded-xl text-sm font-bold transition-all duration-300 border-2 whitespace-nowrap",
                  selectedTeam === team 
                    ? "gradient-primary text-white border-transparent shadow-xl scale-105 z-10" 
                    : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:bg-muted"
                )}
              >
                {team}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-card rounded-xl p-4 text-sm text-destructive bg-destructive/5 border border-destructive/20">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStaff.map((user, i) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-2xl p-5 border border-border/50 hover:border-primary/30 transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{user.username}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full font-medium",
                      user.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    )}>
                      {user.status}
                    </span>
                    <span>•</span>
                    <span>Staff</span>
                    {user.team && (
                      <>
                        <span>•</span>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[80px]">
                          {user.team}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => handleOpenEdit(user)}
                >
                  <Pencil size={14} />
                </Button>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Staff Account</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete <strong>{user.username}</strong>? This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button variant="destructive" onClick={() => handleDelete(user.id)}>Delete</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Warehouse size={14} />
                <span className="flex-1 truncate">{getWarehouseName(user.warehouse_id)}</span>
              </div>
              
              {user.zone_name && (
                <div className="flex items-center gap-2 text-xs font-medium text-primary bg-primary/5 rounded-lg px-3 py-2 border border-primary/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>Floor {user.floor_number} - {user.zone_name}</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {openModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpenModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md glass-card bg-card p-6 rounded-2xl border border-border shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">{editingId ? "Edit Staff" : "Add New Staff"}</h2>
                <button
                  onClick={() => setOpenModal(false)}
                  className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground ml-1">Username</label>
                  <input
                    required
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground ml-1">
                    {editingId ? "Password (leave blank to keep current)" : "Password"}
                  </label>
                  <input
                    required={!editingId}
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/30 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground ml-1">Assigned Warehouse</label>
                  <select
                    required
                    value={form.warehouse_id}
                    onChange={(e) => setForm({ ...form, warehouse_id: e.target.value, zone_id: "" })}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/30 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Select warehouse...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground ml-1">Assigned Zone (Duty Area)</label>
                  <select
                    value={form.zone_id}
                    onChange={(e) => setForm({ ...form, zone_id: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/30 outline-none transition-all appearance-none cursor-pointer"
                    disabled={!form.warehouse_id}
                  >
                    <option value="">Select zone...</option>
                    {form.warehouse_id && (
                      warehouses.find(w => String(w.id) === form.warehouse_id)?.floors.flatMap(f => 
                        f.zones.map(z => (
                          <option key={z.id} value={z.id}>
                            Floor {f.floor_number} - {z.zone_name} ({z.zone_type})
                          </option>
                        ))
                      )
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground ml-1">Team</label>
                  <select
                    value={form.team}
                    onChange={(e) => setForm({ ...form, team: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/30 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="">Select team...</option>
                    {teamOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground ml-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary/30 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={submitting}
                    type="submit"
                    className="flex-1 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {submitting ? "Processing..." : editingId ? "Save Changes" : "Create Account"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}