import React from "react";
import { Clock, Zap, Wallet, PlusCircle, MinusCircle, AlertTriangle } from "lucide-react";

const fmt = (n, decimals = 2) =>
  (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const SalarySlip = ({ payrollData }) => {
  if (!payrollData) return null;

  const {
    name                    = "—",
    employee_id             = "—",
    month                   = 1,
    year                    = new Date().getFullYear(),
    base_salary             = 0,
    duty_hour               = 0,
    standard_monthly_hours  = 0,
    total_actual_hours      = 0,
    total_benefit_hours     = 0,
    penalty_deduction_hours = 0,
    final_billable_hours    = 0,
    hourly_rate_at_time     = 0,
    gross_salary            = 0,
    food_allowance          = 0,
    other_allowance         = 0,
    bonus                   = 0,
    deduction               = 0,
    net_salary              = 0,
    late_count              = 0,
    early_leave_count       = 0,
    status                  = "draft",
  } = payrollData;

  const monthName = new Date(0, month - 1).toLocaleString("en-US", { month: "long" });
  const totalInfractions = late_count + early_leave_count;
  const gracedUsed = Math.min(totalInfractions, 4);
  const triggered  = Math.max(0, totalInfractions - 4);

  const Row = ({ icon, label, value, color = "text-slate-700", sub }) => (
    <div className="flex justify-between items-center text-xs py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <div>
          <span>{label}</span>
          {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );

  return (
    <div className="bg-white text-slate-900 p-7 rounded-2xl shadow-2xl w-full font-sans">

      {/* Header */}
      <div className="border-b-2 border-slate-100 pb-5 mb-5 flex justify-between items-start">
        <div>
          <h3 className="text-xl font-black tracking-tight text-slate-800">PAYSLIP</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            {monthName} {year}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-blue-600 uppercase">AFAM GROUP</p>
          <p className="text-[9px] text-slate-400 font-mono mt-0.5">{employee_id}</p>
          {status === "locked" && (
            <span className="inline-block mt-1 text-[8px] font-black uppercase px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
              Locked
            </span>
          )}
        </div>
      </div>

      {/* Employee info */}
      <div className="bg-slate-50 rounded-xl p-4 mb-5">
        <p className="text-sm font-black text-slate-800 mb-1">{name}</p>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Base Salary: <span className="font-bold text-slate-700">SAR {fmt(base_salary)}</span>
          &nbsp;·&nbsp;
          Duty: <span className="font-bold text-slate-700">{duty_hour}h/day</span>
          &nbsp;·&nbsp;
          Standard: <span className="font-bold text-slate-700">{standard_monthly_hours || duty_hour * 26}h/month</span>
        </p>
      </div>

      {/* Hours breakdown */}
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Hours Summary</p>
        <Row icon={<Clock size={12} />}      label="Actual Worked Hours"        value={`${fmt(total_actual_hours, 1)}h`} />
        <Row icon={<Zap size={12} className="text-emerald-500" />}
                                              label="Paid Leave / Benefit Hours"  value={`+${fmt(total_benefit_hours, 1)}h`}    color="text-emerald-600" />
        {penalty_deduction_hours > 0 && (
          <Row icon={<MinusCircle size={12} className="text-rose-500" />}
                                              label="Penalty Deduction"            value={`-${fmt(penalty_deduction_hours, 1)}h`} color="text-rose-600"
               sub={`${triggered} triggered (${gracedUsed} of ${totalInfractions} infractions graced)`} />
        )}
        <Row icon={<Clock size={12} className="text-blue-500" />}
                                              label="Final Billable Hours"         value={`${fmt(final_billable_hours, 1)}h`}    color="text-blue-700" />
      </div>

      {/* Financial breakdown */}
      <div className="border-t border-slate-100 pt-4 mb-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Earnings & Deductions</p>
        <Row icon={<PlusCircle size={12} className="text-slate-400" />}
             label="Gross Salary Earned"
             sub={`${fmt(final_billable_hours, 1)}h × SAR ${(hourly_rate_at_time ?? 0).toFixed(4)}/hr`}
             value={`SAR ${fmt(gross_salary)}`} />

        {food_allowance > 0 && (
          <Row icon={<PlusCircle size={12} className="text-emerald-500" />}
               label="Food Allowance"  value={`+SAR ${fmt(food_allowance)}`} color="text-emerald-600" />
        )}

        {(bonus > 0 || other_allowance > 0) && (
          <Row icon={<PlusCircle size={12} className="text-emerald-500" />}
               label="Bonus / Other Allowance" value={`+SAR ${fmt(bonus + other_allowance)}`} color="text-emerald-600" />
        )}

        {deduction > 0 && (
          <Row icon={<MinusCircle size={12} className="text-rose-500" />}
               label="Deductions" value={`-SAR ${fmt(deduction)}`} color="text-rose-600" />
        )}

        {totalInfractions > 0 && (
          <div className="flex items-start gap-2 mt-2 text-[9px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <AlertTriangle size={10} className="shrink-0 mt-0.5" />
            <span>
              {totalInfractions} infraction{totalInfractions !== 1 ? "s" : ""} ({late_count} late, {early_leave_count} early leave).&nbsp;
              {gracedUsed} graced, {triggered} triggered penalty.
            </span>
          </div>
        )}
      </div>

      {/* Net salary */}
      <div className="bg-slate-900 rounded-2xl p-5 text-white relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Net Payout</p>
          <p className="text-3xl font-black">SAR {fmt(net_salary)}</p>
          <p className="mt-1.5 flex items-center gap-1 text-[9px] text-slate-400 font-mono">
            <Wallet size={9} /> SAR {(hourly_rate_at_time ?? 0).toFixed(4)}/hr
          </p>
        </div>
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl" />
      </div>

      <p className="mt-5 text-[8px] text-slate-400 text-center italic leading-relaxed">
        System-generated preview. Final approval required by authorized administrator.
      </p>
    </div>
  );
};

export default SalarySlip;




















// import React from 'react';
// import { Clock, Zap, Wallet, PlusCircle, MinusCircle } from 'lucide-react';

// const SalarySlip = ({ payrollData }) => {
//   if (!payrollData) return null;

//   const dynamicStandard = payrollData.duty_hour * 26;

//   return (
//     <div className="bg-white text-slate-900 p-8 rounded-2xl shadow-2xl w-full max-w-md mx-auto font-sans">
//       {/* Header */}
//       <div className="border-b-2 border-slate-100 pb-6 mb-6 flex justify-between items-start">
//         <div>
//           <h3 className="text-2xl font-black tracking-tight text-slate-800">PAYSLIP</h3>
//           <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
//             {new Date(0, payrollData.month - 1).toLocaleString('en-US', { month: 'long' })} {payrollData.year}
//           </p>
//         </div>
//         <div className="text-right">
//           <p className="text-[10px] font-black text-blue-600 uppercase">AFAM GROUP</p>
//           <p className="text-[10px] text-slate-400 font-mono mt-1">{payrollData.employee_id}</p>
//         </div>
//       </div>

//       {/* Employee Info */}
//       <div className="mb-8">
//         <h4 className="text-sm font-black text-slate-800 mb-1 uppercase">{payrollData.name}</h4>
//         <p className="text-[10px] text-slate-500 font-semibold uppercase">
//           Base Salary: SAR {payrollData.base_salary?.toLocaleString()} | Standard: {dynamicStandard}h/Month ({payrollData.duty_hour}h Duty)
//         </p>
//       </div>

//       {/* Hours Breakdown */}
//       <div className="space-y-3 mb-6">
//         <div className="flex justify-between items-center text-xs">
//           <div className="flex items-center gap-2 text-slate-500">
//             <Clock size={14} />
//             <span>Actual Worked Hours</span>
//           </div>
//           <span className="font-bold">{payrollData.total_actual_hours}h</span>
//         </div>

//         <div className="flex justify-between items-center text-xs">
//           <div className="flex items-center gap-2 text-slate-500">
//             <Zap size={14} className="text-emerald-500" />
//             <span>Benefit Leave Hours</span>
//           </div>
//           <span className="font-bold text-emerald-600">+{payrollData.total_benefit_hours}h</span>
//         </div>
//       </div>

//       {/* Financial Breakdown */}
//       <div className="border-t border-slate-100 pt-4 space-y-3 mb-8">
//         <div className="flex justify-between items-center text-xs">
//           <div className="flex items-center gap-2 text-slate-500">
//             <PlusCircle size={14} className="text-blue-500" />
//             <span>Gross Salary Earned</span>
//           </div>
//           <span className="font-semibold text-slate-800">SAR {payrollData.gross_salary?.toLocaleString()}</span>
//         </div>

//         {/* Dynamic Allowances */}
//         {payrollData.food_allowance > 0 && (
//           <div className="flex justify-between items-center text-xs">
//             <span className="text-slate-500 ml-5">Food Allowance</span>
//             <span className="text-slate-800">+SAR {payrollData.food_allowance}</span>
//           </div>
//         )}

//         {(payrollData.bonus > 0 || payrollData.other_allowance > 0) && (
//           <div className="flex justify-between items-center text-xs">
//             <span className="text-slate-500 ml-5">Bonus / Other</span>
//             <span className="text-slate-800">+SAR {(payrollData.bonus + payrollData.other_allowance)}</span>
//           </div>
//         )}

//         {/* Deductions */}
//         {payrollData.deduction > 0 && (
//           <div className="flex justify-between items-center text-xs">
//             <div className="flex items-center gap-2 text-slate-500">
//               <MinusCircle size={14} className="text-red-500" />
//               <span>Deductions</span>
//             </div>
//             <span className="font-bold text-red-600">-SAR {payrollData.deduction}</span>
//           </div>
//         )}
//       </div>

//       {/* Net Total Section */}
//       <div className="bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
//         <div className="relative z-10">
//           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Net Payout</p>
//           <div className="flex items-baseline gap-2">
//             <span className="text-3xl font-black">SAR {payrollData.net_salary?.toLocaleString()}</span>
//           </div>
//           <div className="mt-2 flex items-center gap-1 opacity-50 text-[9px] font-mono">
//              <Wallet size={10} /> Rate: {payrollData.hourly_rate_at_time}/hr
//           </div>
//         </div>
//         <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
//       </div>

//       <p className="mt-6 text-[9px] text-slate-400 text-center leading-relaxed italic">
//         Verified Digital Preview. Final approval required by Admin.
//       </p>
//     </div>
//   );
// };

// export default SalarySlip;