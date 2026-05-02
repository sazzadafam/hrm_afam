import React, { useState, useEffect, useMemo, useCallback } from "react";
import {Fingerprint, Search, Activity, Clock, AlertTriangle, LogOut, Download, Filter, Ghost, TrendingUp, LogIn, Coffee, Users,
  CheckCircle2, XCircle, Timer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import api from "../api/axios";



const sanitizeLogs = (logs) => {
  const uniqueMap = new Map();
  logs.forEach((log) => {
    const id = log.user_id || log.employee_id || log.id;
    let dateKey = new Date().toDateString();
    if (log.check_in) dateKey = new Date(log.check_in).toDateString();
    else if (log.date) dateKey = new Date(log.date).toDateString();
    const key = `${id}-${dateKey}`;

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, log);
    } else {
      const existing = uniqueMap.get(key);
      const existingIsAbsent = existing.status?.toLowerCase() === "absent";
      const newIsAbsent = log.status?.toLowerCase() === "absent";
      if (existingIsAbsent && !newIsAbsent) uniqueMap.set(key, log);
      else if (!existing.check_in && log.check_in) uniqueMap.set(key, log);
    }
  });
  return Array.from(uniqueMap.values());
};

const getStatusMetrics = (log) => {
  const statusLower = log.status?.toLowerCase();
  if (statusLower === "absent")
    return { label: "ABSENT", isLate: false, isAbsent: true, isOnBreak: false, isCompleted: false };
  if (statusLower === "on_break")
    return { label: "ON BREAK", isLate: false, isAbsent: false, isOnBreak: true, isCompleted: false };
  if (statusLower === "completed")
    return { label: "COMPLETED", isLate: false, isAbsent: false, isOnBreak: false, isCompleted: true };

  if (!log.check_in || !log.shift_start)
    return { label: "ON TIME", isLate: false, isAbsent: false, isOnBreak: false, isCompleted: false };

  const checkInTime = new Date(log.check_in);
  const [sH, sM] = log.shift_start.split(":").map(Number);
  const shiftStart = new Date(checkInTime);
  shiftStart.setHours(sH, sM, 0, 0);
  const isLate = (checkInTime - shiftStart) / 60000 > 10;
  return { label: isLate ? "LATE" : "ON TIME", isLate, isAbsent: false, isOnBreak: false, isCompleted: false };
};

const buildCardKey = (log) => {
  const id = log.user_id || log.employee_id || log.id;
  const dateKey = new Date(log.check_in || log.date || Date.now()).toDateString();
  return `${id}-${dateKey}`;
};

const fmtTime = (isoStr) =>
  isoStr
    ? new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--:--";

const shiftProgress = (log) => {
  if (!log.check_in || !log.shift_start || !log.shift_end) return null;
  const now = Date.now();
  const base = new Date(log.check_in);
  const [sh, sm] = log.shift_start.split(":").map(Number);
  const [eh, em] = log.shift_end.split(":").map(Number);
  const start = new Date(base).setHours(sh, sm, 0, 0);
  let end = new Date(base).setHours(eh, em, 0, 0);
  if (end <= start) end += 86400000; // overnight shift
  const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  return Math.round(pct);
};

const exportCSV = (logs, todayStr) => {
  if (!logs.length) return;
  const headers = ["Name", "Employee ID", "Department", "Check In", "Check Out", "Hours Worked", "Status"];
  const rows = logs.map((l) => [
    l.employee_id || l.user_id || "",
    l.name || "",
    l.department || "",
    l.check_in ? new Date(l.check_in).toLocaleString() : "",
    l.check_out ? new Date(l.check_out).toLocaleString() : "",
    l.hours_worked ?? "",
    l._metrics?.label || "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `attendance-${todayStr}.csv`;
  a.click();
};




const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className={`bg-slate-900/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between
    hover:bg-slate-900/60 transition-colors group cursor-default`}>
    <div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-400 transition-colors">
        {label}
      </p>
      <p className={`text-2xl font-black drop-shadow-sm ${color}`}>{value}</p>
    </div>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors
      ${color.replace("text-", "bg-").replace(/\d+$/, "500/10")} group-hover:${color.replace("text-", "bg-").replace(/\d+$/, "500/20")}`}>
      <Icon size={20} className={color} />
    </div>
  </div>
);

const StatusBadge = ({ metrics }) => {
  if (metrics.isAbsent)
    return <span className="text-[9px] bg-red-700 text-white px-2 py-0.5 rounded font-black italic shadow-sm">ABSENT</span>;
  if (metrics.isOnBreak)
    return <span className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded font-black italic shadow-sm">ON BREAK</span>;
  if (metrics.isLate)
    return <span className="text-[9px] bg-amber-600 text-white px-2 py-0.5 rounded font-black italic shadow-sm">LATE</span>;
  if (metrics.isCompleted)
    return <span className="text-[9px] bg-slate-600 text-white px-2 py-0.5 rounded font-black italic shadow-sm">DONE</span>;
  return <span className="text-[9px] bg-emerald-700 text-white px-2 py-0.5 rounded font-black italic shadow-sm">ON TIME</span>;
};

const AttendanceCard = ({ log }) => {
  const metrics = log._metrics;
  const progress = shiftProgress(log);

  const cardStyle = metrics.isAbsent
    ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10"
    : metrics.isOnBreak
    ? "bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10"
    : metrics.isLate
    ? "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10"
    : metrics.isCompleted
    ? "bg-slate-800/20 border-white/5 hover:bg-slate-800/40"
    : "bg-slate-800/40 border-white/5 hover:bg-slate-800/60";

  const iconEl = metrics.isAbsent ? (
    <XCircle size={16} className="text-red-500" />
  ) : metrics.isOnBreak ? (
    <Coffee size={16} className="text-blue-400" />
  ) : metrics.isCompleted ? (
    <CheckCircle2 size={16} className="text-slate-500" />
  ) : (
    <Fingerprint size={16} className="text-emerald-500" />
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`p-4 rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-lg ${cardStyle}`}
    >
      {/* Top row */}
      <div className="flex justify-between items-start">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-[10px] font-black text-emerald-500/80 mb-0.5">
            #{log.employee_id || log.user_id}
          </p>
          <p className="text-sm font-bold text-pink-50 truncate">{log.name}</p>
          <p className="text-[10px] font-medium text-sky-500 uppercase">
            {log.department || "General"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {iconEl}
          {/* Hours worked pill */}
          <div className="flex items-center gap-1 bg-black/20 border border-white/5 px-2 py-0.5 rounded text-[10px] font-mono text-slate-300">
            <Timer size={10} className="text-White" />
            {log.hours_worked != null ? `${log.hours_worked}h` : "--"}
            {log.duty_hour ? ` / ${log.duty_hour}h` : ""}
          </div>
        </div>
      </div>

      {/* Shift progress bar */}
      {progress !== null && !metrics.isAbsent && (
        <div className="mt-3">
          <div className="flex justify-between text-[9px] text-slate-250 mb-1">
            <span>{log.shift_start}</span>
            <span>{progress}%</span>
            <span>{log.shift_end}</span>
          </div>
          <div className="w-full h-1 bg-white rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                metrics.isCompleted ? "bg-slate-500" :
                metrics.isOnBreak ? "bg-blue-500" : "bg-emerald-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom row */}
      <div className="mt-3 flex flex-wrap gap-3 items-center justify-between border-t border-white/5 pt-3">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <LogIn size={12} className={metrics.isAbsent ? "text-slate-600" : "text-emerald-500"} />
            <span className={`text-[10px] font-bold ${metrics.isAbsent ? "text-slate-600" : "text-slate-300"}`}>
              {fmtTime(log.check_in)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <LogOut size={12} className={metrics.isAbsent ? "text-slate-600" : "text-red-400"} />
            <span className={`text-[10px] font-bold ${metrics.isAbsent ? "text-slate-600" : "text-slate-300"}`}>
              {fmtTime(log.check_out)}
            </span>
          </div>
        </div>
        <StatusBadge metrics={metrics} />
      </div>
    </motion.div>
  );
};



const Dashboard = () => {
  const [employeesCount, setEmployeesCount] = useState(0);
  const [onDutyCount, setOnDutyCount]       = useState(0);
  const [liveLogs, setLiveLogs]             = useState([]);
  const [allUsers, setAllUsers]             = useState([]);
  const [searchQuery, setSearchQuery]       = useState("");
  const [selectedDept, setSelectedDept]     = useState("All Departments");
  const [filterStatus, setFilterStatus]     = useState("all"); 
  const [currentTime, setCurrentTime]       = useState(new Date());
  const [isLoading, setIsLoading]           = useState(true);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);



  useEffect(() => {
    api.post("/attendance/mark-absents").catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [users, summary, stats] = await Promise.all([
        api.get("/admin/users/"),
        api.get("/admin/actions/attendance/summary"),
        api.get("/admin/actions/attendance/stats"),
      ]);
      const userData = users.data?.users || users.data || [];
      setAllUsers(userData);
      setEmployeesCount(Array.isArray(userData) ? userData.length : 0);
      setLiveLogs(sanitizeLogs(summary.data || []));
      setOnDutyCount(stats.data?.present_now || 0);
    } catch (err) {
      console.error("Sync Error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);


  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const departments = useMemo(
    () => [...new Set(allUsers.map((u) => u.department).filter(Boolean))],
    [allUsers]
  );

  const todayLogs = useMemo(
    () =>
      liveLogs
        .filter((log) => {
          const d = log.check_in || log.date;
          return d?.startsWith(todayStr);
        })
        .map((log) => ({ ...log, _metrics: getStatusMetrics(log) })),
    [liveLogs, todayStr]
  );

  const filteredLiveLogs = useMemo(() => {
    return todayLogs.filter((log) => {
      const m = log._metrics;
      const matchesDept =
        selectedDept === "All Departments" ||
        (log.department || "").toLowerCase().trim() === selectedDept.toLowerCase().trim();
      const matchesSearch = (log.name || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "absent"    && m.isAbsent)    ||
        (filterStatus === "late"      && m.isLate)      ||
        (filterStatus === "on_break"  && m.isOnBreak)   ||
        (filterStatus === "completed" && m.isCompleted);
      return matchesDept && matchesSearch && matchesStatus;
    });
  }, [todayLogs, searchQuery, selectedDept, filterStatus]);

  const lateCount      = useMemo(() => todayLogs.filter((l) => l._metrics.isLate).length,      [todayLogs]);
  const absentCount    = useMemo(() => todayLogs.filter((l) => l._metrics.isAbsent).length,    [todayLogs]);
  const onBreakCount   = useMemo(() => todayLogs.filter((l) => l._metrics.isOnBreak).length,   [todayLogs]);
  const completedCount = useMemo(() => todayLogs.filter((l) => l._metrics.isCompleted).length, [todayLogs]);

  const pieData = useMemo(() => [
    { name: "On Duty",    value: onDutyCount },
    { name: "On Break",   value: onBreakCount },
    { name: "Absent",     value: absentCount },
    { name: "Off Shift",  value: Math.max(0, employeesCount - onDutyCount - onBreakCount - absentCount) },
  ], [onDutyCount, onBreakCount, absentCount, employeesCount]);

  const PIE_COLORS = ["#10b981", "#3b82f6", "#dc2626", "#334155"];

  const filterButtons = [
    { key: "absent",    label: "Absent",    color: "bg-red-700",   icon: Ghost },
    { key: "late",      label: "Late",      color: "bg-amber-600", icon: AlertTriangle },
    { key: "on_break",  label: "On Break",  color: "bg-blue-600",  icon: Coffee },
    { key: "completed", label: "Completed", color: "bg-slate-600", icon: CheckCircle2 },
  ];


  return (
    <section className="space-y-6 animate-in fade-in duration-700">

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-white italic tracking-tight uppercase">
            Control Center
          </h1>
          <p className="text-slate-500 text-xs uppercase tracking-widest mt-1 flex items-center gap-2">
            <Activity size={12} className="text-emerald-500" />
            Live Attendance Monitoring
          </p>
        </div>

        <div className="flex flex-wrap gap-3 w-full lg:w-auto items-center">

          {/* Status filter pills */}
          <div className="bg-slate-900/50 p-1 rounded-xl border border-white/5 flex flex-wrap gap-1">
            <button
              onClick={() => setFilterStatus("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                filterStatus === "all"
                  ? "bg-white/10 text-white shadow"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              <Users size={12} /> All
            </button>
            {filterButtons.map(({ key, label, color, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(filterStatus === key ? "all" : key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                  filterStatus === key
                    ? `${color} text-white shadow-lg`
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }`}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          {/* Dept filter */}
          <div className="relative group">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-slate-900/60 border border-slate-800 text-sm text-white pl-10 pr-8 py-2.5 rounded-xl outline-none appearance-none cursor-pointer focus:border-slate-600 transition-colors"
            >
              <option value="All Departments">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative flex-grow md:flex-grow-0 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-slate-300 transition-colors" />
            <input
              type="text"
              placeholder="Search Personnel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900/60 border border-slate-800 text-sm text-white pl-10 pr-4 py-2.5 rounded-xl outline-none w-full md:w-48 placeholder:text-slate-600 focus:border-slate-600 transition-colors"
            />
          </div>

          {/* Export CSV */}
          <button
            onClick={() => exportCSV(filteredLiveLogs, todayStr)}
            title="Export filtered data as CSV"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-bold uppercase text-slate-200 hover:text-white hover:border-slate-600 transition-all"
          >
            <Download size={14} /> Today's Attendance
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT: Live Activity Stream */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden shadow-2xl h-[70vh] flex flex-col">

            {/* Stream header */}
            <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5 shrink-0">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Live Activity Stream
                <span className="text-slate-600 ml-1">({filteredLiveLogs.length})</span>
              </span>
              <span className="text-xs font-bold text-slate-400 font-mono flex items-center gap-1.5">
                <Clock size={12} /> {currentTime.toLocaleTimeString()}
              </span>
            </div>

            {/* Cards */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-grow">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600">
                  <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-3" />
                  <p className="text-xs uppercase tracking-widest font-bold">Loading...</p>
                </div>
              ) : filteredLiveLogs.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-slate-600"
                >
                  <Ghost size={32} className="mb-3 opacity-20" />
                  <p className="text-xs uppercase tracking-widest font-bold">No Records Found</p>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AnimatePresence mode="popLayout">
                    {filteredLiveLogs.map((log) => (
                      <AttendanceCard key={buildCardKey(log)} log={log} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Analytics */}
        <div className="lg:col-span-4 space-y-4">

          {/* Pie Chart */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 p-6 flex flex-col items-center justify-center shadow-xl hover:bg-slate-900/50 transition-colors">
            <div className="w-full relative" style={{ height: "220px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    innerRadius="75%"
                    outerRadius="95%"
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                    }}
                    itemStyle={{ color: "#fff", fontSize: "12px", fontWeight: "bold" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">On Duty</p>
                <h2 className="text-5xl font-black italic text-white tracking-tighter drop-shadow-md">
                  {onDutyCount}
                </h2>
                <p className="text-xs font-bold text-slate-400">of {employeesCount} total</p>
              </div>
            </div>

            {/* Pie legend */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 w-full px-2">
              {pieData.map((entry, i) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i] }} />
                  <span className="text-[10px] text-slate-400 font-medium">{entry.name}</span>
                  <span className="text-[10px] text-slate-300 font-black ml-auto">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-3">
            <StatCard label="Late Arrivals"   value={lateCount}      icon={AlertTriangle} color="text-amber-500" />
            <StatCard label="Absent Today"    value={absentCount}    icon={Ghost}         color="text-red-500"   />
            <StatCard label="On Break"        value={onBreakCount}   icon={Coffee}        color="text-blue-400"  />
            <StatCard label="Shift Completed" value={completedCount} icon={CheckCircle2}  color="text-slate-400" />
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </section>
  );
};

export default Dashboard;