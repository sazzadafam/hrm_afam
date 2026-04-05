import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Edit2, Fingerprint, UserMinus, Eye, Clock, Store, Banknote, Clock10Icon } from 'lucide-react';
import { deleteEmployee } from '../api/employeeService';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import EditEmployeeModal from './EditEmployeeModal';

const EmployeeTable = ({ employees = [], loading, onRefresh }) => {
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, empId: null, empName: '' });
  const [editModal, setEditModal] = useState({ isOpen: false, employee: null });
  const navigate = useNavigate();

  const userRole = localStorage.getItem('role');
  const isReadOnly = userRole === 'read_only_admin';
  const IMAGE_BASE_URL = "http://localhost:8000/";

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => {
      const idA = String(a.employee_id || "");
      const idB = String(b.employee_id || "");
      return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [employees]);

  const handleViewDetails = (id) => {
    if (!id) return;
    navigate(`/employees/${id}`);
  };

  // Fixed Edit Handler with full isolation
  const handleEditClick = (e, emp) => {
    e.preventDefault();
    e.stopPropagation(); 
    setEditModal({ isOpen: true, employee: emp });
  };

  const handleConfirmDeactivate = async () => {
    if (isReadOnly) return;
    try {
      await deleteEmployee(deleteModal.empId);
      onRefresh();
      setDeleteModal({ isOpen: false, empId: null, empName: '' });
    } catch (err) { 
      alert("Deactivation failed."); 
    }
  };

  return (
    <div className="bg-slate-900/50 border border-white/10 rounded-[2rem] overflow-hidden backdrop-blur-md shadow-2xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black">
              <th className="px-6 py-5 text-center w-20">Profile</th>
              <th className="px-6 py-5">Personnel Details</th>
              <th className="px-6 py-5">Store & Shift</th>
              <th className="px-6 py-5">Duty Time</th>
              <th className="px-6 py-5">Status</th>
              {!isReadOnly && <th className="px-6 py-5 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {!loading && sortedEmployees.map((emp) => (
              <tr 
                key={emp.id} 
                className="hover:bg-white/[0.02] group transition-all duration-200 cursor-pointer border-b border-white/5" 
                onClick={() => handleViewDetails(emp.id)}
              >
                {/* Profile Image */}
                <td className="px-6 py-4">
                  <div className="flex justify-center">
                    <img 
                      src={emp.image_path ? `${IMAGE_BASE_URL}${emp.image_path}` : `https://ui-avatars.com/api/?name=${emp.name}&background=0f172a&color=3b82f6`} 
                      alt={emp.name} 
                      className="w-11 h-11 rounded-2xl object-cover border border-white/10 group-hover:border-blue-500/50 transition-all shadow-lg"
                      onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${emp.name}&background=0f172a&color=3b82f6` }}
                    />
                  </div>
                </td>

                {/* Personnel Details */}
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-white group-hover:text-red-400 transition-colors uppercase tracking-tight">{emp.name}</div>
                  <div className="flex flex-col gap-0.5 mt-1">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5"><Mail size={10} className="text-blue-500"/> {emp.email}</div>
                    <div className="text-[10px] text-blue-400 font-mono font-black flex items-center gap-1.5 italic">
                       <Fingerprint size={10}/> ID: {emp.employee_id}
                    </div>
                  </div>
                </td>

                {/* Store & Shift */}
                <td className="px-6 py-4">
                  <div className="text-[11px] text-slate-200 font-bold flex items-center gap-2 mb-1 uppercase tracking-wider">
                    <Store size={12} className="text-amber-500"/> {emp.department || 'Main Store'}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-2 font-medium">
                    <Clock size={10} className="text-slate-600"/> 
                    {emp.shift_start} - {emp.shift_end} 
                    <span className="bg-slate-800 text-blue-400 px-1.5 py-0.5 rounded ml-1 text-[8px] font-black">{emp.duty_hour}h</span>
                  </div>
                </td>

                {/* Compensation */}
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Duty Hour</div>
                    <div className="text-sm font-black text-white flex items-center gap-1">
                      <Clock10Icon size={14} className="opacity-50"/>
                      {emp.gross_salary ? Number(emp.duty_hour).toLocaleString() : '0'}
                      <span className="text-[9px] text-emerald-600 ml-0.5">H</span>
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td className="px-6 py-4 text-center">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                    emp.is_active 
                    ? "text-emerald-400 bg-emerald-500/5 border-emerald-500/20" 
                    : "text-red-400 bg-red-500/5 border-red-500/20"
                  }`}>
                    <div className={`w-1 h-1 rounded-full ${emp.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></div>
                    {emp.is_active ? 'Active' : 'Archived'}
                  </div>
                </td>

                {/* Management Actions */}
                {!isReadOnly && (
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                      
                      {/* View Details Button */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleViewDetails(emp.id); }} 
                        className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all active:scale-90" 
                        title="View Details"
                      >
                        <Eye size={16}/>
                      </button>
                      
                      {/* Premium Edit Button */}
                      <button 
                        onClick={(e) => handleEditClick(e, emp)} 
                        className="p-2 text-slate-400 hover:text-blue-400 bg-white/5 hover:bg-blue-500/15 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)] border border-white/5 hover:border-blue-500/40 rounded-xl transition-all duration-300 active:scale-90" 
                        title="Edit Employee"
                      >
                        <Edit2 size={16}/>
                      </button>

                      {/* Archive Button */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setDeleteModal({ isOpen: true, empId: emp.id, empName: emp.name }); }} 
                        className="p-2 text-slate-400 hover:text-red-500 bg-white/5 hover:bg-red-500/15 border border-white/5 hover:border-red-500/40 rounded-xl transition-all active:scale-90" 
                        title="Archive Employee"
                      >
                        <UserMinus size={16}/>
                      </button>
                      
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && sortedEmployees.length === 0 && (
        <div className="p-20 text-center">
          <div className="text-slate-600 text-sm font-medium">No employees found.</div>
        </div>
      )}

      {/* Modals */}
      {!isReadOnly && (
        <>
          <ConfirmDeleteModal 
            isOpen={deleteModal.isOpen} 
            employeeName={deleteModal.empName} 
            onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })} 
            onConfirm={handleConfirmDeactivate} 
          />
          <EditEmployeeModal 
            isOpen={editModal.isOpen} 
            employee={editModal.employee} 
            onClose={() => setEditModal({ isOpen: false, employee: null })} 
            onRefresh={onRefresh} 
          />
        </>
      )}
    </div>
  );
};

export default EmployeeTable;