import React, { useState, useEffect, useMemo } from "react";
import { 
  Fingerprint, Cpu, Search, Activity, Clock, 
  AlertTriangle, LogOut, Download, Filter, Ghost, TrendingUp, LogIn 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import api from "../api/axios";

const Dashboard = () => {
  const [employeesCount, setEmployeesCount] = useState(0);
  const [onDutyCount, setOnDutyCount] = useState(0);
  const [liveLogs, setLiveLogs] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("All Departments");
  const [filterLateOnly, setFilterLateOnly] = useState(false);
  const [filterAbsentOnly, setFilterAbsentOnly] = useState(false); 
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sanitizeLogs = (logs) => {
    const uniqueMap = new Map();
    logs.forEach(log => {
      const id = log.user_id || log.employee_id || log.id;
      const dateKey = new Date(log.check_in || log.date).toDateString();
      const key = `${id}-${dateKey}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, log);
      } else {
        const existing = uniqueMap.get(key);
        if (!existing.check_in && log.check_in) {
          uniqueMap.set(key, log);
        }
      }
    });
    return Array.from(uniqueMap.values());
  };

  const fetchData = async () => {
    try {
      await api.post("/attendance/mark-absents");
      const [users, summary, stats] = await Promise.all([
        api.get("/admin/users/"),
        api.get("/admin/actions/attendance/summary"),
        api.get("/admin/actions/attendance/stats")
      ]);
      const userData = users.data?.users || users.data || [];
      setAllUsers(userData);
      setEmployeesCount(Array.isArray(userData) ? userData.length : 0);
      setLiveLogs(sanitizeLogs(summary.data || []));
      setOnDutyCount(stats.data.present_now || 0);
    } catch (err) { 
      console.error("Sync Error:", err); 
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const getStatusMetrics = (log) => {
    const isAbsent = log.status?.toLowerCase() === "absent";
    if (isAbsent) return { status: "ABSENT", isLate: false, isAbsent: true };
    if (!log.check_in || !log.shift_start) return { status: "On Time", isLate: false, isAbsent: false };
    const checkInTime = new Date(log.check_in);
    const [sH, sM] = log.shift_start.split(':').map(Number);
    const shiftStart = new Date(checkInTime);
    shiftStart.setHours(sH, sM, 0, 0);
    const isLate = (checkInTime - shiftStart) / (1000 * 60) > 10;
    return { status: isLate ? "LATE" : "On Time", isLate, isAbsent: false };
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const filteredLiveLogs = useMemo(() => {
    return liveLogs.filter(log => {
      const metrics = getStatusMetrics(log);
      const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
      const matchesSearch = (log.name || "").toLowerCase().includes(searchQuery.toLowerCase());
      let matchesStatus = true;
      if (filterAbsentOnly) matchesStatus = metrics.isAbsent;
      else if (filterLateOnly) matchesStatus = metrics.isLate;
      const logDate = log.check_in || log.date;
      return logDate?.startsWith(todayStr) && matchesDept && matchesSearch && matchesStatus;
    });
  }, [liveLogs, searchQuery, selectedDept, filterLateOnly, filterAbsentOnly, todayStr]);

  const lateCount = useMemo(() => 
    liveLogs.filter(log => (log.check_in || "").startsWith(todayStr) && getStatusMetrics(log).isLate).length, 
  [liveLogs, todayStr]);

  const absentCount = useMemo(() => 
    liveLogs.filter(log => ((log.check_in || "")?.startsWith(todayStr) || (log.date || "")?.startsWith(todayStr)) && getStatusMetrics(log).isAbsent).length, 
  [liveLogs, todayStr]);

  return (
    <section className="space-y-6 animate-in fade-in duration-700">
      {/* HEADER: Matches EmployeesPage layout */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-white italic tracking-tight uppercase"></h1>
          <p className="text-slate-500 text-xs uppercase tracking-widest mt-1">Live Attendance Monitoring</p>
        </div>

        <div className="flex flex-wrap gap-3 w-full lg:w-auto items-center">
          {/* Status Filters */}
          <div className="bg-slate-900/50 p-1 rounded-xl border border-white/5 flex">
            <button 
              onClick={() => { setFilterAbsentOnly(!filterAbsentOnly); setFilterLateOnly(false); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                filterAbsentOnly ? 'bg-red-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Ghost size={14} /> Absents
            </button>
            <button 
              onClick={() => { setFilterLateOnly(!filterLateOnly); setFilterAbsentOnly(false); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                filterLateOnly ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <AlertTriangle size={14} /> Late
            </button>
          </div>

          {/* Dept Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <select 
              value={selectedDept} 
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-slate-900/60 border border-slate-800 text-sm text-white pl-10 pr-8 py-2.5 rounded-xl outline-none appearance-none cursor-pointer"
            >
              <option value="All Departments">All Departments</option>
              {[...new Set(allUsers.map(u => u.department).filter(Boolean))].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Search */}
          <div className="relative flex-grow md:flex-grow-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search Personnel..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900/60 border border-slate-800 text-sm text-white pl-10 pr-4 py-2.5 rounded-xl outline-none w-full md:w-48 placeholder:text-slate-600"
            />
          </div>


        </div>
      </div>

      {/* MAIN CONTENT: 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT: Live Stream Area */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden shadow-2xl h-[70vh] flex flex-col">
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Live Activity Stream
                </span>
                <span className="text-xs font-bold text-blue-300 font-mono">{currentTime.toLocaleTimeString()}</span>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-grow">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                  {filteredLiveLogs.map((log) => {
                    const metrics = getStatusMetrics(log);
                    return (
                      <motion.div 
                        key={log.user_id || log.id} 
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 rounded-2xl border transition-all ${
                          metrics.isAbsent ? 'bg-red-500/5 border-red-500/20' : 
                          metrics.isLate ? 'bg-amber-500/5 border-amber-500/20' : 
                          'bg-slate-800/40 border-white/5 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] font-black text-emerald-500/80 mb-0.5">#{log.employee_id || log.user_id}</p>
                            <p className="text-sm font-bold text-white">{log.name}</p>
                            <p className="text-[10px] font-medium text-slate-500 uppercase">{log.department || 'General'}</p>
                          </div>
                          {metrics.isAbsent ? <Ghost size={16} className="text-red-500" /> : <Fingerprint size={16} className="text-emerald-500" />}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-4 items-center justify-between border-t border-white/5 pt-3">
                           <div className="flex gap-4">
                               <div className="flex items-center gap-1.5">
                                   <LogIn size={12} className="text-emerald-500" />
                                   <span className="text-[10px] font-bold text-slate-300">
                                       {log.check_in ? new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}
                                   </span>
                               </div>
                               <div className="flex items-center gap-1.5">
                                   <LogOut size={12} className="text-red-400" />
                                   <span className="text-[10px] font-bold text-slate-300">
                                       {log.check_out ? new Date(log.check_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}
                                   </span>
                               </div>
                           </div>
                           <div className="flex gap-1">
                            {metrics.isLate && <span className="text-[9px] bg-amber-600 text-white px-2 py-0.5 rounded font-black italic">LATE</span>}
                            {metrics.isAbsent && <span className="text-[9px] bg-red-700 text-white px-2 py-0.5 rounded font-black italic">ABSENT</span>}
                           </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Analytics Area */}
        <div className="lg:col-span-4 space-y-6">
          {/* Chart Card */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 p-8 flex flex-col items-center justify-center relative shadow-xl">
            <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie 
                    data={[{value: onDutyCount}, {value: Math.max(0, employeesCount - onDutyCount)}]} 
                    innerRadius="85%" outerRadius="100%" paddingAngle={5} dataKey="value" stroke="none"
                    >
                    <Cell fill="#10b981" />
                    <Cell fill="#334155" />
                    </Pie>
                </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">On Duty</p>
                    <h2 className="text-6xl font-black italic text-white tracking-tighter">{onDutyCount}</h2>
                    <p className="text-xs font-bold text-white">Total {employeesCount}</p>
                </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-slate-900/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Late Arrivals</p>
                    <p className="text-2xl font-black text-amber-500">{lateCount}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <TrendingUp size={20} className="text-amber-500" />
                </div>
            </div>
            
            <div className="bg-slate-900/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Absent Employee</p>
                    <p className="text-2xl font-black text-red-600">{absentCount}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <Ghost size={20} className="text-red-600" />
                </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </section>
  );
};

export default Dashboard;









// import React, { useState, useEffect, useMemo } from "react";
// import { 
//   Fingerprint, Cpu, Search, Activity, Clock, 
//   AlertTriangle, LogOut, Download, Filter, Ghost, TrendingUp 
// } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// import api from "../api/axios";

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [selectedDept, setSelectedDept] = useState("All Departments");
//   const [filterLateOnly, setFilterLateOnly] = useState(false);
//   const [filterAbsentOnly, setFilterAbsentOnly] = useState(false); 
//   const [currentTime, setCurrentTime] = useState(new Date());

//   useEffect(() => {
//     const timer = setInterval(() => setCurrentTime(new Date()), 1000);
//     return () => clearInterval(timer);
//   }, []);

//   const sanitizeLogs = (logs) => {
//     const uniqueMap = new Map();
//     logs.forEach(log => {
//       const id = log.user_id || log.employee_id || log.id;
//       const dateKey = new Date(log.check_in || log.date).toDateString();
//       const key = `${id}-${dateKey}`;
//       if (!uniqueMap.has(key)) {
//         uniqueMap.set(key, log);
//       } else {
//         const existing = uniqueMap.get(key);
//         if (!existing.check_in && log.check_in) {
//           uniqueMap.set(key, log);
//         }
//       }
//     });
//     return Array.from(uniqueMap.values());
//   };

//   const fetchData = async () => {
//     try {
//       await api.post("/attendance/mark-absents");
//       const [users, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);
//       const userData = users.data?.users || users.data || [];
//       setAllUsers(userData);
//       setEmployeesCount(Array.isArray(userData) ? userData.length : 0);
//       setLiveLogs(sanitizeLogs(summary.data || []));
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { 
//       console.error("Sync Error:", err); 
//     }
//   };

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 15000);
//     return () => clearInterval(interval);
//   }, []);

//   const getStatusMetrics = (log) => {
//     const isAbsent = log.status?.toLowerCase() === "absent";
//     if (isAbsent) return { status: "ABSENT", isLate: false, isAbsent: true };
//     if (!log.check_in || !log.shift_start) return { status: "On Time", isLate: false, isAbsent: false };
//     const checkInTime = new Date(log.check_in);
//     const [sH, sM] = log.shift_start.split(':').map(Number);
//     const shiftStart = new Date(checkInTime);
//     shiftStart.setHours(sH, sM, 0, 0);
//     const isLate = (checkInTime - shiftStart) / (1000 * 60) > 10;
//     return { status: isLate ? "LATE" : "On Time", isLate, isAbsent: false };
//   };

//   const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

//   const filteredLiveLogs = useMemo(() => {
//     return liveLogs.filter(log => {
//       const metrics = getStatusMetrics(log);
//       const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
//       const matchesSearch = (log.name || "").toLowerCase().includes(searchQuery.toLowerCase());
//       let matchesStatus = true;
//       if (filterAbsentOnly) matchesStatus = metrics.isAbsent;
//       else if (filterLateOnly) matchesStatus = metrics.isLate;
//       const logDate = log.check_in || log.date;
//       return logDate?.startsWith(todayStr) && matchesDept && matchesSearch && matchesStatus;
//     });
//   }, [liveLogs, searchQuery, selectedDept, filterLateOnly, filterAbsentOnly, todayStr]);

//   const lateCount = useMemo(() => 
//     liveLogs.filter(log => (log.check_in || "").startsWith(todayStr) && getStatusMetrics(log).isLate).length, 
//   [liveLogs, todayStr]);

//   const absentCount = useMemo(() => 
//     liveLogs.filter(log => ((log.check_in || "")?.startsWith(todayStr) || (log.date || "")?.startsWith(todayStr)) && getStatusMetrics(log).isAbsent).length, 
//   [liveLogs, todayStr]);

//   return (
//     <section className="space-y-6 animate-in fade-in duration-700">
//       {/* HEADER: Matches EmployeesPage layout */}
//       <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
//         <div>
//           <h1 className="text-2xl font-black text-white italic tracking-tight uppercase">System Dashboard</h1>
//           <p className="text-slate-500 text-xs uppercase tracking-widest mt-1">Live Attendance Monitoring</p>
//         </div>

//         <div className="flex flex-wrap gap-3 w-full lg:w-auto items-center">
//           {/* Status Filters */}
//           <div className="bg-slate-900/50 p-1 rounded-xl border border-white/5 flex">
//             <button 
//               onClick={() => { setFilterAbsentOnly(!filterAbsentOnly); setFilterLateOnly(false); }}
//               className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
//                 filterAbsentOnly ? 'bg-red-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
//               }`}
//             >
//               <Ghost size={14} /> Absents
//             </button>
//             <button 
//               onClick={() => { setFilterLateOnly(!filterLateOnly); setFilterAbsentOnly(false); }}
//               className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
//                 filterLateOnly ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
//               }`}
//             >
//               <AlertTriangle size={14} /> Late
//             </button>
//           </div>

//           {/* Dept Filter */}
//           <div className="relative">
//             <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
//             <select 
//               value={selectedDept} 
//               onChange={(e) => setSelectedDept(e.target.value)}
//               className="bg-slate-900/60 border border-slate-800 text-sm text-white pl-10 pr-8 py-2.5 rounded-xl outline-none appearance-none cursor-pointer"
//             >
//               <option value="All Departments">All Departments</option>
//               {[...new Set(allUsers.map(u => u.department).filter(Boolean))].map(d => <option key={d} value={d}>{d}</option>)}
//             </select>
//           </div>

//           {/* Search */}
//           <div className="relative flex-grow md:flex-grow-0">
//             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
//             <input 
//               type="text" 
//               placeholder="Search Personnel..." 
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="bg-slate-900/60 border border-slate-800 text-sm text-white pl-10 pr-4 py-2.5 rounded-xl outline-none w-full md:w-48 placeholder:text-slate-600"
//             />
//           </div>


//         </div>
//       </div>

//       {/* MAIN CONTENT: 2-Column Grid */}
//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
//         {/* LEFT: Live Stream Area */}
//         <div className="lg:col-span-8 space-y-4">
//           <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden shadow-2xl h-[70vh] flex flex-col">
//             <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
//                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-2">
//                     <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
//                     Live Activity Stream
//                 </span>
//                 <span className="text-xs font-bold text-slate-400 font-mono">{currentTime.toLocaleTimeString()}</span>
//             </div>
            
//             <div className="p-6 overflow-y-auto custom-scrollbar flex-grow">
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <AnimatePresence mode="popLayout">
//                   {filteredLiveLogs.map((log) => {
//                     const metrics = getStatusMetrics(log);
//                     return (
//                       <motion.div 
//                         key={log.user_id || log.id} 
//                         layout
//                         initial={{ opacity: 0, y: 10 }}
//                         animate={{ opacity: 1, y: 0 }}
//                         className={`p-4 rounded-2xl border transition-all ${
//                           metrics.isAbsent ? 'bg-red-500/5 border-red-500/20' : 
//                           metrics.isLate ? 'bg-amber-500/5 border-amber-500/20' : 
//                           'bg-slate-800/40 border-white/5 hover:bg-slate-800/60'
//                         }`}
//                       >
//                         <div className="flex justify-between items-start">
//                           <div>
//                             <p className="text-sm font-bold text-white">{log.name}</p>
//                             <p className="text-[10px] font-medium text-slate-500 uppercase">{log.department || 'General'}</p>
//                           </div>
//                           {metrics.isAbsent ? <Ghost size={16} className="text-red-500" /> : <Fingerprint size={16} className="text-emerald-500" />}
//                         </div>
//                         <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
//                            <div className="flex gap-3">
//                                <div className="flex items-center gap-1.5">
//                                    <Clock size={12} className="text-slate-500" />
//                                    <span className="text-[10px] font-bold text-slate-300">
//                                        {log.check_in ? new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}
//                                    </span>
//                                </div>
//                            </div>
//                            {metrics.isLate && <span className="text-[9px] bg-amber-600 text-white px-2 py-0.5 rounded font-black italic">LATE</span>}
//                            {metrics.isAbsent && <span className="text-[9px] bg-red-700 text-white px-2 py-0.5 rounded font-black italic">ABSENT</span>}
//                         </div>
//                       </motion.div>
//                     );
//                   })}
//                 </AnimatePresence>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* RIGHT: Analytics Area */}
//         <div className="lg:col-span-4 space-y-6">
//           {/* Chart Card */}
//           <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 p-8 flex flex-col items-center justify-center relative shadow-xl">
//             <div className="w-full h-64">
//                 <ResponsiveContainer width="100%" height="100%">
//                 <PieChart>
//                     <Pie 
//                     data={[{value: onDutyCount}, {value: Math.max(0, employeesCount - onDutyCount)}]} 
//                     innerRadius="85%" outerRadius="100%" paddingAngle={5} dataKey="value" stroke="none"
//                     >
//                     <Cell fill="#10b981" />
//                     <Cell fill="#334155" />
//                     </Pie>
//                 </PieChart>
//                 </ResponsiveContainer>
//                 <div className="absolute inset-0 flex flex-col items-center justify-center">
//                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">On Duty</p>
//                     <h2 className="text-6xl font-black italic text-white tracking-tighter">{onDutyCount}</h2>
//                     <p className="text-xs font-bold text-slate-600">Total {employeesCount}</p>
//                 </div>
//             </div>
//           </div>

//           {/* Quick Stats Grid */}
//           <div className="grid grid-cols-1 gap-4">
//             <div className="bg-slate-900/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between">
//                 <div>
//                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Late Arrivals</p>
//                     <p className="text-2xl font-black text-amber-500">{lateCount}</p>
//                 </div>
//                 <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
//                     <TrendingUp size={20} className="text-amber-500" />
//                 </div>
//             </div>
            
//             <div className="bg-slate-900/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between">
//                 <div>
//                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Absent Units</p>
//                     <p className="text-2xl font-black text-red-600">{absentCount}</p>
//                 </div>
//                 <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
//                     <Ghost size={20} className="text-red-600" />
//                 </div>
//             </div>
//           </div>
//         </div>
//       </div>

//       <style>{`
//         .custom-scrollbar::-webkit-scrollbar { width: 4px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
//         .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
//       `}</style>
//     </section>
//   );
// };

// export default Dashboard;
















// import React, { useState, useEffect, useMemo } from "react";
// import { Fingerprint, Cpu, Search, Activity, Clock, Building2, AlertTriangle, LogOut, Download, Filter, UserCheck, Ghost } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// import api from "../api/axios";
// import NotificationBell from '../components/NotificationBell';

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [selectedDept, setSelectedDept] = useState("All Departments");
//   const [filterLateOnly, setFilterLateOnly] = useState(false);
//   const [filterAbsentOnly, setFilterAbsentOnly] = useState(false); 
//   const [currentTime, setCurrentTime] = useState(new Date());

//   useEffect(() => {
//     const timer = setInterval(() => setCurrentTime(new Date()), 1000);
//     return () => clearInterval(timer);
//   }, []);

//   // --- HELPER: REMOVE DUPLICATES ---
//   const sanitizeLogs = (logs) => {
//     const uniqueMap = new Map();
    
//     logs.forEach(log => {
//       // Create a unique key using user_id or employee_id
//       const id = log.user_id || log.employee_id || log.id;
//       const dateKey = new Date(log.check_in || log.date).toDateString();
//       const key = `${id}-${dateKey}`;

//       if (!uniqueMap.has(key)) {
//         uniqueMap.set(key, log);
//       } else {
//         // Priority Logic: If we find a record with an actual punch-in, 
//         // replace the existing one (which might just be a generic "Absent" placeholder)
//         const existing = uniqueMap.get(key);
//         if (!existing.check_in && log.check_in) {
//           uniqueMap.set(key, log);
//         }
//       }
//     });
//     return Array.from(uniqueMap.values());
//   };

//   const fetchData = async () => {
//     try {
//       // Trigger the backend to scan for absentees first
//       await api.post("/attendance/mark-absents");

//       const [users, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);

//       const userData = users.data?.users || users.data || [];
//       setAllUsers(userData);
//       setEmployeesCount(Array.isArray(userData) ? userData.length : 0);
      
//       // APPLY SANITIZATION HERE
//       const cleanLogs = sanitizeLogs(summary.data || []);
//       setLiveLogs(cleanLogs);
      
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { 
//       console.error("Sync Error:", err); 
//     }
//   };

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 15000); // Increased to 15s to reduce server load
//     return () => clearInterval(interval);
//   }, []);

//   // --- METRICS LOGIC ---
//   const getStatusMetrics = (log) => {
//     const isAbsent = log.status?.toLowerCase() === "absent";
//     if (isAbsent) return { status: "ABSENT", isLate: false, isAbsent: true };

//     if (!log.check_in || !log.shift_start) return { status: "On Time", isLate: false, isAbsent: false };
    
//     const checkInTime = new Date(log.check_in);
//     const [sH, sM] = log.shift_start.split(':').map(Number);
//     const shiftStart = new Date(checkInTime);
//     shiftStart.setHours(sH, sM, 0, 0);
    
//     const isLate = (checkInTime - shiftStart) / (1000 * 60) > 10;
//     return { status: isLate ? "LATE" : "On Time", isLate, isAbsent: false };
//   };

//   const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

//   // --- FILTER LOGIC ---
//   const filteredLiveLogs = useMemo(() => {
//     return liveLogs.filter(log => {
//       const metrics = getStatusMetrics(log);
//       const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
//       const matchesSearch = (log.name || "").toLowerCase().includes(searchQuery.toLowerCase());
      
//       let matchesStatus = true;
//       if (filterAbsentOnly) matchesStatus = metrics.isAbsent;
//       else if (filterLateOnly) matchesStatus = metrics.isLate;

//       const logDate = log.check_in || log.date;
//       const isToday = logDate?.startsWith(todayStr);
      
//       return isToday && matchesDept && matchesSearch && matchesStatus;
//     });
//   }, [liveLogs, searchQuery, selectedDept, filterLateOnly, filterAbsentOnly, todayStr]);

//   const lateCount = useMemo(() => 
//     liveLogs.filter(log => (log.check_in || "").startsWith(todayStr) && getStatusMetrics(log).isLate).length, 
//   [liveLogs, todayStr]);

//   const absentCount = useMemo(() => 
//     liveLogs.filter(log => ((log.check_in || "")?.startsWith(todayStr) || (log.date || "")?.startsWith(todayStr)) && getStatusMetrics(log).isAbsent).length, 
//   [liveLogs, todayStr]);

//   const downloadTodayData = () => {
//     if (filteredLiveLogs.length === 0) return alert("No data to export for current filters.");
//     const headers = ["Name", "Department", "Check In", "Check Out", "Status"];
//     const csvRows = [
//       headers.join(","),
//       ...filteredLiveLogs.map(log => {
//         const { status } = getStatusMetrics(log);
//         return [
//           `"${log.name}"`,
//           `"${log.department || 'General'}"`,
//           log.check_in ? new Date(log.check_in).toLocaleTimeString() : "N/A",
//           log.check_out ? new Date(log.check_out).toLocaleTimeString() : "N/A",
//           status
//         ].join(",");
//       })
//     ];
//     const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
//     const url = URL.createObjectURL(blob);
//     const link = document.createElement("a");
//     link.href = url;
//     link.setAttribute("download", `AFAM_Attendance_${todayStr}.csv`);
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//   };

//   return (
//     <div className="min-h-screen bg-[#2c3041] text-white p-6 font-mono">
//       <header className="flex justify-between items-center mb-12 border-b border-white/5 pb-8">
//         <div className="flex items-center gap-4">
//           <div className="w-12 h-12 bg-red-600/10 rounded-xl flex items-center justify-center border border-red-600/30 shadow-[0_0_20px_rgba(220,38,38,0.15)]">
//             <Cpu className="text-red-500" size={24} />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black italic tracking-tighter uppercase text-green-600"></h1>
//           </div>
//         </div>

//         <div className="text-center">
//           <p className="text-2xl font-black tracking-tighter text-white">{currentTime.toLocaleTimeString()}</p>
//           <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">
//             {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
//           </p>
//         </div>

//         <div className="flex flex-wrap items-center gap-3">
//           <button 
//             onClick={() => { setFilterAbsentOnly(!filterAbsentOnly); setFilterLateOnly(false); }}
//             className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
//               filterAbsentOnly ? "bg-red-600 border-red-500 text-white" : "bg-slate-900/50 border-white/10 text-slate-400"
//             }`}
//           >
//             <Ghost size={14} /> {filterAbsentOnly ? "Showing Absent" : "Filter Absent"}
//           </button>

//           <button 
//             onClick={() => { setFilterLateOnly(!filterLateOnly); setFilterAbsentOnly(false); }}
//             className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
//               filterLateOnly ? "bg-orange-600 border-orange-500 text-white" : "bg-slate-900/50 border-white/10 text-slate-400"
//             }`}
//           >
//             <AlertTriangle size={14} /> {filterLateOnly ? "Showing Late" : "Filter Late"}
//           </button>

//           <button onClick={downloadTodayData} className="flex items-center gap-2 bg-emerald-600/10 border border-emerald-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase text-emerald-500 hover:bg-emerald-600 hover:text-white transition-all">
//             <Download size={14} /> Export
//           </button>

//           <div className="relative group">
//             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
//             <input 
//               type="text" 
//               placeholder="Search..." 
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="bg-slate-900/50 border border-white/10 pl-10 pr-4 py-2 rounded-xl text-[10px] outline-none focus:border-red-500/50 w-40"
//             />
//           </div>

//           <select 
//             value={selectedDept} 
//             onChange={(e) => setSelectedDept(e.target.value)}
//             className="bg-slate-900/50 border border-white/10 px-4 py-2 rounded-xl text-[10px] uppercase outline-none"
//           >
//             <option value="All Departments">All Depts</option>
//             {[...new Set(allUsers.map(u => u.department).filter(Boolean))].map(d => <option key={d} value={d}>{d}</option>)}
//           </select>
//         </div>
//       </header>

//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
//         <div className="lg:col-span-8 space-y-6">
//           <div className="flex justify-between items-center">
//             <h2 className="text-[12px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-3">
//               <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${filterAbsentOnly || filterLateOnly ? 'bg-red-600' : 'bg-emerald-500'}`} /> 
//               {filterAbsentOnly ? "Personnel Absent Records" : filterLateOnly ? "Late Arrivals Stream" : "Live Personnel Stream"}
//             </h2>
//           </div>

//           <div className="bg-[#111827]/40 border border-white/5 rounded-[2.5rem] p-6 h-[68vh] overflow-y-auto custom-scrollbar">
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <AnimatePresence mode="popLayout">
//                 {filteredLiveLogs.map((log) => {
//                   const metrics = getStatusMetrics(log);
//                   const logId = log.user_id || log.employee_id || log.id;
//                   return (
//                     <motion.div 
//                       key={logId} 
//                       layout
//                       initial={{ opacity: 0, scale: 0.95 }}
//                       animate={{ opacity: 1, scale: 1 }}
//                       exit={{ opacity: 0, scale: 0.95 }}
//                       className={`p-5 rounded-[1.5rem] border ${
//                         metrics.isAbsent ? 'bg-red-950/40 border-red-600' : 
//                         metrics.isLate ? 'bg-orange-950/20 border-orange-500/30' : 
//                         'bg-white/5 border-transparent'
//                       }`}
//                     >
//                       <div className="flex justify-between items-start mb-3">
//                         <div>
//                           <p className="text-[13px] font-black uppercase text-white mb-1">{log.name}</p>
//                           <p className="text-[9px] font-bold text-slate-500 uppercase">{log.department || 'General'}</p>
//                         </div>
//                         {metrics.isAbsent ? <Ghost size={18} className="text-red-600 animate-bounce" /> : <Fingerprint size={18} className={metrics.isLate ? "text-orange-500" : "text-emerald-500"} />}
//                       </div>
                      
//                       <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
//                         {metrics.isAbsent ? (
//                           <div className="text-[10px] font-black text-red-500 uppercase flex items-center gap-2">
//                              <Clock size={12} /> Fingerprint Not Detected
//                           </div>
//                         ) : (
//                           <>
//                             <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
//                               <Clock size={12} className="text-emerald-500" /> 
//                               <span className="text-white">IN: {new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
//                             </div>
//                             {log.check_out && (
//                                <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
//                                  <LogOut size={12} className="text-red-500" /> 
//                                  <span className="text-white">OUT: {new Date(log.check_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
//                                </div>
//                             )}
//                           </>
//                         )}
//                         {metrics.isLate && <span className="ml-auto text-[8px] bg-orange-600 px-2 py-0.5 rounded font-black italic">LATE</span>}
//                         {metrics.isAbsent && <span className="ml-auto text-[8px] bg-red-600 px-2 py-0.5 rounded font-black italic">ABSENT</span>}
//                       </div>
//                     </motion.div>
//                   );
//                 })}
//               </AnimatePresence>
//             </div>
//           </div>
//         </div>

//         <div className="lg:col-span-4 space-y-8">
//           <div className="bg-[#111827]/60 border border-white/5 rounded-[3.5rem] p-10 aspect-square flex flex-col items-center justify-center relative shadow-2xl overflow-hidden">
//             <ResponsiveContainer width="100%" height="100%">
//               <PieChart>
//                 <Pie 
//                   data={[{value: onDutyCount}, {value: Math.max(0, employeesCount - onDutyCount)}]} 
//                   innerRadius="80%" outerRadius="95%" paddingAngle={8} dataKey="value" stroke="none"
//                 >
//                   <Cell fill="#10b981" />
//                   <Cell fill="#ef4444" opacity={0.05} />
//                 </Pie>
//               </PieChart>
//             </ResponsiveContainer>
//             <div className="absolute inset-0 flex flex-col items-center justify-center">
//               <div className="flex items-baseline gap-1">
//                 <span className="text-8xl font-black italic tracking-tighter leading-none">{onDutyCount}</span>
//                 <span className="text-3xl text-slate-600 font-bold">/{employeesCount}</span>
//               </div>
//               <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mt-4">Active Units</p>
//             </div>
//           </div>

//           <div className="grid grid-cols-1 gap-4">
//             <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:bg-red-600/5 transition-all">
//               <div>
//                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Absent Today</p>
//                 <p className="text-4xl font-black text-red-600">{absentCount}</p>
//               </div>
//               <Ghost size={32} className="text-red-600 opacity-50" />
//             </div>

//             <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:bg-orange-600/5 transition-all">
//               <div>
//                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Late Today</p>
//                 <p className="text-4xl font-black text-orange-500">{lateCount}</p>
//               </div>
//               <AlertTriangle size={32} className="text-orange-500 opacity-50" />
//             </div>
//           </div>
//         </div>
//       </div>
//       <style>{`
//         .custom-scrollbar::-webkit-scrollbar { width: 4px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 10px; }
//         .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
//       `}</style>
//     </div>
//   );
// };

// export default Dashboard;








// import React, { useState, useEffect, useMemo } from "react";
// import { Fingerprint, Cpu, Search, Activity, Clock, Building2, AlertTriangle, LogOut, Download, Filter, UserCheck, Ghost } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// import api from "../api/axios";

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [selectedDept, setSelectedDept] = useState("All Departments");
//   const [filterLateOnly, setFilterLateOnly] = useState(false);
//   const [filterAbsentOnly, setFilterAbsentOnly] = useState(false); // New Filter State
//   const [currentTime, setCurrentTime] = useState(new Date());

//   useEffect(() => {
//     const timer = setInterval(() => setCurrentTime(new Date()), 1000);
//     return () => clearInterval(timer);
//   }, []);

//   const fetchData = async () => {
//     try {
//       // Trigger the backend to scan for absentees first
//       await api.post("/attendance/mark-absents");

//       const [users, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);

//       const userData = users.data?.users || users.data || [];
//       setAllUsers(userData);
//       setEmployeesCount(Array.isArray(userData) ? userData.length : 0);
      
//       setLiveLogs(summary.data || []);
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { 
//       console.error("Sync Error:", err); 
//     }
//   };

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 10000); // 10s sync
//     return () => clearInterval(interval);
//   }, []);

//   // --- UPDATED METRICS LOGIC ---
//   const getStatusMetrics = (log) => {
//     const isAbsent = log.status?.toLowerCase() === "absent";
//     if (isAbsent) return { status: "ABSENT", isLate: false, isAbsent: true };

//     if (!log.check_in || !log.shift_start) return { status: "On Time", isLate: false, isAbsent: false };
    
//     const checkInTime = new Date(log.check_in);
//     const [sH, sM] = log.shift_start.split(':').map(Number);
//     const shiftStart = new Date(checkInTime);
//     shiftStart.setHours(sH, sM, 0, 0);
    
//     // 15 min grace as per your previous logic
//     const isLate = (checkInTime - shiftStart) / (1000 * 60) > 15;
//     return { status: isLate ? "LATE" : "On Time", isLate, isAbsent: false };
//   };

//   const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

//   // --- UPDATED FILTER LOGIC ---
//   const filteredLiveLogs = useMemo(() => {
//     return liveLogs.filter(log => {
//       const metrics = getStatusMetrics(log);
//       const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
//       const matchesSearch = log.name.toLowerCase().includes(searchQuery.toLowerCase());
      
//       // Filter Logic: If Absent filter is on, show absents. If Late filter is on, show late. Else show all.
//       let matchesStatus = true;
//       if (filterAbsentOnly) matchesStatus = metrics.isAbsent;
//       else if (filterLateOnly) matchesStatus = metrics.isLate;

//       const isToday = log.check_in?.startsWith(todayStr) || log.date?.startsWith(todayStr);
//       return isToday && matchesDept && matchesSearch && matchesStatus;
//     });
//   }, [liveLogs, searchQuery, selectedDept, filterLateOnly, filterAbsentOnly, todayStr]);

//   const lateCount = useMemo(() => 
//     liveLogs.filter(log => log.check_in?.startsWith(todayStr) && getStatusMetrics(log).isLate).length, 
//   [liveLogs, todayStr]);

//   const absentCount = useMemo(() => 
//     liveLogs.filter(log => (log.check_in?.startsWith(todayStr) || log.date?.startsWith(todayStr)) && getStatusMetrics(log).isAbsent).length, 
//   [liveLogs, todayStr]);

//   const downloadTodayData = () => {
//     if (filteredLiveLogs.length === 0) return alert("No data to export for current filters.");

//     const headers = ["Name", "Department", "Check In", "Check Out", "Status"];
//     const csvRows = [
//       headers.join(","),
//       ...filteredLiveLogs.map(log => {
//         const { status } = getStatusMetrics(log);
//         return [
//           `"${log.name}"`,
//           `"${log.department || 'General'}"`,
//           log.check_in ? new Date(log.check_in).toLocaleTimeString() : "N/A",
//           log.check_out ? new Date(log.check_out).toLocaleTimeString() : "N/A",
//           status
//         ].join(",");
//       })
//     ];

//     const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
//     const url = URL.createObjectURL(blob);
//     const link = document.createElement("a");
//     link.href = url;
//     link.setAttribute("download", `AFAM_Attendance_${todayStr}.csv`);
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//   };

//   return (
//     <div className="min-h-screen bg-[#0b0f1a] text-white p-6 font-mono">
//       <header className="flex justify-between items-center mb-12 border-b border-white/5 pb-8">
//         <div className="flex items-center gap-4">
//           <div className="w-12 h-12 bg-red-600/10 rounded-xl flex items-center justify-center border border-red-600/30 shadow-[0_0_20px_rgba(220,38,38,0.15)]">
//             <Cpu className="text-red-500" size={24} />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black italic tracking-tighter uppercase text-red-600">AFAM COMMAND</h1>
//             <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">INTELLIGENCE UNIT</p>
//           </div>
//         </div>

//         <div className="text-center">
//           <p className="text-2xl font-black tracking-tighter text-white">{currentTime.toLocaleTimeString()}</p>
//           <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">
//             {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
//           </p>
//         </div>

//         <div className="flex items-center gap-3">
//           {/* ABSENT FILTER BUTTON */}
//           <button 
//             onClick={() => { setFilterAbsentOnly(!filterAbsentOnly); setFilterLateOnly(false); }}
//             className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
//               filterAbsentOnly 
//                 ? "bg-red-600 border-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]" 
//                 : "bg-slate-900/50 border-white/10 text-slate-400 hover:border-red-500/50"
//             }`}
//           >
//             <Ghost size={14} /> {filterAbsentOnly ? "Showing Absent" : "Filter Absent"}
//           </button>

//           <button 
//             onClick={() => { setFilterLateOnly(!filterLateOnly); setFilterAbsentOnly(false); }}
//             className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
//               filterLateOnly 
//                 ? "bg-orange-600 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]" 
//                 : "bg-slate-900/50 border-white/10 text-slate-400 hover:border-orange-500/50"
//             }`}
//           >
//             <AlertTriangle size={14} /> {filterLateOnly ? "Showing Late" : "Filter Late"}
//           </button>

//           <button 
//             onClick={downloadTodayData}
//             className="flex items-center gap-2 bg-emerald-600/10 border border-emerald-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:bg-emerald-600 hover:text-white transition-all"
//           >
//             <Download size={14} /> Export
//           </button>

//           <div className="relative group ml-2">
//             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-red-500 transition-colors" />
//             <input 
//               type="text" 
//               placeholder="Search..." 
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="bg-slate-900/50 border border-white/10 pl-10 pr-4 py-2 rounded-xl text-[10px] uppercase outline-none focus:border-red-500/50 w-40 transition-all"
//             />
//           </div>

//           <select 
//             value={selectedDept} 
//             onChange={(e) => setSelectedDept(e.target.value)}
//             className="bg-slate-900/50 border border-white/10 px-4 py-2 rounded-xl text-[10px] uppercase outline-none cursor-pointer hover:border-white/20"
//           >
//             <option value="All Departments">All Depts</option>
//             {[...new Set(allUsers.map(u => u.department).filter(Boolean))].map(d => <option key={d} value={d} className="bg-[#0b0f1a]">{d}</option>)}
//           </select>
//         </div>
//       </header>

//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
//         <div className="lg:col-span-8 space-y-6">
//           <div className="flex justify-between items-center px-2">
//             <h2 className="text-[12px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-3">
//               <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${filterAbsentOnly || filterLateOnly ? 'bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'}`} /> 
//               {filterAbsentOnly ? "Personnel Absent Records" : filterLateOnly ? "Late Arrivals Stream" : "Live Personnel Stream"}
//             </h2>
//             <div className="h-[1px] flex-1 bg-gradient-to-r from-red-600/40 via-white/5 to-transparent ml-6" />
//           </div>

//           <div className="bg-[#111827]/40 border border-white/5 rounded-[2.5rem] p-6 h-[68vh] overflow-y-auto custom-scrollbar shadow-inner">
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <AnimatePresence mode="popLayout">
//                 {filteredLiveLogs.map((log) => {
//                   const metrics = getStatusMetrics(log);
//                   return (
//                     <motion.div 
//                       key={log.user_id || log.id} 
//                       layout
//                       initial={{ opacity: 0, scale: 0.95 }}
//                       animate={{ opacity: 1, scale: 1 }}
//                       exit={{ opacity: 0, scale: 0.95 }}
//                       className={`p-5 rounded-[1.5rem] border transition-all hover:translate-y-[-2px] ${
//                         metrics.isAbsent ? 'bg-red-950/40 border-red-600 shadow-[inset_0_0_20px_rgba(220,38,38,0.1)]' : 
//                         metrics.isLate ? 'bg-orange-950/20 border-orange-500/30' : 
//                         'bg-white/5 border-transparent hover:bg-white/[0.08]'
//                       }`}
//                     >
//                       <div className="flex justify-between items-start mb-3">
//                         <div>
//                           <p className="text-[13px] font-black uppercase tracking-tight text-white mb-1">{log.name}</p>
//                           <p className="text-[9px] font-bold text-slate-500 uppercase">{log.department || 'General'}</p>
//                         </div>
//                         {metrics.isAbsent ? <Ghost size={18} className="text-red-600 animate-bounce" /> : <Fingerprint size={18} className={metrics.isLate ? "text-orange-500" : "text-emerald-500"} />}
//                       </div>
                      
//                       <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
//                         {metrics.isAbsent ? (
//                           <div className="text-[10px] font-black text-red-500 uppercase flex items-center gap-2">
//                              <Clock size={12} /> Fingerprint Not Detected
//                           </div>
//                         ) : (
//                           <>
//                             <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
//                               <Clock size={12} className="text-emerald-500" /> 
//                               <span className="text-white">IN: {new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
//                             </div>
//                             {log.check_out && (
//                                <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
//                                  <LogOut size={12} className="text-red-500" /> 
//                                  <span className="text-white">OUT: {new Date(log.check_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
//                                </div>
//                             )}
//                           </>
//                         )}
//                         {metrics.isLate && <span className="ml-auto text-[8px] bg-orange-600 px-2 py-0.5 rounded font-black italic tracking-tighter">LATE</span>}
//                         {metrics.isAbsent && <span className="ml-auto text-[8px] bg-red-600 px-2 py-0.5 rounded font-black italic tracking-tighter animate-pulse">ABSENT</span>}
//                       </div>
//                     </motion.div>
//                   );
//                 })}
//               </AnimatePresence>
//             </div>
//           </div>
//         </div>

//         <div className="lg:col-span-4 space-y-8">
//           <div className="bg-[#111827]/60 border border-white/5 rounded-[3.5rem] p-10 aspect-square flex flex-col items-center justify-center relative shadow-2xl overflow-hidden">
//             <div className="absolute top-0 left-0 w-full h-full bg-emerald-500/5 blur-[80px]" />
//             <ResponsiveContainer width="100%" height="100%">
//               <PieChart>
//                 <Pie 
//                   data={[{value: onDutyCount}, {value: Math.max(0, employeesCount - onDutyCount)}]} 
//                   innerRadius="80%" 
//                   outerRadius="95%" 
//                   paddingAngle={8} 
//                   dataKey="value" 
//                   stroke="none"
//                 >
//                   <Cell fill="#10b981" />
//                   <Cell fill="#ef4444" opacity={0.05} />
//                 </Pie>
//               </PieChart>
//             </ResponsiveContainer>
//             <div className="absolute inset-0 flex flex-col items-center justify-center">
//               <div className="flex items-baseline gap-1">
//                 <span className="text-8xl font-black italic tracking-tighter leading-none">{onDutyCount}</span>
//                 <span className="text-3xl text-slate-600 font-bold">/{employeesCount}</span>
//               </div>
//               <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mt-4">Active Units</p>
//             </div>
//           </div>

//           <div className="grid grid-cols-1 gap-4">
//             <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:bg-red-600/5 transition-all">
//               <div>
//                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Absent Today</p>
//                 <p className="text-4xl font-black text-red-600 transition-colors">{absentCount}</p>
//               </div>
//               <Ghost size={32} className="text-red-600 opacity-50 group-hover:opacity-100" />
//             </div>

//             <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:bg-orange-600/5 transition-all">
//               <div>
//                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Late Today</p>
//                 <p className="text-4xl font-black text-orange-500">{lateCount}</p>
//               </div>
//               <AlertTriangle size={32} className="text-orange-500 opacity-50 group-hover:opacity-100" />
//             </div>
//           </div>
//         </div>
//       </div>

//       <style>{`
//         .custom-scrollbar::-webkit-scrollbar { width: 4px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 10px; }
//         .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
//       `}</style>
//     </div>
//   );
// };

// export default Dashboard;












// import React, { useState, useEffect, useMemo } from "react";
// import { Fingerprint, Cpu, Search, Activity, Clock, Building2, AlertTriangle, LogOut, Download, Filter, UserCheck } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// import api from "../api/axios";

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [selectedDept, setSelectedDept] = useState("All Departments");
//   const [filterLateOnly, setFilterLateOnly] = useState(false);
//   const [currentTime, setCurrentTime] = useState(new Date());

//   useEffect(() => {
//     const timer = setInterval(() => setCurrentTime(new Date()), 1000);
//     return () => clearInterval(timer);
//   }, []);

//   const fetchData = async () => {
//     try {
//       const [users, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);


//       const userData = users.data?.users || users.data || [];
//       setAllUsers(userData);
//       setEmployeesCount(Array.isArray(userData) ? userData.length : 0);
      
//       setLiveLogs(summary.data || []);
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { 
//       console.error("Sync Error:", err); 
//     }
//   };

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 5000);
//     return () => clearInterval(interval);
//   }, []);


//   const getStatusMetrics = (log) => {
//     if (!log.check_in || !log.shift_start) return { status: "On Time", isLate: false };
//     const checkInTime = new Date(log.check_in);
//     const [sH, sM] = log.shift_start.split(':').map(Number);
//     const shiftStart = new Date(checkInTime);
//     shiftStart.setHours(sH, sM, 0, 0);
//     const isLate = (checkInTime - shiftStart) / (1000 * 60) > 15;
//     return { status: isLate ? "LATE" : "On Time", isLate };
//   };

//   const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

//   const filteredLiveLogs = useMemo(() => {
//     return liveLogs.filter(log => {
//       const metrics = getStatusMetrics(log);
//       const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
//       const matchesSearch = log.name.toLowerCase().includes(searchQuery.toLowerCase());
//       const matchesLateFilter = filterLateOnly ? metrics.isLate : true;
//       const isToday = log.check_in?.startsWith(todayStr);
//       return isToday && matchesDept && matchesSearch && matchesLateFilter;
//     });
//   }, [liveLogs, searchQuery, selectedDept, filterLateOnly, todayStr]);

//   const lateCount = useMemo(() => 
//     liveLogs.filter(log => log.check_in?.startsWith(todayStr) && getStatusMetrics(log).isLate).length, 
//   [liveLogs, todayStr]);

//   const downloadTodayData = () => {
//     if (filteredLiveLogs.length === 0) return alert("No data to export for current filters.");

//     const headers = ["Name", "Department", "Check In", "Check Out", "Status"];
//     const csvRows = [
//       headers.join(","),
//       ...filteredLiveLogs.map(log => {
//         const { status } = getStatusMetrics(log);
//         return [
//           `"${log.name}"`,
//           `"${log.department || 'General'}"`,
//           log.check_in ? new Date(log.check_in).toLocaleTimeString() : "N/A",
//           log.check_out ? new Date(log.check_out).toLocaleTimeString() : "N/A",
//           status
//         ].join(",");
//       })
//     ];

//     const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
//     const url = URL.createObjectURL(blob);
//     const link = document.createElement("a");
//     link.href = url;
//     link.setAttribute("download", `AFAM_Attendance_${todayStr}.csv`);
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//   };

//   return (
//     <div className="min-h-screen bg-[#0b0f1a] text-white p-6 font-mono">
      

//       <header className="flex justify-between items-center mb-12 border-b border-white/5 pb-8">
//         <div className="flex items-center gap-4">
//           <div className="w-12 h-12 bg-red-600/10 rounded-xl flex items-center justify-center border border-red-600/30">
//             <Cpu className="text-red-500" size={24} />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black italic tracking-tighter uppercase, text-red-600"> <span className="text-red-600"></span></h1>
//             <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">COMMAND CENTER</p>
//           </div>
//         </div>

//         <div className="text-center">
//           <p className="text-2xl font-black tracking-tighter text-white">{currentTime.toLocaleTimeString()}</p>
//           <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">
//             {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
//           </p>
//         </div>

//         <div className="flex items-center gap-3">
//           <button 
//             onClick={() => setFilterLateOnly(!filterLateOnly)}
//             className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
//               filterLateOnly 
//                 ? "bg-red-600 border-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]" 
//                 : "bg-slate-900/50 border-white/10 text-slate-400 hover:border-red-500/50"
//             }`}
//           >
//             <AlertTriangle size={14} /> {filterLateOnly ? "Showing Late" : "Filter Late"}
//           </button>

//           <button 
//             onClick={downloadTodayData}
//             className="flex items-center gap-2 bg-emerald-600/10 border border-emerald-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:bg-emerald-600 hover:text-white transition-all"
//           >
//             <Download size={14} /> Export
//           </button>

//           <div className="relative group ml-2">
//             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-red-500 transition-colors" />
//             <input 
//               type="text" 
//               placeholder="Search..." 
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="bg-slate-900/50 border border-white/10 pl-10 pr-4 py-2 rounded-xl text-[10px] uppercase outline-none focus:border-red-500/50 w-40 transition-all"
//             />
//           </div>

//           <select 
//             value={selectedDept} 
//             onChange={(e) => setSelectedDept(e.target.value)}
//             className="bg-slate-900/50 border border-white/10 px-4 py-2 rounded-xl text-[10px] uppercase outline-none cursor-pointer hover:border-white/20"
//           >
//             <option value="All Departments">All Depts</option>
//             {[...new Set(allUsers.map(u => u.department).filter(Boolean))].map(d => <option key={d} value={d} className="bg-[#0b0f1a]">{d}</option>)}
//           </select>
//         </div>
//       </header>

//       {/* MAIN GRID */}
//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        
//         {/* LEFT SIDE: LIVE FEED */}
//         <div className="lg:col-span-8 space-y-6">
//           <div className="flex justify-between items-center px-2">
//             <h2 className="text-[12px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-3">
//               <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${filterLateOnly ? 'bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'}`} /> 
//               {filterLateOnly ? "Late Arrivals Stream" : "Live Personnel Stream"}
//             </h2>
//             <div className="h-[1px] flex-1 bg-gradient-to-r from-red-600/40 via-white/5 to-transparent ml-6" />
//           </div>

//           <div className="bg-[#111827]/40 border border-white/5 rounded-[2.5rem] p-6 h-[68vh] overflow-y-auto custom-scrollbar shadow-inner">
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <AnimatePresence mode="popLayout">
//                 {filteredLiveLogs.map((log) => {
//                   const metrics = getStatusMetrics(log);
//                   return (
//                     <motion.div 
//                       key={log.user_id} 
//                       layout
//                       initial={{ opacity: 0, scale: 0.95 }}
//                       animate={{ opacity: 1, scale: 1 }}
//                       exit={{ opacity: 0, scale: 0.95 }}
//                       className={`p-5 rounded-[1.5rem] border transition-all hover:translate-y-[-2px] ${
//                         metrics.isLate ? 'bg-red-950/20 border-red-500/30' : 'bg-white/5 border-transparent hover:bg-white/[0.08]'
//                       }`}
//                     >
//                       <div className="flex justify-between items-start mb-3">
//                         <div>
//                           <p className="text-[13px] font-black uppercase tracking-tight text-white mb-1">{log.name}</p>
//                           <p className="text-[9px] font-bold text-slate-500 uppercase">{log.department || 'General'}</p>
//                         </div>
//                         <Fingerprint size={18} className={metrics.isLate ? "text-red-500" : "text-emerald-500"} />
//                       </div>
                      
//                       <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
//                         <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
//                           <Clock size={12} className="text-emerald-500" /> 
//                           <span className="text-white">IN: {new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
//                         </div>
//                         {log.check_out && (
//                            <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
//                              <LogOut size={12} className="text-red-500" /> 
//                              <span className="text-white">OUT: {new Date(log.check_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
//                            </div>
//                         )}
//                         {metrics.isLate && <span className="ml-auto text-[8px] bg-red-600 px-2 py-0.5 rounded font-black italic tracking-tighter">LATE</span>}
//                       </div>
//                     </motion.div>
//                   );
//                 })}
//               </AnimatePresence>
//             </div>
//             {filteredLiveLogs.length === 0 && (
//               <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
//                 <Activity size={48} className="mb-4" />
//                 <p className="text-[10px] font-black uppercase tracking-widest">No matching personnel</p>
//               </div>
//             )}
//           </div>
//         </div>

//         {/* RIGHT SIDE: ANALYTICS */}
//         <div className="lg:col-span-4 space-y-8">
//           <div className="bg-[#111827]/60 border border-white/5 rounded-[3.5rem] p-10 aspect-square flex flex-col items-center justify-center relative shadow-2xl overflow-hidden">
//             <div className="absolute top-0 left-0 w-full h-full bg-emerald-500/5 blur-[80px]" />
//             <ResponsiveContainer width="100%" height="100%">
//               <PieChart>
//                 <Pie 
//                   data={[{value: onDutyCount}, {value: Math.max(0, employeesCount - onDutyCount)}]} 
//                   innerRadius="80%" 
//                   outerRadius="95%" 
//                   paddingAngle={8} 
//                   dataKey="value" 
//                   stroke="none"
//                 >
//                   <Cell fill="#10b981" />
//                   <Cell fill="#ef4444" opacity={0.05} />
//                 </Pie>
//               </PieChart>
//             </ResponsiveContainer>
//             <div className="absolute inset-0 flex flex-col items-center justify-center">
//               <div className="flex items-baseline gap-1">
//                 <span className="text-8xl font-black italic tracking-tighter leading-none">{onDutyCount}</span>
//                 <span className="text-3xl text-slate-600 font-bold">/{employeesCount}</span>
//               </div>
//               <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mt-4">Active Units</p>
//             </div>
//           </div>

//           <div className="grid grid-cols-1 gap-4">
//             <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:bg-red-600/5 transition-all">
//               <div>
//                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Late Today</p>
//                 <p className="text-4xl font-black group-hover:text-red-500 transition-colors">{lateCount}</p>
//               </div>
//               <AlertTriangle size={32} className="text-red-600 opacity-50 group-hover:opacity-100" />
//             </div>

//             <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:bg-emerald-600/5 transition-all">
//               <div>
//                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Presence</p>
//                 <p className="text-4xl font-black text-emerald-500">{Math.round((onDutyCount/employeesCount)*100 || 0)}%</p>
//               </div>
//               <Activity size={32} className="text-emerald-500 opacity-50 group-hover:opacity-100" />
//             </div>
//           </div>
//         </div>
//       </div>

//       <style>{`
//         .custom-scrollbar::-webkit-scrollbar { width: 4px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 10px; }
//         .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
//       `}</style>
//     </div>
//   );
// };

// export default Dashboard;





// import React, { useState, useEffect, useMemo } from "react";
// import {
//   Fingerprint, Cpu, Search, Activity, Clock, Building2, AlertTriangle, LogOut
// } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// import api from "../api/axios";

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [selectedDept, setSelectedDept] = useState("All Departments");
//   const [filterLateOnly, setFilterLateOnly] = useState(false);
//   const [currentTime, setCurrentTime] = useState(new Date());

//   // --- (1) SYNC CLOCK ---
//   useEffect(() => {
//     const timer = setInterval(() => setCurrentTime(new Date()), 1000);
//     return () => clearInterval(timer);
//   }, []);

//   // --- (2) FETCH DATA ---
//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 5000);
//     return () => clearInterval(interval);
//   }, []);

//   const fetchData = async () => {
//     try {
//       const [users, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);
//       setAllUsers(users.data || []);
//       setEmployeesCount(users.data.length);
//       setLiveLogs(summary.data || []);
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { console.error("Sync Error:", err); }
//   };

//   const getStatusMetrics = (log) => {
//     if (!log.check_in || !log.shift_start) return { status: "On Time", isLate: false };
//     const checkInTime = new Date(log.check_in);
//     const [sH, sM] = log.shift_start.split(':').map(Number);
//     const shiftStart = new Date(checkInTime);
//     shiftStart.setHours(sH, sM, 0, 0);
//     const isLate = (checkInTime - shiftStart) / (1000 * 60) > 15;
//     return { status: isLate ? "LATE" : "On Time", isLate };
//   };

//   const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [currentTime.toDateString()]);

//   // --- (3) FILTERED LIVE FEED ---
//   const filteredLiveLogs = useMemo(() => {
//     return liveLogs.filter(log => {
//       const metrics = getStatusMetrics(log);
//       const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
//       const matchesSearch = log.name.toLowerCase().includes(searchQuery.toLowerCase());
//       const matchesLateFilter = filterLateOnly ? metrics.isLate : true;
//       return log.check_in?.startsWith(todayStr) && matchesDept && matchesSearch && matchesLateFilter;
//     });
//   }, [liveLogs, searchQuery, selectedDept, filterLateOnly, todayStr]);

//   const lateCount = useMemo(() => 
//     liveLogs.filter(log => log.check_in?.startsWith(todayStr) && getStatusMetrics(log).isLate).length, 
//   [liveLogs, todayStr]);

//   return (
//     <div className="min-h-screen bg-[#0b0f1a] text-white p-6 font-mono">
      
//       {/* HEADER SECTION */}
//       <header className="flex justify-between items-center mb-12 border-b border-white/5 pb-8">
//         <div className="flex items-center gap-4">
//           <div className="w-12 h-12 bg-red-600/10 rounded-xl flex items-center justify-center border border-red-600/30">
//             <Cpu className="text-red-500" size={24} />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black italic tracking-tighter uppercase">AFAM <span className="text-red-600">GROUP</span></h1>
//             <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">COMMAND CENTER</p>
//           </div>
//         </div>

//         <div className="text-center">
//           <p className="text-2xl font-black tracking-tighter text-white">{currentTime.toLocaleTimeString()}</p>
//           <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">
//             {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
//           </p>
//         </div>

//         <div className="flex items-center gap-4">
//           <div className="relative group">
//             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-red-500 transition-colors" />
//             <input 
//               type="text" 
//               placeholder="Search Personnel..." 
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="bg-slate-900/50 border border-white/10 pl-10 pr-4 py-2 rounded-xl text-[10px] uppercase outline-none focus:border-red-500/50 w-64 transition-all"
//             />
//           </div>
//           <select 
//             value={selectedDept} 
//             onChange={(e) => setSelectedDept(e.target.value)}
//             className="bg-slate-900/50 border border-white/10 px-4 py-2 rounded-xl text-[10px] uppercase outline-none cursor-pointer hover:border-white/20"
//           >
//             <option value="All Departments">All Departments</option>
//             {[...new Set(allUsers.map(u => u.department).filter(Boolean))].map(d => <option key={d} value={d} className="bg-[#0b0f1a]">{d}</option>)}
//           </select>
//         </div>
//       </header>

//       {/* UPDATED 2-COLUMN GRID (REMOVED OFFLINE TABLE) */}
//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        
//         {/* LEFT SIDE: LIVE FEED (EXPANDED) */}
//         <div className="lg:col-span-8 space-y-6">
//           <div className="flex justify-between items-center px-2">
//             <h2 className="text-[12px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-3">
//               <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.5)]" /> 
//               Live Personnel Stream
//             </h2>
//             <div className="h-[1px] flex-1 bg-gradient-to-r from-red-600/40 via-white/5 to-transparent ml-6" />
//           </div>

//           <div className="bg-[#111827]/40 border border-white/5 rounded-[2.5rem] p-6 h-[68vh] overflow-y-auto custom-scrollbar shadow-inner">
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <AnimatePresence mode="popLayout">
//                 {filteredLiveLogs.map((log) => {
//                   const metrics = getStatusMetrics(log);
//                   return (
//                     <motion.div 
//                       key={log.user_id} 
//                       layout
//                       initial={{ opacity: 0, scale: 0.95 }}
//                       animate={{ opacity: 1, scale: 1 }}
//                       className={`p-5 rounded-[1.5rem] border transition-all hover:translate-y-[-2px] ${
//                         metrics.isLate ? 'bg-red-950/20 border-red-500/30' : 'bg-white/5 border-transparent hover:bg-white/[0.08]'
//                       }`}
//                     >
//                       <div className="flex justify-between items-start mb-3">
//                         <div>
//                           <p className="text-[13px] font-black uppercase tracking-tight text-white mb-1">{log.name}</p>
//                           <p className="text-[9px] font-bold text-slate-500 uppercase">{log.department || 'General'}</p>
//                         </div>
//                         <Fingerprint size={18} className={metrics.isLate ? "text-red-500" : "text-emerald-500"} />
//                       </div>
                      
//                       <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
//                         <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
//                           <Clock size={12} className="text-emerald-500" /> 
//                           <span className="text-white">IN: {new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
//                         </div>
//                         {log.check_out && (
//                            <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
//                              <LogOut size={12} className="text-red-500" /> 
//                              <span className="text-white">OUT: {new Date(log.check_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
//                            </div>
//                         )}
//                         {metrics.isLate && <span className="ml-auto text-[8px] bg-red-600 px-2 py-0.5 rounded font-black italic tracking-tighter">LATE ARRIVAL</span>}
//                       </div>
//                     </motion.div>
//                   );
//                 })}
//               </AnimatePresence>
//             </div>
//             {filteredLiveLogs.length === 0 && (
//               <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
//                 <Activity size={48} className="mb-4" />
//                 <p className="text-[10px] font-black uppercase tracking-widest">No Active Personnel Found</p>
//               </div>
//             )}
//           </div>
//         </div>

//         {/* RIGHT SIDE: ANALYTICS & STATS */}
//         <div className="lg:col-span-4 space-y-8">
//           <div className="bg-[#111827]/60 border border-white/5 rounded-[3.5rem] p-10 aspect-square flex flex-col items-center justify-center relative shadow-2xl overflow-hidden">
//             {/* Background Glow */}
//             <div className="absolute top-0 left-0 w-full h-full bg-emerald-500/5 blur-[80px]" />
            
//             <ResponsiveContainer width="100%" height="100%">
//               <PieChart>
//                 <Pie 
//                   data={[{value: onDutyCount}, {value: Math.max(0, employeesCount - onDutyCount)}]} 
//                   innerRadius="80%" 
//                   outerRadius="95%" 
//                   paddingAngle={8} 
//                   dataKey="value" 
//                   stroke="none"
//                 >
//                   <Cell fill="#10b981" />
//                   <Cell fill="#ef4444" opacity={0.05} />
//                 </Pie>
//               </PieChart>
//             </ResponsiveContainer>
            
//             <div className="absolute inset-0 flex flex-col items-center justify-center">
//               <div className="flex items-baseline gap-1">
//                 <span className="text-8xl font-black italic tracking-tighter leading-none">{onDutyCount}</span>
//                 <span className="text-3xl text-slate-600 font-bold">/{employeesCount}</span>
//               </div>
//               <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mt-4">Active Units</p>
//             </div>
//           </div>

//           <div className="grid grid-cols-1 gap-4">
//             <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:bg-red-600/5 transition-all">
//               <div>
//                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Late Today</p>
//                 <p className="text-4xl font-black group-hover:text-red-500 transition-colors">{lateCount}</p>
//               </div>
//               <AlertTriangle size={32} className="text-red-600 opacity-50 group-hover:opacity-100" />
//             </div>

//             <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex items-center justify-between group hover:bg-emerald-600/5 transition-all">
//               <div>
//                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Presence</p>
//                 <p className="text-4xl font-black text-emerald-500">{Math.round((onDutyCount/employeesCount)*100 || 0)}%</p>
//               </div>
//               <Activity size={32} className="text-emerald-500 opacity-50 group-hover:opacity-100" />
//             </div>
//           </div>
//         </div>

//       </div>

//       <style>{`
//         .custom-scrollbar::-webkit-scrollbar { width: 4px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 10px; }
//         .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
//       `}</style>
//     </div>
//   );
// };

// export default Dashboard;







// import React, { useState, useEffect, useMemo, useRef } from "react";
// import {
//   Users, Fingerprint, Scan, Cpu, Download, 
//   Search, Activity, ShieldAlert, Clock, Building2, AlertTriangle, Bell, LogOut, DollarSign
// } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
// import api from "../api/axios";
// import * as XLSX from "xlsx";

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [isSyncing, setIsSyncing] = useState(false);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [selectedDept, setSelectedDept] = useState("All Departments");
//   const [notifications, setNotifications] = useState([]);
//   const [filterLateOnly, setFilterLateOnly] = useState(false);
//   const [currentTime, setCurrentTime] = useState(new Date());

//   const prevLogsLength = useRef(0);

//   // --- LIVE TIME & DATE ---
//   useEffect(() => {
//     const timer = setInterval(() => setCurrentTime(new Date()), 1000);
//     return () => clearInterval(timer);
//   }, []);

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 5000);
//     return () => clearInterval(interval);
//   }, []);

//   const fetchData = async () => {
//     setIsSyncing(true);
//     try {
//       const [users, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);
      
//       if (summary.data.length > prevLogsLength.current && prevLogsLength.current !== 0) {
//         addNotification(summary.data[0].name);
//       }
//       prevLogsLength.current = summary.data.length;
      
//       setAllUsers(users.data || []);
//       setEmployeesCount(users.data.length);
//       setLiveLogs(summary.data || []);
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { console.error("Sync Error:", err); }
//     setTimeout(() => setIsSyncing(false), 800);
//   };

//   const addNotification = (name) => {
//     const id = Date.now();
//     setNotifications(prev => [{ id, name }, ...prev]);
//     setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 3500);
//   };

//   // --- LOGIC UTILS ---
//   const getStatusMetrics = (log) => {
//     if (!log.check_in || !log.shift_start) return { status: "On Time", isLate: false, lateMinutes: 0 };
//     const checkInTime = new Date(log.check_in);
//     const [sH, sM] = log.shift_start.split(':').map(Number);
//     const shiftStart = new Date(checkInTime);
//     shiftStart.setHours(sH, sM, 0, 0);
    
//     const lateMinutes = Math.max(0, (checkInTime - shiftStart) / (1000 * 60));
//     const isLate = lateMinutes > 15;
//     return { status: isLate ? "LATE" : "On Time", isLate, lateMinutes };
//   };

//   const todayStr = useMemo(() => currentTime.toISOString().split('T')[0], [currentTime.toDateString()]);

//   // --- SECTION: FILTERED LIVE FEED ---
//   const filteredLiveLogs = useMemo(() => {
//     return liveLogs.filter(log => {
//       const metrics = getStatusMetrics(log);
//       const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
//       const matchesSearch = log.name.toLowerCase().includes(searchQuery.toLowerCase());
//       const matchesLateFilter = filterLateOnly ? metrics.isLate : true;
//       return log.check_in?.startsWith(todayStr) && matchesDept && matchesSearch && matchesLateFilter;
//     });
//   }, [liveLogs, searchQuery, selectedDept, filterLateOnly, todayStr]);

//   // --- SECTION: DUPLICATE REMOVAL FOR OFFLINE LIST ---
//   const offSitePersonnel = useMemo(() => {
//     // Create a Set of IDs currently clocked in today for O(1) lookup
//     const activeIds = new Set(liveLogs.filter(l => l.check_in?.startsWith(todayStr)).map(l => String(l.user_id)));
    
//     return allUsers.filter(user => {
//       const isAlreadyLive = activeIds.has(String(user.id));
//       const matchesDept = selectedDept === "All Departments" || user.department === selectedDept;
//       const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase());
//       return !isAlreadyLive && matchesDept && matchesSearch;
//     });
//   }, [allUsers, liveLogs, selectedDept, searchQuery, todayStr]);

//   // --- ANALYTICS CALCULATIONS ---
//   const { lateCount, estimatedLoss } = useMemo(() => {
//     let count = 0;
//     let loss = 0;
//     liveLogs.forEach(log => {
//       const metrics = getStatusMetrics(log);
//       if (metrics.isLate) {
//         count++;
//         // Use salary data from employee profile (assuming monthly salary / 22 days / 8 hours)
//         const user = allUsers.find(u => String(u.id) === String(log.user_id));
//         if (user && user.salary) {
//           const minuteRate = (user.salary / 22 / 8 / 60);
//           loss += metrics.lateMinutes * minuteRate;
//         }
//       }
//     });
//     return { lateCount: count, estimatedLoss: loss.toFixed(2) };
//   }, [liveLogs, allUsers]);

//   return (
//     <div className="min-h-screen bg-[#0f172a] text-white p-6 font-mono relative overflow-hidden">
      
//       {/* HEADER */}
//       <header className="flex justify-between items-center mb-10 relative z-10 border-b border-white/5 pb-6">
//         <div className="flex items-center gap-4">
//           <div className="w-12 h-12 bg-red-600/10 rounded-xl flex items-center justify-center border border-red-600/30">
//             <Cpu className="text-red-500" size={24} />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black italic">AFAM <span className="text-red-600">GROUP</span></h1>
//             <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">COMMAND CENTER</p>
//           </div>
//         </div>

//         <div className="text-center">
//           <p className="text-xl font-black tracking-tighter text-white">{currentTime.toLocaleTimeString()}</p>
//           <p className="text-[9px] font-bold text-red-500 uppercase">
//             {currentTime.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
//           </p>
//         </div>

//         <div className="flex items-center gap-3">
//           <div className="relative group">
//             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
//             <input 
//               type="text" 
//               placeholder="SEARCH PERSONNEL..." 
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="bg-slate-900 border border-white/10 pl-9 pr-4 py-2 rounded-xl text-[10px] font-black uppercase outline-none focus:border-red-500 transition-all w-48"
//             />
//           </div>
//           <div className="flex items-center gap-2 bg-slate-900 border border-white/10 px-3 py-2 rounded-xl">
//             <Building2 size={14} className="text-red-500" />
//             <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className="bg-transparent text-[10px] font-black uppercase outline-none">
//               <option value="All Departments" className="bg-slate-900">All Departments</option>
//               {[...new Set(allUsers.map(u => u.department).filter(Boolean))].map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
//             </select>
//           </div>
//         </div>
//       </header>

//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
//         {/* LIVE FEED */}
//         <div className="lg:col-span-4 space-y-4">
//           <div className="flex items-center justify-between px-2">
//             <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
//               <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> Live Feed
//             </h2>
//             <svg width="100" height="20" viewBox="0 0 100 20" className="text-red-500 opacity-60">
//               <path d="M0,10 L40,10 L45,2 L55,18 L60,10 L100,10" fill="none" stroke="currentColor" strokeWidth="2" className="heartbeat-mini" />
//             </svg>
//           </div>

//           <div className="bg-slate-900/40 border border-white/5 rounded-[2.5rem] p-5 h-[70vh] overflow-y-auto custom-scrollbar space-y-3">
//             <AnimatePresence mode="popLayout">
//               {filteredLiveLogs.map((log, i) => {
//                 const metrics = getStatusMetrics(log);
//                 return (
//                   <motion.div 
//                     key={`${log.user_id}-${i}`} 
//                     initial={{ opacity: 0, x: -20 }} 
//                     animate={{ opacity: 1, x: 0 }}
//                     layout 
//                     className={`p-4 rounded-2xl border transition-all ${metrics.isLate ? 'bg-red-950/30 border-red-500/40' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
//                   >
//                     <div className="flex justify-between items-start mb-2">
//                       <p className="text-[12px] font-black uppercase">{log.name}</p>
//                       <Fingerprint size={16} className={metrics.isLate ? "text-red-500" : "text-emerald-500"} />
//                     </div>
//                     <div className="flex items-center gap-4">
//                       <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
//                         <Clock size={10} className="text-emerald-500" /> {new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
//                       </div>
//                       {log.check_out && (
//                         <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
//                           <LogOut size={10} className="text-red-500" /> {new Date(log.check_out).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
//                         </div>
//                       )}
//                       {metrics.isLate && <span className="bg-red-600 text-white text-[7px] px-1.5 py-0.5 rounded italic ml-auto font-black">LATE</span>}
//                     </div>
//                   </motion.div>
//                 );
//               })}
//             </AnimatePresence>
//           </div>
//         </div>

//         {/* OFFLINE PERSONNEL (DUPLICATES REMOVED) */}
//         <div className="lg:col-span-4 space-y-4">
//           <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-500 italic px-2">Offline Personnel</h2>
//           <div className="bg-black/30 border border-white/5 rounded-[2.5rem] p-5 h-[70vh] overflow-y-auto custom-scrollbar space-y-2">
//             {offSitePersonnel.map((u, i) => (
//               <div key={u.id || i} className="flex justify-between items-center p-3 border-b border-white/5 opacity-40 hover:opacity-100 transition-opacity group">
//                 <span className="text-[11px] font-bold uppercase group-hover:text-red-400">{u.name}</span>
//                 <span className="text-[8px] border border-slate-700 px-2 py-0.5 rounded text-slate-500 font-black">OFFLINE</span>
//               </div>
//             ))}
//           </div>
//         </div>

//         {/* ANALYTICS PANEL */}
//         <div className="lg:col-span-4 space-y-6">
//           <div className="bg-slate-900/40 border border-white/10 rounded-[3.5rem] p-10 aspect-square flex flex-col items-center justify-center relative shadow-2xl">
//             <ResponsiveContainer width="100%" height="100%">
//               <PieChart>
//                 <Pie data={[{value: onDutyCount}, {value: employeesCount - onDutyCount}]} innerRadius={90} outerRadius={120} paddingAngle={8} dataKey="value" stroke="none">
//                   <Cell fill="#10b981" /><Cell fill="#ef4444" opacity={0.1} />
//                 </Pie>
//               </PieChart>
//             </ResponsiveContainer>
//             <div className="absolute text-center">
//               <p className="text-7xl font-black italic leading-none">{onDutyCount}<span className="text-3xl text-slate-600 not-italic">/{employeesCount}</span></p>
//               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">Active Units</p>
//             </div>
//           </div>
          
//           <div className="grid grid-cols-2 gap-4">
//             <button 
//               onClick={() => setFilterLateOnly(!filterLateOnly)}
//               className={`p-6 rounded-[2rem] border transition-all text-center relative overflow-hidden group ${filterLateOnly ? 'bg-red-600 border-red-400' : 'bg-white/5 border-white/5'}`}
//             >
//               <AlertTriangle size={20} className={`mx-auto mb-2 ${filterLateOnly ? 'text-white' : 'text-red-500'}`} />
//               <p className={`text-[9px] font-black uppercase ${filterLateOnly ? 'text-white/80' : 'text-slate-500'}`}>Late Today</p>
//               <p className="text-3xl font-black">{lateCount}</p>
//               <div className="mt-2 flex items-center justify-center gap-1 text-[8px] font-black text-red-400 group-hover:text-white">
//                 <DollarSign size={8} /> LOSS: ${estimatedLoss}
//               </div>
//               {filterLateOnly && <p className="text-[7px] font-bold uppercase mt-1 text-white animate-pulse">Filtering Active</p>}
//             </button>

//             <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5 text-center flex flex-col justify-center">
//               <Activity size={20} className="text-emerald-500 mx-auto mb-2" />
//               <p className="text-[9px] text-slate-500 font-black uppercase">Presence</p>
//               <p className="text-3xl font-black text-emerald-500">{Math.round((onDutyCount/employeesCount)*100 || 0)}%</p>
//             </div>
//           </div>
//         </div>
//       </div>

//       <style>{`
//         .heartbeat-mini { stroke-dasharray: 100; stroke-dashoffset: 100; animation: miniBeat 2s linear infinite; }
//         @keyframes miniBeat { 0% { stroke-dashoffset: 100; } 100% { stroke-dashoffset: 0; } }
//         .custom-scrollbar::-webkit-scrollbar { width: 4px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
//       `}</style>
//     </div>
//   );
// };

// export default Dashboard;











// import React, { useState, useEffect, useMemo } from "react";
// import {
//   Users, Fingerprint, Scan, Cpu, Radio, Download, 
//   Building2, Search, Activity, ShieldAlert, Clock
// } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// import api from "../api/axios";
// import * as XLSX from "xlsx";

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [isSyncing, setIsSyncing] = useState(false);
//   const [selectedDept, setSelectedDept] = useState("All Departments");
//   const [searchQuery, setSearchQuery] = useState("");
//   const [pulseColor, setPulseColor] = useState("rgba(255,255,255,0.2)");

//   // --- HEARTBEAT COLOR TOGGLE (Every 5 Seconds) ---
//   useEffect(() => {
//     const colorInterval = setInterval(() => {
//       setPulseColor("#ef4444"); // Flash Red
//       setTimeout(() => setPulseColor("rgba(255,255,255,0.2)"), 1500); // Back to White
//     }, 5000);
//     return () => clearInterval(colorInterval);
//   }, []);

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 8000);
//     return () => clearInterval(interval);
//   }, []);

//   const fetchData = async () => {
//     setIsSyncing(true);
//     try {
//       const [users, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);
//       setAllUsers(users.data || []);
//       setEmployeesCount(users.data.length);
//       setLiveLogs(summary.data || []);
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { console.error(err); }
//     setTimeout(() => setIsSyncing(false), 800);
//   };

//   // --- STATUS LOGIC (15 Min Grace Period) ---
//   const getStatusMetrics = (log) => {
//     if (!log.check_in || !log.shift_start) return { status: "On Time", isLate: false, isEarly: false };
    
//     const checkInTime = new Date(log.check_in);
//     const [sH, sM] = log.shift_start.split(':').map(Number);
//     const shiftStart = new Date(checkInTime);
//     shiftStart.setHours(sH, sM, 0, 0);

//     const isLate = (checkInTime - shiftStart) / (1000 * 60) > 15;
//     if (isLate) return { status: "LATE ARRIVAL", isLate: true, isEarly: false };

//     if (log.check_out && log.shift_end) {
//       const checkOutTime = new Date(log.check_out);
//       const [eH, eM] = log.shift_end.split(':').map(Number);
//       const shiftEnd = new Date(checkOutTime);
//       shiftEnd.setHours(eH, eM, 0, 0);
      
//       if (sH > eH && checkOutTime.getHours() > sH) shiftEnd.setDate(shiftEnd.getDate() + 1);
//       if (checkOutTime < shiftEnd) return { status: "EARLY LEAVE", isLate: false, isEarly: true };
//     }
//     return { status: "On Time", isLate: false, isEarly: false };
//   };

//   const filteredLogs = useMemo(() => {
//     const today = new Date().toISOString().split('T')[0];
//     return liveLogs.filter(log => {
//       const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
//       const matchesSearch = log.name.toLowerCase().includes(searchQuery.toLowerCase());
//       return log.check_in?.startsWith(today) && matchesDept && matchesSearch;
//     });
//   }, [liveLogs, selectedDept, searchQuery]);

//   // --- EXCEL EXPORT WITH STATUS COLUMN ---
//   const handleExport = () => {
//     const exportData = filteredLogs.map(log => {
//       const metrics = getStatusMetrics(log);
//       return {
//         'Employee ID': log.employee_id,
//         'Name': log.name,
//         'Department': log.department || 'Main Office',
//         'Check-In': log.check_in ? new Date(log.check_in).toLocaleTimeString() : '-',
//         'Check-Out': log.check_out ? new Date(log.check_out).toLocaleTimeString() : '-',
//         'Status': metrics.status // Show Late/Early/On-Time
//       };
//     });
//     const ws = XLSX.utils.json_to_sheet(exportData);
//     const wb = XLSX.utils.book_new();
//     XLSX.utils.book_append_sheet(wb, ws, "Attendance Pulse");
//     XLSX.writeFile(wb, `AFAM_Pulse_Report_${new Date().toLocaleDateString()}.xlsx`);
//   };

//   const donutData = [
//     { name: 'On Duty', value: onDutyCount, color: '#10b981' }, 
//     { name: 'Off Duty', value: Math.max(0, employeesCount - onDutyCount), color: '#ef4444' }
//   ];

//   return (
//     <div className="min-h-screen bg-[#1E2235] text-white p-6 font-mono overflow-hidden relative">
      
//       {/* 01. FIXED HEARTBEAT ALIGNMENT (TOP ONLY) */}
//       <div className="absolute top-0 left-0 w-full h-[120px] pointer-events-none z-0 opacity-40">
//         <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
//             <path 
//               d="M0,80 L350,80 L360,20 L375,95 L390,80 L1000,80" 
//               fill="none" stroke={pulseColor} strokeWidth="3" 
//               className="heartbeat-path"
//               style={{ transition: 'stroke 1s ease' }}
//             />
//         </svg>
//       </div>

//       <header className="flex justify-between items-center border-b border-white/5 pb-6 mb-8 relative z-20 bg-[#1E2235]/60 backdrop-blur-md">
//         <div className="flex items-center gap-6">
//           <div className="w-12 h-12 border-2 border-red-600 rounded-full flex items-center justify-center animate-spin-slow">
//               <Cpu className="text-red-500" size={18} />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black tracking-widest uppercase italic text-red-600 leading-none">AFAM GROUP</h1>
//             <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-[0.3em]">Operational Pulse // Live</p>
//           </div>
//         </div>

//         <div className="flex items-center gap-4">
//             <div className="relative">
//                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
//                 <input 
//                     type="text" placeholder="SEARCH AGENT..." 
//                     value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
//                     className="bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-[10px] w-64 outline-none focus:border-red-600 transition-all"
//                 />
//             </div>
//             <button onClick={handleExport} className="bg-emerald-600 hover:bg-emerald-700 px-5 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20">
//                 <Download size={14} /> <span className="text-[10px] font-black uppercase">Export Status</span>
//             </button>
//         </div>
//       </header>

//       {/* 02. MAIN TABLES (STARTING CORRECTLY AFTER HEADER) */}
//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10 h-[calc(100vh-180px)]">
        
//         {/* LIVE STREAM COLUMN */}
//         <div className="lg:col-span-4 flex flex-col gap-4">
//           <h2 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-2 border-l-2 border-red-600">
//             Auth Feed <span className="text-slate-500">|</span> {filteredLogs.length} Records
//           </h2>
//           <div className="flex-1 bg-black/20 border border-white/5 rounded-[2.5rem] p-4 overflow-y-auto custom-scrollbar space-y-3">
//               <AnimatePresence>
//                   {filteredLogs.map((log, i) => {
//                       const metrics = getStatusMetrics(log);
//                       return (
//                         <motion.div key={i} layout className={`p-4 rounded-2xl flex items-center justify-between group transition-all ${metrics.isLate ? 'bg-red-600/10 border border-red-600/40' : 'bg-white/5 border border-transparent'}`}>
//                             <div>
//                                 <p className={`text-[12px] font-black uppercase ${metrics.isLate ? 'text-red-500' : 'text-white'}`}>{log.name}</p>
//                                 <div className="flex items-center gap-2 mt-1">
//                                     <span className="text-[9px] text-slate-500 font-bold">{new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                    
//                                     {/* MANDATORY STAMPS */}
//                                     {metrics.isLate && (
//                                       <div className="flex items-center gap-1 px-2 py-0.5 bg-red-600 rounded text-[7px] font-black text-white uppercase tracking-tighter shadow-lg shadow-red-900/40">
//                                           <ShieldAlert size={8} /> LATE ARRIVAL
//                                       </div>
//                                     )}
//                                     {metrics.isEarly && (
//                                       <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500 rounded text-[7px] font-black text-white uppercase tracking-tighter">
//                                           <Clock size={8} /> EARLY LEAVE
//                                       </div>
//                                     )}
//                                 </div>
//                             </div>
//                             <Fingerprint size={16} className={metrics.isLate ? "text-red-500" : "text-emerald-500 opacity-20 group-hover:opacity-100"} />
//                         </motion.div>
//                       );
//                   })}
//               </AnimatePresence>
//           </div>
//         </div>

//         {/* OFF-SITE INTEL COLUMN */}
//         <div className="lg:col-span-4 flex flex-col gap-4">
//             <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 border-l-2 border-slate-600">Off-Site Personnel</h2>
//             <div className="flex-1 bg-black/10 border border-white/5 rounded-[2.5rem] p-6 overflow-y-auto custom-scrollbar space-y-2">
//                 {allUsers.filter(u => !filteredLogs.some(l => l.user_id === u.id)).slice(0, 15).map((u, i) => (
//                     <div key={i} className="flex justify-between items-center p-4 border-b border-white/5 opacity-40">
//                         <span className="text-[10px] font-bold uppercase">{u.name}</span>
//                         <span className="text-[8px] font-bold text-slate-500 uppercase italic">Offline</span>
//                     </div>
//                 ))}
//             </div>
//         </div>

//         {/* RADIAL ANALYTICS COLUMN */}
//         <div className="lg:col-span-4 space-y-6">
//             <div className="bg-white/5 border border-white/10 rounded-[3.5rem] p-10 h-[45vh] flex flex-col items-center justify-center relative overflow-hidden">
//                 <div className="w-full h-full relative">
//                     <ResponsiveContainer width="100%" height="100%">
//                         <PieChart>
//                             <Pie
//                                 data={donutData} innerRadius={90} outerRadius={125}
//                                 paddingAngle={8} dataKey="value" stroke="none"
//                             >
//                                 {donutData.map((entry, index) => (
//                                     <Cell key={`cell-${index}`} fill={entry.color} />
//                                 ))}
//                             </Pie>
//                         </PieChart>
//                     </ResponsiveContainer>
//                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
//                         <p className="text-7xl font-black italic leading-none">{onDutyCount}</p>
//                         <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2 italic">Active Units</p>
//                     </div>
//                 </div>
//             </div>

//             <div className="grid grid-cols-2 gap-6">
//                 <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex flex-col items-center">
//                     <Users size={20} className="text-red-500 mb-2" />
//                     <p className="text-[8px] font-black text-slate-500 uppercase">Total Workforce</p>
//                     <p className="text-2xl font-black">{employeesCount}</p>
//                 </div>
//                 <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/5 flex flex-col items-center">
//                     <Activity size={20} className="text-red-500 mb-2" />
//                     <p className="text-[8px] font-black text-slate-500 uppercase">Efficiency</p>
//                     <p className="text-2xl font-black">{Math.round((onDutyCount/employeesCount)*100)}%</p>
//                 </div>
//             </div>
//         </div>

//       </div>

//       <style>{`
//         .animate-spin-slow { animation: spin 20s linear infinite; }
//         @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
//         .heartbeat-path {
//           stroke-dasharray: 1000;
//           stroke-dashoffset: 1000;
//           animation: beat 8s linear infinite;
//         }
//         @keyframes beat {
//           0% { stroke-dashoffset: 1000; }
//           15% { stroke-dashoffset: 0; }
//           100% { stroke-dashoffset: 0; opacity: 0; }
//         }
//         .custom-scrollbar::-webkit-scrollbar { width: 4px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #3a3f5a; border-radius: 10px; }
//       `}</style>
//     </div>
//   );
// };

// export default Dashboard;


// import React, { useState, useEffect, useMemo } from "react";
// import {
//   Users, Fingerprint, Scan, Cpu, Radio, Download, 
//   Building2, Search, AlertCircle, Activity, ShieldAlert
// } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// import api from "../api/axios";

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [isSyncing, setIsSyncing] = useState(false);
//   const [selectedDept, setSelectedDept] = useState("All Departments");
//   const [searchQuery, setSearchQuery] = useState("");
//   const [pulseColor, setPulseColor] = useState("rgba(255,255,255,0.3)");

//   // Heartbeat Color Toggle (Every 5 seconds)
//   useEffect(() => {
//     const colorInterval = setInterval(() => {
//       setPulseColor("#ef4444"); // Turn Red
//       setTimeout(() => setPulseColor("rgba(255,255,255,0.3)"), 1500); // Back to White after 1.5s
//     }, 5000);
//     return () => clearInterval(colorInterval);
//   }, []);

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 8000);
//     return () => clearInterval(interval);
//   }, []);

//   const fetchData = async () => {
//     setIsSyncing(true);
//     try {
//       const [users, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);
//       setAllUsers(users.data || []);
//       setEmployeesCount(users.data.length);
//       setLiveLogs(summary.data || []);
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { console.error(err); }
//     setTimeout(() => setIsSyncing(false), 800);
//   };

//   const filteredLogs = useMemo(() => {
//     const today = new Date().toISOString().split('T')[0];
//     return liveLogs.filter(log => {
//       const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
//       const matchesSearch = log.name.toLowerCase().includes(searchQuery.toLowerCase());
//       return log.check_in?.startsWith(today) && matchesDept && matchesSearch;
//     });
//   }, [liveLogs, selectedDept, searchQuery]);

//   const donutData = [
//     { name: 'On Duty', value: onDutyCount, color: '#10b981' }, 
//     { name: 'Off Duty', value: Math.max(0, employeesCount - onDutyCount), color: '#ef4444' }
//   ];

//   return (
//     <div className="min-h-screen bg-[#1E2235] text-white p-6 font-mono overflow-hidden relative selection:bg-red-500/30">
      
//       {/* BACKGROUND HEARTBEAT - Positioned absolute so it doesn't affect table alignment */}
//       <div className="absolute top-[160px] left-0 w-full h-[100px] pointer-events-none z-0">
//         <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none">
//             <path 
//               d="M0,50 L380,50 L390,20 L405,80 L420,50 L1000,50" 
//               fill="none" 
//               stroke={pulseColor} 
//               strokeWidth="3" 
//               className="heartbeat-path"
//               style={{ transition: 'stroke 0.8s ease' }}
//             />
//         </svg>
//       </div>

//       <header className="flex justify-between items-center border-b border-white/5 pb-6 mb-8 relative z-20">
//         <div className="flex items-center gap-6">
//           <div className="w-12 h-12 border-2 border-red-600 rounded-full flex items-center justify-center animate-spin-slow">
//               <Cpu className="text-red-500" size={18} />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black tracking-widest uppercase italic text-red-600">AFAM GROUP</h1>
//             <p className="text-[9px] font-bold text-slate-400">CORE OPS // {isSyncing ? 'SYNCING...' : 'LIVE'}</p>
//           </div>
//         </div>

//         <div className="flex items-center gap-4">
//             <div className="relative">
//                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
//                 <input 
//                     type="text" placeholder="SEARCH..." 
//                     value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
//                     className="bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-[10px] w-48 focus:border-red-600 outline-none transition-all"
//                 />
//             </div>
//             <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
//                 <Building2 size={14} className="text-red-500" />
//                 <select 
//                     value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}
//                     className="bg-transparent text-[10px] font-black uppercase outline-none"
//                 >
//                     {["All Departments", ...new Set(allUsers.map(u => u.department).filter(Boolean))].map(dept => (
//                       <option key={dept} value={dept} className="bg-[#1E2235]">{dept}</option>
//                     ))}
//                 </select>
//             </div>
//         </div>
//       </header>

//       {/* TABLES NOW START IMMEDIATELY AFTER HEADER */}
//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10 h-[calc(100vh-180px)]">
        
//         {/* COLUMN 1: LIVE STREAM */}
//         <div className="lg:col-span-4 flex flex-col gap-4">
//           <div className="flex justify-between items-center px-2 border-l-2 border-red-600">
//             <h2 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
//               <Scan size={14} className="text-red-500" /> Live Stream
//             </h2>
//             <span className="text-[10px] text-red-500 font-bold">{filteredLogs.length} Records</span>
//           </div>
//           <div className="flex-1 bg-black/30 backdrop-blur-sm border border-white/5 rounded-[2rem] p-4 overflow-y-auto custom-scrollbar space-y-3">
//               <AnimatePresence>
//                   {filteredLogs.map((log, i) => (
//                       <motion.div key={i} layout className={`p-4 rounded-2xl flex items-center justify-between group transition-all ${log.is_late ? 'bg-red-600/10 border border-red-600/40 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-white/5 border border-transparent'}`}>
//                           <div>
//                               <p className={`text-[11px] font-black uppercase ${log.is_late ? 'text-red-500' : 'text-white'}`}>{log.name}</p>
//                               <div className="flex items-center gap-2 mt-1">
//                                   <span className="text-[9px] text-slate-500">{new Date(log.check_in).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                  
//                                   {/* MANDATORY LATE STAMP */}
//                                   {log.is_late && (
//                                     <div className="flex items-center gap-1 px-2 py-0.5 bg-red-600 rounded text-[7px] font-black text-white uppercase tracking-tighter">
//                                         <AlertCircle size={8} /> LATE ARRIVAL
//                                     </div>
//                                   )}
//                               </div>
//                           </div>
//                           <Fingerprint size={16} className={log.is_late ? "text-red-500" : "text-emerald-500 opacity-20"} />
//                       </motion.div>
//                   ))}
//               </AnimatePresence>
//           </div>
//         </div>

//         {/* COLUMN 2: OFF-SITE PERSONNEL */}
//         <div className="lg:col-span-4 flex flex-col gap-4">
//             <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 border-l-2 border-slate-600">Inactive Intel</h2>
//             <div className="flex-1 bg-black/10 border border-white/5 rounded-[2rem] p-6 overflow-y-auto custom-scrollbar space-y-2">
//                 {allUsers.filter(u => !filteredLogs.some(l => l.user_id === u.id)).slice(0, 15).map((u, i) => (
//                     <div key={i} className="flex justify-between items-center p-3 border-b border-white/5 opacity-40">
//                         <span className="text-[10px] font-bold uppercase">{u.name}</span>
//                         <span className="text-[8px] font-bold text-slate-500 uppercase">Off-Site</span>
//                     </div>
//                 ))}
//             </div>
//         </div>

//         {/* COLUMN 3: RADIAL ANALYTICS */}
//         <div className="lg:col-span-4 space-y-6">
//             <div className="bg-white/5 border border-white/10 rounded-[3rem] p-8 h-[40vh] flex flex-col items-center justify-center relative">
//                 <div className="w-full h-full relative">
//                     <ResponsiveContainer width="100%" height="100%">
//                         <PieChart>
//                             <Pie
//                                 data={donutData} innerRadius={80} outerRadius={110}
//                                 paddingAngle={6} dataKey="value" stroke="none"
//                             >
//                                 {donutData.map((entry, index) => (
//                                     <Cell key={`cell-${index}`} fill={entry.color} />
//                                 ))}
//                             </Pie>
//                         </PieChart>
//                     </ResponsiveContainer>
//                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
//                         <p className="text-6xl font-black italic">{onDutyCount}</p>
//                         <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">On-Duty Units</p>
//                     </div>
//                 </div>
//             </div>

//             <div className="grid grid-cols-2 gap-4">
//                 <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
//                     <Users size={18} className="text-red-500 mb-2" />
//                     <p className="text-[8px] font-black text-slate-500 uppercase">Workforce</p>
//                     <p className="text-xl font-black">{employeesCount}</p>
//                 </div>
//                 <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
//                     <Activity size={18} className="text-red-500 mb-2" />
//                     <p className="text-[8px] font-black text-slate-500 uppercase">Sync Rate</p>
//                     <p className="text-xl font-black">ACTIVE</p>
//                 </div>
//             </div>
//         </div>

//       </div>

//       <style>{`
//         .animate-spin-slow { animation: spin 20s linear infinite; }
//         @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
//         .heartbeat-path {
//           stroke-dasharray: 1000;
//           stroke-dashoffset: 1000;
//           animation: beat 8s linear infinite;
//         }
//         @keyframes beat {
//           0% { stroke-dashoffset: 1000; }
//           15% { stroke-dashoffset: 0; }
//           100% { stroke-dashoffset: 0; opacity: 0; }
//         }

//         .custom-scrollbar::-webkit-scrollbar { width: 3px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #3a3f5a; border-radius: 10px; }
//       `}</style>
//     </div>
//   );
// };

// export default Dashboard;










// import React, { useState, useEffect, useMemo } from "react";
// import {
//   Users, TrendingUp, Activity, Fingerprint, Zap, Globe, Scan, 
//   Cpu, Lock, Radio, Download, Clock, LogOut, UserMinus, 
//   Building2, ChevronDown, Search, AlertCircle
// } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
// import api from "../api/axios";

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [isSyncing, setIsSyncing] = useState(false);
//   const [selectedDept, setSelectedDept] = useState("All Departments");
//   const [searchQuery, setSearchQuery] = useState("");

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 8000);
//     return () => clearInterval(interval);
//   }, []);

//   const fetchData = async () => {
//     setIsSyncing(true);
//     try {
//       const [users, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);
//       setAllUsers(users.data || []);
//       setEmployeesCount(users.data.length);
//       setLiveLogs(summary.data || []);
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { console.error("Sync Error", err); }
//     setTimeout(() => setIsSyncing(false), 800);
//   };

//   // Logic for Heartbeat & Search Filtering
//   const departments = useMemo(() => ["All Departments", ...new Set(allUsers.map(u => u.department).filter(Boolean))], [allUsers]);

//   const filteredLogs = useMemo(() => {
//     const today = new Date().toISOString().split('T')[0];
//     return liveLogs.filter(log => {
//       const matchesDept = selectedDept === "All Departments" || log.department === selectedDept;
//       const matchesSearch = log.name.toLowerCase().includes(searchQuery.toLowerCase());
//       return log.check_in?.startsWith(today) && matchesDept && matchesSearch;
//     });
//   }, [liveLogs, selectedDept, searchQuery]);

//   // Donut Chart Data
//   const donutData = [
//     { name: 'On Duty', value: onDutyCount, color: '#10b981' }, // Emerald-500
//     { name: 'Off Duty', value: Math.max(0, employeesCount - onDutyCount), color: '#ef4444' } // Red-500
//   ];

//   const downloadCSV = () => {
//     const headers = ["Employee", "Check-In", "Dept", "Status"];
//     const rows = filteredLogs.map(l => [l.name, l.check_in, l.department, l.is_late ? "LATE" : "OK"]);
//     const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
//     const link = document.createElement("a");
//     link.href = encodeURI(csvContent);
//     link.download = `AFAM_Pulse_${new Date().toLocaleDateString()}.csv`;
//     link.click();
//   };

//   return (
//     <div className="min-h-screen bg-[#1E2235] text-white p-6 font-mono overflow-hidden relative">
      
//       {/* 1. HEARTBEAT LINE (Every 10s via CSS Animation) */}
//       <div className="absolute top-[120px] left-0 w-full h-[2px] opacity-20 pointer-events-none overflow-hidden">
//         <svg width="100%" height="100" viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute -top-12">
//             <path 
//               d="M0,50 L400,50 L410,20 L420,80 L430,50 L1000,50" 
//               fill="none" stroke="#ef4444" strokeWidth="2" 
//               className="heartbeat-path"
//             />
//         </svg>
//       </div>

//       <header className="flex justify-between items-center border-b border-white/5 pb-6 mb-8 relative z-20">
//         <div className="flex items-center gap-6">
//           <div className="w-12 h-12 border-2 border-red-600 rounded-full flex items-center justify-center animate-spin-slow">
//               <Cpu className="text-red-500" size={18} />
//           </div>
//           <div>
//             <h1 className="text-2xl font-black tracking-widest uppercase italic text-red-600">AFAM GROUP</h1>
//             <p className="text-[8px] font-bold text-slate-400">OPERATIONAL PULSE: {isSyncing ? 'SYNCING' : 'STABLE'}</p>
//           </div>
//         </div>

//         <div className="flex items-center gap-4">
//             {/* 4. SEARCH BAR */}
//             <div className="relative group">
//                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-red-500 transition-colors" size={14} />
//                 <input 
//                     type="text" placeholder="SEARCH AGENT..." 
//                     value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
//                     className="bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-[10px] w-64 outline-none focus:border-red-600/50 transition-all"
//                 />
//             </div>

//             <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
//                 <Building2 size={14} className="text-red-500" />
//                 <select 
//                     value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}
//                     className="bg-transparent text-[10px] font-black uppercase outline-none cursor-pointer"
//                 >
//                     {departments.map(dept => <option key={dept} value={dept} className="bg-[#1E2235]">{dept}</option>)}
//                 </select>
//             </div>

//             <button onClick={downloadCSV} className="bg-red-600 hover:bg-red-700 px-5 py-2 rounded-xl flex items-center gap-2 transition-all">
//                 <Download size={14} /> <span className="text-[10px] font-black">CSV</span>
//             </button>
//         </div>
//       </header>

//       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
//         {/* COLUMN 1: LIVE FEED */}
//         <div className="lg:col-span-4 flex flex-col gap-4">
//           <h2 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
//             <Scan size={14} className="text-red-500" /> Live Stream
//           </h2>
//           <div className="flex-1 bg-black/20 border border-white/5 rounded-[2rem] p-4 overflow-y-auto h-[65vh] custom-scrollbar space-y-3">
//               <AnimatePresence>
//                   {filteredLogs.map((log, i) => (
//                       <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-white/5 rounded-2xl flex items-center justify-between group">
//                           <div>
//                               <p className="text-[11px] font-bold uppercase group-hover:text-red-500 transition-colors">{log.name}</p>
//                               <div className="flex gap-2 mt-1">
//                                   <span className="text-[8px] text-slate-500">{new Date(log.check_in).toLocaleTimeString()}</span>
//                                   {/* 2. LATE ARRIVAL BADGE */}
//                                   {log.is_late && (
//                                     <span className="text-[7px] bg-red-600/20 text-red-500 px-2 rounded-full font-black flex items-center gap-1 uppercase">
//                                         <AlertCircle size={8} /> Late
//                                     </span>
//                                   )}
//                               </div>
//                           </div>
//                           <Fingerprint size={14} className="text-emerald-500 opacity-20 group-hover:opacity-100" />
//                       </motion.div>
//                   ))}
//               </AnimatePresence>
//           </div>
//         </div>

//         {/* COLUMN 2: OFF-DUTY */}
//         <div className="lg:col-span-4 flex flex-col gap-4">
//             <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Off-Site Intel</h2>
//             <div className="flex-1 bg-black/10 border border-white/5 rounded-[2rem] p-6 overflow-y-auto h-[65vh] custom-scrollbar space-y-2">
//                 {allUsers.filter(u => !filteredLogs.some(l => l.user_id === u.id)).slice(0, 15).map((u, i) => (
//                     <div key={i} className="flex justify-between items-center p-3 border-b border-white/5 opacity-40">
//                         <span className="text-[10px] font-bold uppercase">{u.name}</span>
//                         <span className="text-[7px] bg-white/5 px-2 py-0.5 rounded uppercase">Inactive</span>
//                     </div>
//                 ))}
//             </div>
//         </div>

//         {/* COLUMN 3: RADIAL ANALYTICS */}
//         <div className="lg:col-span-4 space-y-6">
//             <div className="bg-white/5 border border-white/10 rounded-[3rem] p-8 h-[45vh] flex flex-col items-center justify-center relative">
//                 {/* 3. ROUND DYNAMIC GRAPH */}
//                 <div className="w-full h-full relative">
//                     <ResponsiveContainer width="100%" height="100%">
//                         <PieChart>
//                             <Pie
//                                 data={donutData} innerRadius={80} outerRadius={110}
//                                 paddingAngle={5} dataKey="value" stroke="none"
//                             >
//                                 {donutData.map((entry, index) => (
//                                     <Cell key={`cell-${index}`} fill={entry.color} />
//                                 ))}
//                             </Pie>
//                         </PieChart>
//                     </ResponsiveContainer>
//                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
//                         <p className="text-5xl font-black italic">{onDutyCount}</p>
//                         <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Active Units</p>
//                     </div>
//                 </div>
//                 <div className="flex gap-4 mt-4">
//                     <div className="flex items-center gap-2"><div className="w-2 h-2 bg-emerald-500 rounded-full"/> <span className="text-[8px] font-bold uppercase">On Duty</span></div>
//                     <div className="flex items-center gap-2"><div className="w-2 h-2 bg-red-500 rounded-full"/> <span className="text-[8px] font-bold uppercase">Off Duty</span></div>
//                 </div>
//             </div>

//             <div className="grid grid-cols-2 gap-4">
//                 <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
//                     <Users size={16} className="text-red-500 mb-2" />
//                     <p className="text-[8px] font-bold text-slate-500 uppercase">Total Workforce</p>
//                     <p className="text-xl font-black">{employeesCount}</p>
//                 </div>
//                 <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5">
//                     <Zap size={16} className="text-red-500 mb-2" />
//                     <p className="text-[8px] font-bold text-slate-500 uppercase">System Pulse</p>
//                     <p className="text-xl font-black">98%</p>
//                 </div>
//             </div>
//         </div>
//       </div>

//       <style>{`
//         .animate-spin-slow { animation: spin 15s linear infinite; }
//         @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
//         /* 1. Heartbeat Animation Logic */
//         .heartbeat-path {
//           stroke-dasharray: 1000;
//           stroke-dashoffset: 1000;
//           animation: beat 10s linear infinite;
//         }
//         @keyframes beat {
//           0% { stroke-dashoffset: 1000; }
//           10% { stroke-dashoffset: 0; }
//           100% { stroke-dashoffset: 0; opacity: 0; }
//         }

//         .custom-scrollbar::-webkit-scrollbar { width: 3px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #3a3f5a; border-radius: 10px; }
//       `}</style>
//     </div>
//   );
// };

// export default Dashboard;










// import React, { useState, useEffect, useMemo } from "react";
// import {
//   Users, TrendingUp, DollarSign, Activity, 
//   ShieldCheck, Fingerprint, Zap, Globe, Scan, 
//   Cpu, ArrowUpRight, Lock, Radio
// } from "lucide-react";
// import { motion, AnimatePresence } from "framer-motion";
// import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
// import api from "../api/axios";

// const Dashboard = () => {
//   const [employeesCount, setEmployeesCount] = useState(0);
//   const [onDutyCount, setOnDutyCount] = useState(0);
//   const [liveLogs, setLiveLogs] = useState([]);
//   const [payrollStats, setPayrollStats] = useState({ total_monthly_payout: 0 });
//   const [isSyncing, setIsSyncing] = useState(false);

//   const todaysLogs = useMemo(() => {
//     const today = new Date().toISOString().split('T')[0];
//     return liveLogs.filter(log => log.check_in.startsWith(today));
//   }, [liveLogs]);

//   useEffect(() => {
//     fetchData();
//     const interval = setInterval(fetchData, 8000);
//     return () => clearInterval(interval);
//   }, []);

//   const fetchData = async () => {
//     setIsSyncing(true);
//     try {
//       const [users, payroll, summary, stats] = await Promise.all([
//         api.get("/admin/users/"),
//         api.get("/admin/payroll/dashboard-stats"),
//         api.get("/admin/actions/attendance/summary"),
//         api.get("/admin/actions/attendance/stats")
//       ]);
//       setEmployeesCount(users.data.length);
//       setPayrollStats(payroll.data);
//       setLiveLogs(summary.data || []);
//       setOnDutyCount(stats.data.present_now || 0);
//     } catch (err) { console.error(err); }
//     setTimeout(() => setIsSyncing(false), 1000);
//   };

//   return (
//     <div className="min-h-screen bg-[#1E2235] text-white p-6 font-mono overflow-hidden relative">
      
//       {/* --- ELIMINATED SCANNER: REPLACED WITH ADAPTIVE GRADIENT GLOW --- */}
//       <div className="fixed inset-0 pointer-events-none">
//         <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_30%,_rgba(220,38,38,0.08)_0%,_transparent_50%)]" />
//         <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_80%_70%,_rgba(220,38,38,0.05)_0%,_transparent_50%)]" />
//       </div>

//       <div className="max-w-[1800px] mx-auto relative z-10 h-full flex flex-col gap-8">
        
//         {/* TOP STATUS BAR: HUD STYLE */}
//         <header className="flex justify-between items-center border-b border-white/5 pb-6">
//           <div className="flex items-center gap-6">
//             <div className="relative">
//                 <div className="w-12 h-12 border-2 border-red-600 rounded-full flex items-center justify-center animate-spin-slow">
//                     <div className="w-1 h-1 bg-green-600 rounded-full absolute top-0" />
//                 </div>
//                 <Cpu className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-500" size={18} />
//             </div>
//             <div>
//                 <h1 className="text-2xl font-black tracking-[0.2em] uppercase italic"><span className="text-red-600">AFAM Group</span></h1>
//                 <div className="flex items-center gap-2 mt-1">
//                     <span className={`h-1.5 w-1.5 rounded-full ${isSyncing ? 'bg-green-500 animate-ping' : 'bg-emerald-500'}`} />
//                     <p className="text-[8px] font-bold text-white uppercase tracking-widest">Neural Link: Stable</p>
//                 </div>
//             </div>
//           </div>

//           <div className="flex gap-8">
//             <div className="text-right">
//                 <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Total Liquidity</p>
//                 <p className="text-xl font-black text-white">SAR {payrollStats.total_monthly_payout?.toLocaleString()}</p>
//             </div>
//             <div className="h-10 w-[1px] bg-white/10" />
//             <div className="text-right">
//                 <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Time (AST)</p>
//                 <p className="text-xl font-black text-white">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
//             </div>
//           </div>
//         </header>

//         {/* MAIN LAYOUT: FOCUS ON TODAY'S LIVE FEED */}
//         <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
//           {/* SECTION 01: TODAY'S LIVE FEED (The "Interceptor") */}
//           <div className="lg:col-span-4 flex flex-col gap-4">
//             <div className="flex items-center justify-between px-2">
//                 <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-red-500 flex items-center gap-2">
//                     <Scan size={14} /> Live Auth Stream
//                 </h2>
//                 <span className="text-[9px] text-white">TODAY / 2026</span>
//             </div>

//             <div className="bg-[#1E2235] border border-white/10 rounded-[2rem] p-2 h-[75vh] relative overflow-hidden group">
//                 {/* Decorative Internal Borders */}
//                 <div className="absolute top-4 left-4 w-4 h-4 border-t border-l border-white/20" />
//                 <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-white/20" />
                
//                 <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-2">
//                     <AnimatePresence mode="popLayout">
//                         {todaysLogs.map((log, i) => (
//                             <motion.div
//                                 key={log.id || i}
//                                 initial={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
//                                 animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
//                                 exit={{ opacity: 0, scale: 0.9 }}
//                                 className="relative p-4 bg-white/[0.02] border border-transparent hover:border-red-600/30 hover:bg-red-600/5 rounded-2xl transition-all cursor-none overflow-hidden"
//                             >
//                                 <div className="flex justify-between items-center relative z-10">
//                                     <div className="flex items-center gap-4">
//                                         <div className="text-[10px] font-bold text-slate-700">0{i+1}</div>
//                                         <div>
//                                             <p className="text-[11px] font-black uppercase tracking-tighter">{log.name}</p>
//                                             <p className="text-[9px] text-slate-500 mt-0.5">{new Date(log.check_in).toLocaleTimeString()} • {log.shift}</p>
//                                         </div>
//                                     </div>
//                                     <Fingerprint size={14} className={log.is_manual ? 'text-amber-500' : 'text-emerald-500'} />
//                                 </div>
//                                 {/* Background "Glow Trace" */}
//                                 <motion.div 
//                                     className="absolute inset-0 bg-red-600/5 opacity-0 group-hover:opacity-100" 
//                                     initial={false}
//                                     whileHover={{ x: ['-100%', '100%'], transition: { duration: 1, repeat: Infinity } }}
//                                 />
//                             </motion.div>
//                         ))}
//                     </AnimatePresence>
//                 </div>
//             </div>
//           </div>

//           {/* SECTION 02: ANALYTICAL ORBIT */}
//           <div className="lg:col-span-8 space-y-8">
            
//             {/* LARGE ON-DUTY HEX-COUNTER */}
//             <motion.div 
//                 className="bg-white/[0.02] border border-white/10 rounded-[3rem] p-12 relative overflow-hidden group shadow-2xl"
//                 whileHover={{ borderColor: 'rgba(220,38,38,0.3)' }}
//             >
//                 <div className="relative z-10 flex flex-col md:flex-row justify-between items-center">
//                     <div>
//                         <div className="flex items-center gap-2 mb-4">
//                             <Radio size={14} className="text-red-500 animate-pulse" />
//                             <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Current Occupancy</p>
//                         </div>
//                         <h3 className="text-[10rem] font-black tracking-tighter leading-none italic text-white flex items-start">
//                             {onDutyCount}
//                             <div className="mt-8 ml-4">
//                                 <p className="text-xs uppercase font-bold text-red-600 tracking-widest">Units</p>
//                                 <p className="text-[10px] uppercase font-medium text-slate-500 tracking-tighter">Verified Active</p>
//                             </div>
//                         </h3>
//                     </div>
                    
//                     <div className="w-full md:w-[300px] h-[150px] opacity-20">
//                         <ResponsiveContainer width="100%" height="100%">
//                             <AreaChart data={[{v:0}, {v:onDutyCount*0.4}, {v:onDutyCount}]}>
//                                 <Area type="step" dataKey="v" stroke="#ef4444" strokeWidth={4} fill="transparent" />
//                             </AreaChart>
//                         </ResponsiveContainer>
//                     </div>
//                 </div>
//                 {/* Visual Depth Circles */}
//                 <div className="absolute -top-24 -right-24 w-96 h-96 border border-white/5 rounded-full" />
//                 <div className="absolute -bottom-12 -right-12 w-48 h-48 border border-red-600/10 rounded-full animate-pulse" />
//             </motion.div>

//             {/* LOWER GRID: STATS & CHARTS */}
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
//                 {/* MINI CHART */}
//                 <div className="bg-[#1E2235] border border-white/10 rounded-[2.5rem] p-8">
//                     <div className="flex justify-between items-center mb-6">
//                         <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Personnel Growth</p>
//                         <div className="flex items-center gap-2 text-emerald-500 font-bold text-[10px]">
//                             <TrendingUp size={12} /> +14.2%
//                         </div>
//                     </div>
//                     <div className="h-[150px]">
//                         <ResponsiveContainer width="100%" height="100%">
//                             <AreaChart data={[{m: "W1", v: 10}, {m: "W2", v: 35}, {m: "W3", v: 25}, {m: "W4", v: employeesCount}]}>
//                                 <defs>
//                                     <linearGradient id="obsidianGlow" x1="0" y1="0" x2="0" y2="1">
//                                         <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4}/>
//                                         <stop offset="100%" stopColor="#ef4444" stopOpacity={0}/>
//                                     </linearGradient>
//                                 </defs>
//                                 <Area type="monotone" dataKey="v" stroke="#ef4444" strokeWidth={3} fill="url(#obsidianGlow)" />
//                             </AreaChart>
//                         </ResponsiveContainer>
//                     </div>
//                 </div>

//                 {/* SYSTEM GRID */}
//                 <div className="grid grid-cols-2 gap-4">
//                     {[
//                         { label: 'Total Workforce', val: employeesCount, icon: Users },
//                         { label: 'Security Protocols', val: 'Active', icon: Lock },
//                         { label: 'Global Nodes', val: 'Riyadh', icon: Globe },
//                         { label: 'Live Pulse', val: '98Hz', icon: Zap }
//                     ].map((item, i) => (
//                         <div key={i} className="bg-white/[0.03] border border-white/5 p-6 rounded-3xl hover:bg-white/[0.06] transition-all">
//                              <item.icon size={16} className="text-red-600 mb-4" />
//                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{item.label}</p>
//                              <p className="text-lg font-bold text-white tracking-tighter">{item.val}</p>
//                         </div>
//                     ))}
//                 </div>

//             </div>
//           </div>
//         </div>
//       </div>

//       <style>{`
//         .animate-spin-slow { animation: spin 15s linear infinite; }
//         @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
//         .custom-scrollbar::-webkit-scrollbar { width: 4px; }
//         .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
//         .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
//         .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #ef4444; }
//       `}</style>
//     </div>
//   );
// };

// export default Dashboard;