import React, { useState, useRef, useEffect } from 'react';
import { Bell, Clock, CheckCircle, UserMinus, LogOut, Check } from 'lucide-react';
import api from '../api/axios';

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [resolvedIds, setResolvedIds] = useState(() => {
    const saved = localStorage.getItem('resolved_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  
  const dropdownRef = useRef(null);
  // Reference for the notification sound
  const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3'));

  const fetchLiveAlerts = async () => {
    try {
      const res = await api.get("/attendance/all");
      const today = new Date().toDateString();

      const newAlerts = res.data
        .filter(log => new Date(log.check_in || log.date).toDateString() === today)
        .map(log => {
          const checkIn = log.check_in ? new Date(log.check_in) : null;
          const checkOut = log.check_out ? new Date(log.check_out) : null;
          
          let type = "";
          let message = "";

          if (log.status?.toLowerCase() === "absent") {
            type = "absent";
            message = `${log.name} is Absent today.`;
          } 
          else if (checkIn && log.shift_start) {
            const [sH, sM] = log.shift_start.split(':').map(Number);
            const shiftStart = new Date(checkIn);
            shiftStart.setHours(sH, sM, 0, 0);
            if ((checkIn - shiftStart) / (1000 * 60) > 10) {
              type = "late";
              message = `${log.name} arrived Late (${checkIn.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})`;
            }
          }

          if (!type && checkOut && log.shift_end) {
            const [eH, eM] = log.shift_end.split(':').map(Number);
            const shiftEnd = new Date(checkOut);
            shiftEnd.setHours(eH, eM, 0, 0);
            if ((shiftEnd - checkOut) / (1000 * 60) > 10) {
              type = "early";
              message = `${log.name} left Early (${checkOut.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})})`;
            }
          }

          const id = `${log.id}-${type}`;
          return (type && !resolvedIds.includes(id)) ? { id, text: message, type } : null;
        })
        .filter(Boolean);

      // --- SOUND LOGIC ---
      // If we have more notifications than before, play the sound
      if (newAlerts.length > notifications.length && notifications.length !== 0) {
        audioRef.current.play().catch(err => console.log("Autoplay blocked until user interacts with page."));
      }

      setNotifications(newAlerts);
    } catch (err) {
      console.error("Sync Error:", err);
    }
  };

  const handleResolve = (id) => {
    const newResolved = [...resolvedIds, id];
    setResolvedIds(newResolved);
    localStorage.setItem('resolved_notifications', JSON.stringify(newResolved));
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  useEffect(() => {
    fetchLiveAlerts();
    const interval = setInterval(fetchLiveAlerts, 30000);
    return () => clearInterval(interval);
  }, [resolvedIds, notifications.length]); // Added notifications.length to dependency

  // Click outside logic
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-3 rounded-xl border transition-all duration-300 shadow-lg ${
          isOpen ? 'bg-red-500/10 border-red-500/50 text-red-500' : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
        }`}
      >
        <Bell size={22} />
        {notifications.length > 0 && (
          <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#0f172a] animate-pulse" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 w-96 bg-[#111827] border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h3 className="text-xs font-black uppercase tracking-widest text-white">System Alerts</h3>
            {notifications.length > 0 && (
              <button onClick={() => {
                const allIds = [...resolvedIds, ...notifications.map(n => n.id)];
                setResolvedIds(allIds);
                localStorage.setItem('resolved_notifications', JSON.stringify(allIds));
                setNotifications([]);
              }} className="text-[10px] text-red-400 font-bold hover:underline">CLEAR ALL</button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {notifications.length > 0 ? (
              notifications.map((n) => (
                <div key={n.id} className="p-5 border-b border-white/5 hover:bg-white/[0.03] flex items-start gap-4 group">
                   <div className={`p-2.5 rounded-xl ${
                    n.type === 'late' ? 'bg-amber-500/10 text-amber-500' : 
                    n.type === 'absent' ? 'bg-red-500/10 text-red-500' : 'bg-orange-500/10 text-orange-500'
                  }`}>
                    {n.type === 'late' && <Clock size={18} />}
                    {n.type === 'absent' && <UserMinus size={18} />}
                    {n.type === 'early' && <LogOut size={18} />}
                  </div>
                  <div className="flex-1 text-sm font-bold text-slate-200">{n.text}</div>
                  <button onClick={() => handleResolve(n.id)} className="p-2 text-emerald-500 opacity-0 group-hover:opacity-100 transition-all">
                    <Check size={18} strokeWidth={3} />
                  </button>
                </div>
              ))
            ) : (
              <div className="p-16 text-center text-slate-600 text-[10px] font-black tracking-widest uppercase">System Clear</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;