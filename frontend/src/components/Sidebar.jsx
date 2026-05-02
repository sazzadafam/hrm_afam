import React from 'react';
import { 
  LayoutDashboard, Users, Calendar, Settings, 
  LogOut, Clock, CreditCard, FileText, ChevronRight 
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = localStorage.getItem('role'); 
  const isReadOnly = userRole === 'read_only_admin';

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const NavItem = ({ icon: Icon, label, path }) => {
    const isActive = location.pathname === path;
    return (
      <div 
        onClick={() => navigate(path)}
        className={`relative flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 group ${
          isActive 
            ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-[0_10px_20px_-10px_rgba(239,68,68,0.5)]' 
            : 'text-slate-400 hover:bg-white/5 hover:text-white hover:translate-x-1'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon size={19} className={`${isActive ? 'text-white' : 'group-hover:text-red-400'} transition-colors`} />
          <span className={`text-sm font-semibold tracking-wide ${isActive ? 'opacity-100' : 'opacity-80'}`}>{label}</span>
        </div>
        {isActive && <ChevronRight size={14} className="text-white/70" />}
      </div>
    );
  };

  const SectionLabel = ({ children }) => (
    <p className="px-4 mt-8 mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700">
      {children}
    </p>
  );

  return (
    // UPDATED: bg-[#020617] is deeper than your Layout's #0f172a, creating a sleek contrast
    <aside className="w-64 bg-[#2c3041] flex flex-col fixed h-full z-20 border-r border-white/5 shadow-[20px_0_50px_-15px_rgba(0,0,0,0.5)]">
      
      {/* HEADER / LOGO */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-2 px-2">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-orange-100 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden">
              <img 
                src="/icon-192.png"
                alt="Logo" 
                className="w-full h-full object-cover p-1.5"
                onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=AF&background=ef4444&color=fff" }}
              />
            </div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black text-red-500 tracking-tight">
              AFAM<span className="text-white font-light"> GROUP</span>
            </h1>
          </div>
        </div>
        
        {/* ROLE BADGE */}
        <div className="px-2 mb-8">
            <div className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tighter border ${
              isReadOnly ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-red-500/10 border-red-500/20 text-white'
            }`}>
              {isReadOnly ? 'Auditor View' : 'Administrator'}
            </div>
        </div>

        {/* NAVIGATION */}
        <nav className="space-y-1">
          <SectionLabel>Core Analytics</SectionLabel>
          <NavItem icon={LayoutDashboard} label="Dashboard" path="/dashboard" />
          
          <NavItem icon={Users} label="Employees" path="/employees" />
          <NavItem icon={Clock} label="Attendance" path="/attendance" />
          <NavItem icon={CreditCard} label="Payroll" path="/payroll" />
          
          {/* {!isReadOnly && (
            <NavItem icon={FileText} label="Reports" path="/reports" />
          )} */}
          <NavItem icon={Calendar} label="Events" path="/events" />

          {!isReadOnly && (
             <NavItem icon={Settings} label="Settings" path="/settings" />
          )}
        </nav>
      </div>

      {/* FOOTER / USER SECTION */}
      <div className="mt-auto p-4 border-t border-white/5 bg-white/[0.01]">
        <div className="flex items-center gap-3 px-2 py-3 mb-2 bg-[#0f172a]/50 rounded-xl border border-white/5">
          <div className="w-8 h-8 rounded-full bg-[#1e293b] border border-white/10 flex items-center justify-center text-[10px] font-bold text-slate-300">
            {isReadOnly ? 'AU' : 'AD'}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs font-bold text-white truncate">
              {isReadOnly ? 'System Auditor' : 'System Admin'}
            </span>
            <div className="flex items-center gap-1.5">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
               <span className="text-[10px] text-slate-500 truncate">Online Now</span>
            </div>
          </div>
        </div>
        
        <button 
          onClick={handleLogout} 
          className="flex items-center gap-3 text-slate-500 hover:text-red-500 transition-all w-full p-2.5 rounded-lg hover:bg-red-500/5 group"
        >
          <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-semibold">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;