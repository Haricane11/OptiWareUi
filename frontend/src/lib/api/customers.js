import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const getCustomers = async () => {
  const response = await axios.get(`${API_URL}/customers`);
  return response.data;
};

export const createCustomer = async (customerData) => {
  const response = await axios.post(`${API_URL}/customers`, customerData);
  return response.data;
};

export const updateCustomer = async (id, customerData) => {
  const response = await axios.put(`${API_URL}/customers/${id}`, customerData);
  return response.data;
};

export const deleteCustomer = async (id) => {
  const response = await axios.delete(`${API_URL}/customers/${id}`);
  return response.data;
};
