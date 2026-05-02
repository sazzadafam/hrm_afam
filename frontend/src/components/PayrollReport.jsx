import React, { useEffect, useState } from "react";
import api from "../api/axios";
import { Trophy, Clock, FileSpreadsheet } from "lucide-react";

// ---------------------------------------------------------------------------
// PayrollReport — summary cards (current month)
// ---------------------------------------------------------------------------

const PayrollReport = () => {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/payroll/summary")
      .then((res) => setData(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        No payroll data available for this month.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data.map((emp) => {
        const pct = emp.progress ?? 0;
        // Use static color classes — Tailwind cannot resolve dynamic class names
        const barColor =
          pct >= 100 ? "bg-emerald-500"
          : pct >= 75 ? "bg-blue-500"
          : pct >= 50 ? "bg-amber-500"
          : "bg-slate-600";

        const badgeStyle =
          emp.category === "Full"
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : emp.category === "Bonus (OT)"
            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
            : "bg-amber-500/10 text-amber-400 border-amber-500/20";

        const isMet = emp.total_hours >= (emp.standard_hours || 312);

        return (
          <div
            key={emp.employee_id}
            className="bg-[#111827] border border-white/5 p-5 rounded-2xl relative overflow-hidden"
          >
            {/* Progress bar */}
            <div
              className={`absolute bottom-0 left-0 h-1 transition-all duration-1000 ${barColor}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />

            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-white font-bold text-sm">{emp.name}</h4>
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-tighter mt-0.5">
                  {emp.employee_id}
                </p>
              </div>
              <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border ${badgeStyle}`}>
                {emp.category}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-3xl font-black text-white">
                {emp.total_hours}
                <span className="text-xs text-slate-500 ml-1">hrs</span>
              </div>
              <div className="flex-1">
                {isMet ? (
                  <div className="flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
                    <Trophy size={11} /> Target Met
                  </div>
                ) : (
                  <div className="text-slate-500 text-[10px]">
                    Needs {((emp.standard_hours || 312) - emp.total_hours).toFixed(1)}h for Full Pay
                  </div>
                )}
                <div className="text-[9px] text-slate-600 mt-0.5">{pct}% of target</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ExportButton
// ---------------------------------------------------------------------------

const ExportButton = ({ month, year }) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const m = month || new Date().getMonth() + 1;
      const y = year  || new Date().getFullYear();
      const res = await api.get(`/admin/payroll/export-csv?month=${m}&year=${y}`, {
        responseType: "blob",
      });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href  = url;
      const monthName = new Date(y, m - 1).toLocaleString("en-US", { month: "long" });
      link.setAttribute("download", `Payroll_${monthName}_${y}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Ensure you are logged in as an Admin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/20 transition-all active:scale-95 disabled:opacity-50"
    >
      <FileSpreadsheet size={16} />
      {loading ? "Exporting…" : "Export to CSV"}
    </button>
  );
};

export { PayrollReport, ExportButton };














// import React, { useEffect, useState } from 'react';
// import api from '../api/axios';
// import { Trophy, Clock, AlertCircle } from 'lucide-react';
// import { Download, FileSpreadsheet } from 'lucide-react';

// const PayrollReport = () => {
//   const [data, setData] = useState([]);

//   useEffect(() => {
//     api.get('/admin/payroll/summary').then(res => setData(res.data));
//   }, []);

//   return (
//     <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
//       {data.map((emp) => (
//         <div key={emp.employee_id} className="bg-[#111827] border border-white/5 p-5 rounded-2xl relative overflow-hidden">
//           <div 
//             className={`absolute bottom-0 left-0 h-1 transition-all duration-1000 bg-${emp.status_color}-500`}
//             style={{ width: `${emp.progress}%`, boxShadow: `0 0 15px ${emp.status_color}` }}
//           />
          
//           <div className="flex justify-between items-start mb-4">
//             <div>
//               <h4 className="text-white font-bold">{emp.name}</h4>
//               <p className="text-[10px] text-slate-500 font-mono uppercase tracking-tighter">ID: {emp.employee_id}</p>
//             </div>
//             <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border border-${emp.status_color}-500/20 bg-${emp.status_color}-500/10 text-${emp.status_color}-400`}>
//               {emp.category}
//             </span>
//           </div>

//           <div className="flex items-center gap-4">
//             <div className="text-3xl font-black text-white">{emp.total_hours}<span className="text-xs text-slate-500 ml-1">hrs</span></div>
//             <div className="flex-1">
//                {emp.total_hours >= 78 ? (
//                  <div className="flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
//                    <Trophy size={12}/> Target Met
//                  </div>
//                ) : (
//                  <div className="text-slate-500 text-[10px]">
//                    Needs { (78 - emp.total_hours).toFixed(1) }h for Full Pay
//                  </div>
//                )}
//             </div>
//           </div>
//         </div>
//       ))}
//     </div>
//   );
// };


// const ExportButton = () => {
//   const handleExport = async () => {
//     try {
//       const response = await api.get('/admin/payroll/export-csv', {
//         responseType: 'blob', 
//       });
      
//       const url = window.URL.createObjectURL(new Blob([response.data]));
//       const link = document.createElement('a');
//       link.href = url;
//       link.setAttribute('download', `Payroll_Report_${new Date().getMonth() + 1}.csv`);
//       document.body.appendChild(link);
//       link.click();
//       link.remove();
//     } catch (err) {
//       alert("Export failed. Ensure you are logged in as an Admin.");
//     }
//   };

//   return (
//     <button 
//       onClick={handleExport}
//       className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
//     >
//       <FileSpreadsheet size={18} />
//       Export to Excel (.csv)
//     </button>
//   );
// };

// export { PayrollReport, ExportButton };