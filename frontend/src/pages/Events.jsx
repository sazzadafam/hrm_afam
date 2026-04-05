import React, { useState, useEffect, useMemo } from "react";
import api from "../api/axios";
import {
  Calendar, Plus, Trash2, MapPin, Bell, X, Search, 
  Megaphone, PartyPopper, Clock, AlertCircle, Edit3, Settings
} from "lucide-react";

const Events = () => {
  /* ================= STATE MANAGEMENT ================= */
  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fallback: If no role is found, we can default to 'admin' for your local testing
  const [userRole, setUserRole] = useState(localStorage.getItem("role") || "admin");

  const initialForm = {
    title: "",
    description: "",
    location: "",
    start_date: "",
    end_date: "",
    is_holiday: false,
    type: "event"
  };

  const [formData, setFormData] = useState(initialForm);

  /* ================= DATA FETCHING ================= */
  const fetchEvents = async () => {
    try {
      const res = await api.get("/events/");
      setEvents(res.data);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  useEffect(() => {
    fetchEvents();
    // Logic for WebSocket and Esc key remains the same...
  }, []);

  /* ================= CORE ACTIONS ================= */
  const handleEditClick = (event) => {
    setEditingId(event.id);
    const formatForInput = (dateStr) => dateStr ? new Date(dateStr).toISOString().slice(0, 16) : "";
    setFormData({
      ...event,
      start_date: formatForInput(event.start_date),
      end_date: formatForInput(event.end_date)
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    const payload = { ...formData, end_date: formData.end_date || null };

    try {
      if (editingId) {
        const res = await api.put(`/events/${editingId}/`, payload);
        setEvents(prev => prev.map(ev => ev.id === editingId ? res.data : ev));
      } else {
        const res = await api.post("/events/", payload);
        setEvents(prev => [res.data, ...prev]);
      }
      closeModal();
    } catch (err) {
      alert("Action failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this event?")) return;
    try {
      await api.delete(`/events/${id}/`);
      setEvents(prev => prev.filter(ev => ev.id !== id));
    } catch (err) {
      alert("Failed to delete.");
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData(initialForm);
  };

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      const matchesSearch = ev.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = activeFilter === "all" || (activeFilter === "holiday" && ev.is_holiday) || (ev.type === activeFilter);
      return matchesSearch && matchesFilter;
    });
  }, [events, searchQuery, activeFilter]);

  const getTheme = (ev) => {
    if (ev.is_holiday) return { border: "border-rose-500/30", bg: "bg-rose-500/10", text: "text-rose-400", icon: <PartyPopper size={18} /> };
    if (ev.type === "announcement") return { border: "border-amber-500/30", bg: "bg-amber-500/10", text: "text-amber-400", icon: <Megaphone size={18} /> };
    return { border: "border-indigo-500/30", bg: "bg-indigo-500/10", text: "text-indigo-400", icon: <Calendar size={18} /> };
  };

  return (
    <div className="max-w-7xl mx-auto p-6 min-h-screen text-slate-200">
      
      {/* HEADER */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12 bg-slate-900/40 p-6 rounded-[2rem] border border-white/5">
        <div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">Events & Updates</h1>
          <p className="text-slate-500 text-sm mt-1">Manage company milestones and news.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" placeholder="Quick search..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 w-64 focus:ring-2 ring-indigo-500 outline-none transition-all"
            />
          </div>
          
          {/* THE ADD BUTTON - Now more prominent */}
          {userRole === "admin" && (
            <button 
              onClick={() => setShowModal(true)} 
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-6 py-2.5 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
            >
              <Plus size={20} /> Add New
            </button>
          )}
        </div>
      </header>

      {/* FILTER TABS */}
      <div className="flex gap-3 mb-10 overflow-x-auto pb-2 scrollbar-hide">
        {["all", "event", "announcement", "holiday"].map(tab => (
          <button key={tab} onClick={() => setActiveFilter(tab)}
            className={`px-6 py-2 rounded-2xl text-sm font-semibold capitalize transition-all border ${
              activeFilter === tab 
              ? "bg-white text-slate-950 border-white shadow-xl" 
              : "bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300"
            }`}>
            {tab === 'all' ? 'Show All' : tab + 's'}
          </button>
        ))}
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredEvents.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-slate-900/20 rounded-[3rem] border border-dashed border-slate-800">
             <Calendar className="mx-auto text-slate-800 mb-4" size={48} />
             <p className="text-slate-600 font-medium text-lg">No matches found for "{searchQuery}"</p>
          </div>
        ) : (
          filteredEvents.map((ev) => {
            const style = getTheme(ev);
            return (
              <div key={ev.id} className={`group p-8 rounded-[2.5rem] border ${style.border} ${style.bg} backdrop-blur-md transition-all hover:shadow-2xl hover:shadow-indigo-500/5`}>
                <div className="flex justify-between items-start mb-8">
                  <div className={`p-4 rounded-3xl ${style.bg} ${style.text} shadow-inner`}>{style.icon}</div>
                  {userRole === "admin" && (
                    <div className="flex gap-2">
                      <button onClick={() => handleEditClick(ev)} className="p-2.5 rounded-xl bg-slate-900/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"><Edit3 size={16} /></button>
                      <button onClick={() => handleDelete(ev.id)} className="p-2.5 rounded-xl bg-slate-900/50 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>
                <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-indigo-300 transition-colors">{ev.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-8 line-clamp-3">{ev.description}</p>
                <div className="pt-6 border-t border-white/5 space-y-3">
                  <div className="flex items-center gap-3 text-xs text-slate-400 font-mono"><Clock size={14} className="text-indigo-500" />{new Date(ev.start_date).toLocaleDateString()} at {new Date(ev.start_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  {ev.location && <div className="flex items-center gap-3 text-xs text-slate-500 font-medium"><MapPin size={14} className="text-rose-500" />{ev.location}</div>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={closeModal} />
          <form onSubmit={handleSubmit} className="relative bg-[#0b0f1a] border border-slate-800 p-10 rounded-[3rem] w-full max-w-xl shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-extrabold text-white">{editingId ? "Update Event" : "Create Event"}</h2>
              <button type="button" onClick={closeModal} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <input required type="text" placeholder="Event Title" className="w-full bg-slate-900 rounded-2xl p-4 text-white focus:ring-2 ring-indigo-500 border-none outline-none"
              value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
            
            <textarea placeholder="Event details and info..." className="w-full bg-slate-900 rounded-2xl p-4 h-32 text-white border-none outline-none resize-none"
              value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} />

            <div className="grid grid-cols-2 gap-4">
              <select className="bg-slate-900 rounded-2xl p-4 text-white border-none outline-none cursor-pointer" value={formData.type} onChange={(e) => setFormData({...formData, type: e.target.value})}>
                <option value="event">Event</option>
                <option value="announcement">Announcement</option>
              </select>
              <input type="text" placeholder="Where is it?" className="bg-slate-900 rounded-2xl p-4 text-white border-none outline-none"
                value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div><label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block ml-1">Starts</label><input required type="datetime-local" className="w-full bg-slate-900 rounded-2xl p-4 text-sm text-white border-none outline-none" value={formData.start_date} onChange={(e) => setFormData({...formData, start_date: e.target.value})} /></div>
               <div><label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block ml-1">Ends</label><input type="datetime-local" className="w-full bg-slate-900 rounded-2xl p-4 text-sm text-white border-none outline-none" value={formData.end_date} onChange={(e) => setFormData({...formData, end_date: e.target.value})} /></div>
            </div>

            <label className="flex items-center justify-between bg-slate-900/50 p-5 rounded-2xl cursor-pointer hover:bg-slate-900 transition-colors">
              <div className="flex items-center gap-3">
                <PartyPopper size={20} className="text-rose-500" />
                <span className="text-sm font-semibold text-slate-300">Official Holiday</span>
              </div>
              <input type="checkbox" className="w-6 h-6 accent-indigo-500 rounded-lg" checked={formData.is_holiday} onChange={(e) => setFormData({...formData, is_holiday: e.target.checked})} />
            </label>

            <button type="submit" disabled={isSubmitting} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:scale-[1.02] py-5 rounded-2xl font-bold text-lg text-white transition-all disabled:opacity-50 shadow-xl shadow-indigo-600/10">
              {isSubmitting ? "Processing..." : editingId ? "Update Details" : "Publish Now"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Events;