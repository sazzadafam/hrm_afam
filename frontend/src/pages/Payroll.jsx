import React, { useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import PayrollProgress from "../components/PayrollProgress";
import SalarySlip from "../components/SalarySlip";
import {
  DollarSign, FileText, ChevronRight, Download,
  Search, FileSpreadsheet, Calendar, Lock,
  CheckCircle2, AlertTriangle, X, RefreshCcw
} from "lucide-react";

// ---------------------------------------------------------------------------
// Confirm Modal — replaces window.confirm
// ---------------------------------------------------------------------------
const ConfirmModal = ({ message, onConfirm, onClose, loading }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200] p-4">
    <div className="bg-[#1e293b] border border-white/10 rounded-[2rem] w-full max-w-sm shadow-2xl p-8 text-center space-y-5">
      <div className="w-14 h-14 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto">
        <Lock size={24} className="text-blue-400" />
      </div>
      <h3 className="text-white font-bold text-sm uppercase tracking-widest">Confirm Action</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{message}</p>
      <div className="flex gap-3 pt-2">
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-2xl border border-white/10 text-slate-400 text-xs font-bold uppercase hover:bg-white/5 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase hover:bg-blue-500 transition-all disabled:opacity-50"
        >
          {loading ? "Processing…" : "Confirm"}
        </button>
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Main Payroll Page
// ---------------------------------------------------------------------------
const Payroll = () => {
  const [employees,       setEmployees]       = useState([]);
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [searchTerm,      setSearchTerm]      = useState("");
  const [month,           setMonth]           = useState(new Date().getMonth() + 1);
  const [year,            setYear]            = useState(new Date().getFullYear());
  const [error,           setError]           = useState("");
  const [successMsg,      setSuccessMsg]      = useState("");
  const [confirmModal,    setConfirmModal]    = useState(null);   // { message, onConfirm }
  const [actionLoading,   setActionLoading]   = useState(false);

  const userRole   = (localStorage.getItem("role") || "").toLowerCase();
  const isAdmin    = userRole === "admin";
  const isReadOnly = userRole === "read_only_admin" || userRole === "auditor";

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  // ── Fetch payroll preview ────────────────────────────────────────────────
  const fetchPayrollData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/admin/payroll/calculate-batch/${month}/${year}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setEmployees(data);
      // Keep selected payroll in sync if already selected
      if (selectedPayroll) {
        const refreshed = data.find((e) => e.employee_id === selectedPayroll.employee_id);
        if (refreshed) setSelectedPayroll(refreshed);
      }
} catch (err) {
      setError("Failed to load payroll data. Check server logs.");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { fetchPayrollData(); }, [fetchPayrollData]);

  // ── Lock & Finalize ───────────────────────────────────────────────────────
  const handleGenerateAll = () => {
    if (!isAdmin) return;
    const monthName = new Date(year, month - 1).toLocaleString("en-US", { month: "long" });
    setConfirmModal({
      message: `Lock and finalize payroll for ${monthName} ${year}? Existing records will be updated.`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const res = await api.post(`/admin/payroll/generate-batch/${month}/${year}`);
          showSuccess(res.data?.message || "Payroll locked successfully.");
          setConfirmModal(null);
          fetchPayrollData();
        } catch (err) {
          setError(err?.response?.data?.detail || "Failed to lock payroll.");
          setConfirmModal(null);
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // ── Export CSV — uses api instance, not window.open ──────────────────────
  const handleExportCSV = async () => {
    try {
      const res = await api.get(`/admin/payroll/export-csv?month=${month}&year=${year}`, {
        responseType: "blob",
      });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href  = url;
      const monthName = new Date(year, month - 1).toLocaleString("en-US", { month: "long" });
      link.setAttribute("download", `Payroll_${monthName}_${year}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("CSV export failed. Ensure you have access.");
    }
  };

  // ── Download PDF payslip — uses api instance ─────────────────────────────
  const handleDownloadPayslip = async (empId) => {
    try {
      const res = await api.get(
        `/admin/payroll/payslip/${empId}/${month}/${year}`,
        { responseType: "blob" }
      );
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href  = url;
      link.setAttribute("download", `Payslip_${empId}_${month}_${year}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate payslip PDF. Ensure payroll is locked first.");
    }
  };

  const filtered = employees.filter(
    (e) =>
      (e.name  || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.employee_id || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPayout = employees.reduce((s, e) => s + (e.net_salary || 0), 0);
  const isLocked    = employees.some((e) => e.status === "locked");

  return (
    <div className="p-6 lg:p-8 bg-[#0f172a] min-h-screen text-slate-200">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start mb-8 gap-6">
        <div>
          <h1 className="text-3xl font-black text-white">
            {isReadOnly ? "Payroll Audit" : "Payroll Management"}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-slate-400 text-xs mt-2">
            <span className="flex items-center gap-1">
              <Calendar size={12} className="text-blue-400" />
              Rule: duty_hour × 26 days = standard monthly hours
            </span>
            {isLocked && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold">
                <Lock size={10} /> Locked
              </span>
            )}
            {isReadOnly && (
              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-bold">
                READ-ONLY ACCESS
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Month / Year selector */}
          <div className="flex bg-slate-900 border border-white/10 rounded-xl p-1">
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="bg-transparent px-3 py-2 text-sm outline-none border-r border-white/10 text-white cursor-pointer"
            >
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={i + 1} className="bg-slate-900">
                  {new Date(0, i).toLocaleString("en-US", { month: "long" })}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="bg-transparent px-3 py-2 text-sm w-20 outline-none text-white text-center"
              min={2020}
              max={2099}
            />
          </div>

          <button
            onClick={fetchPayrollData}
            title="Refresh"
            className="p-2.5 bg-slate-800 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
          >
            <RefreshCcw size={16} />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl transition-all border border-white/5 text-sm font-bold"
          >
            <FileSpreadsheet size={16} /> Export CSV
          </button>

          {isAdmin && (
            <button
              onClick={handleGenerateAll}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20 text-sm"
            >
              <Lock size={16} /> Lock & Finalize
            </button>
          )}
        </div>
      </div>

      {/* ── Banners ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-5 flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm rounded-2xl px-5 py-3">
          <AlertTriangle size={14} className="shrink-0" /> {error}
          <button onClick={() => setError("")} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {successMsg && (
        <div className="mb-5 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-2xl px-5 py-3">
          <CheckCircle2 size={14} className="shrink-0" /> {successMsg}
        </div>
      )}

      {/* ── Summary strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Employees",      value: employees.length,                    color: "text-blue-400" },
          { label: "Total Payout",   value: `SAR ${totalPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-emerald-400" },
          { label: "Total Hours",    value: `${employees.reduce((s, e) => s + (e.total_actual_hours || 0), 0).toFixed(0)}h`, color: "text-cyan-400" },
          { label: "Status",         value: isLocked ? "Locked" : "Preview",     color: isLocked ? "text-emerald-400" : "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{label}</p>
            <p className={`text-xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Main grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* Left: Employee table */}
        <div className="xl:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:border-blue-500 outline-none transition-all text-sm placeholder:text-slate-600"
            />
          </div>

          <div className="bg-[#1e293b]/40 rounded-2xl overflow-hidden border border-white/5 backdrop-blur-sm">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-600">
                <DollarSign size={32} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">No payroll records found</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-white/5 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4 text-center">Benefit</th>
                    <th className="px-6 py-4 text-center">Penalty</th>
                    <th className="px-6 py-4">Progress</th>
                    <th className="px-6 py-4 text-right">Net Payout</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((emp) => {
                    const target    = emp.standard_monthly_hours || (emp.duty_hour || 12) * 26;
                    const isSelected = selectedPayroll?.employee_id === emp.employee_id;
                    return (
                      <tr
                        key={emp.employee_id}
                        onClick={() => setSelectedPayroll(isSelected ? null : emp)}
                        className={`hover:bg-white/5 transition-all cursor-pointer ${isSelected ? "bg-blue-500/10" : ""}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {emp.status === "locked" && (
                              <Lock size={12} className="text-emerald-400 shrink-0" />
                            )}
                            <div>
                              <p className="text-white font-bold text-sm">{emp.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">{emp.employee_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-lg">
                            +{emp.total_benefit_hours ?? 0}h
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {(emp.penalty_deduction_hours ?? 0) > 0 ? (
                            <span className="px-2 py-1 bg-rose-500/10 text-rose-400 text-[10px] font-black rounded-lg">
                              -{emp.penalty_deduction_hours}h
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 w-52">
                          <PayrollProgress
                            workedHours={emp.total_actual_hours ?? 0}
                            target={target}
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="text-white font-black text-base">
                            SAR {(emp.net_salary ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {emp.hourly_rate_at_time?.toFixed(4)}/hr
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <ChevronRight
                            size={16}
                            className={isSelected ? "text-blue-400" : "text-slate-600"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Salary slip preview */}
        <div className="xl:col-span-1">
          {selectedPayroll ? (
            <div className="sticky top-8 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="text-blue-400" size={18} /> Slip Preview
                </h2>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => handleDownloadPayslip(selectedPayroll.employee_id)}
                    title="Download PDF"
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600/20 text-blue-400 rounded-xl hover:bg-blue-600/40 transition-all border border-blue-400/20 text-xs font-bold"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button
                    onClick={() => setSelectedPayroll(null)}
                    className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="origin-top transform shadow-2xl border border-white/5 rounded-3xl overflow-hidden">
                <SalarySlip payrollData={selectedPayroll} />
              </div>
            </div>
          ) : (
            <div className="h-[420px] border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <DollarSign size={28} className="opacity-20" />
              </div>
              <p className="text-sm font-medium leading-relaxed">
                Select an employee from the list<br />to preview their salary slip.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
};

export default Payroll;













// import React, { useState, useEffect } from 'react';
// import api from '../api/axios';
// import PayrollProgress from '../components/PayrollProgress';
// import SalarySlip from '../components/SalarySlip';
// import { DollarSign, FileText, ChevronRight, Download, Search, FileSpreadsheet, Calendar} from 'lucide-react';

// const Payroll = () => {
//   const [employees, setEmployees] = useState([]);
//   const [selectedPayroll, setSelectedPayroll] = useState(null);
//   const [loading, setLoading] = useState(true);
//   const [searchTerm, setSearchTerm] = useState('');
//   const [month, setMonth] = useState(new Date().getMonth() + 1);
//   const [year, setYear] = useState(new Date().getFullYear());

//   // ROLE CHECK
//   const userRole = localStorage.getItem('role');
//   const isAdmin = userRole === 'admin';
//   const isReadOnly = userRole === 'read_only_admin';

//   const fetchPayrollData = async () => {
//     setLoading(true);
//     try {
//       const response = await api.get(`/admin/payroll/calculate-batch/${month}/${year}`);
//       // Ensure we always set an array even if the backend fails
//       setEmployees(Array.isArray(response.data) ? response.data : []);
//       setLoading(false);
//     } catch (err) {
//       console.error("Payroll sync failed:", err);
//       setEmployees([]); // Reset to empty array on error to prevent .filter crash
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchPayrollData();
//   }, [month, year]);

//   const handleGenerateAll = async () => {
//     if (!isAdmin) return;
//     if(window.confirm(`Generate and Lock payroll for ${month}/${year}?`)) {
//       try {
//         await api.post(`/admin/payroll/generate-batch/${month}/${year}`);
//         alert("Monthly Payroll Locked Successfully!");
//         fetchPayrollData(); 
//       } catch (err) {
//         alert("Error locking payroll. Check server logs.");
//       }
//     }
//   };

//   const handleDownloadPayslip = (empId) => {
//     window.open(`http://localhost:8000/admin/payroll/payslip/${empId}/${month}/${year}`, '_blank');
//   };

//   const handleExportCSV = () => {
//     window.open(`http://localhost:8000/admin/payroll/export-csv`, '_blank');
//   };

//   return (
//     <div className="p-8 bg-[#0f172a] min-h-screen text-slate-200">
      
//       {/* Header & Controls */}
//       <div className="flex flex-col lg:flex-row justify-between items-start mb-10 gap-6">
//         <div>
//           <h1 className="text-3xl font-black text-white">
//             {isReadOnly ? 'Payroll Audit' : 'Payroll Management'}
//           </h1>
//           <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
//             <Calendar size={14} className="text-blue-400" />
//             <span>Rule: 312h Standard (78h Week = 84h Pay)</span>
//             {isReadOnly && (
//               <span className="ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded border border-amber-500/20">
//                 READ-ONLY ACCESS
//               </span>
//             )}
//           </div>
//         </div>

//         <div className="flex flex-wrap gap-3">
//           <button 
//             onClick={handleExportCSV}
//             className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-3 rounded-xl transition-all flex items-center gap-2 border border-white/5"
//           >
//             <FileSpreadsheet size={18} /> Export CSV
//           </button>

//           <div className="flex bg-slate-900 border border-white/10 rounded-xl p-1">
//             <select 
//               value={month} 
//               onChange={(e) => setMonth(parseInt(e.target.value))}
//               className="bg-transparent px-3 py-2 text-sm outline-none border-r border-white/10 text-white cursor-pointer"
//             >
//               {[...Array(12)].map((_, i) => (
//                 <option key={i+1} value={i+1} className="bg-slate-900">
//                   {new Date(0, i).toLocaleString('en-US', { month: 'long' })}
//                 </option>
//               ))}
//             </select>
//             <input 
//               type="number" 
//               value={year} 
//               onChange={(e) => setYear(parseInt(e.target.value))}
//               className="bg-transparent px-3 py-2 text-sm w-24 outline-none text-white text-center"
//             />
//           </div>
          
//           {isAdmin && (
//             <button 
//               onClick={handleGenerateAll}
//               className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
//             >
//               <DollarSign size={18} /> Lock & Finalize
//             </button>
//           )}
//         </div>
//       </div>

//       <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
//         <div className="xl:col-span-2 space-y-4">
//           <div className="relative mb-6">
//             <Search className="absolute left-4 top-3.5 text-slate-500" size={18} />
//             <input 
//               type="text" 
//               placeholder="Search by name or ID..."
//               className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:border-blue-500 outline-none transition-all"
//               onChange={(e) => setSearchTerm(e.target.value)}
//             />
//           </div>

//           <div className="bg-[#1e293b]/30 rounded-2xl overflow-hidden border border-white/5 backdrop-blur-sm">
//             <table className="w-full text-left border-collapse">
//               <thead className="bg-white/5 text-[10px] font-black uppercase text-slate-500 tracking-widest">
//                 <tr>
//                   <th className="p-6">Employee</th>
//                   <th className="p-6 text-center">Benefit</th>
//                   <th className="p-6 w-64">Monthly Goal (312h)</th>
//                   <th className="p-6 text-right">Estimated Payout</th>
//                   <th className="p-6"></th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-white/5">
//                 {employees
//                   .filter(e => e.name?.toLowerCase().includes(searchTerm.toLowerCase()))
//                   .map((emp) => (
//                   <tr 
//                     key={emp.employee_id} 
//                     className={`hover:bg-white/5 transition-all cursor-pointer ${selectedPayroll?.employee_id === emp.employee_id ? 'bg-blue-500/10' : ''}`}
//                     onClick={() => setSelectedPayroll(emp)}
//                   >
//                     <td className="p-6">
//                       <div className="flex flex-col">
//                         <span className="text-white font-bold">{emp.name}</span>
//                         <span className="text-[10px] text-slate-500 font-mono tracking-tight">{emp.employee_id}</span>
//                       </div>
//                     </td>
//                     <td className="p-6 text-center">
//                         <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-lg">
//                           +{emp.total_benefit_hours ?? 0}h
//                         </span>
//                     </td>
//                     <td className="p-6">
//                       <PayrollProgress workedHours={emp.total_actual_hours ?? 0} target={312} />
//                     </td>
//                     <td className="p-6 text-right">
//                       <div className="flex flex-col items-end">
//                         <span className="text-white font-black text-lg">
//                           {/* Safe call using Optional Chaining */}
//                           SAR {emp.gross_salary?.toLocaleString() ?? "0"}
//                         </span>
//                         <span className="text-[10px] text-slate-500">
//                           Rate: {emp.hourly_rate_at_time?.toLocaleString() ?? "0"}/hr
//                         </span>
//                       </div>
//                     </td>
//                     <td className="p-6">
//                       <ChevronRight size={18} className={`${selectedPayroll?.employee_id === emp.employee_id ? 'text-blue-400' : 'text-slate-600'}`} />
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         </div>

//         {/* Right Section: Salary Slip Preview */}
//         <div className="xl:col-span-1">
//           {selectedPayroll ? (
//             <div className="sticky top-8 space-y-6">
//               <div className="flex justify-between items-center text-white">
//                 <h2 className="text-lg font-bold flex items-center gap-2">
//                   <FileText className="text-blue-400" size={20} /> Slip Preview
//                 </h2>
//                 <div className="flex gap-2">
//                   <button 
//                     onClick={() => handleDownloadPayslip(selectedPayroll.employee_id)}
//                     className="p-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/40 transition-all border border-blue-400/20"
//                     title="Generate PDF Payslip"
//                   >
//                     <Download size={18} />
//                   </button>
//                   <button 
//                     onClick={() => setSelectedPayroll(null)}
//                     className="text-xs text-slate-500 hover:text-white px-2"
//                   >
//                     Close
//                   </button>
//                 </div>
//               </div>
//               <div className="scale-95 origin-top transform transition-all shadow-2xl border border-white/5 rounded-3xl">
//                 <SalarySlip payrollData={selectedPayroll} />
//               </div>
//             </div>
//           ) : (
//             <div className="h-[450px] border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center p-12 text-center text-slate-500">
//               <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
//                 <DollarSign size={32} className="opacity-20" />
//               </div>
//               <p className="text-sm font-medium">Select an employee from the list<br/>to preview their salary details.</p>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Payroll;