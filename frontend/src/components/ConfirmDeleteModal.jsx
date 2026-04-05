import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

const ConfirmDeleteModal = ({ isOpen, onClose, onConfirm, employeeName }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-white/5">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={18} />
            Confirm Deactivation
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-slate-300 text-sm leading-relaxed">
            Are you sure you want to deactivate <span className="text-white font-bold">{employeeName}</span>?
          </p>
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <p className="text-[12px] text-amber-200/80 italic">
              Note: This will not delete their records. The employee will be moved to the <strong>Archive</strong> and lose system access, but their attendance and salary history will be preserved.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white/5 flex gap-3 justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-orange-900/20 transition-all active:scale-95"
          >
            Deactivate Employee
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;