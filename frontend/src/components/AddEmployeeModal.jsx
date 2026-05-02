import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Camera, Loader2, Clock, Banknote, ShieldCheck, Contact2, Briefcase } from 'lucide-react';
import api from '../api/axios';

const INITIAL_STATE = {
  employee_id: '',
  name: '',
  email: '',
  phone: '',
  iqama_number: '',
  nationality: '',
  blood_group: '',
  dob: '',
  password: '',
  emergency_contact: '',
  department: '', 
  designation: '',
  shift_start: '08:00',
  shift_end: '20:00',
  duty_hour: '12',
  break_start: '12:00', // <-- ADDED
  break_end: '18:30',   // <-- ADDED
  salary: '0', 
  food_allowance: '0',
  conveyance: '0',
  monthly_paid_leave: '24',
  iqama_expire: '',
  hiring_date: '',
  has_split_shift: false, 
  image: null
};

const AddEmployeeModal = ({ isOpen, onClose, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [formData, setFormData] = useState(INITIAL_STATE);
  const [departments, setDepartments] = useState([]);

  // --- DUTY HOUR AUTO-CALCULATION ---
// --- SMARTER DUTY HOUR AUTO-CALCULATION ---
  useEffect(() => {
    if (!formData.shift_start || !formData.shift_end) return;

    // Helper function to convert "HH:MM" to a decimal number
    const parseTime = (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return h + (m / 60);
    };

    let startDec = parseTime(formData.shift_start);
    let endDec = parseTime(formData.shift_end);
    
    // Handle overnight main shift (e.g., 8 PM to 6 AM)
    if (endDec <= startDec) endDec += 24; 
    
    let totalSpan = endDec - startDec;
    let netHours = totalSpan;

    // If split shift is ON, calculate the break duration and subtract it
    if (formData.has_split_shift && formData.break_start && formData.break_end) {
      let bStart = parseTime(formData.break_start);
      let bEnd = parseTime(formData.break_end);
      
      // Handle overnight break
      if (bEnd <= bStart) bEnd += 24;
      
      let breakDuration = bEnd - bStart;
      netHours = totalSpan - breakDuration;
    }

    // Ensure we don't end up with negative hours if the inputs are weird
    const finalHours = Math.max(0, netHours);

    setFormData(prev => ({ 
        ...prev, 
        duty_hour: finalHours.toFixed(1),
        monthly_paid_leave: (finalHours * 2).toString() 
    }));
  }, [
    formData.shift_start, 
    formData.shift_end, 
    formData.has_split_shift, 
    formData.break_start, 
    formData.break_end
  ]);

  const grossSalary = useMemo(() => {
    return parseFloat(formData.salary || 0) + parseFloat(formData.food_allowance || 0) + parseFloat(formData.conveyance || 0);
  }, [formData.salary, formData.food_allowance, formData.conveyance]);

  useEffect(() => {
    if (isOpen) {
      setFormData(INITIAL_STATE);
      setImagePreview(null);
      const loadDepts = async () => {
        try { const res = await api.get('/departments'); setDepartments(res.data); } catch (e) { console.error(e); }
      };
      loadDepts();
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const data = new FormData();
    
    Object.keys(formData).forEach(key => { 
        if (key === 'image') {
            if (formData.image) data.append('image', formData.image);
        } else if (key === 'has_split_shift') {
            data.append(key, formData[key] ? 'true' : 'false');
        } else if (formData[key] !== null && formData[key] !== '') {
            data.append(key, formData[key]); 
        }
    });
    data.append('gross_salary', grossSalary);

    try {
      await api.post('/admin/users/', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      onRefresh(); onClose();
    } catch (err) { alert(err.response?.data?.detail || "Unique ID required or Server Error"); } 
    finally { setLoading(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-6xl bg-[#0f111a] border border-white/5 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-3 text-white">
            <ShieldCheck className="text-blue-500" size={20} />
            <h2 className="text-xl font-bold tracking-tight">New Employee Enrollment</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={24}/></button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="overflow-y-auto p-8 custom-scrollbar space-y-10">
          
          {/* 1. BASIC & IDENTITY */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-blue-400 text-[11px] font-bold uppercase tracking-[0.2em]">
              <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div> BASIC & IDENTITY
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-3 flex flex-col items-center justify-center bg-white/5 rounded-2xl p-4 border border-white/5">
                <div className="relative w-28 h-28 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center overflow-hidden">
                  {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <Camera className="text-slate-500" />}
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const file = e.target.files[0]; if(file) { setFormData({...formData, image: file}); setImagePreview(URL.createObjectURL(file)); }}} />
                </div>
                <span className="text-[9px] text-slate-500 mt-3 font-bold uppercase tracking-widest">UPLOAD PROFILE</span>
              </div>

              <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Employee ID (ZK ID)*</label>
                  <input required name="employee_id" autoComplete="off" value={formData.employee_id} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Full Name*</label>
                  <input required name="name" value={formData.name} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Employee Email*</label>
                  <input required type="email" name="email" autoComplete="off" value={formData.email} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Phone Number*</label>
                  <input required name="phone" value={formData.phone} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Iqama Number</label>
                  <input name="iqama_number" value={formData.iqama_number} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Nationality</label>
                  <input name="nationality" value={formData.nationality} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Blood Group</label>
                  <select name="blood_group" value={formData.blood_group} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white">
                    <option value="">Select</option>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Date of Birth</label>
                  <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Portal Password*</label>
                  <input required type="password" name="password" autoComplete="new-password" value={formData.password} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1">Emergency Contact (Name / Relation / Phone Number)</label>
                  <input name="emergency_contact" value={formData.emergency_contact} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* 2. JOB & PAYROLL */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-bold uppercase tracking-[0.2em]">
              <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div> JOB & PAYROLL
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-white/5 p-6 rounded-3xl border border-white/5">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Select Store (Department)</label>
                <select required name="department" value={formData.department} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white">
                  <option value="">Select Store</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Designation</label>
                <input name="designation" value={formData.designation} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Shift Start</label>
                <input type="time" name="shift_start" value={formData.shift_start} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Shift End</label>
                <input type="time" name="shift_end" value={formData.shift_end} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>

              {/* --- SPLIT SHIFT TOGGLE UI --- */}
              <div className="md:col-span-4 flex items-center justify-between bg-[#1a1d2b] p-4 rounded-xl border border-white/10">
                <div>
                  <label className="text-sm text-white font-bold tracking-wider flex items-center gap-2">
                    Enable Split Shift Schedule
                  </label>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                    Applies 4-Punch Logic & unlocks manual duty hour entry
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    name="has_split_shift" 
                    checked={formData.has_split_shift} 
                    onChange={handleChange} 
                    className="sr-only peer" 
                  />
                  <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-500 border border-white/10"></div>
                </label>
              </div>

              {/* --- CONDITIONAL SPLIT SHIFT BREAK TIMES --- */}
              {formData.has_split_shift && (
                <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase ml-1">Break Start (First Out)</label>
                    <input type="time" name="break_start" value={formData.break_start} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase ml-1">Break End (Second In)</label>
                    <input type="time" name="break_end" value={formData.break_end} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
                  </div>
                </div>
              )}

              <div className="bg-[#0a0c14] p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                <span className="text-[9px] text-blue-500 font-bold uppercase mb-1">DUTY HOURS</span>
                <input 
                  type="number" 
                  step="0.5"
                  name="duty_hour" 
                  value={formData.duty_hour} 
                  onChange={handleChange} 
                  disabled={!formData.has_split_shift} 
                  className={`w-full bg-transparent border-b ${formData.has_split_shift ? 'border-blue-500 text-white' : 'border-transparent text-slate-400'} text-lg font-black outline-none transition-colors`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Basic Salary (SAR)</label>
                <input type="number" name="salary" value={formData.salary} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Food Allowance</label>
                <input type="number" name="food_allowance" value={formData.food_allowance} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Conveyance</label>
                <input type="number" name="conveyance" value={formData.conveyance} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>
              
              <div className="md:col-span-4 bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 flex justify-between items-center">
                <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2"><Banknote size={16}/> TOTAL GROSS SALARY</span>
                <div className="text-2xl font-black text-emerald-400">{grossSalary.toLocaleString()} <span className="text-xs">SAR</span></div>
              </div>
            </div>
          </div>

          {/* 3. OTHER DATA */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-amber-500 text-[11px] font-bold uppercase tracking-[0.2em]">
              <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div> OTHER DATA
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Monthly Paid Leave (Hours)</label>
                <input type="number" name="monthly_paid_leave" value={formData.monthly_paid_leave} onChange={handleChange} className="bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white w-full" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Iqama Expiry Date</label>
                <input type="date" name="iqama_expire" value={formData.iqama_expire} onChange={handleChange} className="bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white w-full" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1">Hiring Date</label>
                <input type="date" name="hiring_date" value={formData.hiring_date} onChange={handleChange} className="bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white w-full" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-6 border-t border-white/5">
            <button type="button" onClick={onClose} className="px-8 py-3 text-slate-500 font-bold hover:text-white transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-3 rounded-2xl font-black flex items-center gap-2 active:scale-95 disabled:opacity-50 transition-all">
              {loading ? <Loader2 className="animate-spin" /> : <Save size={18}/>} SAVE EMPLOYEE
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEmployeeModal;










// import React, { useState, useEffect, useMemo } from 'react';
// import { X, Save, Camera, Loader2, Clock, Banknote, ShieldCheck, Contact2, Briefcase } from 'lucide-react';
// import api from '../api/axios';

// const INITIAL_STATE = {
//   employee_id: '',
//   name: '',
//   email: '',
//   phone: '',
//   iqama_number: '',
//   nationality: '',
//   blood_group: '',
//   dob: '',
//   password: '',
//   emergency_contact: '',
//   department: '', 
//   designation: '',
//   shift_start: '08:00',
//   shift_end: '20:00',
//   duty_hour: '12',
//   salary: '0', 
//   food_allowance: '0',
//   conveyance: '0',
//   monthly_paid_leave: '24',
//   iqama_expire: '',
//   hiring_date: '',
//   has_split_shift: false, // <-- ADDED
//   image: null
// };

// const AddEmployeeModal = ({ isOpen, onClose, onRefresh }) => {
//   const [loading, setLoading] = useState(false);
//   const [imagePreview, setImagePreview] = useState(null);
//   const [formData, setFormData] = useState(INITIAL_STATE);
//   const [departments, setDepartments] = useState([]);

//   // --- DUTY HOUR AUTO-CALCULATION ---
//   useEffect(() => {
//     // FIX: If it is a split shift, stop auto-calculating! Let admin type it manually.
//     if (formData.has_split_shift) return;

//     if (!formData.shift_start || !formData.shift_end) return;
//     const [startH, startM] = formData.shift_start.split(':').map(Number);
//     const [endH, endM] = formData.shift_end.split(':').map(Number);
    
//     let startDec = startH + startM / 60;
//     let endDec = endH + endM / 60;
    
//     if (endDec <= startDec) endDec += 24; 
    
//     const diff = endDec - startDec;
//     setFormData(prev => ({ 
//         ...prev, 
//         duty_hour: diff.toFixed(1), 
//         monthly_paid_leave: (diff * 2).toString() 
//     }));
//   }, [formData.shift_start, formData.shift_end, formData.has_split_shift]);

//   const grossSalary = useMemo(() => {
//     return parseFloat(formData.salary || 0) + parseFloat(formData.food_allowance || 0) + parseFloat(formData.conveyance || 0);
//   }, [formData.salary, formData.food_allowance, formData.conveyance]);

//   useEffect(() => {
//     if (isOpen) {
//       setFormData(INITIAL_STATE);
//       setImagePreview(null);
//       const loadDepts = async () => {
//         try { const res = await api.get('/departments'); setDepartments(res.data); } catch (e) { console.error(e); }
//       };
//       loadDepts();
//     }
//   }, [isOpen]);

//   // --- UPDATED TO SUPPORT CHECKBOXES ---
//   const handleChange = (e) => {
//     const { name, value, type, checked } = e.target;
//     setFormData(prev => ({ 
//       ...prev, 
//       [name]: type === 'checkbox' ? checked : value 
//     }));
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setLoading(true);
//     const data = new FormData();
    
//     // --- UPDATED FORMDATA TO HANDLE BOOLEAN PROPERLY ---
//     Object.keys(formData).forEach(key => { 
//         if (key === 'image') {
//             if (formData.image) data.append('image', formData.image);
//         } else if (key === 'has_split_shift') {
//             data.append(key, formData[key] ? 'true' : 'false');
//         } else if (formData[key] !== null && formData[key] !== '') {
//             data.append(key, formData[key]); 
//         }
//     });
//     data.append('gross_salary', grossSalary);

//     try {
//       await api.post('/admin/users/', data, { headers: { 'Content-Type': 'multipart/form-data' } });
//       onRefresh(); onClose();
//     } catch (err) { alert(err.response?.data?.detail || "Unique ID required or Server Error"); } 
//     finally { setLoading(false); }
//   };

//   if (!isOpen) return null;

//   return (
//     <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
//       <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose} />
//       <div className="relative w-full max-w-6xl bg-[#0f111a] border border-white/5 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
//         <div className="p-6 border-b border-white/5 flex justify-between items-center">
//           <div className="flex items-center gap-3 text-white">
//             <ShieldCheck className="text-blue-500" size={20} />
//             <h2 className="text-xl font-bold tracking-tight">New Employee Enrollment</h2>
//           </div>
//           <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={24}/></button>
//         </div>

//         <form onSubmit={handleSubmit} autoComplete="off" className="overflow-y-auto p-8 custom-scrollbar space-y-10">
          
//           {/* 1. BASIC & IDENTITY */}
//           <div className="space-y-6">
//             <div className="flex items-center gap-2 text-blue-400 text-[11px] font-bold uppercase tracking-[0.2em]">
//               <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div> BASIC & IDENTITY
//             </div>
//             <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
//               <div className="lg:col-span-3 flex flex-col items-center justify-center bg-white/5 rounded-2xl p-4 border border-white/5">
//                 <div className="relative w-28 h-28 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center overflow-hidden">
//                   {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <Camera className="text-slate-500" />}
//                   <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const file = e.target.files[0]; if(file) { setFormData({...formData, image: file}); setImagePreview(URL.createObjectURL(file)); }}} />
//                 </div>
//                 <span className="text-[9px] text-slate-500 mt-3 font-bold uppercase tracking-widest">UPLOAD PROFILE</span>
//               </div>

//               <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-3 gap-4">
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Employee ID (ZK ID)*</label>
//                   <input required name="employee_id" autoComplete="off" value={formData.employee_id} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
//                 </div>
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Full Name*</label>
//                   <input required name="name" value={formData.name} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
//                 </div>
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Employee Email*</label>
//                   <input required type="email" name="email" autoComplete="off" value={formData.email} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
//                 </div>
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Phone Number*</label>
//                   <input required name="phone" value={formData.phone} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
//                 </div>
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Iqama Number</label>
//                   <input name="iqama_number" value={formData.iqama_number} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//                 </div>
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Nationality</label>
//                   <input name="nationality" value={formData.nationality} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//                 </div>
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Blood Group</label>
//                   <select name="blood_group" value={formData.blood_group} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white">
//                     <option value="">Select</option>
//                     {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
//                   </select>
//                 </div>
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Date of Birth</label>
//                   <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//                 </div>
//                 <div className="space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Portal Password*</label>
//                   <input required type="password" name="password" autoComplete="new-password" value={formData.password} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//                 </div>
//                 <div className="md:col-span-3 space-y-1">
//                   <label className="text-[10px] text-slate-500 uppercase ml-1">Emergency Contact (Name / Relation / Phone Number)</label>
//                   <input name="emergency_contact" value={formData.emergency_contact} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//                 </div>
//               </div>
//             </div>
//           </div>

//           {/* 2. JOB & PAYROLL */}
//           <div className="space-y-6">
//             <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-bold uppercase tracking-[0.2em]">
//               <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div> JOB & PAYROLL
//             </div>
//             <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-white/5 p-6 rounded-3xl border border-white/5">
//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Select Store (Department)</label>
//                 <select required name="department" value={formData.department} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white">
//                   <option value="">Select Store</option>
//                   {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
//                 </select>
//               </div>
//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Designation</label>
//                 <input name="designation" value={formData.designation} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//               </div>
//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Shift Start</label>
//                 <input type="time" name="shift_start" value={formData.shift_start} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//               </div>
//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Shift End</label>
//                 <input type="time" name="shift_end" value={formData.shift_end} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//               </div>

//               {/* --- SPLIT SHIFT TOGGLE UI --- */}
//               <div className="md:col-span-4 flex items-center justify-between bg-[#1a1d2b] p-4 rounded-xl border border-white/10">
//                 <div>
//                   <label className="text-sm text-white font-bold tracking-wider flex items-center gap-2">
//                     Enable Split Shift Schedule
//                   </label>
//                   <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
//                     Applies 4-Punch Logic & unlocks manual duty hour entry
//                   </p>
//                 </div>
//                 <label className="relative inline-flex items-center cursor-pointer">
//                   <input 
//                     type="checkbox" 
//                     name="has_split_shift" 
//                     checked={formData.has_split_shift} 
//                     onChange={handleChange} 
//                     className="sr-only peer" 
//                   />
//                   <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-500 border border-white/10"></div>
//                 </label>
//               </div>

//               <div className="bg-[#0a0c14] p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
//                 <span className="text-[9px] text-blue-500 font-bold uppercase mb-1">DUTY HOURS</span>
//                 <input 
//                   type="number" 
//                   name="duty_hour" 
//                   value={formData.duty_hour} 
//                   onChange={handleChange} 
//                   disabled={!formData.has_split_shift} // Only editable if split shift is on
//                   className={`w-full bg-transparent border-b ${formData.has_split_shift ? 'border-blue-500 text-white' : 'border-transparent text-slate-400'} text-lg font-black outline-none transition-colors`}
//                 />
//               </div>

//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Basic Salary (SAR)</label>
//                 <input type="number" name="salary" value={formData.salary} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//               </div>
//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Food Allowance</label>
//                 <input type="number" name="food_allowance" value={formData.food_allowance} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//               </div>
//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Conveyance</label>
//                 <input type="number" name="conveyance" value={formData.conveyance} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
//               </div>
              
//               <div className="md:col-span-4 bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20 flex justify-between items-center">
//                 <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2"><Banknote size={16}/> TOTAL GROSS SALARY</span>
//                 <div className="text-2xl font-black text-emerald-400">{grossSalary.toLocaleString()} <span className="text-xs">SAR</span></div>
//               </div>
//             </div>
//           </div>

//           {/* 3. OTHER DATA */}
//           <div className="space-y-6">
//             <div className="flex items-center gap-2 text-amber-500 text-[11px] font-bold uppercase tracking-[0.2em]">
//               <div className="w-1.5 h-4 bg-amber-500 rounded-full"></div> OTHER DATA
//             </div>
//             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Monthly Paid Leave (Hours)</label>
//                 <input type="number" name="monthly_paid_leave" value={formData.monthly_paid_leave} onChange={handleChange} className="bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white w-full" />
//               </div>
//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Iqama Expiry Date</label>
//                 <input type="date" name="iqama_expire" value={formData.iqama_expire} onChange={handleChange} className="bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white w-full" />
//               </div>
//               <div className="space-y-1">
//                 <label className="text-[10px] text-slate-500 uppercase ml-1">Hiring Date</label>
//                 <input type="date" name="hiring_date" value={formData.hiring_date} onChange={handleChange} className="bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white w-full" />
//               </div>
//             </div>
//           </div>

//           <div className="flex justify-end gap-4 pt-6 border-t border-white/5">
//             <button type="button" onClick={onClose} className="px-8 py-3 text-slate-500 font-bold hover:text-white transition-colors">Cancel</button>
//             <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-3 rounded-2xl font-black flex items-center gap-2 active:scale-95 disabled:opacity-50 transition-all">
//               {loading ? <Loader2 className="animate-spin" /> : <Save size={18}/>} SAVE EMPLOYEE
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// };

// export default AddEmployeeModal;