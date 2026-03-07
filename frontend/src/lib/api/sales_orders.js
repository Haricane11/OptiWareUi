import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const getSalesOrders = async (status, page = 1, limit = 20) => {
  const params = { page, limit };
  if (status) params.status = status;
  const response = await axios.get(`${API_URL}/sales-orders`, { params });
  return response.data;
};

export const getSalesOrder = async (id) => {
  const response = await axios.get(`${API_URL}/sales-orders/${id}`);
  return response.data;
};

export const createSalesOrder = async (orderData) => {
  const response = await axios.post(`${API_URL}/sales-orders`, orderData);
  return response.data;
};

export const updateSalesOrder = async (id, orderData) => {
  const response = await axios.put(`${API_URL}/sales-orders/${id}`, orderData);
  return response.data;
};

export const deleteSalesOrder = async (id) => {
  const response = await axios.delete(`${API_URL}/sales-orders/${id}`);
  return response.data;
};
