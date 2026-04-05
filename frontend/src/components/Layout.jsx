import React from 'react';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';

const Layout = ({ children, title }) => {
  // Logic to pull user details
  const userRole = localStorage.getItem('role') === 'read_only_admin' ? 'Auditor' : 'Admin';
  const adminName = localStorage.getItem('name') || "System User";

  return (
    <div className="flex min-h-screen bg-[#999595] text-slate-200 font-sans selection:bg-red-500/30">
      {/* Scrollbar Styling Injection */}
      <style>
        {`
          .custom-scrollbar::-webkit-scrollbar {
            width: 5px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.02);
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #334155;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #ef4444;
          }
        `}
      </style>

      <Sidebar />
      
      <div className="flex-1 ml-64 flex flex-col">
        {/* Unified Header */}
        <header className="p-8 flex justify-between items-center bg-gradient-to-b from-[#0f172a] to-transparent z-10">
          <div>
            <div className="flex items-center gap-3">
               <h1 className="text-3xl font-black text-white tracking-tight uppercase">
                {title}
              </h1>
              <div className="h-1 w-8 bg-red-500 rounded-full mt-1"></div>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mt-2">
              Welcome back, <span className="text-red-500">{userRole}</span> 
              <span className="mx-3 text-slate-800">|</span>
              <span className="text-slate-300">{adminName}</span>
            </p>
          </div>

          <div className="flex items-center gap-6">
            {/* Real-time Clock (Visual Only) */}
            <div className="hidden lg:flex flex-col items-end border-r border-white/5 pr-6">
               <span className="text-xs font-black text-white tracking-widest uppercase">Live System</span>
               <span className="text-[10px] text-emerald-500 font-bold animate-pulse uppercase">● Online</span>
            </div>
            
            {/* Functional Notification Bell */}
            <NotificationBell />
          </div>
        </header>

        {/* Page Content */}
        <main className="px-8 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;