import React from 'react';
import { Clock, Zap, Wallet, PlusCircle, MinusCircle } from 'lucide-react';

const SalarySlip = ({ payrollData }) => {
  if (!payrollData) return null;

  // Calculate the dynamic standard for this specific employee
  const dynamicStandard = payrollData.duty_hour * 26;

  return (
    <div className="bg-white text-slate-900 p-8 rounded-2xl shadow-2xl w-full max-w-md mx-auto font-sans">
      {/* Header */}
      <div className="border-b-2 border-slate-100 pb-6 mb-6 flex justify-between items-start">
        <div>
          <h3 className="text-2xl font-black tracking-tight text-slate-800">PAYSLIP</h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            {new Date(0, payrollData.month - 1).toLocaleString('en-US', { month: 'long' })} {payrollData.year}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-blue-600 uppercase">AFAM GROUP</p>
          <p className="text-[10px] text-slate-400 font-mono mt-1">{payrollData.employee_id}</p>
        </div>
      </div>

      {/* Employee Info */}
      <div className="mb-8">
        <h4 className="text-sm font-black text-slate-800 mb-1 uppercase">{payrollData.name}</h4>
        <p className="text-[10px] text-slate-500 font-semibold uppercase">
          Standard: {dynamicStandard}h/Month ({payrollData.duty_hour}h Duty x 26 Days)
        </p>
      </div>

      {/* Hours Breakdown */}
      <div className="space-y-3 mb-6">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Clock size={14} />
            <span>Actual Worked Hours</span>
          </div>
          <span className="font-bold">{payrollData.total_actual_hours}h</span>
        </div>

        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <Zap size={14} className="text-emerald-500" />
            <span>Benefit Leave Hours</span>
          </div>
          <span className="font-bold text-emerald-600">+{payrollData.total_benefit_hours}h</span>
        </div>
      </div>

      {/* Financial Breakdown */}
      <div className="border-t border-slate-100 pt-4 space-y-3 mb-8">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <PlusCircle size={14} className="text-blue-500" />
            <span>Base Salary Earned</span>
          </div>
          <span className="font-semibold text-slate-800">SAR {payrollData.gross_salary?.toLocaleString()}</span>
        </div>

        {/* Dynamic Allowances */}
        {payrollData.food_allowance > 0 && (
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 ml-5">Food Allowance</span>
            <span className="text-slate-800">+SAR {payrollData.food_allowance}</span>
          </div>
        )}

        {(payrollData.bonus > 0 || payrollData.other_allowance > 0) && (
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 ml-5">Bonus / Other</span>
            <span className="text-slate-800">+SAR {(payrollData.bonus + payrollData.other_allowance)}</span>
          </div>
        )}

        {/* Deductions */}
        {payrollData.deduction > 0 && (
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <MinusCircle size={14} className="text-red-500" />
              <span>Deductions</span>
            </div>
            <span className="font-bold text-red-600">-SAR {payrollData.deduction}</span>
          </div>
        )}
      </div>

      {/* Net Total Section */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Net Payout</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black">SAR {payrollData.net_salary?.toLocaleString()}</span>
          </div>
          <div className="mt-2 flex items-center gap-1 opacity-50 text-[9px] font-mono">
             <Wallet size={10} /> Rate: {payrollData.hourly_rate_at_time}/hr
          </div>
        </div>
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
      </div>

      <p className="mt-6 text-[9px] text-slate-400 text-center leading-relaxed italic">
        Verified Digital Preview. Final approval required by Admin.
      </p>
    </div>
  );
};

export default SalarySlip;