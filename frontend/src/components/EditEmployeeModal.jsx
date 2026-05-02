import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Camera, Loader2, ShieldCheck, Banknote, Clock, CalendarDays, Globe2 } from 'lucide-react';
import api from '../api/axios';

const EditEmployeeModal = ({ isOpen, onClose, onRefresh, employee }) => {
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [departments, setDepartments] = useState([]);
  
  const [formData, setFormData] = useState({
    name: '', employee_id: '', phone: '', email: '', nationality: '',
    designation: '', department: '', salary: 0, food_allowance: 0,
    conveyance: 0, duty_hour: '12', shift_start: '08:00', shift_end: '20:00',
    hiring_date: '', iqama_number: '', iqama_expire: '', 
    blood_group: '', dob: '', emergency_contact: '',
    monthly_paid_leave: ' ',
    has_split_shift: false, 
    break_start: '12:00', // <-- ADDED
    break_end: '18:30',   // <-- ADDED
    image: null
  });

  const IMAGE_BASE_URL = "http://localhost:8000/";

  // --- INITIAL DATA LOAD ---
  useEffect(() => {
    if (employee && isOpen) {
      setFormData({
        id: employee.id,
        name: employee.name || '',
        employee_id: employee.employee_id || '',
        phone: employee.phone || '',
        email: employee.email || '',
        nationality: employee.nationality || '',
        designation: employee.designation || '',
        department: employee.department || '',
        salary: employee.salary || 0,
        food_allowance: employee.food_allowance || 0,
        conveyance: employee.conveyance || 0,
        duty_hour: employee.duty_hour || '12',
        shift_start: employee.shift_start || '',
        shift_end: employee.shift_end || '',
        hiring_date: employee.hiring_date || '',
        iqama_number: employee.iqama_number || '',
        iqama_expire: employee.iqama_expire || '', 
        blood_group: employee.blood_group || '',
        dob: employee.dob || '',
        emergency_contact: employee.emergency_contact || '',
        monthly_paid_leave: employee.monthly_paid_leave || ' ',
        has_split_shift: employee.has_split_shift || false, 
        break_start: employee.break_start || '12:00', // <-- ADDED
        break_end: employee.break_end || '18:30',     // <-- ADDED
        image: null 
      });
      setImagePreview(employee.image_path ? `${IMAGE_BASE_URL}${employee.image_path}` : null);
      
      const loadDepts = async () => {
        try { 
          const res = await api.get('/departments/'); 
          setDepartments(res.data); 
        } catch (e) { console.error("Dept Load Fail:", e); }
      };
      loadDepts();
    }
  }, [employee, isOpen]);

  // --- AUTO-CALCULATION LOGIC (Sync with Add Modal) ---
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



  // useEffect(() => {
  //   if (formData.has_split_shift) return;
  //   if (!formData.shift_start || !formData.shift_end) return;

  //   const [startH, startM] = formData.shift_start.split(':').map(Number);
  //   const [endH, endM] = formData.shift_end.split(':').map(Number);
  //   let startDec = startH + startM / 60;
  //   let endDec = endH + endM / 60;
  //   if (endDec <= startDec) endDec += 24; 
    
  //   const diff = endDec - startDec;
  //   setFormData(prev => ({ 
  //       ...prev, 
  //       duty_hour: diff.toFixed(1),
  //       monthly_paid_leave: (diff * 2).toString() 
  //   }));
  // }, [formData.shift_start, formData.shift_end, formData.has_split_shift]);

  const grossSalary = useMemo(() => {
    return (parseFloat(formData.salary) || 0) + 
           (parseFloat(formData.food_allowance) || 0) + 
           (parseFloat(formData.conveyance) || 0);
  }, [formData.salary, formData.food_allowance, formData.conveyance]);

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
      await api.put(`/admin/users/${employee.id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onRefresh();
      onClose();
    } catch (err) {
      alert(err.response?.data?.detail || "Update failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 bg-[#020617]/95 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full max-w-6xl bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-[0_0_50px_-12px_rgba(59,130,246,0.3)] overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Header: Cyber Design */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <ShieldCheck className="text-blue-500" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white italic tracking-tighter uppercase">Personnel Dossier Editor</h2>
              <p className="text-[10px] text-slate-500 font-bold tracking-[0.3em] uppercase">Modifying: {employee?.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-red-500/20 transition-all"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-8 custom-scrollbar space-y-12">
          
          {/* SECTION 1: CORE IDENTITY */}
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
              <div className="flex items-center gap-2 text-blue-400 text-[11px] font-black uppercase tracking-[0.2em]">
                <Globe2 size={14}/> Core Identity & Bio-Data
              </div>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Profile Upload with Glow */}
              <div className="lg:col-span-3 flex flex-col items-center justify-start pt-2">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                  <div className="relative w-40 h-40 rounded-[2rem] bg-slate-900 border-2 border-white/5 flex items-center justify-center overflow-hidden">
                    {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" /> : <Camera className="text-slate-700" size={32} />}
                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={(e) => {
                      const file = e.target.files[0];
                      if(file) { setFormData({...formData, image: file}); setImagePreview(URL.createObjectURL(file)); }
                    }} />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all">
                        <Camera className="text-white mb-1" size={20} />
                        <span className="text-[9px] text-white font-black uppercase tracking-tighter">Update Image</span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 text-center">
                    <span className="px-4 py-1 bg-blue-500/5 border border-blue-500/10 rounded-full text-[10px] text-blue-400 font-bold uppercase tracking-widest">Employee Portrait</span>
                </div>
              </div>

              {/* Input Grid */}
              <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  { label: 'ZK ID / Employee ID*', name: 'employee_id' },
                  { label: 'Full Name*', name: 'name' },
                  { label: 'Email Address*', name: 'email', type: 'email' },
                  { label: 'Phone Number*', name: 'phone' },
                  { label: 'Iqama Number', name: 'iqama_number' },
                  { label: 'Nationality', name: 'nationality' }
                ].map((field) => (
                  <div key={field.name} className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold tracking-widest">{field.label}</label>
                    <input 
                      required={field.label.includes('*')}
                      type={field.type || 'text'}
                      name={field.name}
                      value={formData[field.name]}
                      onChange={handleChange}
                      className="w-full bg-[#161925] border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all"
                    />
                  </div>
                ))}

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold tracking-widest">Iqama Expiry</label>
                  <input type="date" name="iqama_expire" value={formData.iqama_expire} onChange={handleChange} className="w-full bg-[#161925] border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500 outline-none" />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold tracking-widest">Blood Group</label>
                  <select name="blood_group" value={formData.blood_group} onChange={handleChange} className="w-full bg-[#161925] border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500 outline-none">
                    <option value="">Select</option>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold tracking-widest">Date of Birth</label>
                  <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="w-full bg-[#161925] border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500 outline-none" />
                </div>

                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold tracking-widest">Emergency Contact Details</label>
                  <input name="emergency_contact" placeholder="Name / Relation / Phone" value={formData.emergency_contact} onChange={handleChange} className="w-full bg-[#161925] border border-white/5 rounded-2xl p-4 text-white focus:border-blue-500 outline-none" />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: DEPLOYMENT & LOGISTICS */}
          <div className="space-y-8">
            <div className="flex items-center gap-3">
                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
                <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-black uppercase tracking-[0.2em]">
                    <Clock size={14}/> Operational & Financial Metrics
                </div>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden">
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold">Store / Dept</label>
                <select name="department" value={formData.department} onChange={handleChange} className="w-full bg-[#0f111a] border border-white/10 rounded-xl p-4 text-white">
                  <option value="">Assign Unit</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold">Job Title</label>
                <input name="designation" value={formData.designation} onChange={handleChange} className="w-full bg-[#0f111a] border border-white/10 rounded-xl p-4 text-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold">Shift Start</label>
                <input type="time" name="shift_start" value={formData.shift_start} onChange={handleChange} className="w-full bg-[#0f111a] border border-white/10 rounded-xl p-4 text-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold">Shift End</label>
                <input type="time" name="shift_end" value={formData.shift_end} onChange={handleChange} className="w-full bg-[#0f111a] border border-white/10 rounded-xl p-4 text-white" />
              </div>

              {/* Split Shift Container */}
              <div className="md:col-span-4 flex items-center justify-between bg-white/5 p-5 rounded-2xl border border-white/5">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl transition-colors ${formData.has_split_shift ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                        <Clock size={20} />
                    </div>
                    <div>
                        <label className="text-sm text-white font-black tracking-tight uppercase">Split Shift Logic</label>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Enables 4-punch biometric recording</p>
                    </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="has_split_shift" checked={formData.has_split_shift} onChange={handleChange} className="sr-only peer" />
                  <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600 border border-white/10"></div>
                </label>
              </div>

              {/* <-- ADDED: CONDITIONAL BREAK FIELDS --> */}
              {formData.has_split_shift && (
                <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-blue-400 uppercase ml-2 font-black">Break Start (First Out)</label>
                    <input type="time" name="break_start" value={formData.break_start} onChange={handleChange} className="w-full bg-[#161925] border border-blue-500/20 rounded-2xl p-4 text-white focus:border-blue-500 outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-blue-400 uppercase ml-2 font-black">Break End (Second In)</label>
                    <input type="time" name="break_end" value={formData.break_end} onChange={handleChange} className="w-full bg-[#161925] border border-blue-500/20 rounded-2xl p-4 text-white focus:border-blue-500 outline-none" />
                  </div>
                </div>
              )}

              <div className="space-y-1.5 bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10">
                <label className="text-[9px] text-blue-400 font-black uppercase tracking-widest block text-center mb-1">Daily Duty Hours</label>
                <input 
                  type="number" 
                  name="duty_hour" 
                  value={formData.duty_hour} 
                  onChange={handleChange} 
                  disabled={!formData.has_split_shift} 
                  className={`w-full text-center bg-transparent text-2xl font-black outline-none ${formData.has_split_shift ? 'text-white' : 'text-slate-600'}`}
                />
              </div>

              <div className="space-y-1.5 bg-white/5 p-4 rounded-2xl border border-white/5">
                <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold tracking-widest">
                  Monthly Paid Leave (H)
                </label>
                <input 
                  type="number" 
                  name="monthly_paid_leave" 
                  value={formData.monthly_paid_leave} 
                  onChange={handleChange} 
                  className="w-full bg-[#161925] border border-white/5 rounded-xl p-4 text-white focus:border-blue-500 outline-none transition-all font-black text-xl" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold">Hiring Date</label>
                <input type="date" name="hiring_date" value={formData.hiring_date} onChange={handleChange} className="w-full bg-[#0f111a] border border-white/10 rounded-xl p-4 text-white" />
              </div>

              <div className="space-y-1.5 bg-amber-500/5 p-4 rounded-2xl border border-amber-500/10">
                  <label className="text-[9px] text-amber-500 font-black uppercase tracking-widest block text-center mb-1">Basic Salary</label>
                  <input type="number" name="salary" value={formData.salary} onChange={handleChange} className="w-full text-center bg-transparent text-xl font-black text-white outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold">Food Allowance</label>
                <input type="number" name="food_allowance" value={formData.food_allowance} onChange={handleChange} className="w-full bg-[#0f111a] border border-white/10 rounded-xl p-4 text-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 uppercase ml-2 font-bold">Conveyance</label>
                <input type="number" name="conveyance" value={formData.conveyance} onChange={handleChange} className="w-full bg-[#0f111a] border border-white/10 rounded-xl p-4 text-white" />
              </div>

              <div className="md:col-span-2 bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/20 flex justify-between items-center px-8">
                <div className="flex items-center gap-3">
                    <Banknote className="text-emerald-500" size={24}/>
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Gross Total</span>
                </div>
                <div className="text-3xl font-black text-emerald-400 italic">
                  {grossSalary.toLocaleString()} <span className="text-xs font-bold text-emerald-600">SAR</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-6 pt-6 border-t border-white/5">
            <button type="button" onClick={onClose} className="text-slate-500 font-bold uppercase tracking-widest text-xs hover:text-white transition-colors">Discard Changes</button>
            <button type="submit" disabled={loading} className="group relative bg-blue-600 hover:bg-blue-500 text-white px-20 py-5 rounded-[2rem] font-black flex items-center gap-3 active:scale-95 disabled:opacity-50 transition-all shadow-[0_20px_40px_-12px_rgba(37,99,235,0.3)]">
              {loading ? <Loader2 className="animate-spin" /> : <Save size={20} className="group-hover:rotate-12 transition-transform"/>} 
              <span className="uppercase tracking-tighter text-lg">Commit Dossier Update</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditEmployeeModal;