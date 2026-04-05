import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { RotateCcw, UserX, Trash2 } from 'lucide-react';
import { restoreEmployee, deletePermanently } from '../api/employeeService';
import { toast } from 'sonner'; // Import toast

const PastEmployees = ({ onRefresh }) => {
  const [archived, setArchived] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchArchived = async () => {
    try {
      const response = await api.get(`/admin/users/archived`);
      setArchived(response.data);
    } catch (err) {
      console.error("Failed to fetch archive", err);
      toast.error("Could not load archived employees");
    }
  };

  const handleRestore = async (id) => {
    try {
      await restoreEmployee(id);
      
      // Update local state and parent UI
      await fetchArchived();
      if (onRefresh) onRefresh(); 
      
      toast.success("Employee restored successfully!");
    } catch (err) {
      toast.error("Failed to restore employee");
      console.error(err);
    }
  };

  const handleDeletePermanently = async (id) => {
    console.log("Attempting to delete User ID:", id); // Check your browser console!
    // Keep window.confirm for safety on destructive actions
    if (window.confirm("ARE YOU SURE? This will permanently delete this employee and all linked records. This cannot be undone.")) {
      try {
        await deletePermanently(id);
        
        // Refresh lists
        await fetchArchived();
        if (onRefresh) onRefresh(); 
        
        toast.success("Employee record purged permanently");
      } catch (err) {
        console.error("Delete failed", err);
        toast.error("Delete failed. Ensure no active payroll or attendance records exist for this ID.");
      }
    }
  };

  useEffect(() => { 
    fetchArchived(); 
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <UserX className="text-slate-400" /> Inactive Personnel
      </h2>
      
      <div className="grid gap-3">
        {archived.length === 0 ? (
          <p className="text-slate-500 text-sm italic py-4">No archived records found.</p>
        ) : (
          archived.map(emp => (
            <div 
              key={emp.id} 
              className="bg-[#111827] border border-white/5 p-4 rounded-xl flex justify-between items-center hover:border-white/10 transition-colors group"
            >
              <div>
                <p className="text-white font-medium group-hover:text-emerald-400 transition-colors">
                  {emp.name || "Unknown Name"}
                </p>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  ID: {emp.employee_id}
                </p>
              </div>
              
              <div className="flex gap-2">
                {/* Restore Button */}
                <button 
                  onClick={() => handleRestore(emp.id)}
                  className="p-2.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-all active:scale-95"
                  title="Restore Employee"
                >
                  <RotateCcw size={18} />
                </button>

                {/* Permanent Delete Button */}
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