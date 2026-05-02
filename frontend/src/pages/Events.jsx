import React, { useState, useEffect, useMemo, useCallback } from "react";
import api from "../api/axios";
import {
  Calendar, Plus, Trash2, MapPin, X, Search,
  Megaphone, PartyPopper, Clock, Edit3,
  ArrowUpDown, AlertTriangle, CheckCircle2, Timer
} from "lucide-react";


// ---------------------------------------------------------------------------
// Constants — defined OUTSIDE component so they are never recreated
// ---------------------------------------------------------------------------

const INITIAL_FORM = {
  title: "",
  description: "",
  location: "",
  start_date: "",
  end_date: "",
  is_holiday: false,
  type: "event",
};

const FORM_FIELDS = ["title", "description", "location", "start_date", "end_date", "is_holiday", "type"];

const FILTER_TABS = [
  { key: "all",          label: "Show All" },
  { key: "upcoming",     label: "Upcoming" },
  { key: "ongoing",      label: "Ongoing" },
  { key: "past",         label: "Past" },
  { key: "announcement", label: "Announcements" },
  { key: "holiday",      label: "Holidays" },
];


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getEventStatus = (ev) => {
  if (!ev.start_date) return "upcoming";
  const now = Date.now();

  // Parse the date string. If the backend returns naive strings (no Z / offset),
  // append 'Z' to treat them as UTC — consistent with how the server stores them.
  const parseDate = (str) => {
    if (!str) return NaN;
    const iso = /[Zz]|[+-]\d{2}:\d{2}$/.test(str) ? str : str + "Z";
    return new Date(iso).getTime();
  };

  const start = parseDate(ev.start_date);
  if (isNaN(start)) return "upcoming";

  const end = ev.end_date ? parseDate(ev.end_date) : null;

  if (now < start) return "upcoming";

  // Has an explicit end date → use it to determine past
  if (end && !isNaN(end)) {
    return now > end ? "past" : "ongoing";
  }

  // No end date → treat single-day events as "past" after their start day ends
  const startDay = new Date(start);
  const endOfStartDay = new Date(
    startDay.getUTCFullYear(),
    startDay.getUTCMonth(),
    startDay.getUTCDate(),
    23, 59, 59, 999
  ).getTime();

  return now > endOfStartDay ? "past" : "ongoing";
};

const getCountdown = (ev) => {
  if (!ev.start_date) return null;
  const now   = Date.now();
  const iso   = /[Zz]|[+-]\d{2}:\d{2}$/.test(ev.start_date) ? ev.start_date : ev.start_date + "Z";
  const start = new Date(iso).getTime();
  const diff  = start - now;
  if (diff <= 0) return null;
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0)  return `In ${days} day${days !== 1 ? "s" : ""}`;
  if (hours > 0) return `In ${hours} hour${hours !== 1 ? "s" : ""}`;
  return "Starting soon";
};

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const normalized = /[Zz]|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z";
  const d = new Date(normalized);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const getTheme = (ev) => {
  if (ev.is_holiday || ev.type === "holiday")
    return {
      border: "border-rose-500/40",
      bg: "bg-[#1a0d0d]",
      accentBar: "bg-rose-600",
      text: "text-rose-400", iconBg: "bg-rose-500/20",
      icon: <PartyPopper size={18} />, label: "Holiday",
      labelStyle: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    };
  if (ev.type === "announcement")
    return {
      border: "border-amber-500/40",
      bg: "bg-[#1a1200]",
      accentBar: "bg-amber-500",
      text: "text-amber-400", iconBg: "bg-amber-500/20",
      icon: <Megaphone size={18} />, label: "Announcement",
      labelStyle: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    };
  return {
    border: "border-indigo-500/40",
    bg: "bg-[#0d0d1a]",
    accentBar: "bg-indigo-600",
    text: "text-indigo-400", iconBg: "bg-indigo-500/20",
    icon: <Calendar size={18} />, label: "Event",
    labelStyle: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  };
};

const statusStyle = {
  upcoming: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  ongoing:  "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  past:     "bg-slate-700/60 text-slate-400 border-slate-600/30",
};

const statusLabel = { upcoming: "Upcoming", ongoing: "Ongoing", past: "Past" };


// ---------------------------------------------------------------------------
// DeleteConfirmModal
// ---------------------------------------------------------------------------

const DeleteConfirmModal = ({ event, onClose, onConfirm, isDeleting }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200] p-4">
    <div className="bg-[#0b0f1a] border border-white/10 rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden">
      <div className="p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto">
          <Trash2 size={24} className="text-rose-400" />
        </div>
        <h3 className="text-white font-bold text-sm uppercase tracking-widest">Confirm Delete</h3>
        <p className="text-slate-400 text-xs leading-relaxed">
          Permanently delete{" "}
          <span className="text-white font-bold">"{event?.title}"</span>?
          This action cannot be undone.
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-[1.5rem] border border-white/10 text-slate-400 text-xs font-bold uppercase hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 py-3 rounded-[1.5rem] bg-rose-600 text-white text-xs font-black uppercase hover:bg-rose-500 transition-all disabled:opacity-50"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  </div>
);


// ---------------------------------------------------------------------------
// EventFormModal
// ---------------------------------------------------------------------------

const EventFormModal = ({ editingEvent, onClose, onSaved }) => {
  const [formData, setFormData]   = useState(() => {
    if (!editingEvent) return { ...INITIAL_FORM };
    const fmt = (d) => d ? new Date(d).toISOString().slice(0, 16) : "";
    // Only copy known form fields — avoids sending backend-only fields in payload
    return {
      title:       editingEvent.title       || "",
      description: editingEvent.description || "",
      location:    editingEvent.location    || "",
      start_date:  fmt(editingEvent.start_date),
      end_date:    fmt(editingEvent.end_date),
      is_holiday:  editingEvent.is_holiday  ?? false,
      type:        editingEvent.type        || "event",
    };
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]               = useState("");

  const set = (field) => (e) =>
    setFormData((prev) => ({
      ...prev,
      [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  // Auto-set is_holiday when type === "holiday"
  const handleTypeChange = (e) => {
    const type = e.target.value;
    setFormData((prev) => ({ ...prev, type, is_holiday: type === "holiday" }));
  };

  const handleSave = async () => {
    setError("");
    if (!formData.title.trim())      { setError("Title is required."); return; }
    if (!formData.start_date)        { setError("Start date is required."); return; }
    if (formData.end_date && formData.end_date < formData.start_date) {
      setError("End date cannot be before the start date."); return;
    }

    setIsSubmitting(true);
    const payload = {
      ...formData,
      end_date:   formData.end_date || null,
      is_holiday: formData.type === "holiday" || formData.is_holiday,
    };

    try {
      let saved;
      if (editingEvent) {
        const res = await api.put(`/events/${editingEvent.id}/`, payload);
        saved = res.data;
      } else {
        const res = await api.post("/events/", payload);
        saved = res.data;
      }
      onSaved(saved, !!editingEvent);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || "Action failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose} />

      <div className="relative bg-[#0b0f1a] border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-xl shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">

        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-extrabold text-white">
            {editingEvent ? "Update Event" : "Create Event"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X size={22} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-2xl px-4 py-3">
            <AlertTriangle size={14} className="shrink-0" /> {error}
          </div>
        )}

        {/* Title */}
        <input
          type="text"
          placeholder="Event Title *"
          value={formData.title}
          onChange={set("title")}
          className="w-full bg-slate-900 rounded-2xl p-4 text-white text-sm outline-none focus:ring-2 ring-indigo-500 placeholder:text-slate-600"
        />

        {/* Description */}
        <textarea
          placeholder="Event details and info..."
          rows={4}
          value={formData.description}
          onChange={set("description")}
          className="w-full bg-slate-900 rounded-2xl p-4 text-white text-sm outline-none resize-none placeholder:text-slate-600 focus:ring-2 ring-indigo-500"
        />

        {/* Type + Location */}
        <div className="grid grid-cols-2 gap-4">
          <select
            value={formData.type}
            onChange={handleTypeChange}
            className="bg-slate-900 rounded-2xl p-4 text-white text-sm outline-none cursor-pointer focus:ring-2 ring-indigo-500 [color-scheme:dark]"
          >
            <option value="event">Event</option>
            <option value="announcement">Announcement</option>
            <option value="holiday">Holiday</option>
          </select>
          <input
            type="text"
            placeholder="Location (optional)"
            value={formData.location}
            onChange={set("location")}
            className="bg-slate-900 rounded-2xl p-4 text-white text-sm outline-none placeholder:text-slate-600 focus:ring-2 ring-indigo-500"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Starts *</label>
            <input
              type="datetime-local"
              value={formData.start_date}
              onChange={set("start_date")}
              className="w-full bg-slate-900 rounded-2xl p-4 text-sm text-white outline-none focus:ring-2 ring-indigo-500 [color-scheme:dark]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Ends</label>
            <input
              type="datetime-local"
              value={formData.end_date}
              onChange={set("end_date")}
              min={formData.start_date}
              className="w-full bg-slate-900 rounded-2xl p-4 text-sm text-white outline-none focus:ring-2 ring-indigo-500 [color-scheme:dark]"
            />
          </div>
        </div>

        {/* Holiday toggle — only shown when type is not already "holiday" */}
        {formData.type !== "holiday" && (
          <label className="flex items-center justify-between bg-slate-900/50 p-4 rounded-2xl cursor-pointer hover:bg-slate-900 transition-colors">
            <div className="flex items-center gap-3">
              <PartyPopper size={18} className="text-rose-500" />
              <span className="text-sm font-semibold text-slate-300">Mark as Official Holiday</span>
            </div>
            <input
              type="checkbox"
              className="w-5 h-5 accent-indigo-500 rounded-lg"
              checked={formData.is_holiday}
              onChange={set("is_holiday")}
            />
          </label>
        )}

        {/* Submit */}
        <button
          onClick={handleSave}
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 py-4 rounded-2xl font-bold text-white transition-all disabled:opacity-50 shadow-xl shadow-indigo-600/10 hover:scale-[1.01] active:scale-[0.99]"
        >
          {isSubmitting ? "Saving…" : editingEvent ? "Update Event" : "Publish Now"}
        </button>
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// EventCard
// ---------------------------------------------------------------------------

const EventCard = ({ ev, isAdmin, onEdit, onDelete }) => {
  const theme    = getTheme(ev);
  const status   = getEventStatus(ev);
  const countdown = getCountdown(ev);

  return (
    <div
      className={`group relative rounded-[1.75rem] border ${theme.border} ${theme.bg}
        transition-all duration-300 hover:shadow-2xl hover:shadow-black/40
        hover:-translate-y-1 flex flex-col overflow-hidden`}
    >
      {/* Colour accent bar at top */}
      <div className={`h-1 w-full ${theme.accentBar} opacity-80`} />
      <div className="p-7 flex flex-col flex-grow">
      {/* Top row: icon + status + actions */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${theme.iconBg} ${theme.text} shadow-inner shrink-0`}>
            {theme.icon}
          </div>
          <div className="flex flex-col gap-1">
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${theme.labelStyle}`}>
              {theme.label}
            </span>
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${statusStyle[status]}`}>
              {statusLabel[status]}
            </span>
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onEdit(ev)}
              className="p-2 rounded-xl bg-slate-900/60 text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-white/5"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={() => onDelete(ev)}
              className="p-2 rounded-xl bg-slate-900/60 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-white/5"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Title + description */}
      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors leading-snug">
        {ev.title}
      </h3>
      {ev.description && (
        <p className="text-slate-400 text-sm leading-relaxed line-clamp-2 mb-4 flex-grow">
          {ev.description}
        </p>
      )}

      {/* Countdown pill */}
      {countdown && (
        <div className="flex items-center gap-2 mb-4">
          <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase px-3 py-1 rounded-full">
            <Timer size={10} /> {countdown}
          </span>
        </div>
      )}

      {/* Footer: date + location */}
      <div className="pt-4 border-t border-white/5 space-y-2 mt-auto">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <Clock size={12} className={`${theme.text} shrink-0`} />
          <span>{fmtDateTime(ev.start_date)}</span>
        </div>
        {ev.end_date && (
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <Clock size={12} className="text-slate-600 shrink-0" />
            <span>Ends {fmtDateTime(ev.end_date)}</span>
          </div>
        )}
        {ev.location && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin size={12} className="text-rose-500 shrink-0" />
            <span>{ev.location}</span>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};


// ---------------------------------------------------------------------------
// Main Events component
// ---------------------------------------------------------------------------

const Events = () => {
  const [events,       setEvents]       = useState([]);
  const [showModal,    setShowModal]    = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting,   setIsDeleting]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortAsc,      setSortAsc]      = useState(true);
  const [fetchError,   setFetchError]   = useState("");

  // Safe role fallback — never defaults to admin
  const userRole = (localStorage.getItem("role") || "read_only").toLowerCase();
  const isAdmin  = userRole === "admin";

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  const fetchEvents = useCallback(async () => {
    setFetchError("");
    try {
      const res = await api.get("/events/");
      setEvents(res.data || []);
    } catch (err) {
      setFetchError("Failed to load events. Please refresh the page.");
      console.error("Fetch error:", err);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ---------------------------------------------------------------------------
  // WebSocket — live updates without page refresh
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Build the WebSocket URL from the current API base
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = (process.env.REACT_APP_API_URL || window.location.host).replace(/^https?:\/\//, "");
    const wsUrl = `${protocol}://${host}/events/ws/notifications`;

    let ws;
    let reconnectTimer;
    let isMounted = true;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[Events WS] Connected");
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === "new_event") {
            // Re-fetch so we get the full serialized object from the server
            fetchEvents();
          } else if (msg.type === "updated_event") {
            fetchEvents();
          } else if (msg.type === "deleted_event") {
            setEvents((prev) => prev.filter((ev) => ev.id !== msg.id));
          }
        } catch {
          // Non-JSON message — ignore
        }
      };

      ws.onclose = () => {
        if (isMounted) {
          // Auto-reconnect after 3 seconds
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (err) => {
        console.warn("[Events WS] Error — will reconnect:", err);
        ws.close();
      };
    };

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [fetchEvents]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleSaved = useCallback((savedEvent, isEdit) => {
    setEvents((prev) =>
      isEdit
        ? prev.map((ev) => (ev.id === savedEvent.id ? savedEvent : ev))
        : [savedEvent, ...prev]
    );
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/events/${deleteTarget.id}/`);
      setEvents((prev) => prev.filter((ev) => ev.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setDeleteTarget(null);
      setFetchError("Failed to delete event.");
    } finally {
      setIsDeleting(false);
    }
  };

  const openEdit = useCallback((ev) => {
    setEditingEvent(ev);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingEvent(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Filtered + sorted events
  // ---------------------------------------------------------------------------

  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return events
      .filter((ev) => {
        const matchesSearch =
          (ev.title       || "").toLowerCase().includes(q) ||
          (ev.description || "").toLowerCase().includes(q);
        const status = getEventStatus(ev);
        const matchesFilter =
          activeFilter === "all"          ||
          activeFilter === status          ||
          (activeFilter === "holiday"      && (ev.is_holiday || ev.type === "holiday")) ||
          (activeFilter === "announcement" && ev.type === "announcement");
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        const ta = a.start_date ? new Date(a.start_date).getTime() : 0;
        const tb = b.start_date ? new Date(b.start_date).getTime() : 0;
        return sortAsc ? ta - tb : tb - ta;
      });
  }, [events, searchQuery, activeFilter, sortAsc]);

  // Counts for filter tab badges
  const counts = useMemo(() => ({
    all:          events.length,
    upcoming:     events.filter((e) => getEventStatus(e) === "upcoming").length,
    ongoing:      events.filter((e) => getEventStatus(e) === "ongoing").length,
    past:         events.filter((e) => getEventStatus(e) === "past").length,
    announcement: events.filter((e) => e.type === "announcement").length,
    holiday:      events.filter((e) => e.is_holiday || e.type === "holiday").length,
  }), [events]);

  // ---------------------------------------------------------------------------
  // Empty state message
  // ---------------------------------------------------------------------------

  const emptyMessage = useMemo(() => {
    if (searchQuery) return `No results for "${searchQuery}"`;
    if (activeFilter !== "all") return `No ${activeFilter} events found`;
    return "No events yet";
  }, [searchQuery, activeFilter]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6 min-h-screen text-slate-200">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 bg-slate-900/40 p-6 rounded-[2rem] border border-white/5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Events & Updates</h1>
          <p className="text-slate-500 text-sm mt-1">Manage company milestones and news.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={16} />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 w-56 focus:ring-2 ring-indigo-500 outline-none transition-all text-sm placeholder:text-slate-600"
            />
          </div>

          {/* Sort toggle */}
          <button
            onClick={() => setSortAsc((v) => !v)}
            title={sortAsc ? "Sorted: earliest first" : "Sorted: latest first"}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 text-xs font-bold uppercase transition-all"
          >
            <ArrowUpDown size={14} />
            {sortAsc ? "Oldest First" : "Newest First"}
          </button>

          {/* Add button — admin only */}
          {isAdmin && (
            <button
              onClick={() => { setEditingEvent(null); setShowModal(true); }}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-6 py-2.5 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95 text-sm"
            >
              <Plus size={18} /> Add New
            </button>
          )}
        </div>
      </header>

      {/* Fetch error banner */}
      {fetchError && (
        <div className="mb-6 flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-2xl px-5 py-4">
          <AlertTriangle size={14} className="shrink-0" /> {fetchError}
          <button onClick={() => setFetchError("")} className="ml-auto text-rose-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── FILTER TABS ─────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide flex-nowrap">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-2xl text-xs font-bold capitalize transition-all border whitespace-nowrap shrink-0 ${
              activeFilter === key
                ? "bg-white text-slate-950 border-white shadow-xl"
                : "bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300"
            }`}
          >
            {label}
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
              activeFilter === key ? "bg-slate-950/20 text-slate-800" : "bg-slate-800 text-slate-500"
            }`}>
              {counts[key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── EVENT GRID ──────────────────────────────────────────────────── */}
      {filteredEvents.length === 0 ? (
        <div className="py-24 text-center bg-slate-900/20 rounded-[3rem] border border-dashed border-slate-800">
          <Calendar className="mx-auto text-slate-800 mb-4" size={40} />
          <p className="text-slate-600 font-medium">{emptyMessage}</p>
          {isAdmin && activeFilter === "all" && !searchQuery && (
            <button
              onClick={() => { setEditingEvent(null); setShowModal(true); }}
              className="mt-6 flex items-center gap-2 mx-auto px-6 py-3 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold hover:bg-indigo-600/30 transition-all"
            >
              <Plus size={14} /> Create your first event
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((ev) => (
            <EventCard
              key={ev.id}
              ev={ev}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* ── MODALS ──────────────────────────────────────────────────────── */}
      {showModal && (
        <EventFormModal
          editingEvent={editingEvent}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          event={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
        />
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default Events;













// import React, { useState, useEffect, useMemo } from "react";
// import api from "../api/axios";
// import {
//   Calendar, Plus, Trash2, MapPin, Bell, X, Search, 
//   Megaphone, PartyPopper, Clock, AlertCircle, Edit3, Settings
// } from "lucide-react";

// const Events = () => {
//   /* ================= STATE MANAGEMENT ================= */
//   const [events, setEvents] = useState([]);
//   const [showModal, setShowModal] = useState(false);
//   const [editingId, setEditingId] = useState(null);
//   const [notificationCount, setNotificationCount] = useState(0);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [activeFilter, setActiveFilter] = useState("all");
//   const [isSubmitting, setIsSubmitting] = useState(false);

//   // Fallback: If no role is found, we can default to 'admin' for your local testing
//   const [userRole, setUserRole] = useState(localStorage.getItem("role") || "admin");

//   const initialForm = {
//     title: "",
//     description: "",
//     location: "",
//     start_date: "",
//     end_date: "",
//     is_holiday: false,
//     type: "event"
//   };

//   const [formData, setFormData] = useState(initialForm);

//   /* ================= DATA FETCHING ================= */
//   const fetchEvents = async () => {
//     try {
//       const res = await api.get("/events/");
//       setEvents(res.data);
//     } catch (err) {
//       console.error("Fetch error:", err);
//     }
//   };

//   useEffect(() => {
//     fetchEvents();
//     // Logic for WebSocket and Esc key remains the same...
//   }, []);

//   /* ================= CORE ACTIONS ================= */
//   const handleEditClick = (event) => {
//     setEditingId(event.id);
//     const formatForInput = (dateStr) => dateStr ? new Date(dateStr).toISOString().slice(0, 16) : "";
//     setFormData({
//       ...event,
//       start_date: formatForInput(event.start_date),
//       end_date: formatForInput(event.end_date)
//     });
//     setShowModal(true);
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setIsSubmitting(true);
//     const payload = { ...formData, end_date: formData.end_date || null };

//     try {
//       if (editingId) {
//         const res = await api.put(`/events/${editingId}/`, payload);
//         setEvents(prev => prev.map(ev => ev.id === editingId ? res.data : ev));
//       } else {
//         const res = await api.post("/events/", payload);
//         setEvents(prev => [res.data, ...prev]);
//       }
//       closeModal();
//     } catch (err) {
//       alert("Action failed.");
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   const handleDelete = async (id) => {
//     if (!window.confirm("Delete this event?")) return;
//     try {
//       await api.delete(`/events/${id}/`);
//       setEvents(prev => prev.filter(ev => ev.id !== id));
//     } catch (err) {
//       alert("Failed to delete.");
//     }
//   };

//   const closeModal = () => {
//     setShowModal(false);
//     setEditingId(null);
//     setFormData(initialForm);
//   };

//   const filteredEvents = useMemo(() => {
//     return events.filter(ev => {
//       const matchesSearch = ev.title.toLowerCase().includes(searchQuery.toLowerCase());
//       const matchesFilter = activeFilter === "all" || (activeFilter === "holiday" && ev.is_holiday) || (ev.type === activeFilter);
//       return matchesSearch && matchesFilter;
//     });
//   }, [events, searchQuery, activeFilter]);

//   const getTheme = (ev) => {
//     if (ev.is_holiday) return { border: "border-rose-500/30", bg: "bg-rose-500/10", text: "text-rose-400", icon: <PartyPopper size={18} /> };
//     if (ev.type === "announcement") return { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-400", icon: <Megaphone size={18} /> };
//     return { border: "border-indigo-500/30", bg: "bg-indigo-500/10", text: "text-indigo-400", icon: <Calendar size={18} /> };
//   };

//   return (
//     <div className="max-w-7xl mx-auto p-6 min-h-screen text-slate-200">
      
//       {/* HEADER */}
//       <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12 bg-slate-900/40 p-6 rounded-[2rem] border border-white/5">
//         <div>
//           <h1 className="text-4xl font-extrabold text-white tracking-tight">Events & Updates</h1>
//           <p className="text-slate-500 text-sm mt-1">Manage company milestones and news.</p>
//         </div>

//         <div className="flex flex-wrap items-center gap-4">
//           <div className="relative">
//             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
//             <input 
//               type="text" placeholder="Quick search..." value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="bg-slate-950 border border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 w-64 focus:ring-2 ring-indigo-500 outline-none transition-all"
//             />
//           </div>
          
//           {/* THE ADD BUTTON - Now more prominent */}
//           {userRole === "admin" && (
//             <button 
//               onClick={() => setShowModal(true)} 
//               className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-6 py-2.5 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
//             >
//               <Plus size={20} /> Add New
//             </button>
//           )}
//         </div>
//       </header>

//       {/* FILTER TABS */}
//       <div className="flex gap-3 mb-10 overflow-x-auto pb-2 scrollbar-hide">
//         {["all", "event", "announcement", "holiday"].map(tab => (
//           <button key={tab} onClick={() => setActiveFilter(tab)}
//             className={`px-6 py-2 rounded-2xl text-sm font-semibold capitalize transition-all border ${
//               activeFilter === tab 
//               ? "bg-white text-slate-950 border-white shadow-xl" 
//               : "bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300"
//             }`}>
//             {tab === 'all' ? 'Show All' : tab + 's'}
//           </button>
//         ))}
//       </div>

//       {/* GRID */}
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
//         {filteredEvents.length === 0 ? (
//           <div className="col-span-full py-20 text-center bg-slate-900/20 rounded-[3rem] border border-dashed border-slate-800">
//              <Calendar className="mx-auto text-slate-800 mb-4" size={48} />
//              <p className="text-slate-600 font-medium text-lg">No matches found for "{searchQuery}"</p>
//           </div>
//         ) : (
//           filteredEvents.map((ev) => {
//             const style = getTheme(ev);
//             return (
//               <div key={ev.id} className={`group p-8 rounded-[2.5rem] border ${style.border} ${style.bg} backdrop-blur-md transition-all hover:shadow-2xl hover:shadow-indigo-500/5`}>
//                 <div className="flex justify-between items-start mb-8">
//                   <div className={`p-4 rounded-3xl ${style.bg} ${style.text} shadow-inner`}>{style.icon}</div>
//                   {userRole === "admin" && (
//                     <div className="flex gap-2">
//                       <button onClick={() => handleEditClick(ev)} className="p-2.5 rounded-xl bg-slate-900/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"><Edit3 size={16} /></button>
//                       <button onClick={() => handleDelete(ev.id)} className="p-2.5 rounded-xl bg-slate-900/50 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"><Trash2 size={16} /></button>
//                     </div>
//                   )}
//                 </div>
//                 <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-indigo-300 transition-colors">{ev.title}</h3>
//                 <p className="text-slate-400 text-sm leading-relaxed mb-8 line-clamp-3">{ev.description}</p>
//                 <div className="pt-6 border-t border-white/5 space-y-3">
//                   <div className="flex items-center gap-3 text-xs text-slate-400 font-mono"><Clock size={14} className="text-indigo-500" />{new Date(ev.start_date).toLocaleDateString()} at {new Date(ev.start_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
//                   {ev.location && <div className="flex items-center gap-3 text-xs text-slate-500 font-medium"><MapPin size={14} className="text-rose-500" />{ev.location}</div>}
//                 </div>
//               </div>
//             );
//           })
//         )}
//       </div>

//       {/* MODAL */}
//       {showModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
//           <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={closeModal} />
//           <form onSubmit={handleSubmit} className="relative bg-[#0b0f1a] border border-slate-800 p-10 rounded-[3rem] w-full max-w-xl shadow-2xl space-y-6">
//             <div className="flex justify-between items-center">
//               <h2 className="text-3xl font-extrabold text-white">{editingId ? "Update Event" : "Create Event"}</h2>
//               <button type="button" onClick={closeModal} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X size={24} /></button>
//             </div>
            
//             <input required type="text" placeholder="Event Title" className="w-full bg-slate-900 rounded-2xl p-4 text-white focus:ring-2 ring-indigo-500 border-none outline-none"
//               value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
            
//             <textarea placeholder="Event details and info..." className="w-full bg-slate-900 rounded-2xl p-4 h-32 text-white border-none outline-none resize-none"
//               value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />

//             <div className="grid grid-cols-2 gap-4">
//               <select className="bg-slate-900 rounded-2xl p-4 text-white border-none outline-none cursor-pointer" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})}>
//                 <option value="event">Event</option>
//                 <option value="announcement">Announcement</option>
//               </select>
//               <input type="text" placeholder="Where is it?" className="bg-slate-900 rounded-2xl p-4 text-white border-none outline-none"
//                 value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} />
//             </div>

//             <div className="grid grid-cols-2 gap-4">
//                <div><label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block ml-1">Starts</label><input required type="datetime-local" className="w-full bg-slate-900 rounded-2xl p-4 text-sm text-white border-none outline-none" value={formData.start_date} onChange={(e) => setFormData({...formData, start_date: e.target.value})} /></div>
//                <div><label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block ml-1">Ends</label><input type="datetime-local" className="w-full bg-slate-900 rounded-2xl p-4 text-sm text-white border-none outline-none" value={formData.end_date} onChange={(e) => setFormData({...formData, end_date: e.target.value})} /></div>
//             </div>

//             <label className="flex items-center justify-between bg-slate-900/50 p-5 rounded-2xl cursor-pointer hover:bg-slate-900 transition-colors">
//               <div className="flex items-center gap-3">
//                 <PartyPopper size={20} className="text-rose-500" />
//                 <span className="text-sm font-semibold text-slate-300">Official Holiday</span>
//               </div>
//               <input type="checkbox" className="w-6 h-6 accent-indigo-500 rounded-lg" checked={formData.is_holiday} onChange={(e) => setFormData({...formData, is_holiday: e.target.checked})} />
//             </label>

//             <button type="submit" disabled={isSubmitting} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:scale-[1.02] py-5 rounded-2xl font-bold text-lg text-white transition-all disabled:opacity-50 shadow-xl shadow-indigo-600/10">
//               {isSubmitting ? "Processing..." : editingId ? "Update Details" : "Publish Now"}
//             </button>
//           </form>
//         </div>
//       )}
//     </div>
//   );
// };

// export default Events;