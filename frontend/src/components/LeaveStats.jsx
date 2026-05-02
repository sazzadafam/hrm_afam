import React from 'react';
import { Briefcase, HeartPulse, AlertTriangle } from 'lucide-react';

const StatCard = ({ label, count, color, icon: Icon }) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
    <div className={`p-3 rounded-xl ${color}`}>
      <Icon size={20} />
    </div>
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-lg font-black text-slate-800">{count}</p>
    </div>
  </div>
);

const LeaveStats = ({ summary }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <StatCard label="Annual Leave" count={summary.annual || 0} color="bg-blue-50 text-blue-600" icon={Briefcase} />
      <StatCard label="Sick Leave" count={summary.sick || 0} color="bg-emerald-50 text-emerald-600" icon={HeartPulse} />
      <StatCard label="Used This Year" count={summary.used || 0} color="bg-rose-50 text-rose-600" icon={AlertTriangle} />
    </div>
  );
};

export default LeaveStats;