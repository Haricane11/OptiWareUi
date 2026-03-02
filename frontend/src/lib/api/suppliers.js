import { httpGetJson, httpPostJson } from "./http";

export async function getSuppliers() {
  return httpGetJson("/suppliers");
}

export async function createSupplier(payload) {
  return httpPostJson("/suppliers", payload);
}
