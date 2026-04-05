import api from './axios';

export const getEmployees = () => api.get('/admin/users'); // Adjust based on your FastAPI router
export const createEmployee = (data) => api.post('/admin/users', data);
export const deleteEmployee = (id) => api.delete(`/admin/users/${id}`);
export const updateEmployee = (id, data) => api.put(`/admin/users/${id}`, data);
// export const restoreEmployee = (userId) => axios.post(`/admin/users/${userId}/restore`);




export const getAllEmployees = async () => {
    try {
        const response = await api.get('/admin/users'); 
        return response.data;
    } catch (error) {
        console.error("Error in employeeService:", error);
        throw error;
    }
};


// 1. DELETE
export const deletePermanently = async (id) => {
  return await api.delete(`/admin/users/${id}/permanent`); 
};

// 2. RESTORE
export const restoreEmployee = async (id) => {
  return await api.post(`/admin/users/${id}/restore`);
};


//For Editable data
export const updatePayrollAdjustments = async (payrollId, data) => {
  return await api.put(`/admin/payroll/update-adjustments/${payrollId}`, null, {
    params: data
  });
};