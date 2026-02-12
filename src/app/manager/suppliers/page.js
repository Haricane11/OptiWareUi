"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Phone, Mail, MapPin, Package, MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

const suppliersData = [
  { id: "SUP-001", name: "FreshCo Ltd.", contact: "Alice Chen", email: "alice@freshco.com", phone: "+1 555-0101", address: "123 Green Ave, Portland", category: "Dairy & Fresh", products: 14, status: "active", lastOrder: "Feb 8, 2026" },
  { id: "SUP-002", name: "SteelWorks Inc.", contact: "Robert Kim", email: "r.kim@steelworks.com", phone: "+1 555-0202", address: "456 Industrial Blvd, Detroit", category: "Hardware", products: 8, status: "active", lastOrder: "Feb 7, 2026" },
  { id: "SUP-003", name: "PackPro", contact: "Maria Lopez", email: "maria@packpro.com", phone: "+1 555-0303", address: "789 Box St, Austin", category: "Packaging", products: 6, status: "active", lastOrder: "Feb 5, 2026" },
  { id: "SUP-004", name: "TechParts Global", contact: "James Ota", email: "j.ota@techparts.io", phone: "+1 555-0404", address: "321 Circuit Rd, San Jose", category: "Electronics", products: 11, status: "inactive", lastOrder: "Jan 15, 2026" },
  { id: "SUP-005", name: "OrganicFarms Co.", contact: "Sarah Patel", email: "sarah@organicfarms.com", phone: "+1 555-0505", address: "654 Valley Ln, Sacramento", category: "Dairy & Fresh", products: 9, status: "active", lastOrder: "Feb 9, 2026" },
  { id: "SUP-006", name: "BuildRight Supply", contact: "Tom Baker", email: "tom@buildright.com", phone: "+1 555-0606", address: "111 Builder Way, Phoenix", category: "Hardware", products: 5, status: "active", lastOrder: "Feb 3, 2026" },
];

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const filtered = suppliersData.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">{suppliersData.length} suppliers · {suppliersData.filter(s => s.status === "active").length} active</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-medium shadow-sm hover:opacity-90 transition-opacity">
          <Plus size={16} />
          Add Supplier
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search suppliers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
        />
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                <th className="px-5 py-3 font-medium">Supplier</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Products</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Last Order</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
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
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">{s.category}</span>
                  </td>
                  <td className="px-5 py-3.5">{s.products}</td>
                  <td className="px-5 py-3.5">
                    <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium",
                      s.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    )}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{s.lastOrder}</td>
                  <td className="px-5 py-3.5">
                    <button className="p-1 rounded-md hover:bg-muted transition-colors">
                      <MoreHorizontal size={16} className="text-muted-foreground" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Drawer-like Overlay */}
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
            onClick={e => e.stopPropagation()}
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
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Phone</p>
                    <p className="text-sm font-medium">{selectedSupplier.phone}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Mail size={16} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Email</p>
                    <p className="text-sm font-medium">{selectedSupplier.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <MapPin size={16} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Address</p>
                    <p className="text-sm font-medium">{selectedSupplier.address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Package size={16} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Supply Category</p>
                    <p className="text-sm font-medium">{selectedSupplier.category}</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-border">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-2xl font-bold">{selectedSupplier.products}</p>
                    <p className="text-xs text-muted-foreground">Total Products</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50">
                    <p className="text-sm font-bold truncate">{selectedSupplier.lastOrder}</p>
                    <p className="text-xs text-muted-foreground">Last Order</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted transition-colors">
                  Edit Profile
                </button>
                <button className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground font-medium shadow-sm hover:opacity-90 transition-opacity">
                  Place Order
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
