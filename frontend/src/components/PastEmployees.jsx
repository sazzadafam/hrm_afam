import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import { RotateCcw, UserX, Trash2, Loader2 } from 'lucide-react';
import { restoreEmployee, deletePermanently } from '../api/employeeService';
import { toast } from 'sonner';

const PastEmployees = ({ onRefresh }) => {
  const [archived, setArchived] = useState([]);
  const [loading, setLoading] = useState(true);

  // Use useCallback to prevent unnecessary re-renders
  const fetchArchived = useCallback(async () => {
    setLoading(true);
    try {
      // Ensure your axios interceptor is attaching the Bearer token
      const response = await api.get(`/admin/users/archived`);
      setArchived(response.data);
    } catch (err) {
      console.error("Failed to fetch archive", err);
      // If the error is 422 or 401, it's likely an auth issue
      const errorMsg = err.response?.data?.detail || "Could not load archived records";
      toast.error(typeof errorMsg === 'string' ? errorMsg : "Authentication Error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRestore = async (id) => {
    try {
      await restoreEmployee(id);
      toast.success("Employee restored successfully!");
      
      // Refresh local list and parent component
      await fetchArchived();
      if (onRefresh) onRefresh(); 
    } catch (err) {
      toast.error("Failed to restore employee");
      console.error(err);
    }
  };

  const handleDeletePermanently = async (id) => {
    if (window.confirm("ARE YOU SURE? This will permanently delete this employee and all linked records. This cannot be undone.")) {
      try {
        await deletePermanently(id);
        toast.success("Employee record purged permanently");
        
        await fetchArchived();
        if (onRefresh) onRefresh(); 
      } catch (err) {
        console.error("Delete failed", err);
        toast.error("Delete failed. Check server logs for constraints.");
      }
    }
  };

  useEffect(() => { 
    fetchArchived(); 
  }, [fetchArchived]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <UserX className="text-slate-400" /> Inactive Personnel
      </h2>
      
      <div className="grid gap-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500">
            <Loader2 className="animate-spin mb-2" />
            <p className="text-sm">Fetching archived records...</p>
          </div>
        ) : archived.length === 0 ? (
          <div className="bg-[#111827] border border-white/5 p-8 rounded-xl text-center">
            <p className="text-slate-500 text-sm italic">No archived records found.</p>
          </div>
        ) : (
          archived.map(emp => (
            <div 
              key={emp.id} 
              className="bg-[#111827] border border-white/5 p-4 rounded-xl flex justify-between items-center hover:border-emerald-500/30 transition-all group"
            >
              <div>
                <p className="text-white font-medium group-hover:text-emerald-400 transition-colors">
                  {emp.name || "Unknown Name"}
                </p>
                <div className="flex gap-3 mt-1">
                  <p className="text-xs text-slate-500 font-mono">
                    ID: {emp.employee_id}
                  </p>
                  <p className="text-xs text-slate-600 italic">
                    {emp.department} — {emp.designation}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => handleRestore(emp.id)}
                  className="p-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-all active:scale-95"
                  title="Restore Employee"
                >
                  <RotateCcw size={18} />
                </button>

                <button 
                  onClick={() => handleDeletePermanently(emp.id)}
                  className="p-2.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-all active:scale-95"
                  title="Delete Permanently"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PastEmployees;