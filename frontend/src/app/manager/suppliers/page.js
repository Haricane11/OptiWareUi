"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Package,
  MoreHorizontal,
  X,
  Building2,
  User,
  Tag,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSuppliers, createSupplier } from "@/lib/api/suppliers";

const toDisplaySupplier = (row) => {
  const dbId = row?.id;
  const code =
    typeof dbId === "number" || (typeof dbId === "string" && /^\d+$/.test(dbId))
      ? `SUP-${String(dbId).padStart(3, "0")}`
      : String(dbId ?? "");

  return {
    dbId,
    id: code || "SUP-???",
    name: row?.name ?? "—",
    contact: row?.contact_person ?? "—",
    email: row?.email ?? "—",
    phone: row?.phone ?? "—",
    address: row?.address ?? "—",
    status: (row?.status ?? "inactive").toLowerCase(),
    created_at: row?.created_at ?? null,
    products: typeof row?.products_count === "number" ? row.products_count : 0,
    lastOrder: row?.last_order ?? "—",
  };
};

const emptyForm = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  status: "active",
};

export default function Suppliers() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingSupplier, setEditingSupplier] = useState(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const rows = await getSuppliers();
        const mapped = Array.isArray(rows) ? rows.map(toDisplaySupplier) : [];
        if (alive) setSuppliers(mapped);
      } catch (e) {
        if (alive) setError(e?.message || "Failed to load suppliers.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q)
    );
  }, [search, suppliers]);

  const totalCount = suppliers.length;
  const activeCount = suppliers.filter((s) => s.status === "active").length;

  const openAdd = () => {
    setEditingSupplier(null);
    setForm(emptyForm);
    setFormError("");
    setIsAddOpen(true);
  };


  const openEditProfile = () => {
    if (!selectedSupplier) return;
    setEditingSupplier(selectedSupplier);
    setForm({
      name: selectedSupplier.name === "—" ? "" : selectedSupplier.name,
      contact_person: selectedSupplier.contact === "—" ? "" : selectedSupplier.contact,
      phone: selectedSupplier.phone === "—" ? "" : selectedSupplier.phone,
      email: selectedSupplier.email === "—" ? "" : selectedSupplier.email,
      address: selectedSupplier.address === "—" ? "" : selectedSupplier.address,
      status: selectedSupplier.status || "active",
    });
    setFormError("");
    setIsAddOpen(true);
  };

  const placeOrderForSupplier = () => {
    if (!selectedSupplier?.dbId) return;
    try {
      localStorage.setItem("preselectSupplierId", String(selectedSupplier.dbId));
    } catch {}
    setSelectedSupplier(null);
    router.push("/manager/purchase-orders");
  };


  const closeAdd = () => {
    if (saving) return;
    setIsAddOpen(false);
  };

  const onChange = (key) => (e) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  
  const updateSupplier = async (id, payload) => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    const res = await fetch(`${base}/suppliers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Failed to update supplier.");
    }
    return res.json();
  };

const submitNewSupplier = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!form.name.trim()) {
      setFormError("Supplier name is required.");
      return;
    }

    try {
      setSaving(true);

      // payload must match DB column names
      const payload = {
        name: form.name.trim(),
        contact_person: form.contact_person.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        status: form.status || "active",
      };

      if (editingSupplier?.dbId) {
        const updated = await updateSupplier(editingSupplier.dbId, payload);
        const mapped = toDisplaySupplier(updated);

        setSuppliers((prev) =>
          prev.map((s) => (s.dbId === editingSupplier.dbId ? mapped : s))
        );
        setSelectedSupplier(mapped);
      } else {
        const created = await createSupplier(payload);
        const mapped = toDisplaySupplier(created);

        // update table immediately (prepend)
        setSuppliers((prev) => [mapped, ...prev]);
      }

      setEditingSupplier(null);
      setIsAddOpen(false);
      setForm(emptyForm);
    } catch (err) {
      setFormError(err?.message || "Failed to create supplier.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? "Loading suppliers…" : `${totalCount} suppliers · ${activeCount} active`}
          </p>
        </div>

        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Add Supplier
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          placeholder="Search suppliers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        />
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {error && (
          <div className="px-5 py-3 text-sm text-destructive border-b border-border bg-destructive/5">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                <th className="px-5 py-3 font-medium">Supplier</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Products</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Last Order</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((s, i) => (
                <motion.tr
                  key={s.dbId ?? s.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedSupplier(s)}
                >
                  <td className="px-5 py-3.5">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{s.id}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{s.contact}</td>
                  <td className="px-5 py-3.5">{s.products}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full font-medium",
                        s.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{s.lastOrder}</td>
                  <td className="px-5 py-3.5">
                    <button
                      className="p-1 rounded-md hover:bg-muted transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal size={16} className="text-muted-foreground" />
                    </button>
                  </td>
                </motion.tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No suppliers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Existing details overlay (unchanged) */}
      {selectedSupplier && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-end bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedSupplier(null)}
        >
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            className="w-full max-w-md h-full bg-card border-l border-border shadow-2xl rounded-2xl p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold">Supplier Details</h2>
              <button
                onClick={() => setSelectedSupplier(null)}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
                  {selectedSupplier.name[0]}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{selectedSupplier.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedSupplier.id}</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Phone size={16} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Phone
                    </p>
                    <p className="text-sm font-medium">{selectedSupplier.phone}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Mail size={16} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Email
                    </p>
                    <p className="text-sm font-medium">{selectedSupplier.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <MapPin size={16} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Address
                    </p>
                    <p className="text-sm font-medium">{selectedSupplier.address}</p>
                  </div>
                </div>

             
              </div>

              <div className="flex gap-3 pt-6">
                <button onClick={openEditProfile} className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors">
                  Edit Profile
                </button>
                <button onClick={placeOrderForSupplier} className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground font-medium shadow-sm hover:opacity-90 transition-opacity">
                  Place Order
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ✅ Add Supplier Modal */}
      <AnimatePresence>
        {isAddOpen && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeAdd}
          >
            <motion.div
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}
              className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="font-bold">{editingSupplier ? "Edit Supplier" : "Add Supplier"}</p>
                  </div>
                </div>
                <button
                  onClick={closeAdd}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                  disabled={saving}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={submitNewSupplier} className="p-5 space-y-4">
                {formError && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field
                    icon={<Building2 size={16} />}
                    label="Supplier Name *"
                    value={form.name}
                    onChange={onChange("name")}
                    placeholder="e.g., FreshCo Ltd."
                    required
                  />
                  <Field
                    icon={<User size={16} />}
                    label="Contact Person"
                    value={form.contact_person}
                    onChange={onChange("contact_person")}
                    placeholder="e.g., Alice Chen"
                  />
                  <Field
                    icon={<Phone size={16} />}
                    label="Phone"
                    value={form.phone}
                    onChange={onChange("phone")}
                    placeholder="09xxxxxxx"
                  />
                  <Field
                    icon={<Mail size={16} />}
                    label="Email"
                    value={form.email}
                    onChange={onChange("email")}
                    placeholder="name@email.com"
                    type="email"
                  />
                </div>

                <Field
                  icon={<MapPin size={16} />}
                  label="Address"
                  value={form.address}
                  onChange={onChange("address")}
                  placeholder="Full address"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* <Field
                    icon={<Tag size={16} />}
                    label="Category"
                    value={form.category}
                    onChange={onChange("category")}
                    placeholder="e.g., Dairy / Packaging"
                  /> */}

                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Status
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, status: "active" }))}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-xl text-sm border transition-colors",
                          form.status === "active"
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted"
                        )}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, status: "inactive" }))}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-xl text-sm border transition-colors",
                          form.status === "inactive"
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted"
                        )}
                      >
                        Inactive
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={closeAdd}
                    className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors"
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground font-medium shadow-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    {saving ? "Saving..." : (
                      <>
                        <CheckCircle2 size={16} />
                        {editingSupplier ? "Update Supplier" : "Save Supplier"}
                      </>
                    )}
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

function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}) {
  return (
    <label className="space-y-1.5 block">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary/30 transition-all">
        <span className="text-muted-foreground">{icon}</span>
        <input
          required={required}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none text-sm"
        />
      </div>
    </label>
  );
}
