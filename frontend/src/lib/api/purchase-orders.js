import { httpGetJson, httpPostJson, httpDeleteJson, httpPutJson } from "./http";

export async function getPurchaseOrders() {
  return httpGetJson("/purchase-orders");
}

export async function getPurchaseOrder(poId) {
  return httpGetJson(`/purchase-orders/${poId}`);
}

export async function createPurchaseOrder(poData) {
  return httpPostJson("/purchase-orders", poData);
}

export async function deletePurchaseOrder(poId) {
  return httpDeleteJson(`/purchase-orders/${poId}`);
}

export async function updatePurchaseOrder(poId, poData) {
  return httpPutJson(`/purchase-orders/${poId}`, poData);
}

export async function generatePurchaseInvoice(poId) {
  return httpPostJson(`/purchase-invoices/generate-from-po/${poId}`, {});
}
