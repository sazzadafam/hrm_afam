import React, { useState, useEffect, useMemo } from "react";
import api from "../api/axios";
import * as XLSX from "xlsx";
import { Users, Clock, Activity, UserCheck, RefreshCcw, Edit3, History, Save, Trash2, X, Download, Search, AlertCircle, FileText } from "lucide-react";
import ManualEntryModal from "../components/ManualEntryForm";

const getAttendanceMetrics = (log) => {
  let isLate = false;
  let isEarly = false;
  const isAbsent = log.status?.toLowerCase() === "absent";
  const now = new Date();
  const logDate = new Date(log.check_in || log.date);
  const isToday = logDate.toDateString() === now.toDateString();

  let shiftStartTime = null;
  if (log.shift_start) {
    const [h, m] = log.shift_start.split(':').map(Number);
    shiftStartTime = new Date(logDate);
    shiftStartTime.setHours(h, m, 0, 0);
  }

  const isWaitingForShift = isToday && !log.check_in && shiftStartTime && now < shiftStartTime;
  if (isWaitingForShift) {
    return { isLate: false, isEarly: false, isAbsent: false, statusText: "Scheduled" };
  }

  if (isAbsent) {
    return { isLate: false, isEarly: false, isAbsent: true, statusText: "Absent" };
  }

  if (log.check_in && !log.check_out) {
    if (shiftStartTime) {
      isLate = (new Date(log.check_in) - shiftStartTime) / (1000 * 60) > 10;
    }
    return { isLate, isEarly: false, isAbsent: false, statusText: "On Duty" };
  }

  if (!log.check_in || !log.shift_start) {
    return { isLate: false, isEarly: false, isAbsent: false, statusText: "Normal" };
  }

  const checkInTime = new Date(log.check_in);
  isLate = (checkInTime - shiftStartTime) / (1000 * 60) > 10;

  if (log.check_out && log.shift_end) {
    const checkOutTime = new Date(log.check_out);
    const [eH, eM] = log.shift_end.split(':').map(Number);
    const shiftEnd = new Date(checkOutTime);
    shiftEnd.setHours(eH, eM, 0, 0);

    const [sH] = log.shift_start.split(':').map(Number);
    if (sH > eH && checkOutTime.getHours() > sH) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }
    isEarly = checkOutTime < shiftEnd;
  }

  let statusText = "Normal";
  if (isLate && isEarly) statusText = "Late Arrival & Early Leave";
  else if (isLate) statusText = "Late Arrival";
  else if (isEarly) statusText = "Early Leave";

  return { isLate, isEarly, isAbsent: false, statusText };
};

// --- COMPONENTS ---

const StatCard = ({ title, value, icon, colorClass }) => (
  <div className="bg-[#1e293b]/40 border border-white/5 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-red-900/10 backdrop-blur-sm">
    <div className="flex justify-between">
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">{title}</p>
        <h3 className="text-4xl font-black text-white mt-2 tracking-tight">{value}</h3>
      </div>
      <div className={`p-3 rounded-xl border ${colorClass}`}>{icon}</div>
    </div>
  </div>
);

const AttendanceTable = ({ logs, onEdit, onDelete, isReadOnly, canDelete }) => {
  const formatWorkHours = (decimal) => {
    if (!decimal || decimal === 0) return "0.00h";
    const h = Math.floor(decimal);
    const m = Math.round((decimal - h) * 60);
    return `${h}.${m.toString().padStart(2, '0')}h`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-slate-500 text-[10px] uppercase tracking-widest bg-white/[0.02]">
            <th className="px-6 py-5">Staff & Shop</th>
            <th className="px-6 py-5">Date</th>
            <th className="px-6 py-5 text-center">Shift</th>
            <th className="px-6 py-5">Stamps (IN/OUT)</th>
            <th className="px-6 py-5 text-center">Duration</th>
            {!isReadOnly && <th className="px-6 py-5 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {logs.map((log) => {
            const { isLate, isEarly, isAbsent } = getAttendanceMetrics(log);
            return (
              <tr key={log.id} className={`hover:bg-white/[0.02] transition-colors group ${isAbsent ? 'bg-red-500/5' : ''}`}>
                <td className="px-6 py-4">
                  <div className="text-white font-bold text-sm flex items-center">
                    {log.name} 
                    {isAbsent ? (
                      <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded ml-2 animate-pulse flex items-center gap-1 shadow-lg shadow-red-500/20">
                        <AlertCircle size={8}/> ABSENT
                      </span>
                    ) : (
                      <>
                        {isLate && (
                          <span className="bg-red-500/10 text-red-500 text-[8px] font-black px-1.5 py-0.5 rounded border border-red-500/20 ml-2 italic tracking-tighter">
                            LATE ARRIVAL
                          </span>
                        )}
                        {isEarly && (
                          <span className="bg-amber-500/10 text-amber-500 text-[8px] font-black px-1.5 py-0.5 rounded border border-amber-500/20 ml-2 italic tracking-tighter">
                            EARLY LEAVE
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="text-green-500 text-[9px] font-black uppercase tracking-widest mt-0.5">{log.department || 'Main Office'}</div>
                </td>
                <td className="px-6 py-4 text-xs text-slate-400">
                  {new Date(log.check_in || log.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${log.shift_type === 'Day' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-400'}`}>{log.shift_type || 'Duty'}</span>
                </td>
                <td className="px-6 py-4 text-[11px] font-mono">
                  {isAbsent ? (
                    <span className="text-red-500/60 italic font-bold">No Fingerprint Detected</span>
                  ) : (
                    <>
                      <div className={isLate ? "text-red-500 font-bold" : "text-emerald-500"}>
                        IN: {log.check_in ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </div>
                      <div className={isEarly ? "text-amber-500 font-bold" : "text-slate-500"}>
                        OUT: {log.check_out ? new Date(log.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-6 py-4 text-center text-sm font-black text-white">
                  {isAbsent ? "0.00h" : formatWorkHours(log.hours_worked)}
                </td>
                {!isReadOnly && (
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={()=>onEdit(log)} className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"><Edit3 size={14}/></button>
                      {canDelete && (
                         <button onClick={()=>onDelete(log.id)} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={14}/></button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};


const EditRecordModal = ({ log, onClose, onRefresh }) => {
  const [inTime, setInTime] = useState(log.check_in ? log.check_in.substring(0, 16) : "");
  const [outTime, setOutTime] = useState(log.check_out ? log.check_out.substring(0, 16) : "");

  const handleSave = async () => {
    try {
      await api.put(`/admin/actions/attendance/${log.id}`, { 
        check_in: inTime || null, 
        check_out: outTime || null 
      });
      onRefresh();
      onClose();
    } catch (err) { alert("Update failed."); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[#1e293b] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <h2 className="text-white font-black uppercase text-xs tracking-widest italic">Correction: <span className="text-red-500">{log.name}</span></h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20}/></button>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Manual In Time</label>
            <input type="datetime-local" value={inTime} onChange={(e)=>setInTime(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-red-500/50 [color-scheme:dark]" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Manual Out Time</label>
            <input type="datetime-local" value={outTime} onChange={(e)=>setOutTime(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-red-500/50 [color-scheme:dark]" />
          </div>
          <button onClick={handleSave} className="w-full py-4 bg-[#ef4444] text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl hover:bg-red-500 transition-all shadow-lg shadow-red-500/20">Sync Correction</button>
        </div>
      </div>
    </div>
  );
};


const AttendanceDashboard = () => {
  const [summary, setSummary] = useState({ present_now: 0, absent: 0, recent_logs: [], total_employees: 0 });
  const [allLogs, setAllLogs] = useState([]); 
  const [searchTerm, setSearchTerm] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(new Date().getMonth());
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const userRole = localStorage.getItem('role')?.toLowerCase();
  const isReadOnly = userRole === 'read_only_admin';
  const isAuditor = userRole === 'auditor';
  const isAdmin = userRole === 'admin';

  const deduplicateLogs = (data) => {
    const uniqueMap = new Map();
    data.forEach(log => {
      const dateStr = new Date(log.check_in || log.date).toDateString();
      const key = `${log.employee_id}-${dateStr}`;

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, log);
      } else {
        const existing = uniqueMap.get(key);
        if (existing.status?.toLowerCase() === "absent" && log.check_in) {
          uniqueMap.set(key, log);
        }
      }
    });
    return Array.from(uniqueMap.values());
  };

  const fetchSummary = async () => {
    setSyncing(true);
    try {
      await api.post("/attendance/mark-absents");

      const [statsRes, summaryRes, historyRes] = await Promise.all([
        api.get("/attendance/stats"),
        api.get("/attendance/summary"),
        api.get("/attendance/all")
      ]);

      const cleanSummary = deduplicateLogs(summaryRes.data || []);
      const cleanHistory = deduplicateLogs(historyRes.data || []);

      setSummary({ ...statsRes.data, recent_logs: cleanSummary });
      setAllLogs(cleanHistory);
    } catch (err) { console.error("Fetch error:", err); } 
    finally { setTimeout(() => setSyncing(false), 800); }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 60000);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(timer); };
  }, []);

  const handleDelete = async (id) => {
    if (!isAdmin) return;
    if (!window.confirm("Permanent delete this record?")) return;
    try {
      await api.delete(`/admin/actions/attendance/${id}`);
      fetchSummary();
    } catch (err) { alert("Delete failed"); }
  };

  const handleEditClick = (log) => {
    if (isReadOnly) return;
    setSelectedLog(log);
    setIsEditModalOpen(true);
  };

  const todayLogs = useMemo(() => {
    const today = new Date().toDateString();
    return (summary.recent_logs || []).filter(log => {
      const logDate = new Date(log.check_in || log.date).toDateString();
      return logDate === today;
    });
  }, [summary.recent_logs]);


  const filteredLogs = useMemo(() => {
    const year = new Date().getFullYear();
    const month = parseInt(monthFilter);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const allDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const baseLogs = allLogs.filter(log => {
      const logDate = new Date(log.check_in || log.date);
      const matchesMonth = logDate.getMonth() === month;
      const matchesDept = deptFilter === "all" || log.department === deptFilter;
      const matchesSearch = log.name?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesMonth && matchesDept && matchesSearch;
    });

    if (searchTerm && baseLogs.length > 0) {
      const employeeName = baseLogs[0].name;
      const employeeId = baseLogs[0].employee_id;
      const dept = baseLogs[0].department;

      return allDays.map(day => {
        const dateObj = new Date(year, month, day);
        const dateTitle = dateObj.toDateString();
        const found = baseLogs.find(l => new Date(l.check_in || l.date).toDateString() === dateTitle);
        
        return found || {
          id: `temp-${day}`,
          employee_id: employeeId,
          name: employeeName,
          department: dept,
          date: dateObj.toISOString(),
          status: "Absent",
          hours_worked: 0
        };
      });
    }

    return baseLogs;
  }, [allLogs, monthFilter, deptFilter, searchTerm]);


const handleAttendanceReport = () => {
    const year = new Date().getFullYear();
    const month = parseInt(monthFilter);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // 1. Group logs and count metrics
    const grouped = allLogs.reduce((acc, log) => {
        const logDate = new Date(log.check_in || log.date);
        if (logDate.getMonth() !== month) return acc;
        
        if (!acc[log.employee_id]) {
            acc[log.employee_id] = {
                id: log.employee_id,
                name: log.name,
                dept: log.department || 'Office',
                presentDays: 0,
                lateArrivals: 0,
                earlyLeaves: 0,
            };
        }
        
        const metrics = getAttendanceMetrics(log);
        
        // Count as present if they checked in (even if late)
        if (!metrics.isAbsent) acc[log.employee_id].presentDays += 1;
        
        // Track violations
        if (metrics.isLate) acc[log.employee_id].lateArrivals += 1;
        if (metrics.isEarly) acc[log.employee_id].earlyLeaves += 1;
        
        return acc;
    }, {});

    // 2. Apply the "4 Free, then 3 = 1 day" Deduction Rule
    const reportData = Object.values(grouped).map(emp => {
        const totalViolations = emp.lateArrivals + emp.earlyLeaves;
        
        let deductionDays = 0;
        
        // Rule: First 4 are free. Every 3 after that = 1 day deduction.
        if (totalViolations > 4) {
            const billableViolations = totalViolations - 4;
            deductionDays = Math.floor(billableViolations / 3);
        }

        const finalWorkedDays = emp.presentDays - deductionDays;
        
        // 3. Status Logic (Updated for strictness)
        let status = "Standard";
        if (totalViolations <= 4 && emp.presentDays >= (daysInMonth - 2)) {
            status = "Excellent";
        } else if (totalViolations > 10) {
            status = "Warning";
        }

        return {
            'Employee ID': emp.id,
            'Name': emp.name,
            'Department': emp.dept,
            'Total Month Days': daysInMonth,
            'Actual Days Present': emp.presentDays,
            'Late Arrivals': emp.lateArrivals,
            'Early Leaves': emp.earlyLeaves,
            'Total Violations': totalViolations,
            'Grace Used': Math.min(totalViolations, 4),
            'Violation Deductions (Days)': deductionDays,
            'Final Payable Days': Math.max(0, finalWorkedDays), // Ensure it doesn't go negative
            'Performance Status': status
        };
    });

    // 4. Export to Excel
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Report");
    XLSX.writeFile(wb, `AFAM_Report_${month + 1}_${year}.xlsx`);
};


const handleExport = () => {
    const exportData = filteredLogs.map(log => {
      const metrics = getAttendanceMetrics(log);
      return {
        'Employee ID': log.employee_id,
        'Name': log.name,
        'Shop Name': log.department || 'N/A',
        'Date': new Date(log.check_in || log.date).toLocaleDateString(),
        // FIX: Use metrics.isAbsent to hide scheduled times for absent personnel
        'Check In': metrics.isAbsent ? "" : (log.check_in ? new Date(log.check_in).toLocaleTimeString() : "--:--"),
        'Check Out': metrics.isAbsent ? "" : (log.check_out ? new Date(log.check_out).toLocaleTimeString() : "--:--"),
        'Hours': log.hours_worked,
        'Status': metrics.statusText 
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData); 
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "Attendance"); 
    XLSX.writeFile(wb, `Report_M${parseInt(monthFilter) + 1}.xlsx`);
};

const departments = [...new Set(allLogs.map(l => l.department).filter(Boolean))];

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-6 md:p-10 space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em] font-bold">AFAM Management Systems</p>
          {isAuditor && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 uppercase font-black">Auditor View</span>}
        </div>
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
          <div className="px-4 py-2.5 bg-slate-900 border border-white/5 font-mono text-xs text-red-500 font-bold rounded-xl shadow-inner">{currentTime.toLocaleTimeString()}</div>
          {!isReadOnly && (
            <button onClick={() => setIsManualModalOpen(true)} className="flex-1 md:flex-none px-6 py-2.5 rounded-xl bg-[#ef4444] text-xs font-black uppercase text-white shadow-lg shadow-red-900/20 hover:scale-105 transition-all">
              + Post Attendance
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="On Site" value={summary.present_now} icon={<UserCheck size={20}/>} colorClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20" />
        <StatCard title="Absent Today" value={summary.absent} icon={<Clock size={20}/>} colorClass="bg-red-500/10 text-[#ef4444] border-red-500/20" />
        <StatCard title="Total Staff" value={summary.total_employees} icon={<Users size={20}/>} colorClass="bg-slate-500/10 text-slate-400 border-slate-500/20" />
      </div>

      <section className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h2 className="text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><Activity size={14} className="text-red-500"/> Live Activity (Today)</h2>
          <button onClick={fetchSummary} disabled={syncing}><RefreshCcw size={14} className={syncing ? "animate-spin text-red-500" : "text-slate-500 hover:text-white"}/></button>
        </div>
        <div className="bg-[#1e293b]/30 border border-white/5 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
          <AttendanceTable logs={todayLogs} onEdit={handleEditClick} onDelete={handleDelete} isReadOnly={isReadOnly} canDelete={isAdmin} />
        </div>
      </section>

      <section className="space-y-6 pt-10 border-t border-slate-800">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 px-2">
          <h2 className="text-slate-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><History size={14}/> Records Archive</h2>
          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            <select value={monthFilter} onChange={(e)=>setMonthFilter(e.target.value)} className="bg-slate-900 border border-white/5 rounded-xl px-4 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-red-500 [color-scheme:dark]">
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                ))}
            </select>
            <select value={deptFilter} onChange={(e)=>setDeptFilter(e.target.value)} className="bg-slate-900 border border-white/5 rounded-xl px-4 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-red-500 [color-scheme:dark]">
                <option value="all">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="relative flex-1 lg:w-48">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                <input type="text" placeholder="Search..." className="w-full bg-slate-900 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-[11px] outline-none" value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} />
            </div>
            
            <button onClick={handleExport} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-[11px] font-black uppercase flex items-center gap-2 hover:bg-emerald-500/20 transition-all">
                <Download size={14}/> Export
            </button>

            <button onClick={handleAttendanceReport} className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-[11px] font-black uppercase flex items-center gap-2 hover:bg-blue-500/20 transition-all">
                <FileText size={14}/> Attendance Report
            </button>
          </div>
        </div>
        <div className="bg-[#1e293b]/30 border border-white/5 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
          <AttendanceTable logs={filteredLogs} onEdit={handleEditClick} onDelete={handleDelete} isReadOnly={isReadOnly} canDelete={isAdmin} />
        </div>
      </section>

      <ManualEntryModal isOpen={isManualModalOpen} onClose={()=>setIsManualModalOpen(false)} onRefresh={fetchSummary} />
      {isEditModalOpen && <EditRecordModal log={selectedLog} onClose={()=>setIsEditModalOpen(false)} onRefresh={fetchSummary} />}
    </div>
  );
};

export default AttendanceDashboard;






















// import React, { useState, useEffect, useMemo } from "react";
// import api from "../api/axios";
// import * as XLSX from "xlsx";
// import { Users, Clock, Activity, UserCheck, RefreshCcw, Edit3, History, Save, Trash2, X, Download, Search, AlertCircle, FileText } from "lucide-react";
// import ManualEntryModal from "../components/ManualEntryForm";

// const getAttendanceMetrics = (log) => {
//   let isLate = false;
//   let isEarly = false;
//   const isAbsent = log.status?.toLowerCase() === "absent";
//   const now = new Date();
//   const logDate = new Date(log.check_in || log.date);
//   const isToday = logDate.toDateString() === now.toDateString();

//   let shiftStartTime = null;
//   if (log.shift_start) {
//     const [h, m] = log.shift_start.split(':').map(Number);
//     shiftStartTime = new Date(logDate);
//     shiftStartTime.setHours(h, m, 0, 0);
//   }

//   const isWaitingForShift = isToday && !log.check_in && shiftStartTime && now < shiftStartTime;
//   if (isWaitingForShift) {
//     return { isLate: false, isEarly: false, isAbsent: false, statusText: "Scheduled" };
//   }

//   if (isAbsent) {
//     return { isLate: false, isEarly: false, isAbsent: true, statusText: "Absent" };
//   }

//   if (log.check_in && !log.check_out) {
//     if (shiftStartTime) {
//       isLate = (new Date(log.check_in) - shiftStartTime) / (1000 * 60) > 10;
//     }
//     return { isLate, isEarly: false, isAbsent: false, statusText: "On Duty" };
//   }

//   if (!log.check_in || !log.shift_start) {
//     return { isLate: false, isEarly: false, isAbsent: false, statusText: "Normal" };
//   }

//   const checkInTime = new Date(log.check_in);
//   isLate = (checkInTime - shiftStartTime) / (1000 * 60) > 10;

//   if (log.check_out && log.shift_end) {
//     const checkOutTime = new Date(log.check_out);
//     const [eH, eM] = log.shift_end.split(':').map(Number);
//     const shiftEnd = new Date(checkOutTime);
//     shiftEnd.setHours(eH, eM, 0, 0);

//     const [sH] = log.shift_start.split(':').map(Number);
//     if (sH > eH && checkOutTime.getHours() > sH) {
//       shiftEnd.setDate(shiftEnd.getDate() + 1);
//     }
//     isEarly = checkOutTime < shiftEnd;
//   }

//   let statusText = "Normal";
//   if (isLate && isEarly) statusText = "Late Arrival & Early Leave";
//   else if (isLate) statusText = "Late Arrival";
//   else if (isEarly) statusText = "Early Leave";

//   return { isLate, isEarly, isAbsent: false, statusText };
// };

// // --- COMPONENTS ---

// const StatCard = ({ title, value, icon, colorClass }) => (
//   <div className="bg-[#1e293b]/40 border border-white/5 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-red-900/10 backdrop-blur-sm">
//     <div className="flex justify-between">
//       <div>
//         <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">{title}</p>
//         <h3 className="text-4xl font-black text-white mt-2 tracking-tight">{value}</h3>
//       </div>
//       <div className={`p-3 rounded-xl border ${colorClass}`}>{icon}</div>
//     </div>
//   </div>
// );

// const AttendanceTable = ({ logs, onEdit, onDelete, isReadOnly, canDelete }) => {
//   const formatWorkHours = (decimal) => {
//     if (!decimal || decimal === 0) return "0.00h";
//     const h = Math.floor(decimal);
//     const m = Math.round((decimal - h) * 60);
//     return `${h}.${m.toString().padStart(2, '0')}h`;
//   };

//   return (
//     <div className="overflow-x-auto">
//       <table className="w-full text-left">
//         <thead>
//           <tr className="text-slate-500 text-[10px] uppercase tracking-widest bg-white/[0.02]">
//             <th className="px-6 py-5">Staff & Shop</th>
//             <th className="px-6 py-5">Date</th>
//             <th className="px-6 py-5 text-center">Shift</th>
//             <th className="px-6 py-5">Stamps (IN/OUT)</th>
//             <th className="px-6 py-5 text-center">Duration</th>
//             {!isReadOnly && <th className="px-6 py-5 text-right">Actions</th>}
//           </tr>
//         </thead>
//         <tbody className="divide-y divide-white/5">
//           {logs.map((log) => {
//             const { isLate, isEarly, isAbsent } = getAttendanceMetrics(log);
//             return (
//               <tr key={log.id} className={`hover:bg-white/[0.02] transition-colors group ${isAbsent ? 'bg-red-500/5' : ''}`}>
//                 <td className="px-6 py-4">
//                   <div className="text-white font-bold text-sm flex items-center">
//                     {log.name} 
//                     {isAbsent ? (
//                       <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded ml-2 animate-pulse flex items-center gap-1 shadow-lg shadow-red-500/20">
//                         <AlertCircle size={8}/> ABSENT
//                       </span>
//                     ) : (
//                       <>
//                         {isLate && (
//                           <span className="bg-red-500/10 text-red-500 text-[8px] font-black px-1.5 py-0.5 rounded border border-red-500/20 ml-2 italic tracking-tighter">
//                             LATE ARRIVAL
//                           </span>
//                         )}
//                         {isEarly && (
//                           <span className="bg-amber-500/10 text-amber-500 text-[8px] font-black px-1.5 py-0.5 rounded border border-amber-500/20 ml-2 italic tracking-tighter">
//                             EARLY LEAVE
//                           </span>
//                         )}
//                       </>
//                     )}
//                   </div>
//                   <div className="text-green-500 text-[9px] font-black uppercase tracking-widest mt-0.5">{log.department || 'Main Office'}</div>
//                 </td>
//                 <td className="px-6 py-4 text-xs text-slate-400">
//                   {new Date(log.check_in || log.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
//                 </td>
//                 <td className="px-6 py-4 text-center">
//                   <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${log.shift_type === 'Day' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-400'}`}>{log.shift_type || 'Duty'}</span>
//                 </td>
//                 <td className="px-6 py-4 text-[11px] font-mono">
//                   {isAbsent ? (
//                     <span className="text-red-500/60 italic font-bold">No Fingerprint Detected</span>
//                   ) : (
//                     <>
//                       <div className={isLate ? "text-red-500 font-bold" : "text-emerald-500"}>
//                         IN: {log.check_in ? new Date(log.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
//                       </div>
//                       <div className={isEarly ? "text-amber-500 font-bold" : "text-slate-500"}>
//                         OUT: {log.check_out ? new Date(log.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
//                       </div>
//                     </>
//                   )}
//                 </td>
//                 <td className="px-6 py-4 text-center text-sm font-black text-white">
//                   {isAbsent ? "0.00h" : formatWorkHours(log.hours_worked)}
//                 </td>
//                 {!isReadOnly && (
//                   <td className="px-6 py-4 text-right">
//                     <div className="flex justify-end gap-1">
//                       <button onClick={()=>onEdit(log)} className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"><Edit3 size={14}/></button>
//                       {canDelete && (
//                          <button onClick={()=>onDelete(log.id)} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={14}/></button>
//                       )}
//                     </div>
//                   </td>
//                 )}
//               </tr>
//             );
//           })}
//         </tbody>
//       </table>
//     </div>
//   );
// };


// const EditRecordModal = ({ log, onClose, onRefresh }) => {
//   const [inTime, setInTime] = useState(log.check_in ? log.check_in.substring(0, 16) : "");
//   const [outTime, setOutTime] = useState(log.check_out ? log.check_out.substring(0, 16) : "");

//   const handleSave = async () => {
//     try {
//       await api.put(`/admin/actions/attendance/${log.id}`, { 
//         check_in: inTime || null, 
//         check_out: outTime || null 
//       });
//       onRefresh();
//       onClose();
//     } catch (err) { alert("Update failed."); }
//   };

//   return (
//     <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
//       <div className="bg-[#1e293b] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl">
//         <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
//           <h2 className="text-white font-black uppercase text-xs tracking-widest italic">Correction: <span className="text-red-500">{log.name}</span></h2>
//           <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20}/></button>
//         </div>
//         <div className="p-8 space-y-6">
//           <div className="space-y-2">
//             <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Manual In Time</label>
//             <input type="datetime-local" value={inTime} onChange={(e)=>setInTime(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-red-500/50 [color-scheme:dark]" />
//           </div>
//           <div className="space-y-2">
//             <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Manual Out Time</label>
//             <input type="datetime-local" value={outTime} onChange={(e)=>setOutTime(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-red-500/50 [color-scheme:dark]" />
//           </div>
//           <button onClick={handleSave} className="w-full py-4 bg-[#ef4444] text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl hover:bg-red-500 transition-all shadow-lg shadow-red-500/20">Sync Correction</button>
//         </div>
//       </div>
//     </div>
//   );
// };


// const AttendanceDashboard = () => {
//   const [summary, setSummary] = useState({ present_now: 0, absent: 0, recent_logs: [], total_employees: 0 });
//   const [allLogs, setAllLogs] = useState([]); 
//   const [searchTerm, setSearchTerm] = useState("");
//   const [deptFilter, setDeptFilter] = useState("all");
//   const [monthFilter, setMonthFilter] = useState(new Date().getMonth());
//   const [isManualModalOpen, setIsManualModalOpen] = useState(false);
//   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
//   const [selectedLog, setSelectedLog] = useState(null);
//   const [syncing, setSyncing] = useState(false);
//   const [currentTime, setCurrentTime] = useState(new Date());

//   const userRole = localStorage.getItem('role')?.toLowerCase();
//   const isReadOnly = userRole === 'read_only_admin';
//   const isAuditor = userRole === 'auditor';
//   const isAdmin = userRole === 'admin';

//   const deduplicateLogs = (data) => {
//     const uniqueMap = new Map();
//     data.forEach(log => {
//       const dateStr = new Date(log.check_in || log.date).toDateString();
//       const key = `${log.employee_id}-${dateStr}`;

//       if (!uniqueMap.has(key)) {
//         uniqueMap.set(key, log);
//       } else {
//         const existing = uniqueMap.get(key);
//         if (existing.status?.toLowerCase() === "absent" && log.check_in) {
//           uniqueMap.set(key, log);
//         }
//       }
//     });
//     return Array.from(uniqueMap.values());
//   };

//   const fetchSummary = async () => {
//     setSyncing(true);
//     try {
//       await api.post("/attendance/mark-absents");

//       const [statsRes, summaryRes, historyRes] = await Promise.all([
//         api.get("/attendance/stats"),
//         api.get("/attendance/summary"),
//         api.get("/attendance/all")
//       ]);

//       const cleanSummary = deduplicateLogs(summaryRes.data || []);
//       const cleanHistory = deduplicateLogs(historyRes.data || []);

//       setSummary({ ...statsRes.data, recent_logs: cleanSummary });
//       setAllLogs(cleanHistory);
//     } catch (err) { console.error("Fetch error:", err); } 
//     finally { setTimeout(() => setSyncing(false), 800); }
//   };

//   useEffect(() => {
//     fetchSummary();
//     const interval = setInterval(fetchSummary, 60000);
//     const timer = setInterval(() => setCurrentTime(new Date()), 1000);
//     return () => { clearInterval(interval); clearInterval(timer); };
//   }, []);

//   const handleDelete = async (id) => {
//     if (!isAdmin) return;
//     if (!window.confirm("Permanent delete this record?")) return;
//     try {
//       await api.delete(`/admin/actions/attendance/${id}`);
//       fetchSummary();
//     } catch (err) { alert("Delete failed"); }
//   };

//   const handleEditClick = (log) => {
//     if (isReadOnly) return;
//     setSelectedLog(log);
//     setIsEditModalOpen(true);
//   };

//   const todayLogs = useMemo(() => {
//     const today = new Date().toDateString();
//     return (summary.recent_logs || []).filter(log => {
//       const logDate = new Date(log.check_in || log.date).toDateString();
//       return logDate === today;
//     });
//   }, [summary.recent_logs]);


//   const filteredLogs = useMemo(() => {
//     const year = new Date().getFullYear();
//     const month = parseInt(monthFilter);
//     const daysInMonth = new Date(year, month + 1, 0).getDate();
//     const allDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

//     const baseLogs = allLogs.filter(log => {
//       const logDate = new Date(log.check_in || log.date);
//       const matchesMonth = logDate.getMonth() === month;
//       const matchesDept = deptFilter === "all" || log.department === deptFilter;
//       const matchesSearch = log.name?.toLowerCase().includes(searchTerm.toLowerCase());
//       return matchesMonth && matchesDept && matchesSearch;
//     });

//     if (searchTerm && baseLogs.length > 0) {
//       const employeeName = baseLogs[0].name;
//       const employeeId = baseLogs[0].employee_id;
//       const dept = baseLogs[0].department;

//       return allDays.map(day => {
//         const dateObj = new Date(year, month, day);
//         const dateTitle = dateObj.toDateString();
//         const found = baseLogs.find(l => new Date(l.check_in || l.date).toDateString() === dateTitle);
        
//         return found || {
//           id: `temp-${day}`,
//           employee_id: employeeId,
//           name: employeeName,
//           department: dept,
//           date: dateObj.toISOString(),
//           status: "Absent",
//           hours_worked: 0
//         };
//       });
//     }

//     return baseLogs;
//   }, [allLogs, monthFilter, deptFilter, searchTerm]);


// const handleAttendanceReport = () => {
//     const year = new Date().getFullYear();
//     const month = parseInt(monthFilter);
//     const daysInMonth = new Date(year, month + 1, 0).getDate();
    
//     // 1. Group logs and count metrics
//     const grouped = allLogs.reduce((acc, log) => {
//         const logDate = new Date(log.check_in || log.date);
//         if (logDate.getMonth() !== month) return acc;
        
//         if (!acc[log.employee_id]) {
//             acc[log.employee_id] = {
//                 id: log.employee_id,
//                 name: log.name,
//                 dept: log.department || 'Office',
//                 presentDays: 0,
//                 lateArrivals: 0,
//                 earlyLeaves: 0,
//             };
//         }
        
//         const metrics = getAttendanceMetrics(log);
        
//         // Count as present if they checked in (even if late)
//         if (!metrics.isAbsent) acc[log.employee_id].presentDays += 1;
        
//         // Track violations
//         if (metrics.isLate) acc[log.employee_id].lateArrivals += 1;
//         if (metrics.isEarly) acc[log.employee_id].earlyLeaves += 1;
        
//         return acc;
//     }, {});

//     // 2. Apply the "4 Free, then 3 = 1 day" Deduction Rule
//     const reportData = Object.values(grouped).map(emp => {
//         const totalViolations = emp.lateArrivals + emp.earlyLeaves;
        
//         let deductionDays = 0;
        
//         // Rule: First 4 are free. Every 3 after that = 1 day deduction.
//         if (totalViolations > 4) {
//             const billableViolations = totalViolations - 4;
//             deductionDays = Math.floor(billableViolations / 3);
//         }

//         const finalWorkedDays = emp.presentDays - deductionDays;
        
//         // 3. Status Logic (Updated for strictness)
//         let status = "Standard";
//         if (totalViolations <= 4 && emp.presentDays >= (daysInMonth - 2)) {
//             status = "Excellent";
//         } else if (totalViolations > 10) {
//             status = "Warning";
//         }

//         return {
//             'Employee ID': emp.id,
//             'Name': emp.name,
//             'Department': emp.dept,
//             'Total Month Days': daysInMonth,
//             'Actual Days Present': emp.presentDays,
//             'Late Arrivals': emp.lateArrivals,
//             'Early Leaves': emp.earlyLeaves,
//             'Total Violations': totalViolations,
//             'Grace Used': Math.min(totalViolations, 4),
//             'Violation Deductions (Days)': deductionDays,
//             'Final Payable Days': Math.max(0, finalWorkedDays), // Ensure it doesn't go negative
//             'Performance Status': status
//         };
//     });

//     // 4. Export to Excel
//     const ws = XLSX.utils.json_to_sheet(reportData);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Monthly Report");
//     XLSX.writeFile(wb, `AFAM_Report_${month + 1}_${year}.xlsx`);
// };


// const handleExport = () => {
//     const exportData = filteredLogs.map(log => {
//       const metrics = getAttendanceMetrics(log);
//       return {
//         'Employee ID': log.employee_id,
//         'Name': log.name,
//         'Shop Name': log.department || 'N/A',
//         'Date': new Date(log.check_in || log.date).toLocaleDateString(),
//         'Check In': isAbsent ? "" : (log.check_in ? new Date(log.check_in).toLocaleTimeString() : "--:--"),
//         'Check Out': isAbsent ? "" : (log.check_out ? new Date(log.check_out).toLocaleTimeString() : "--:--"),
//         'Hours': log.hours_worked,
//         'Status': metrics.statusText 
//       };
//     });

//     const ws = XLSX.utils.json_to_sheet(exportData); 
//     const wb = XLSX.utils.book_new(); 
//     XLSX.utils.book_append_sheet(wb, ws, "Attendance"); 
//     XLSX.writeFile(wb, `Report_M${parseInt(monthFilter) + 1}.xlsx`);
// };

// const departments = [...new Set(allLogs.map(l => l.department).filter(Boolean))];

//   return (
//     <div className="min-h-screen bg-[#0f172a] text-slate-200 p-6 md:p-10 space-y-10">
//       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
//         <div>
//           <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em] font-bold">AFAM Management Systems</p>
//           {isAuditor && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 uppercase font-black">Auditor View</span>}
//         </div>
//         <div className="flex flex-wrap gap-4 w-full md:w-auto">
//           <div className="px-4 py-2.5 bg-slate-900 border border-white/5 font-mono text-xs text-red-500 font-bold rounded-xl shadow-inner">{currentTime.toLocaleTimeString()}</div>
//           {!isReadOnly && (
//             <button onClick={() => setIsManualModalOpen(true)} className="flex-1 md:flex-none px-6 py-2.5 rounded-xl bg-[#ef4444] text-xs font-black uppercase text-white shadow-lg shadow-red-900/20 hover:scale-105 transition-all">
//               + Post Attendance
//             </button>
//           )}
//         </div>
//       </div>

//       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//         <StatCard title="On Site" value={summary.present_now} icon={<UserCheck size={20}/>} colorClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20" />
//         <StatCard title="Absent Today" value={summary.absent} icon={<Clock size={20}/>} colorClass="bg-red-500/10 text-[#ef4444] border-red-500/20" />
//         <StatCard title="Total Staff" value={summary.total_employees} icon={<Users size={20}/>} colorClass="bg-slate-500/10 text-slate-400 border-slate-500/20" />
//       </div>

//       <section className="space-y-4">
//         <div className="flex justify-between items-center px-2">
//           <h2 className="text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><Activity size={14} className="text-red-500"/> Live Activity (Today)</h2>
//           <button onClick={fetchSummary} disabled={syncing}><RefreshCcw size={14} className={syncing ? "animate-spin text-red-500" : "text-slate-500 hover:text-white"}/></button>
//         </div>
//         <div className="bg-[#1e293b]/30 border border-white/5 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
//           <AttendanceTable logs={todayLogs} onEdit={handleEditClick} onDelete={handleDelete} isReadOnly={isReadOnly} canDelete={isAdmin} />
//         </div>
//       </section>

//       <section className="space-y-6 pt-10 border-t border-slate-800">
//         <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 px-2">
//           <h2 className="text-slate-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><History size={14}/> Records Archive</h2>
//           <div className="flex flex-wrap gap-3 w-full lg:w-auto">
//             <select value={monthFilter} onChange={(e)=>setMonthFilter(e.target.value)} className="bg-slate-900 border border-white/5 rounded-xl px-4 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-red-500 [color-scheme:dark]">
//                 {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => (
//                     <option key={m} value={i}>{m}</option>
//                 ))}
//             </select>
//             <select value={deptFilter} onChange={(e)=>setDeptFilter(e.target.value)} className="bg-slate-900 border border-white/5 rounded-xl px-4 py-2 text-[11px] font-bold text-slate-300 outline-none focus:border-red-500 [color-scheme:dark]">
//                 <option value="all">All Departments</option>
//                 {departments.map(d => <option key={d} value={d}>{d}</option>)}
//             </select>
//             <div className="relative flex-1 lg:w-48">
//                 <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
//                 <input type="text" placeholder="Search..." className="w-full bg-slate-900 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-[11px] outline-none" value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} />
//             </div>
            
//             <button onClick={handleExport} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-[11px] font-black uppercase flex items-center gap-2 hover:bg-emerald-500/20 transition-all">
//                 <Download size={14}/> Export
//             </button>

//             <button onClick={handleAttendanceReport} className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-[11px] font-black uppercase flex items-center gap-2 hover:bg-blue-500/20 transition-all">
//                 <FileText size={14}/> Attendance Report
//             </button>
//           </div>
//         </div>
//         <div className="bg-[#1e293b]/30 border border-white/5 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
//           <AttendanceTable logs={filteredLogs} onEdit={handleEditClick} onDelete={handleDelete} isReadOnly={isReadOnly} canDelete={isAdmin} />
//         </div>
//       </section>

//       <ManualEntryModal isOpen={isManualModalOpen} onClose={()=>setIsManualModalOpen(false)} onRefresh={fetchSummary} />
//       {isEditModalOpen && <EditRecordModal log={selectedLog} onClose={()=>setIsEditModalOpen(false)} onRefresh={fetchSummary} />}
//     </div>
//   );
// };

// export default AttendanceDashboard;
















// Design 02

// import React, { useState, useEffect, useMemo } from "react";
// import api from "../api/axios";
// import * as XLSX from "xlsx";
// import { 
//   Users, Clock, Activity, UserCheck, RefreshCcw, Edit3, History, 
//   Save, Trash2, X, Download, Search, AlertCircle, LogOut 
// } from "lucide-react";
// import ManualEntryModal from "../components/ManualEntryForm";

// // --- LOGIC ENGINE: STATUS, PROGRESS & OVERTIME ---
// const getAttendanceMetrics = (log) => {
//   let isLate = false;
//   let isEarly = false;
//   let progress = 0;
//   let isOvertime = false;
//   const isAbsent = log.status?.toLowerCase() === "absent";
//   const now = new Date();
//   const logDate = new Date(log.check_in || log.date);
//   const isToday = logDate.toDateString() === now.toDateString();

//   let shiftStartTime = null;
//   let shiftEndTime = null;

//   if (log.shift_start) {
//     const [sH, sM] = log.shift_start.split(':').map(Number);
//     shiftStartTime = new Date(logDate);
//     shiftStartTime.setHours(sH, sM, 0, 0);

//     if (log.shift_end) {
//       const [eH, eM] = log.shift_end.split(':').map(Number);
//       shiftEndTime = new Date(logDate);
//       shiftEndTime.setHours(eH, eM, 0, 0);
//       if (sH > eH) shiftEndTime.setDate(shiftEndTime.getDate() + 1);
//     }
//   }

//   // 1. Scheduled (Before Shift)
//   const isWaiting = isToday && !log.check_in && shiftStartTime && now < shiftStartTime;
//   if (isWaiting) return { statusText: "Scheduled", isLate: false, isAbsent: false, progress: 0 };

//   // 2. Absent
//   if (isAbsent) return { statusText: "Absent", isLate: false, isAbsent: true, progress: 0 };

//   // 3. On Duty / Shift Over (Ongoing)
//   if (log.check_in && !log.check_out) {
//     if (shiftStartTime) isLate = (new Date(log.check_in) - shiftStartTime) / 60000 > 10;
//     if (shiftEndTime && now > shiftEndTime) isOvertime = true;
    
//     if (shiftStartTime && shiftEndTime) {
//       const total = shiftEndTime - shiftStartTime;
//       const elapsed = now - new Date(log.check_in);
//       progress = Math.min(Math.max((elapsed / total) * 100, 0), 100);
//     }
//     return { 
//       statusText: isOvertime ? "Shift Over" : "On Duty", 
//       isLate, isAbsent: false, progress, isOvertime 
//     };
//   }

//   // 4. Completed
//   if (log.check_in && log.check_out) {
//     if (shiftStartTime) isLate = (new Date(log.check_in) - shiftStartTime) / 60000 > 10;
//     if (shiftEndTime) isEarly = new Date(log.check_out) < shiftEndTime;
    
//     let statusText = "Normal";
//     if (isLate && isEarly) statusText = "Late & Early Leave";
//     else if (isLate) statusText = "Late Arrival";
//     else if (isEarly) statusText = "Early Leave";

//     return { statusText, isLate, isEarly, isAbsent: false, progress: 100 };
//   }

//   return { statusText: "Unknown", isLate: false, isAbsent: false, progress: 0 };
// };

// // --- TABLE COMPONENT ---
// const AttendanceTable = ({ logs, onEdit, onDelete, onQuickOut, isReadOnly, canDelete }) => {
//   const formatWorkHours = (decimal) => {
//     if (!decimal) return "0.00h";
//     const h = Math.floor(decimal);
//     const m = Math.round((decimal - h) * 60);
//     return `${h}.${m.toString().padStart(2, '0')}h`;
//   };

//   return (
//     <div className="overflow-x-auto">
//       <table className="w-full text-left">
//         <thead>
//           <tr className="text-slate-500 text-[10px] uppercase tracking-widest bg-white/[0.02]">
//             <th className="px-6 py-5">Staff & Shop</th>
//             <th className="px-6 py-5">Date</th>
//             <th className="px-6 py-5 text-center">Status</th>
//             <th className="px-6 py-5">Stamps (IN/OUT)</th>
//             <th className="px-6 py-5 text-center">Duration / Progress</th>
//             {!isReadOnly && <th className="px-6 py-5 text-right">Actions</th>}
//           </tr>
//         </thead>
//         <tbody className="divide-y divide-white/5">
//           {logs.map((log) => {
//             const metrics = getAttendanceMetrics(log);
//             const { statusText, isLate, isEarly, isAbsent, progress, isOvertime } = metrics;

//             return (
//               <tr key={log.id} className={`transition-all duration-500 ${isOvertime ? 'bg-red-500/10 animate-pulse' : isAbsent ? 'opacity-60' : 'hover:bg-white/[0.01]'}`}>
//                 <td className="px-6 py-4">
//                   <div className="text-white font-bold text-sm flex items-center">
//                     {log.name} 
//                     {statusText === "On Duty" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ml-2 animate-ping"></span>}
//                   </div>
//                   <div className="text-green-500 text-[9px] font-black uppercase tracking-widest mt-0.5">{log.department || 'Main'}</div>
//                 </td>
//                 <td className="px-6 py-4 text-xs text-slate-400">
//                   {new Date(log.check_in || log.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
//                 </td>
//                 <td className="px-6 py-4 text-center">
//                   <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${
//                     isOvertime ? 'bg-red-600 text-white border-red-400' :
//                     statusText === "On Duty" ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
//                     isAbsent ? 'bg-slate-800 text-slate-500 border-white/5' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
//                   }`}>
//                     {statusText === "Normal" ? log.shift_type : statusText}
//                   </span>
//                 </td>
//                 <td className="px-6 py-4 text-[11px] font-mono">
//                   {isAbsent ? <span className="text-red-500/40 italic">No Record</span> :
//                    statusText === "Scheduled" ? <span className="text-slate-600">Pending Shift</span> : (
//                     <>
//                       <div className={isLate ? "text-red-500 font-bold" : "text-emerald-500"}>IN: {log.check_in ? new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</div>
//                       <div className={isEarly ? "text-amber-500 font-bold" : "text-slate-500"}>OUT: {log.check_out ? new Date(log.check_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</div>
//                     </>
//                   )}
//                 </td>
//                 <td className="px-6 py-4 text-center">
//                   {(statusText === "On Duty" || isOvertime) ? (
//                     <div className="flex flex-col items-center gap-1 min-w-[100px]">
//                       <span className={`text-[10px] font-bold ${isOvertime ? 'text-red-500' : 'text-emerald-500'}`}>{formatWorkHours(log.hours_worked)}</span>
//                       <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
//                         <div className={`h-full ${isOvertime ? 'bg-red-500' : isLate ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{width: `${progress}%`}}></div>
//                       </div>
//                     </div>
//                   ) : <span className="text-sm font-black text-white">{formatWorkHours(log.hours_worked)}</span>}
//                 </td>
//                 {!isReadOnly && (
//                   <td className="px-6 py-4 text-right">
//                     <div className="flex justify-end gap-1">
//                       {isOvertime && <button onClick={()=>onQuickOut(log)} title="Force Punch Out" className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><LogOut size={14}/></button>}
//                       <button onClick={()=>onEdit(log)} className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg"><Edit3 size={14}/></button>
//                       {canDelete && <button onClick={()=>onDelete(log.id)} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 size={14}/></button>}
//                     </div>
//                   </td>
//                 )}
//               </tr>
//             );
//           })}
//         </tbody>
//       </table>
//     </div>
//   );
// };

// // --- MAIN DASHBOARD COMPONENT ---
// const AttendanceDashboard = () => {
//   const [stats, setStats] = useState({ present_now: 0, absent: 0, total_employees: 0 });
//   const [allLogs, setAllLogs] = useState([]); 
//   const [searchTerm, setSearchTerm] = useState("");
//   const [monthFilter, setMonthFilter] = useState(new Date().getMonth());
//   const [deptFilter, setDeptFilter] = useState("all");
//   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
//   const [selectedLog, setSelectedLog] = useState(null);
//   const [currentTime, setCurrentTime] = useState(new Date());
//   const [syncing, setSyncing] = useState(false);

//   const isAdmin = localStorage.getItem('role')?.toLowerCase() === 'admin';

//   const fetchData = async () => {
//     setSyncing(true);
//     try {
//       await api.post("/attendance/mark-absents");
//       const [sRes, lRes] = await Promise.all([api.get("/attendance/stats"), api.get("/attendance/all")]);
//       setStats(sRes.data);
//       setAllLogs(lRes.data);
//     } catch (e) { console.error(e); }
//     finally { setTimeout(() => setSyncing(false), 600); }
//   };

//   useEffect(() => {
//     fetchData();
//     const t = setInterval(() => setCurrentTime(new Date()), 1000);
//     const r = setInterval(fetchData, 60000);
//     return () => { clearInterval(t); clearInterval(r); };
//   }, []);

//   // --- FILTER & GAP FILLING LOGIC ---
//   const filteredLogs = useMemo(() => {
//     const year = new Date().getFullYear();
//     const month = parseInt(monthFilter);
//     const daysInMonth = new Date(year, month + 1, 0).getDate();
    
//     const base = allLogs.filter(l => {
//       const d = new Date(l.check_in || l.date);
//       return d.getMonth() === month && (deptFilter === "all" || l.department === deptFilter) &&
//              (!searchTerm || l.name?.toLowerCase().includes(searchTerm.toLowerCase()));
//     });

//     if (searchTerm && base.length > 0) {
//       const emp = base[0];
//       return Array.from({length: daysInMonth}, (_, i) => {
//         const dateStr = new Date(year, month, i + 1).toISOString().split('T')[0];
//         return base.find(l => (l.check_in || l.date).startsWith(dateStr)) || 
//                { id: `gap-${i}`, employee_id: emp.employee_id, name: emp.name, department: emp.department, date: dateStr, status: "Absent", hours_worked: 0 };
//       });
//     }
//     return base;
//   }, [allLogs, monthFilter, deptFilter, searchTerm]);

//   const handleQuickOut = async (log) => {
//     if (!window.confirm(`Force Punch-Out for ${log.name}?`)) return;
//     try {
//       await api.put(`/admin/actions/attendance/${log.id}`, { check_in: log.check_in, check_out: new Date().toISOString() });
//       fetchData();
//     } catch (e) { alert("Action failed"); }
//   };

//   return (
//     <div className="min-h-screen bg-[#0f172a] text-slate-200 p-6 md:p-10 space-y-10">
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-3xl font-black text-white italic tracking-tighter">Duty<span className="text-[#ef4444]">Monitor</span></h1>
//           <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">AFAM Group Management</p>
//         </div>
//         <div className="px-4 py-2 bg-slate-900 border border-white/5 rounded-xl font-mono text-red-500 text-xs shadow-inner">{currentTime.toLocaleTimeString()}</div>
//       </div>

//       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//         <StatCard title="On Site" value={stats.present_now} icon={<UserCheck size={20}/>} colorClass="text-emerald-400 bg-emerald-500/10" />
//         <StatCard title="Absent Today" value={stats.absent} icon={<Clock size={20}/>} colorClass="text-red-500 bg-red-500/10" />
//         <StatCard title="Total Staff" value={stats.total_employees} icon={<Users size={20}/>} colorClass="text-slate-400 bg-slate-500/10" />
//       </div>

//       {/* Archive Summary Scorecard */}
//       {searchTerm && filteredLogs.length > 0 && (
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
//           <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-2xl text-center">
//             <p className="text-[9px] text-emerald-500/50 uppercase font-black">Present</p>
//             <p className="text-2xl font-black text-emerald-400">{filteredLogs.filter(l => l.status !== "Absent").length} Days</p>
//           </div>
//           <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl text-center">
//             <p className="text-[9px] text-red-500/50 uppercase font-black">Absent</p>
//             <p className="text-2xl font-black text-red-400">{filteredLogs.filter(l => l.status === "Absent").length} Days</p>
//           </div>
//           <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl text-center">
//             <p className="text-[9px] text-amber-500/50 uppercase font-black">Lates</p>
//             <p className="text-2xl font-black text-amber-400">{filteredLogs.filter(l => getAttendanceMetrics(l).isLate).length}</p>
//           </div>
//           <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl text-center">
//             <p className="text-[9px] text-blue-500/50 uppercase font-black">Total Hours</p>
//             <p className="text-2xl font-black text-blue-400">{filteredLogs.reduce((a, b) => a + (b.hours_worked || 0), 0).toFixed(1)}h</p>
//           </div>
//         </div>
//       )}

//       {/* Main Table Content */}
//       <section className="space-y-4">
//         <div className="flex flex-wrap gap-4 items-center justify-between">
//           <h2 className="text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><Activity size={14} className="text-red-500"/> Records Archive & Live Feed</h2>
//           <div className="flex flex-wrap gap-2">
//             <select value={monthFilter} onChange={(e)=>setMonthFilter(e.target.value)} className="bg-slate-900 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none">
//               {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => <option key={m} value={i}>{m}</option>)}
//             </select>
//             <div className="relative">
//               <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
//               <input type="text" placeholder="Search employee..." className="bg-slate-900 border border-white/5 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white outline-none w-48 focus:border-red-500/50" value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} />
//             </div>
//             <button onClick={fetchData} className="p-2 bg-slate-900 border border-white/5 rounded-lg text-slate-400 hover:text-white"><RefreshCcw size={14} className={syncing ? "animate-spin" : ""}/></button>
//           </div>
//         </div>
//         <div className="bg-[#1e293b]/30 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-md">
//           <AttendanceTable logs={filteredLogs} onQuickOut={handleQuickOut} onEdit={(l)=>{setSelectedLog(l); setIsEditModalOpen(true);}} onDelete={(id)=>api.delete(`/admin/actions/attendance/${id}`).then(fetchData)} isReadOnly={!isAdmin} canDelete={isAdmin} />
//         </div>
//       </section>

//       {isEditModalOpen && <EditRecordModal log={selectedLog} onClose={()=>setIsEditModalOpen(false)} onRefresh={fetchData} />}
//     </div>
//   );
// };

// // Helper StatCard component
// const StatCard = ({ title, value, icon, colorClass }) => (
//   <div className="bg-[#1e293b]/40 border border-white/5 rounded-2xl p-6 transition-all hover:-translate-y-1 backdrop-blur-sm">
//     <div className="flex justify-between items-start">
//       <div>
//         <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">{title}</p>
//         <h3 className="text-4xl font-black text-white mt-2">{value}</h3>
//       </div>
//       <div className={`p-3 rounded-xl border border-white/5 ${colorClass}`}>{icon}</div>
//     </div>
//   </div>
// );

// // EditRecordModal (Simplified for integration)
// const EditRecordModal = ({ log, onClose, onRefresh }) => {
//   const [inTime, setInTime] = useState(log.check_in ? log.check_in.substring(0, 16) : "");
//   const [outTime, setOutTime] = useState(log.check_out ? log.check_out.substring(0, 16) : "");
//   const handleSave = async () => {
//     try {
//       await api.put(`/admin/actions/attendance/${log.id}`, { check_in: inTime, check_out: outTime });
//       onRefresh(); onClose();
//     } catch (e) { alert("Save failed"); }
//   };
//   return (
//     <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
//       <div className="bg-[#1e293b] border border-white/10 rounded-3xl w-full max-w-md p-8 space-y-6">
//         <h2 className="text-white font-black text-xs uppercase tracking-widest italic border-b border-white/5 pb-4">Manual Correction: {log.name}</h2>
//         <div className="space-y-4">
//           <input type="datetime-local" value={inTime} onChange={(e)=>setInTime(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none [color-scheme:dark]" />
//           <input type="datetime-local" value={outTime} onChange={(e)=>setOutTime(e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none [color-scheme:dark]" />
//         </div>
//         <button onClick={handleSave} className="w-full py-4 bg-[#ef4444] text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl hover:bg-red-500 shadow-lg shadow-red-500/20">Sync Correction</button>
//         <button onClick={onClose} className="w-full text-slate-500 text-[10px] font-black uppercase hover:text-white">Cancel</button>
//       </div>
//     </div>
//   );
// };

// export default AttendanceDashboard;










