"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, MoreHorizontal, X, Edit, Trash2, CheckCircle2, AlertCircle, Warehouse, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { getProducts, createProduct, updateProduct, deleteProduct, getSuppliers } from "@/lib/api/products";
import { useWms } from "../../../context/WmsContext";

const PAGE_SIZE = 20;

function PaginationControls({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  const maxShown = 5;
  let start = Math.max(1, currentPage - Math.floor(maxShown / 2));
  let end = Math.min(totalPages, start + maxShown - 1);
  if (end - start + 1 < maxShown) start = Math.max(1, end - maxShown + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1 pt-4 pb-2">
      <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors">
        <ChevronLeft size={16} />
      </button>
      {start > 1 && (<>
        <button onClick={() => onPageChange(1)} className="w-8 h-8 flex items-center justify-center text-xs rounded-md text-muted-foreground hover:bg-muted/50 transition-colors">1</button>
        {start > 2 && <span className="text-muted-foreground/40 text-xs px-0.5">…</span>}
      </>)}
      {pages.map(p => (
        <button key={p} onClick={() => onPageChange(p)}
          className={cn("w-8 h-8 flex items-center justify-center text-xs rounded-md transition-colors",
            p === currentPage ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted/50")}>
          {p}
        </button>
      ))}
      {end < totalPages && (<>
        {end < totalPages - 1 && <span className="text-muted-foreground/40 text-xs px-0.5">…</span>}
        <button onClick={() => onPageChange(totalPages)} className="w-8 h-8 flex items-center justify-center text-xs rounded-md text-muted-foreground hover:bg-muted/50 transition-colors">{totalPages}</button>
      </>)}
      <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 disabled:opacity-30 transition-colors">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const { state, fetchWarehouses } = useWms();
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null); // For edit or delete
  const [newProductData, setNewProductData] = useState({
    sku: "",
    name: "",
    category: "",
    supplier_id: "",
    supplier_sku: "",
    upc_code: "",
    handling_type: "",
    storage_temperature: "",
    unit_price: "",
    turnover_rate: "Medium",
    status: "inactive", // Default status for manually added products
  });
  const { toast } = useToast();

  useEffect(() => {
    loadProductsAndSuppliers();
    fetchWarehouses();
  }, []);

  const loadProductsAndSuppliers = async () => {
    setLoading(true);
    try {
      const [productsData, suppliersData] = await Promise.all([getProducts(), getSuppliers()]);
      setProducts(productsData);
      setSuppliers(suppliersData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load products or suppliers.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewProductData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setNewProductData((prev) => ({ ...prev, [name]: value }));
  };

  const generateSmartSKU = (category, name, id) => {
    // Remove non-alphanumeric characters to ensure clean SKU parts (e.g., "Hi-Fi" -> "HIF")
    const cleanCategory = (category || "").replace(/[^a-zA-Z0-9]/g, "");
    const cleanName = (name || "").replace(/[^a-zA-Z0-9]/g, "");

    const catPart = (cleanCategory || "XXX").substring(0, 3).toUpperCase().padEnd(3, "X");
    const namePart = (cleanName || "XXX").substring(0, 3).toUpperCase().padEnd(3, "X");
    const idPart = (id || 0).toString().padStart(2, "0");
    return `${catPart}-${namePart}-${idPart}`;
  };

  useEffect(() => {
    // Only auto-generate SKU for new products (when currentProduct is null)
    if (!currentProduct && isModalOpen) {
      const nextId = products.length > 0 ? Math.max(...products.map((p) => p.id || 0)) + 1 : 1;
      const newSku = generateSmartSKU(newProductData.category, newProductData.name, nextId);
      setNewProductData((prev) => ({ ...prev, sku: newSku }));
    }
  }, [newProductData.category, newProductData.name, currentProduct, isModalOpen, products]);

  const handleAddProduct = async () => {
    try {
      const productToCreate = { ...newProductData };
      // SKU is already generated by the useEffect, but ensure it's there
      if (!productToCreate.sku) {
        const nextId = products.length > 0 ? Math.max(...products.map((p) => p.id || 0)) + 1 : 1;
        productToCreate.sku = generateSmartSKU(productToCreate.category, productToCreate.name, nextId);
      }
      productToCreate.unit_price = parseFloat(productToCreate.unit_price);
      productToCreate.supplier_id = productToCreate.supplier_id === "" ? null : parseInt(productToCreate.supplier_id);
      productToCreate.handling_type = productToCreate.handling_type === "" ? null : productToCreate.handling_type;
      productToCreate.storage_temperature = productToCreate.storage_temperature === "" ? null : productToCreate.storage_temperature;

      await createProduct(productToCreate);
      toast({
        title: "Success",
        description: "Product added successfully.",
      });
      setIsModalOpen(false);
      resetNewProductData();
      loadProductsAndSuppliers(); // Refresh list
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to add product: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleUpdateProduct = async () => {
    try {
      const productToUpdate = { ...newProductData };
      productToUpdate.unit_price = parseFloat(productToUpdate.unit_price);
      productToUpdate.supplier_id = productToUpdate.supplier_id === "" ? null : parseInt(productToUpdate.supplier_id);
      productToUpdate.handling_type = productToUpdate.handling_type === "" ? null : productToUpdate.handling_type;
      productToUpdate.storage_temperature = productToUpdate.storage_temperature === "" ? null : productToUpdate.storage_temperature;

      await updateProduct(currentProduct.id, productToUpdate);
      toast({
        title: "Success",
        description: "Product updated successfully.",
      });
      setIsModalOpen(false);
      resetNewProductData();
      loadProductsAndSuppliers(); // Refresh list
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to update product: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleDeleteProduct = async () => {
    try {
      await deleteProduct(currentProduct.id);
      toast({
        title: "Success",
        description: "Product deleted successfully.",
      });
      setIsDeleteDialogOpen(false);
      setCurrentProduct(null);
      loadProductsAndSuppliers(); // Refresh list
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to delete product: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const openAddModal = () => {
    setCurrentProduct(null);
    resetNewProductData();
    setIsModalOpen(true);
  };

  const openEditModal = (product) => {
    setCurrentProduct(product);
    setNewProductData({
      sku: product.sku,
      name: product.name,
      category: product.category,
      supplier_id: product.supplier_id,
      handling_type: product.handling_type || "",
      storage_temperature: product.storage_temperature || "",
      unit_price: product.unit_price,
      turnover_rate: product.turnover_rate,
      status: product.status,
    });
    setIsModalOpen(true);
  };

  const openDeleteDialog = (product) => {
    setCurrentProduct(product);
    setIsDeleteDialogOpen(true);
  };

  const resetNewProductData = () => {
    setNewProductData({
      sku: "",
      name: "",
      category: "",
      supplier_id: "",
      handling_type: "",
      storage_temperature: "",
      unit_price: "",
      turnover_rate: "Medium",
      status: "inactive",
    });
  };

  const filteredProducts = products.filter(
    (product) =>
      (product.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.sku || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.category || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const displayedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const uniqueCategories = useMemo(() => {
    const categories = new Set();
    // Add categories from existing zones
    if (state.zones) {
        state.zones.forEach(z => {
            if (z.product_category) categories.add(z.product_category);
        });
    }
    // Also add categories from existing products
    products.forEach(p => {
        if (p.category) categories.add(p.category);
    });
    return Array.from(categories).sort();
  }, [state.zones, products]);

  const formFields = [
    { id: "name", label: "Product Name", type: "text", required: true },
    { id: "sku", label: "SKU", type: "text", placeholder: "Leave empty for auto-generate" },
    { id: "category", label: "Category", type: "select", options: uniqueCategories, required: true },
    { id: "supplier_id", label: "Supplier", type: "select", required: true, options: suppliers.map(s => ({ value: s.id, label: s.name })) },
    { id: "handling_type", label: "Handling Type", type: "select", required: true, options: ["Standard", "Fragile", "standard_heavy", "standard_light", "standard"] },
    { id: "storage_temperature", label: "Storage Temperature", type: "select", required: true, options: ["Ambient", "Refrigerated", "Frozen"] },
    { id: "unit_price", label: "Unit Price", type: "number", required: true },
    { id: "turnover_rate", label: "Turnover Rate", type: "select", options: ["Low", "Medium", "High"] },
    { id: "status", label: "Status", type: "select", options: ["active", "inactive"] },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col h-full p-6 bg-background rounded-lg shadow-md"
    >
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-foreground">Products Management</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/manager/products-in-shelf')}
            className="flex items-center gap-2"
          >
            <Warehouse className="h-5 w-5" /> Products in Shelf
          </Button>
          <Button onClick={openAddModal} className="flex items-center gap-2">
            <Plus className="h-5 w-5" /> Add New Product
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <Input
          type="text"
          placeholder="Search products by name, SKU, or category..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      <div className="flex-1 overflow-auto border rounded-lg">
        <Table className="min-w-full">
          <TableHeader className="sticky top-0 bg-secondary">
            <TableRow>
              <TableHead className="w-[100px]">SKU</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">Loading products...</TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">No products found.</TableCell>
              </TableRow>
            ) : (
              displayedProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.sku}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{suppliers.find(s => s.id === product.supplier_id)?.name || "N/A"}</TableCell>
                  <TableCell>${product.unit_price?.toFixed(2)}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium",
                      product.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    )}>
                      {product.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditModal(product)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDeleteDialog(product)} className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <PaginationControls currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      {filteredProducts.length > 0 && (
        <p className="text-xs text-center text-muted-foreground pb-2">
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredProducts.length)} of {filteredProducts.length} products
        </p>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{currentProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {formFields.map((field) => (
              <div key={field.id} className="space-y-2">
                <Label htmlFor={field.id}>
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </Label>
                {field.type === "select" ? (
                  <div className="flex items-center space-x-2">
                    <Select
                      name={field.id}
                      value={newProductData[field.id]?.toString()}
                      onValueChange={(value) => handleSelectChange(field.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Select a ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option.value || option} value={option.value?.toString() || option}>
                            {option.label || option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(field.id === "supplier_id" || field.id === "handling_type" || field.id === "storage_temperature" || field.id === "category") && newProductData[field.id] && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSelectChange(field.id, "")}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Clear {field.label}</span>
                      </Button>
                    )}
                  </div>
                ) : field.type === "textarea" ? (
                  <Textarea
                    id={field.id}
                    name={field.id}
                    value={newProductData[field.id]}
                    onChange={handleInputChange}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  />
                ) : (
                  <Input
                    id={field.id}
                    name={field.id}
                    type={field.type}
                    value={newProductData[field.id]}
                    onChange={handleInputChange}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                    required={field.required}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={currentProduct ? handleUpdateProduct : handleAddProduct}
              disabled={!currentProduct && (!newProductData.name)}
            >
              {currentProduct ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p>Are you sure you want to delete product &quot;{currentProduct?.name}&quot; (SKU: {currentProduct?.sku})?</p>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-bold">Warning: Cascading Deletion</p>
                <p>Deleting this product will also <strong>permanently delete all associated Purchase Orders</strong>. This action cannot be undone.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteProduct}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
