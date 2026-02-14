import { httpGetJson } from "./http";

export async function getPurchaseOrders() {
  return httpGetJson("/purchase-orders");
}
