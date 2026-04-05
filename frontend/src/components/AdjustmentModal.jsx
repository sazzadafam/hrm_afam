import React, { useState } from 'react';
import api from '../api/axios';
import { X, Save } from 'lucide-react';

const AdjustmentModal = ({ payroll, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    food: payroll.food_allowance || 0,
    other: payroll.other_allowance || 0,
    bonus: payroll.bonus || 0,
    deduction: payroll.deduction || 0
  });

  const handleSubmit = async () => {
    try {
      // Endpoint matches the @router.put("/update-adjustments/{payroll_id}") we created
      await api.put(`/admin/payroll/update-adjustments/${payroll.id}`, null, {
        params: formData
      });
      alert("Payroll adjusted successfully!");
      onSave(); // Refresh the list
      onClose();
    } catch (err) {
      alert("Failed to update adjustments.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-white/5">
          <h3 className="text-xl font-bold text-white">Adjust Payroll: {payroll.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
        </div>
        
        <div className="p-6 space-y-4">
          {['food', 'other', 'bonus', 'deduction'].map((field) => (
            <div key={field}>
              <label className="text-xs font-black uppercase text-slate-500 mb-1 block">
                {field.replace('_', ' ')} (SAR)
              </label>
              <input 
                type="number"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500"
                value={formData[field]}
                onChange={(e) => setFormData({...formData, [field]: parseFloat(e.target.value) || 0})}
              />
            </div>
          ))}
        </div>

        <div className="p-6 bg-white/5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-slate-400 font-bold">Cancel</button>
          <button 
            onClick={handleSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <Save size={18}/> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdjustmentModal;