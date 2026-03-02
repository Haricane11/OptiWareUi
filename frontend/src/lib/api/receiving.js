const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Trigger automated placement suggestion for a scanned product.
 * @param {Object} data - PlaceProductRequest fields
 */
export async function suggestPlacement(data) {
  const res = await fetch(`${API_BASE}/receiving/suggest-placement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let message = "Failed to suggest placement";

    try {
      const err = await res.json();

      if (err?.detail) {
        if (typeof err.detail === "string") {
          message = err.detail;
        } else if (Array.isArray(err.detail)) {
          // FastAPI / Pydantic-style validation errors: include field name from loc
          message = err.detail
            .map((d) => {
              const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").pop() : null;
              const msg = d.msg || d.message || "Invalid value";
              return field ? `${String(field)}: ${msg}` : msg;
            })
            .join("; ");
        } else if (typeof err.detail === "object") {
          message = JSON.stringify(err.detail);
        }
      } else if (typeof err === "string") {
        message = err;
      } else if (typeof err === "object" && err !== null) {
        message = JSON.stringify(err);
      } else if (res.statusText) {
        message = res.statusText;
      }
    } catch {
      if (res.statusText) {
        message = res.statusText;
      }
    }

    throw new Error(message);
  }

  return res.json();
}

/**
 * Create a receipt_items row (and its parent receipt if needed)
 * WITHOUT assigning a shelf or generating suggestions.
 */
export async function createReceiptItem(data) {
  const res = await fetch(`${API_BASE}/receiving/create-receipt-item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let message = "Failed to create receipt item";
    try {
      const err = await res.json();
      if (err?.detail) {
        message = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      } else if (res.statusText) {
        message = res.statusText;
      }
    } catch {
      if (res.statusText) message = res.statusText;
    }
    throw new Error(message);
  }

  return res.json();
}

/**
 * Run bulk placement engine for all pending receipt_items without shelves.
 */
export async function generateBulkSuggestions(warehouseId = null) {
  const url = new URL(`${API_BASE}/receiving/generate-bulk-suggestions`);
  if (warehouseId) url.searchParams.set("warehouse_id", warehouseId);

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) {
    let message = "Failed to generate placement suggestions";
    try {
      const err = await res.json();
      if (err?.detail) {
        message = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      } else if (res.statusText) {
        message = res.statusText;
      }
    } catch {
      if (res.statusText) message = res.statusText;
    }
    throw new Error(message);
  }
  return res.json();
}

/**
 * Confirm a pending placement.
 * @param {number} receiptItemId
 */
export async function confirmPlacement(receiptItemId, scannedItemId = null) {
  const res = await fetch(`${API_BASE}/receiving/confirm-placement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receipt_item_id: receiptItemId, scanned_item_id: scannedItemId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to confirm placement");
  }
  return res.json();
}

/**
 * Fetch all inventory rows joined with product + shelf details.
 * @param {number|null} warehouseId
 */
export async function getInventoryShelfView(warehouseId = null) {
  const url = new URL(`${API_BASE}/receiving/inventory-shelf-view`);
  if (warehouseId) url.searchParams.set("warehouse_id", warehouseId);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to fetch shelf view");
  }
  return res.json();
}
