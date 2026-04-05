import React from 'react';

const PayrollProgress = ({ workedHours = 0, target = 312 }) => {
  // Ensure workedHours is treated as a number even if null is passed
  const safeWorkedHours = workedHours ?? 0;
  
  const percentage = Math.min(Math.round((safeWorkedHours / target) * 100), 100);
  
  const getBarColor = () => {
    if (percentage >= 100) return 'bg-emerald-500'; 
    if (percentage >= 75) return 'bg-blue-500';    
    if (percentage >= 50) return 'bg-amber-500';   
    return 'bg-slate-600';                         
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-end">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
            Monthly Target ({target}h)
          </span>
          <span className="text-sm font-bold text-white">
            {/* FIX: Use safeWorkedHours to prevent .toFixed(1) crash */}
            {Number(safeWorkedHours).toFixed(1)} <span className="text-slate-500 font-normal">/ {target}h</span>
          </span>
        </div>
        <span className={`text-xs font-black ${percentage === 100 ? 'text-emerald-400' : 'text-slate-400'}`}>
          {percentage}%
        </span>
      </div>

      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
        <div 
          className={`h-full ${getBarColor()} transition-all duration-1000 ease-out rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
          style={{ width: `${percentage}%` }}
        />
        <div className="absolute top-0 left-[25%] w-px h-full bg-white/10" />
        <div className="absolute top-0 left-[50%] w-px h-full bg-white/10" />
        <div className="absolute top-0 left-[75%] w-px h-full bg-white/10" />
      </div>
    </div>
  );
};

export default PayrollProgress;