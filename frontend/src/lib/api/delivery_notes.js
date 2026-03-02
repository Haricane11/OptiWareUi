import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const getDeliveryNotes = async () => {
  const response = await axios.get(`${API_URL}/delivery-notes`);
  return response.data;
};

export const getDeliveryNote = async (id) => {
  const response = await axios.get(`${API_URL}/delivery-notes/${id}`);
  return response.data;
};

export const createDeliveryNote = async (salesOrderId) => {
  const response = await axios.post(`${API_URL}/delivery-notes`, { sales_order_id: salesOrderId });
  return response.data;
};

export const deleteDeliveryNote = async (id) => {
  const response = await axios.delete(`${API_URL}/delivery-notes/${id}`);
  return response.data;
};

export const confirmDeliveryNote = async (id) => {
  const response = await axios.post(`${API_URL}/delivery-notes/${id}/confirm`);
  return response.data;
};
