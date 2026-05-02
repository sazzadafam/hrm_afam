import React, { useState, useEffect, useCallback, useMemo } from "react";
import api from "../api/axios";
import {
  Calendar, Send, User, Bell, Clock, LogOut,
  FileText, CheckCircle2, XCircle, AlertCircle,
  Fingerprint, Timer, MapPin, Megaphone, PartyPopper,
  ChevronLeft, ChevronRight, TrendingUp
} from "lucide-react";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const parseUTC = (str) => {
  if (!str) return null;
  const iso = /[Zz]|[+-]\d{2}:\d{2}$/.test(str) ? str : str + "Z";
  return new Date(iso);
};

const getAttStatus = (log) => {
  if (!log) return { label: "Absent", color: "bg-rose-100 text-rose-700" };
  const s = log.status?.toLowerCase();
  if (s === "absent")   return { label: "Absent",   color: "bg-rose-100 text-rose-700" };
  if (s === "on_break") return { label: "On Break",  color: "bg-blue-100 text-blue-700" };
  if (s === "ongoing")  return { label: "On Duty",   color: "bg-emerald-100 text-emerald-700" };
  if (s === "completed") {
    if (log.hours_worked >= (log.duty_hour || 12)) return { label: "Present",  color: "bg-emerald-100 text-emerald-700" };
    return { label: "Short Day", color: "bg-amber-100 text-amber-700" };
  }
  return { label: "Present", color: "bg-emerald-100 text-emerald-700" };
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const LEAVE_STATUS_STYLE = {
  pending:  "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
};

const getEventTheme = (ev) => {
  if (ev.is_holiday || ev.type === "holiday")
    return { icon: <PartyPopper size={18} />, bg: "bg-rose-50", text: "text-rose-600", border: "border-rose-200", label: "Holiday" };
  if (ev.type === "announcement")
    return { icon: <Megaphone size={18} />, bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200", label: "Announcement" };
  return { icon: <Calendar size={18} />, bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200", label: "Event" };
};


// ---------------------------------------------------------------------------
// TabButton
// ---------------------------------------------------------------------------

const TabButton = ({ icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-200 group ${
      active
        ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    }`}
  >
    <div className="flex items-center gap-3">
      {icon}
      <span className="font-semibold text-sm">{label}</span>
    </div>
    {badge > 0 && (
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
        active ? "bg-white/20 text-white" : "bg-slate-700 text-slate-300"
      }`}>
        {badge}
      </span>
    )}
  </button>
);


// ---------------------------------------------------------------------------
// AttendanceView — real data, working month filter, summary strip
// ---------------------------------------------------------------------------

const AttendanceView = ({ employeeId }) => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year,  setYear]  = useState(now.getFullYear());
  const [logs,  setLogs]  = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/attendance/all");
      const all = res.data || [];
      // Filter to this employee + selected month/year
      const filtered = all.filter((log) => {
        const d = parseUTC(log.check_in || log.date);
        return (
          d &&
          d.getUTCMonth()     === month &&
          d.getUTCFullYear()  === year  &&
          (log.employee_id === employeeId || !employeeId)
        );
      });
      setLogs(filtered);
    } catch (err) {
      console.error("Attendance fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [month, year, employeeId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();

  const summary = useMemo(() => {
    let present = 0, absent = 0, late = 0, totalHours = 0;
    logs.forEach((log) => {
      const s = getAttStatus(log);
      if (s.label === "Absent") { absent++; return; }
      present++;
      totalHours += log.hours_worked || 0;
      if (log.shift_start && log.check_in) {
        const [sh, sm] = log.shift_start.split(":").map(Number);
        const shiftStart = parseUTC(log.check_in);
        shiftStart.setUTCHours(sh, sm, 0, 0);
        if ((parseUTC(log.check_in) - shiftStart) / 60000 > 15) late++;
      }
    });
    return { present, absent, late, totalHours: totalHours.toFixed(1) };
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* Month Navigator */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Monthly Log</h2>
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-1.5">
          <button onClick={prevMonth} className="p-1.5 rounded-xl hover:bg-white hover:shadow-sm transition text-slate-500">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-slate-700 w-36 text-center">
            {MONTHS[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-xl hover:bg-white hover:shadow-sm transition text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Present",      value: summary.present,      color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Absent",       value: summary.absent,       color: "text-rose-600",    bg: "bg-rose-50" },
          { label: "Late Arrivals",value: summary.late,         color: "text-amber-600",   bg: "bg-amber-50" },
          { label: "Total Hours",  value: `${summary.totalHours}h`, color: "text-blue-600",bg: "bg-blue-50" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 text-center`}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Fingerprint size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No records for {MONTHS[month]} {year}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-slate-400 text-xs uppercase tracking-widest border-b border-slate-100">
                <th className="pb-4 pr-6">Date</th>
                <th className="pb-4 pr-6">Clock In</th>
                <th className="pb-4 pr-6">Clock Out</th>
                <th className="pb-4 pr-6">Hours</th>
                <th className="pb-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((log) => {
                const st = getAttStatus(log);
                const d  = parseUTC(log.check_in || log.date);
                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="py-4 pr-6 font-medium text-slate-700 text-sm">
                      {d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                    </td>
                    <td className="py-4 pr-6 text-slate-600 font-mono text-sm">
                      {st.label === "Absent" ? "—" : fmtTime(log.check_in)}
                    </td>
                    <td className="py-4 pr-6 text-slate-600 font-mono text-sm">
                      {st.label === "Absent" ? "—" : fmtTime(log.check_out)}
                    </td>
                    <td className="py-4 pr-6 text-slate-600 font-mono text-sm">
                      {st.label === "Absent" ? "—" : `${log.hours_worked || 0}h`}
                    </td>
                    <td className="py-4">
                      <span className={`${st.color} px-3 py-1 rounded-full text-xs font-bold`}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};


// ---------------------------------------------------------------------------
// LeaveRequestForm — with end_date, validation, history, no alert()
// ---------------------------------------------------------------------------

const LeaveRequestForm = () => {
  const [formData, setFormData] = useState({
    leave_type: "Casual", start_date: "", end_date: "", reason: "",
  });
  const [file,       setFile]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState(false);
  const [history,    setHistory]    = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get("/employee/leave/history");
      setHistory(res.data || []);
    } catch {
      // Leave history is non-critical — fail silently
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const set = (field) => (e) =>
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async () => {
    setError("");
    if (!formData.start_date) { setError("Start date is required."); return; }
    if (!formData.end_date)   { setError("End date is required."); return; }
    if (formData.end_date < formData.start_date) {
      setError("End date cannot be before start date."); return;
    }
    if (!formData.reason.trim()) { setError("Please provide a reason."); return; }
    if (formData.leave_type === "Medical" && !file) {
      setError("Medical report is required for medical leave."); return;
    }

    setSubmitting(true);
    const data = new FormData();
    Object.keys(formData).forEach((k) => data.append(k, formData[k]));
    if (file) data.append("medical_report", file);

    try {
      await api.post("/employee/leave/request", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSuccess(true);
      setFormData({ leave_type: "Casual", start_date: "", end_date: "", reason: "" });
      setFile(null);
      fetchHistory();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err?.response?.data?.detail || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-10 max-w-2xl">
      {/* Form */}
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-slate-800">New Leave Request</h2>

        {error && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-2xl px-4 py-3">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-2xl px-4 py-3">
            <CheckCircle2 size={16} className="shrink-0" /> Request submitted successfully!
          </div>
        )}

        <div className="grid grid-cols-2 gap-5">
          {/* Leave type */}
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Leave Type</label>
            <select
              value={formData.leave_type}
              onChange={set("leave_type")}
              className="w-full border border-slate-200 rounded-2xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-sm font-medium text-slate-700"
            >
              <option value="Casual">Casual</option>
              <option value="Sick">Sick</option>
              <option value="Medical">Medical</option>
              <option value="Emergency">Emergency</option>
              <option value="Annual">Annual</option>
            </select>
          </div>

          {/* Start date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Start Date</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={set("start_date")}
              min={new Date().toISOString().split("T")[0]}
              className="w-full border border-slate-200 rounded-2xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-sm text-slate-700"
            />
          </div>

          {/* End date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">End Date</label>
            <input
              type="date"
              value={formData.end_date}
              onChange={set("end_date")}
              min={formData.start_date || new Date().toISOString().split("T")[0]}
              className="w-full border border-slate-200 rounded-2xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-sm text-slate-700"
            />
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Reason</label>
          <textarea
            rows={4}
            value={formData.reason}
            onChange={set("reason")}
            placeholder="Briefly describe the reason for your leave..."
            className="w-full border border-slate-200 rounded-2xl p-3.5 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50 text-sm text-slate-700 resize-none placeholder:text-slate-400"
          />
        </div>

        {/* Medical report upload */}
        {formData.leave_type === "Medical" && (
          <div className="p-5 border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50/50">
            <label className="flex items-center gap-2 text-blue-700 font-bold text-sm mb-3">
              <FileText size={16} /> Medical Report <span className="text-rose-500">*</span>
            </label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files[0])}
              className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
            />
            {file && (
              <p className="text-xs text-blue-600 font-medium mt-2 flex items-center gap-1">
                <CheckCircle2 size={12} /> {file.name}
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </div>

      {/* Leave History */}
      <div>
        <h3 className="text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
          <FileText size={16} className="text-slate-400" /> Request History
        </h3>
        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No leave requests yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition"
              >
                <div>
                  <p className="text-sm font-bold text-slate-700">{req.leave_type} Leave</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtDate(req.start_date)} → {fmtDate(req.end_date)}
                  </p>
                  {req.reason && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">{req.reason}</p>
                  )}
                </div>
                <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
                  LEAVE_STATUS_STYLE[req.status?.toLowerCase()] || LEAVE_STATUS_STYLE.pending
                }`}>
                  {req.status || "Pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// EventsView — real data from API
// ---------------------------------------------------------------------------

const EventsView = () => {
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/events/")
      .then((res) => setEvents(res.data || []))
      .catch((err) => console.error("Events fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  // Only show upcoming + ongoing events for employees
  const visible = useMemo(() => {
    const now = Date.now();
    return events.filter((ev) => {
      const start = ev.start_date ? new Date(
        /[Zz]|[+-]\d{2}:\d{2}$/.test(ev.start_date) ? ev.start_date : ev.start_date + "Z"
      ).getTime() : 0;
      const end = ev.end_date ? new Date(
        /[Zz]|[+-]\d{2}:\d{2}$/.test(ev.end_date) ? ev.end_date : ev.end_date + "Z"
      ).getTime() : null;
      if (end) return now <= end;
      // No end date — show for the rest of start day
      return now <= start + 86400000;
    }).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  }, [events]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="py-20 text-center text-slate-400">
        <Calendar size={36} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">No upcoming events</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800">Upcoming Events</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {visible.map((ev) => {
          const theme = getEventTheme(ev);
          return (
            <div
              key={ev.id}
              className={`p-5 rounded-2xl border-2 ${theme.border} bg-white hover:shadow-md transition group`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className={`p-2.5 ${theme.bg} rounded-xl ${theme.text} group-hover:scale-110 transition-transform`}>
                  {theme.icon}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${theme.bg} ${theme.text}`}>
                  {theme.label}
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1 leading-snug">{ev.title}</h4>
              {ev.description && (
                <p className="text-slate-500 text-sm leading-relaxed line-clamp-2 mb-3">{ev.description}</p>
              )}
              <div className="space-y-1.5 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                  <Clock size={11} className={theme.text} />
                  {ev.start_date
                    ? parseUTC(ev.start_date)?.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                    : "—"}
                </div>
                {ev.location && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <MapPin size={11} className="text-rose-500" /> {ev.location}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// ProfileView — uses role.name, real join date
// ---------------------------------------------------------------------------

const ProfileView = ({ user }) => {
  const initial = (user.full_name || user.name || "U").charAt(0).toUpperCase();
  const roleName = user.role?.name || user.role || "Employee";

  const fields = [
    { label: "Email Address",  value: user.email },
    { label: "Employee ID",    value: user.employee_id || user.id || "N/A" },
    { label: "Department",     value: user.department || "—" },
    { label: "Shift",          value: user.shift_start && user.shift_end ? `${user.shift_start} – ${user.shift_end}` : "—" },
    { label: "Join Date",      value: user.created_at ? fmtDate(user.created_at) : "—" },
    { label: "Role",           value: roleName },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
      {/* Avatar card */}
      <div className="md:col-span-1 bg-gradient-to-b from-slate-50 to-white rounded-3xl p-8 flex flex-col items-center text-center border border-slate-100">
        <div className="w-28 h-28 bg-blue-600 rounded-full flex items-center justify-center text-4xl text-white font-black mb-4 shadow-lg shadow-blue-200">
          {initial}
        </div>
        <h3 className="text-xl font-bold text-slate-800">{user.full_name || user.name}</h3>
        <p className="text-blue-500 font-semibold text-sm mt-1">{roleName}</p>
        {user.department && (
          <span className="mt-3 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-widest">
            {user.department}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="md:col-span-2">
        <h3 className="text-base font-bold text-slate-700 mb-6 uppercase tracking-widest">
            Personal Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {fields.map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
              <p className="text-slate-800 font-semibold text-sm">{value || "—"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// Main EmployeeDash
// ---------------------------------------------------------------------------

const EmployeeDash = () => {
  const [activeTab, setActiveTab] = useState("attendance");
  const [user,      setUser]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  useEffect(() => {
    api.get("/employee/me")
      .then((res) => setUser(res.data))
      .catch(() => setError("Failed to load profile. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    window.location.href = "/login";
  };

  const displayName = user?.full_name || user?.name || "Employee";
  const initial     = displayName.charAt(0).toUpperCase();
  const roleName    = user?.role?.name || user?.role || "Employee";

  return (
    <div className="flex h-screen bg-slate-50 font-sans">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-2xl shrink-0">
        {/* Logo */}
        <div className="p-6 border-b border-slate-800">
          <p className="text-xl font-black tracking-tight">
            AFAM <span className="text-blue-500">HRM</span>
          </p>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Employee Portal</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          <TabButton icon={<Clock size={18}/>}    label="Attendance"    active={activeTab === "attendance"} onClick={() => setActiveTab("attendance")} />
          <TabButton icon={<Send size={18}/>}     label="Leave Request" active={activeTab === "leave"}      onClick={() => setActiveTab("leave")} />
          <TabButton icon={<Bell size={18}/>}     label="Events"        active={activeTab === "events"}     onClick={() => setActiveTab("events")} />
          <TabButton icon={<User size={18}/>}     label="My Profile"    active={activeTab === "profile"}    onClick={() => setActiveTab("profile")} />
        </nav>

        {/* User pill + Sign out */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          {user && (
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{displayName}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{roleName}</p>
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 transition text-sm font-medium"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 py-5 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 capitalize tracking-tight">
              {activeTab === "leave" ? "Leave Request" : activeTab}
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Welcome back, <span className="font-bold text-slate-600">{displayName}</span>
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl px-4 py-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}
        </header>

        {/* Content */}
        <div className="p-8">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100 min-h-[600px]">
              {activeTab === "attendance" && <AttendanceView employeeId={user?.employee_id || user?.id} />}
              {activeTab === "leave"      && <LeaveRequestForm />}
              {activeTab === "profile"    && <ProfileView user={user || {}} />}
              {activeTab === "events"     && <EventsView />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default EmployeeDash;