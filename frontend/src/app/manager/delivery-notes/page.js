"use client";

import { motion } from "framer-motion";
import { Search, Truck, CheckCircle2, Clock, Package, Trash2, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getDeliveryNotes, deleteDeliveryNote, getDeliveryNote, confirmDeliveryNote } from "@/lib/api/delivery_notes";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusMap = {
  delivered: { label: "Delivered", style: "bg-success/10 text-success", icon: CheckCircle2 },
  shipped: { label: "Shipped", style: "bg-primary/10 text-primary", icon: Truck },
  picked: { label: "Picked", style: "bg-blue-500/10 text-blue-600", icon: Package },
  allocated: { label: "Allocated", style: "bg-indigo-500/10 text-indigo-600", icon: Clock },
  in_transit: { label: "In Transit", style: "bg-primary/10 text-primary", icon: Truck },
  pending: { label: "Pending", style: "bg-warning/10 text-warning", icon: Clock },
};

export default function DeliveryNotes() {
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const data = await getDeliveryNotes();
      setNotes(data);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load delivery notes", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (id) => {
    try {
      const note = await getDeliveryNote(id);
      setSelectedNote(note);
      setIsDetailOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load details", variant: "destructive" });
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this delivery note?")) return;
    try {
      await deleteDeliveryNote(id);
      toast({ title: "Success", description: "Delivery note deleted" });
      loadNotes();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete note", variant: "destructive" });
    }
  };

  const handleConfirmAll = async () => {
    const pendingNotes = notes.filter(n => n.status === 'pending');
    if (pendingNotes.length === 0) {
      toast({ title: "No Pending Notes", description: "There are no pending delivery notes to confirm." });
      return;
    }

    if (!confirm(`Confirm and allocate inventory for ${pendingNotes.length} pending delivery notes?`)) return;

    setConfirming(true);
    let successCount = 0;
    let failCount = 0;

    for (const note of pendingNotes) {
      try {
        await confirmDeliveryNote(note.id);
        successCount++;
      } catch (error) {
        console.error(`Failed to confirm note ${note.delivery_number}:`, error);
        failCount++;
      }
    }

    toast({ 
      title: "Confirmation Complete", 
      description: `Successfully confirmed ${successCount} notes. ${failCount > 0 ? `Failed ${failCount} notes.` : ""}`,
      variant: failCount > 0 ? "destructive" : "default"
    });
    
    setConfirming(false);
    loadNotes();
  };

  const filtered = notes.filter(n =>
    n.delivery_number.toLowerCase().includes(search.toLowerCase()) ||
    n.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    n.order_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Delivery Notes</h1>
        <p className="text-sm text-muted-foreground mt-1">Track outbound deliveries and shipment status.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: "Pending", value: notes.filter(n => n.status === 'pending').length, color: "text-warning", icon: Clock },
          { label: "Allocated", value: notes.filter(n => n.status === 'allocated').length, color: "text-indigo-600", icon: Clock },
          { label: "Picked", value: notes.filter(n => n.status === 'picked').length, color: "text-blue-600", icon: Package },
          { label: "Shipped", value: notes.filter(n => n.status === 'shipped').length, color: "text-primary", icon: Truck },
          { label: "Delivered", value: notes.filter(n => n.status === "delivered").length, icon: CheckCircle2, color: "text-success" },
        ]).map((s) => (
          <div key={s.label} className="glass-card rounded-xl p-4 flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", s.color, s.color.replace('text-', 'bg-') + '/10')}><s.icon size={18} /></div>
            <div>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative max-w-sm w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            type="text" 
            placeholder="Search delivery notes..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9" 
          />
        </div>
        <Button 
          onClick={handleConfirmAll} 
          disabled={confirming || loading}
          className="gradient-primary text-white font-bold rounded-xl"
        >
          {confirming ? "Confirming..." : "Confirm All Pending"}
        </Button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                <th className="px-5 py-3 font-medium">Note ID</th>
                <th className="px-5 py-3 font-medium">Sales Order</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Items</th>
                <th className="px-5 py-3 font-medium">Expected Delivery</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No delivery notes found.</td></tr>
              ) : (
                filtered.map((note, i) => {
                  const st = statusMap[note.status] || statusMap.shipped;
                  const Icon = st.icon;
                  return (
                    <motion.tr 
                      key={note.id} 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-mono text-xs font-medium">{note.delivery_number}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">{note.order_number}</td>
                      <td className="px-5 py-3.5">{note.customer_name}</td>
                      <td className="px-5 py-3.5">{note.item_count}</td>
                      <td className="px-5 py-3.5">
                        {note.expected_delivery_date ? (
                          <div className={cn(
                            "flex items-center gap-1.5",
                            note.status === 'pending' && new Date(note.expected_delivery_date) < new Date() ? "text-destructive font-medium" : "text-muted-foreground"
                          )}>
                            <Clock size={12} />
                            {new Date(note.expected_delivery_date).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1", st.style)}>
                          <Icon size={12} />{st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleView(note.id)}>
                          <Eye size={16} className="text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(note.id)}>
                          <Trash2 size={16} className="text-muted-foreground hover:text-destructive" />
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delivery Note Details</DialogTitle>
          </DialogHeader>
          {selectedNote && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg border border-border">
                <div>
                  <p className="text-muted-foreground">Delivery Number</p>
                  <p className="font-medium">{selectedNote.delivery_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium inline-block mt-1", statusMap[selectedNote.status]?.style)}>
                    {statusMap[selectedNote.status]?.label}
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground">Sales Order</p>
                  <p className="font-medium">{selectedNote.order_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedNote.customer_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Warehouse</p>
                  <p className="font-medium">{selectedNote.warehouse_name}</p>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Shipped Items</h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Product</th>
                        <th className="px-4 py-2 font-medium">SKU</th>
                        <th className="px-4 py-2 text-right font-medium">Ordered</th>
                        <th className="px-4 py-2 text-right font-medium">Shipped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNote.items?.map((item, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="px-4 py-2">{item.product_name}</td>
                          <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{item.ordered_qty}</td>
                          <td className="px-4 py-2 text-right font-medium">{item.shipped_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
