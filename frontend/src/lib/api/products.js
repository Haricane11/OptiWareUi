import { httpGetJson, httpPostJson, httpPutJson, httpDeleteJson } from "./http";

export async function getProducts() {
  return httpGetJson("/products");
}

export async function createProduct(productData) {
  return httpPostJson("/products", productData);
}

export async function updateProduct(productId, productData) {
  return httpPutJson(`/products/${productId}`, productData);
}

export async function deleteProduct(productId) {
  return httpDeleteJson(`/products/${productId}`);
}

export async function getSuppliers() {
  return httpGetJson("/suppliers");
}