import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const getInventoryList = async () => {
  const response = await axios.get(`${API_URL}/inventory`);
  return response.data;
};

export const getProductStock = async (productId, warehouseId = null) => {
  const params = warehouseId ? { warehouse_id: warehouseId } : {};
  const response = await axios.get(`${API_URL}/inventory/stock/${productId}`, { params });
  return response.data;
};

export const getProductBatches = async (productId, warehouseId = null) => {
  const params = warehouseId ? { warehouse_id: warehouseId } : {};
  const response = await axios.get(`${API_URL}/inventory/batches/${productId}`, { params });
  return response.data;
};
