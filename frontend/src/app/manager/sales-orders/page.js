"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, FileOutput, Truck, CheckCircle2, Clock, Package, Plus, Trash2, X, Edit, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getSalesOrders, createSalesOrder, deleteSalesOrder, updateSalesOrder, getSalesOrder } from "@/lib/api/sales_orders";
import { createDeliveryNote } from "@/lib/api/delivery_notes";
import { getCustomers, createCustomer, deleteCustomer } from "@/lib/api/customers";
import { getProducts } from "@/lib/api/products";
import { useWms } from "@/context/WmsContext";
import { ProductPicker } from "./ProductPicker";

const statusMap = {
  pending: { label: "Pending", style: "bg-warning/10 text-warning" },
  processing: { label: "Processing", style: "bg-primary/10 text-primary" },
  ready: { label: "Ready to Ship", style: "bg-success/10 text-success" },
  shipped: { label: "Shipped", style: "bg-muted text-muted-foreground" },
};

export default function SalesOrders() {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, total_pages: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { state, fetchWarehouses } = useWms();
  
  const [newOrder, setNewOrder] = useState({
    customer_id: "",
    warehouse_id: "",
    priority_level: "normal",
    expected_delivery_date: "",
    items: [] // Start with empty array
  });

  const [newCustomer, setNewCustomer] = useState({
    customer_name: "",
    email: "",
    shipping_address: "",
    phone: "",
    tax_id: ""
  });

  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadData(currentPage);
    fetchWarehouses();
  }, [currentPage]);

  const loadData = async (page = 1) => {
    try {
      setLoading(true);
      const [ordersRes, customersData, productsData, bundlesRes] = await Promise.all([
        getSalesOrders(null, page),
        getCustomers(),
        getProducts(),
        fetch("http://localhost:8000/analytics/bundles").then(res => res.json())
      ]);
      setOrders(ordersRes.data || []);
      setPagination(ordersRes.metadata || { total: 0, page: 1, limit: 20, total_pages: 0 });
      setCustomers(customersData);
      setProducts(productsData);
      setBundles(bundlesRes || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = async (order) => {
    try {
      const fullOrder = await getSalesOrder(order.id);
      const bundleItems = (fullOrder.bundle_sales || []).map(bs => ({
        type: "bundle",
        bundle_id: bs.bundle_id.toString(),
        product_id: "",
        ordered_qty: bs.quantity
      }));
      
      const individualItems = (fullOrder.items || []).filter(i => !i.bundle_id).map(i => ({
        type: "product",
        product_id: i.product_id.toString(),
        bundle_id: "",
        ordered_qty: i.ordered_qty
      }));

      setNewOrder({
        customer_id: fullOrder.customer_id.toString(),
        warehouse_id: fullOrder.warehouse_id.toString(),
        priority_level: fullOrder.priority_level,
        expected_delivery_date: fullOrder.expected_delivery_date || "",
        items: [...bundleItems, ...individualItems]
      });
      setSelectedOrder(fullOrder);
      setIsEditing(true);
      setIsCreateModalOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load order details", variant: "destructive" });
    }
  };

  const handleCreateCustomer = async () => {
    try {
      if (!newCustomer.customer_name || !newCustomer.shipping_address) {
        toast({ title: "Error", description: "Name and address are required", variant: "destructive" });
        return;
      }
      await createCustomer(newCustomer);
      toast({ title: "Success", description: "Customer created successfully" });
      setNewCustomer({ customer_name: "", email: "", shipping_address: "", phone: "", tax_id: "" });
      const customersData = await getCustomers();
      setCustomers(customersData);
    } catch (error) {
      toast({ title: "Error", description: "Failed to create customer", variant: "destructive" });
    }
  };

  const handleDeleteCustomer = async (id) => {
    if (!confirm("Are you sure you want to delete this customer?")) return;
    try {
      await deleteCustomer(id);
      toast({ title: "Success", description: "Customer deleted" });
      const customersData = await getCustomers();
      setCustomers(customersData);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete customer", variant: "destructive" });
    }
  };

  const handleCreateOrder = async () => {
    try {
      if (!newOrder.customer_id || !newOrder.warehouse_id) {
        toast({ title: "Error", description: "Please select customer and warehouse", variant: "destructive" });
        return;
      }
      
      const validItems = newOrder.items.filter(i => (i.product_id || i.bundle_id) && i.ordered_qty > 0);
      if (validItems.length === 0) {
        toast({ title: "Error", description: "Please add at least one valid item", variant: "destructive" });
        return;
      }

      const orderData = {
        ...newOrder,
        customer_id: parseInt(newOrder.customer_id),
        warehouse_id: parseInt(newOrder.warehouse_id),
        expected_delivery_date: newOrder.expected_delivery_date || null,
        items: validItems.map(i => ({ 
          product_id: i.type === "product" ? parseInt(i.product_id) : null,
          bundle_id: i.type === "bundle" ? parseInt(i.bundle_id) : null,
          ordered_qty: parseInt(i.ordered_qty) 
        }))
      };

      if (isEditing) {
        await updateSalesOrder(selectedOrder.id, orderData);
        toast({ title: "Success", description: "Sales order updated successfully" });
      } else {
        await createSalesOrder(orderData);
        toast({ title: "Success", description: "Sales order created successfully" });
      }
      
      setIsCreateModalOpen(false);
      setIsEditing(false);
      setNewOrder({
        customer_id: "",
        warehouse_id: "",
        priority_level: "normal",
        items: [{ type: "product", product_id: "", bundle_id: "", ordered_qty: 1 }]
      });
      loadData();
      
      if (isEditing && selectedOrder) {
         const updatedOrder = await getSalesOrder(selectedOrder.id);
         setSelectedOrder(updatedOrder);
      }
    } catch (error) {
      toast({ title: "Error", description: error.message || "Failed to save order", variant: "destructive" });
    }
  };

  const handleDeleteOrder = async (id) => {
    try {
      await deleteSalesOrder(id);
      toast({ title: "Success", description: "Sales order deleted" });
      if (selectedOrder?.id === id) setSelectedOrder(null);
      loadData();
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error.response?.data?.detail || "Failed to delete order", 
        variant: "destructive" 
      });
    }
  };

  const handleGenerateDeliveryNote = async (orderId) => {
    try {
      await createDeliveryNote(orderId);
      toast({ title: "Success", description: "Delivery note generated" });
      loadData();
      // Optionally refresh selected order to show new status
      const updatedOrders = await getSalesOrders();
      setOrders(updatedOrders);
      const updatedSelected = updatedOrders.find(o => o.id === orderId);
      if (updatedSelected) setSelectedOrder(updatedSelected);
    } catch (error) {
      toast({ title: "Error", description: error.response?.data?.detail || "Failed to generate note", variant: "destructive" });
    }
  };

  const addItem = () => {
    setIsPickerOpen(true);
  };

  const handleProductSelect = (item, type) => {
    setNewOrder(prev => {
      // Check if already added
      const idStr = item.id.toString();
      const exists = prev.items.find(i => i.type === type && (type === 'product' ? i.product_id : i.bundle_id)?.toString() === idStr);
      if (exists) return prev;

      return {
        ...prev,
        items: [...prev.items, { 
          type: type, 
          product_id: type === 'product' ? idStr : "", 
          bundle_id: type === 'bundle' ? idStr : "", 
          ordered_qty: 1 
        }]
      };
    });
  };

  const removeItem = (index) => {
    setNewOrder(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...newOrder.items];
    newItems[index][field] = value;
    setNewOrder(prev => ({ ...prev, items: newItems }));
  };

  const getPaginationRange = () => {
    const total = pagination.total_pages;
    const current = currentPage;
    const delta = 1;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  };

  const filtered = orders.filter(o =>
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Review and fulfill customer orders.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsCustomerModalOpen(true)} className="flex items-center gap-2">
            <Users size={16} /> Customers
          </Button>
          <Button onClick={() => {
            setIsEditing(false);
            setNewOrder({
              customer_id: "",
              warehouse_id: "",
              priority_level: "normal",
              items: []
            });
            setIsCreateModalOpen(true);
          }} className="flex items-center gap-2">
            <Plus size={16} /> New Order
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input 
          type="text" 
          placeholder="Search orders..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9" 
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Order list */}
        <div className="lg:col-span-3 space-y-3">
          {loading ? <p className="text-muted-foreground text-center py-8">Loading orders...</p> : filtered.length === 0 ? <p className="text-muted-foreground text-center py-8">No orders found.</p> :
          filtered.map((order, i) => {
            const statusMap = {
              pending: { label: "Pending", style: "bg-warning/10 text-warning" },
              processing: { label: "Processing", style: "bg-primary/10 text-primary" },
              ready: { label: "Ready to Ship", style: "bg-success/10 text-success" },
              shipped: { label: "Shipped", style: "bg-muted text-muted-foreground" },
            };

            const priorityMap = {
              urgent: { label: "Urgent", style: "bg-red-500/10 text-red-600" },
              high: { label: "High", style: "bg-orange-500/10 text-orange-600" },
              normal: { label: "Normal", style: "bg-blue-500/10 text-blue-600" },
              low: { label: "Low", style: "bg-slate-500/10 text-slate-600" },
            };

            const st = statusMap[order.status] || { label: order.status, style: "bg-gray-100 text-gray-800" };
            const pr = priorityMap[order.priority_level] || { label: "Normal", style: "bg-blue-500/10 text-blue-600" };

            return (
              <motion.div
                layoutId={order.id}
                key={order.id}
                initial={{ opacity: 0, y: 8 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.04 }}
                className={cn(
                  "bg-card rounded-lg border p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative",
                  order.status === 'pending' && new Date(order.expected_delivery_date) < new Date() ? "border-destructive/50" : "",
                  selectedOrder?.id === order.id && "ring-2 ring-primary"
                )}
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{order.order_number}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground truncate max-w-[180px]">{order.customer_name}</p>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium inline-block mb-1", st.style)}>
                      {st.label}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Package size={12}/> {order.item_count} items</span>
                    <span>${parseFloat(order.total_amount).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {order.delivery_note && (
                      <span className="text-xs font-mono text-primary flex items-center gap-1">
                        <FileOutput size={12} /> {order.delivery_note}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
          {/* Pagination Controls */}
          {pagination.total_pages > 1 && (
            <div className="flex flex-col items-center gap-4 py-8 mt-4 border-t border-border/50">
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || loading}
                  className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                
                <div className="flex items-center gap-1">
                  {getPaginationRange().map((page, i) => (
                    page === '...' ? (
                      <span key={`dots-${i}`} className="px-3 py-2 text-muted-foreground font-serif">...</span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        disabled={loading}
                        className={cn(
                          "w-10 h-10 flex items-center justify-center rounded-xl text-sm font-medium transition-all",
                          currentPage === page 
                            ? "bg-[#2D9B8B] text-white shadow-lg shadow-teal-500/20" 
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {page}
                      </button>
                    )
                  ))}
                </div>

                <button 
                  onClick={() => setCurrentPage(prev => Math.min(pagination.total_pages, prev + 1))}
                  disabled={currentPage === pagination.total_pages || loading}
                  className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} orders
              </p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2">
          {selectedOrder ? (
            <div className="glass-card rounded-xl p-5 sticky top-8 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">{selectedOrder.order_number}</h2>
                  <p className="text-xs text-muted-foreground mt-1">Warehouse: {selectedOrder.warehouse_name}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-muted" onClick={() => handleEditClick(selectedOrder)}>
                    <Edit size={16} />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteOrder(selectedOrder.id)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
              
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Customer</p>
                <p className="font-medium mt-0.5">{selectedOrder.customer_name}</p>
              </div>

              {/* Items need to be fetched if not already present, but for now assuming list gives enough or fetch details */}
              {/* Note: The list API doesn't return items detail, only count/total. We should fetch details if needed or just show summary. 
                  Let's fetch details when selected if we want to show item list. */}
              <OrderDetails orderId={selectedOrder.id} />

              <div className="pt-4 space-y-3">
                {selectedOrder.status !== "shipped" && !selectedOrder.delivery_note ? (
                  <Button 
                    onClick={() => handleGenerateDeliveryNote(selectedOrder.id)}
                    className="w-full gap-2"
                  >
                    <FileOutput size={16} />
                    Generate Delivery Note
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full gap-2 cursor-default">
                    <Truck size={16} />
                    Shipment Created
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 glass-card rounded-xl border-dashed">
              <div className="p-3 rounded-full bg-muted mb-4">
                <Package size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Select an order to view details and fulfillment options.</p>
            </div>
          )}
        </div>
      </div>

      {/* Customer Modal */}
      <Dialog open={isCustomerModalOpen} onOpenChange={setIsCustomerModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Customers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2 border-b pb-4">
              <Label>Add New Customer</Label>
              <Input placeholder="Customer Name" value={newCustomer.customer_name} onChange={e => setNewCustomer({...newCustomer, customer_name: e.target.value})} />
              <Input placeholder="Email" value={newCustomer.email} onChange={e => setNewCustomer({...newCustomer, email: e.target.value})} />
              <Input placeholder="Shipping Address" value={newCustomer.shipping_address} onChange={e => setNewCustomer({...newCustomer, shipping_address: e.target.value})} />
              <Button size="sm" onClick={handleCreateCustomer} className="w-full">Add Customer</Button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              <Label>Existing Customers</Label>
              {customers.length === 0 ? <p className="text-sm text-muted-foreground">No customers found.</p> : 
                customers.map(c => (
                  <div key={c.id} className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{c.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteCustomer(c.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))
              }
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Sales Order" : "New Sales Order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={newOrder.customer_id} onValueChange={(v) => setNewOrder({...newOrder, customer_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.customer_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Warehouse</Label>
                <Select value={newOrder.warehouse_id} onValueChange={(v) => setNewOrder({...newOrder, warehouse_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Select Warehouse" /></SelectTrigger>
                  <SelectContent>
                    {state.warehouses.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expected Delivery Date</Label>
                <Input 
                  type="date" 
                  value={newOrder.expected_delivery_date || ""}
                  onChange={(e) => setNewOrder({...newOrder, expected_delivery_date: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Order Items</Label>
                <Button variant="outline" size="sm" onClick={addItem}><Plus size={14} className="mr-1" /> Add Item</Button>
              </div>
              <div className="space-y-3">
                {newOrder.items.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-3">
                    <div className="flex justify-end items-center">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)}>
                        <X size={14} />
                      </Button>
                    </div>
                    
                    <div className="flex gap-4 items-center">
                      <div className="flex-1 flex flex-col">
                        {item.type === "product" ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">
                                {products.find(p => p.id.toString() === item.product_id.toString())?.name || "Unknown Product"}
                              </span>
                              {products.find(p => p.id.toString() === item.product_id.toString())?.discount_value > 0 && (
                                <Badge variant="destructive" className="h-4 text-[9px] px-1 font-bold">
                                  {products.find(p => p.id.toString() === item.product_id.toString())?.discount_type === 'PERCENTAGE' 
                                    ? `-${products.find(p => p.id.toString() === item.product_id.toString())?.discount_value}%` 
                                    : `-$${products.find(p => p.id.toString() === item.product_id.toString())?.discount_value}`}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase opacity-70">
                              {products.find(p => p.id.toString() === item.product_id.toString())?.sku || "NO-SKU"}
                            </span>
                          </>
                        ) : (
                          <span className="font-semibold text-sm">
                            {bundles.find(b => b.id.toString() === item.bundle_id.toString())?.bundle_name || "Unknown Bundle"}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight opacity-50">Quantity</p>
                          <Input 
                            type="number" 
                            min="1" 
                            value={item.ordered_qty} 
                            onChange={(e) => updateItem(idx, 'ordered_qty', e.target.value)} 
                            className="h-8 w-20 text-center font-bold bg-background border-border/40"
                          />
                        </div>
                        <div className="text-right min-w-[80px]">
                           <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight opacity-50">Price</p>
                           <p className="text-sm font-bold">
                              ${(() => {
                                if (item.type === "product") {
                                  const p = products.find(prod => prod.id.toString() === item.product_id.toString());
                                  if (!p) return "0.00";
                                  let price = parseFloat(p.unit_price);
                                  if (p.discount_value > 0) {
                                    price = p.discount_type === 'PERCENTAGE' ? price * (1 - p.discount_value / 100) : Math.max(0, price - p.discount_value);
                                  }
                                  return (price * item.ordered_qty).toFixed(2);
                                } else {
                                  const b = bundles.find(bun => bun.id.toString() === item.bundle_id.toString());
                                  return b ? (parseFloat(b.bundle_price) * item.ordered_qty).toFixed(2) : "0.00";
                                }
                              })()}
                           </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Subtotal (Approx.)</span>
              <span className="font-medium">
                ${newOrder.items.reduce((acc, item) => {
                  if (item.type === "product" && item.product_id) {
                    const product = products.find(p => p.id.toString() === item.product_id.toString());
                    if (product) {
                      let price = product.unit_price;
                      if (product.discount_value > 0) {
                        if (product.discount_type === 'PERCENTAGE') price *= (1 - product.discount_value / 100);
                        else price = Math.max(0, price - product.discount_value);
                      }
                      return acc + (price * item.ordered_qty);
                    }
                  } else if (item.type === "bundle" && item.bundle_id) {
                    const bundle = bundles.find(b => b.id.toString() === item.bundle_id.toString());
                    if (bundle) return acc + (bundle.bundle_price * item.ordered_qty);
                  }
                  return acc;
                }, 0).toFixed(2)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOrder}>{isEditing ? "Update Order" : "Create Order"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductPicker 
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        products={products}
        bundles={bundles}
        onSelect={handleProductSelect}
        existingItems={newOrder.items}
      />
    </div>
  );
}



function OrderDetails({ orderId }) {
  const [details, setDetails] = useState(null);

  useEffect(() => {
    getSalesOrder(orderId).then(setDetails).catch(console.error);
  }, [orderId]);

  if (!details) return <p className="text-xs text-muted-foreground">Loading details...</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground uppercase font-semibold">Order Items</p>
      {details.items.map((item, idx) => (
        <div key={idx} className="flex justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
          <div className="flex flex-col">
            <span className="font-medium">{item.product_name}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground">x{item.ordered_qty} @ ${parseFloat(item.unit_price).toFixed(2)}</span>
              {item.discount_value > 0 && (
                <span className="text-[9px] font-bold text-destructive">
                  ({item.discount_type === 'PERCENTAGE' ? `-${item.discount_value}%` : `-$${item.discount_value}`})
                </span>
              )}
            </div>
          </div>
          <span className="font-semibold self-center">${parseFloat(item.total_price).toFixed(2)}</span>
        </div>
      ))}
      <div className="flex justify-between font-bold pt-2">
        <span>Total</span>
        <span className="text-primary">${parseFloat(details.total_amount).toFixed(2)}</span>
      </div>
    </div>
  );
}
