import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import PayrollProgress from '../components/PayrollProgress';
import SalarySlip from '../components/SalarySlip';
import { DollarSign, FileText, ChevronRight, Download, Search, FileSpreadsheet, Calendar} from 'lucide-react';

const Payroll = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  // ROLE CHECK
  const userRole = localStorage.getItem('role');
  const isAdmin = userRole === 'admin';
  const isReadOnly = userRole === 'read_only_admin';

  const fetchPayrollData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/admin/payroll/calculate-batch/${month}/${year}`);
      // Ensure we always set an array even if the backend fails
      setEmployees(Array.isArray(response.data) ? response.data : []);
      setLoading(false);
    } catch (err) {
      console.error("Payroll sync failed:", err);
      setEmployees([]); // Reset to empty array on error to prevent .filter crash
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, [month, year]);

  const handleGenerateAll = async () => {
    if (!isAdmin) return;
    if(window.confirm(`Generate and Lock payroll for ${month}/${year}?`)) {
      try {
        await api.post(`/admin/payroll/generate-batch/${month}/${year}`);
        alert("Monthly Payroll Locked Successfully!");
        fetchPayrollData(); 
      } catch (err) {
        alert("Error locking payroll. Check server logs.");
      }
    }
  };

  const handleDownloadPayslip = (empId) => {
    window.open(`http://localhost:8000/admin/payroll/payslip/${empId}/${month}/${year}`, '_blank');
  };

  const handleExportCSV = () => {
    window.open(`http://localhost:8000/admin/payroll/export-csv`, '_blank');
  };

  return (
    <div className="p-8 bg-[#0f172a] min-h-screen text-slate-200">
      
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start mb-10 gap-6">
        <div>
          <h1 className="text-3xl font-black text-white">
            {isReadOnly ? 'Payroll Audit' : 'Payroll Management'}
          </h1>
          <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
            <Calendar size={14} className="text-blue-400" />
            <span>Rule: 312h Standard (78h Week = 84h Pay)</span>
            {isReadOnly && (
              <span className="ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded border border-amber-500/20">
                READ-ONLY ACCESS
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button 
            onClick={handleExportCSV}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-3 rounded-xl transition-all flex items-center gap-2 border border-white/5"
          >
            <FileSpreadsheet size={18} /> Export CSV
          </button>

          <div className="flex bg-slate-900 border border-white/10 rounded-xl p-1">
            <select 
              value={month} 
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="bg-transparent px-3 py-2 text-sm outline-none border-r border-white/10 text-white cursor-pointer"
            >
              {[...Array(12)].map((_, i) => (
                <option key={i+1} value={i+1} className="bg-slate-900">
                  {new Date(0, i).toLocaleString('en-US', { month: 'long' })}
                </option>
              ))}
            </select>
            <input 
              type="number" 
              value={year} 
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="bg-transparent px-3 py-2 text-sm w-24 outline-none text-white text-center"
            />
          </div>
          
          {isAdmin && (
            <button 
              onClick={handleGenerateAll}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
            >
              <DollarSign size={18} /> Lock & Finalize
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-4">
          <div className="relative mb-6">
            <Search className="absolute left-4 top-3.5 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search by name or ID..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:border-blue-500 outline-none transition-all"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="bg-[#1e293b]/30 rounded-2xl overflow-hidden border border-white/5 backdrop-blur-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-white/5 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                <tr>
                  <th className="p-6">Employee</th>
                  <th className="p-6 text-center">Benefit</th>
                  <th className="p-6 w-64">Monthly Goal (312h)</th>
                  <th className="p-6 text-right">Estimated Payout</th>
                  <th className="p-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {employees
                  .filter(e => e.name?.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((emp) => (
                  <tr 
                    key={emp.employee_id} 
                    className={`hover:bg-white/5 transition-all cursor-pointer ${selectedPayroll?.employee_id === emp.employee_id ? 'bg-blue-500/10' : ''}`}
                    onClick={() => setSelectedPayroll(emp)}
                  >
                    <td className="p-6">
                      <div className="flex flex-col">
                        <span className="text-white font-bold">{emp.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono tracking-tight">{emp.employee_id}</span>
                      </div>
                    </td>
                    <td className="p-6 text-center">
                        <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-lg">
                          +{emp.total_benefit_hours ?? 0}h
                        </span>
                    </td>
                    <td className="p-6">
                      <PayrollProgress workedHours={emp.total_actual_hours ?? 0} target={312} />
                    </td>
                    <td className="p-6 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-white font-black text-lg">
                          {/* Safe call using Optional Chaining */}
                          SAR {emp.gross_salary?.toLocaleString() ?? "0"}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Rate: {emp.hourly_rate_at_time?.toLocaleString() ?? "0"}/hr
                        </span>
                      </div>
                    </td>
                    <td className="p-6">
                      <ChevronRight size={18} className={`${selectedPayroll?.employee_id === emp.employee_id ? 'text-blue-400' : 'text-slate-600'}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Section: Salary Slip Preview */}
        <div className="xl:col-span-1">
          {selectedPayroll ? (
            <div className="sticky top-8 space-y-6">
              <div className="flex justify-between items-center text-white">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <FileText className="text-blue-400" size={20} /> Slip Preview
                </h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleDownloadPayslip(selectedPayroll.employee_id)}
                    className="p-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/40 transition-all border border-blue-400/20"
                    title="Generate PDF Payslip"
                  >
                    <Download size={18} />
                  </button>
                  <button 
                    onClick={() => setSelectedPayroll(null)}
                    className="text-xs text-slate-500 hover:text-white px-2"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="scale-95 origin-top transform transition-all shadow-2xl border border-white/5 rounded-3xl">
                <SalarySlip payrollData={selectedPayroll} />
              </div>
            </div>
          ) : (
            <div className="h-[450px] border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <DollarSign size={32} className="opacity-20" />
              </div>
              <p className="text-sm font-medium">Select an employee from the list<br/>to preview their salary details.</p>
            </div>
          )}
        </div>
      </div>
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
//       setEmployees(response.data);
//       setLoading(false);
//     } catch (err) {
//       console.error("Payroll sync failed:", err);
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchPayrollData();
//   }, [month, year]);

//   const handleGenerateAll = async () => {
//     // SECURITY: Prevent execution if not admin
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
//             {isReadOnly ? 'Payroll Audit' : ' '}
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
          
//           {/* ACTION BUTTON: Only show for Admin */}
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
//                   .filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()))
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
//                        <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-lg">
//                          +{emp.total_benefit_hours}h
//                        </span>
//                     </td>
//                     <td className="p-6">
//                       <PayrollProgress workedHours={emp.total_actual_hours} target={312} />
//                     </td>
//                     <td className="p-6 text-right">
//                       <div className="flex flex-col items-end">
//                         <span className="text-white font-black text-lg">
//                           SAR {emp.gross_salary.toLocaleString()}
//                         </span>
//                         <span className="text-[10px] text-slate-500">
//                           Rate: {emp.hourly_rate_at_time}/hr
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
//                 {/* IMPORTANT: The Auditor can see the slip, 
//                   fulfilling the requirement to see Salary data. 
//                 */}
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