import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { X, Save, User, Calendar, LogIn, LogOut, AlertCircle } from 'lucide-react';

const ManualEntryModal = ({ isOpen, onClose, onRefresh }) => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    check_in: '', 
    check_out: '' 
  });

  useEffect(() => {
    if (isOpen) {
      const fetchEmployees = async () => {
        try {
          const response = await api.get('/admin/users/');
          const activeOnes = response.data.filter(emp => emp.is_active !== false);
          setEmployees(activeOnes);
        } catch (err) {
          console.error("Failed to load employees", err);
          setEmployees([]); 
        }
      };
      fetchEmployees();
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.check_in && !formData.check_out) {
      alert("Please provide at least a Check-In or a Check-Out time.");
      return;
    }

    setLoading(true);
    try {
      let check_in_iso = null;
      let check_out_iso = null;

      if (formData.check_in) {
        check_in_iso = `${formData.date}T${formData.check_in}:00`;
      }
      
      if (formData.check_out) {
        let checkOutDate = formData.date;
        if (formData.check_in && formData.check_out < formData.check_in) {
          const dateObj = new Date(formData.date);
          dateObj.setDate(dateObj.getDate() + 1);
          checkOutDate = dateObj.toISOString().split('T')[0];
        }
        check_out_iso = `${checkOutDate}T${formData.check_out}:00`;
      }

      const payload = {
        employee_id: formData.employee_id,
        check_in: check_in_iso,
        check_out: check_out_iso
      };

      // Corrected endpoint to match Backend router
      await api.post('/admin/actions/attendance/manual', payload);
      
      setFormData({ 
        employee_id: '', 
        date: new Date().toISOString().split('T')[0], 
        check_in: '', 
        check_out: '' 
      });

      onRefresh(); 
      onClose();   
    } catch (err) {
      console.error("Manual Entry Error:", err);
      alert("Error saving log: " + (err.response?.data?.detail || "Server error"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputStyle = "w-full bg-[#0b1220] border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-[#167454] focus:ring-1 focus:ring-[#167454]/20 transition-all [color-scheme:dark]";
  const labelStyle = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2 ml-1";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-[#1e293b] border border-white/5 rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden shadow-emerald-900/10">
        
        <div className="flex justify-between items-center p-8 border-b border-white/5 bg-white/[0.01]">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-3 italic">
              Attendance<span className="text-[#167454]">Correction</span>
            </h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Manual Biometric Sync</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors bg-slate-800/50 p-2 rounded-full">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className={labelStyle}><User size={14} className="text-slate-400" /> Staff Member</label>
            <select
              required
              className={inputStyle}
              value={formData.employee_id}
              onChange={(e) => setFormData({...formData, employee_id: e.target.value})}
            >
              <option value="">Select Employee...</option>
              {employees.map((emp) => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.name || emp.employee_id} — {emp.department}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelStyle}><Calendar size={14} className="text-slate-400" /> Duty Date</label>
            <input
              type="date"
              required
              className={inputStyle}
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelStyle}><LogIn size={14} className="text-emerald-500" /> Manual In</label>
              <input
                type="time"
                className={inputStyle.replace('focus:border-[#167454]', 'focus:border-emerald-500')}
                value={formData.check_in}
                onChange={(e) => setFormData({...formData, check_in: e.target.value})}
              />
            </div>
            <div>
              <label className={labelStyle}><LogOut size={14} className="text-rose-500" /> Manual Out</label>
              <input
                type="time"
                className={inputStyle.replace('focus:border-[#167454]', 'focus:border-rose-500')}
                value={formData.check_out}
                onChange={(e) => setFormData({...formData, check_out: e.target.value})}
              />
            </div>
          </div>

          <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
              This will overwrite or create a duty session for the selected date. Ensure times align with the employee's assigned shift.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#167454] hover:bg-emerald-600 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
            >
              {loading ? "Processing..." : <><Save size={16} /> Sync Attendance</>}
            </button>
            <button 
              type="button"
              onClick={onClose}
              className="w-full py-3 text-slate-500 hover:text-slate-300 font-bold text-[10px] uppercase tracking-[0.2em] transition-colors"
            >
              Dismiss
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualEntryModal;