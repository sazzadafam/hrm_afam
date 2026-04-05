import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Camera, Loader2, ShieldCheck, Banknote, CalendarDays } from 'lucide-react';
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
    image: null
  });

  const IMAGE_BASE_URL = "http://localhost:8000/";

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
        shift_start: employee.shift_start || '08:00',
        shift_end: employee.shift_end || '20:00',
        hiring_date: employee.hiring_date || '',
        iqama_number: employee.iqama_number || '',
        iqama_expire: employee.iqama_expire || '', 
        blood_group: employee.blood_group || '',
        dob: employee.dob || '',
        emergency_contact: employee.emergency_contact || '',
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

  // Automatic Duty Hour Calculation
  useEffect(() => {
    if (!formData.shift_start || !formData.shift_end) return;
    const [startH, startM] = formData.shift_start.split(':').map(Number);
    const [endH, endM] = formData.shift_end.split(':').map(Number);
    let startDec = startH + startM / 60;
    let endDec = endH + endM / 60;
    if (endDec <= startDec) endDec += 24; 
    setFormData(prev => ({ ...prev, duty_hour: (endDec - startDec).toFixed(1) }));
  }, [formData.shift_start, formData.shift_end]);

  const grossSalary = useMemo(() => {
    return (parseFloat(formData.salary) || 0) + 
           (parseFloat(formData.food_allowance) || 0) + 
           (parseFloat(formData.conveyance) || 0);
  }, [formData.salary, formData.food_allowance, formData.conveyance]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const data = new FormData();
    
    Object.keys(formData).forEach(key => {
      if (key === 'image') {
        if (formData.image) data.append('image', formData.image);
      } else {
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-6xl bg-[#0f111a] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-3 text-white">
            <ShieldCheck className="text-blue-500" size={20} />
            <h2 className="text-xl font-bold italic tracking-tight uppercase">Update Personnel Dossier: {employee?.name}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-8 custom-scrollbar space-y-10">
          
          {/* SECTION 1: IDENTITY */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-blue-400 text-[11px] font-black uppercase tracking-[0.2em]">
              <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div> Core Identity & Bio-Data
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-3 flex flex-col items-center justify-center bg-white/5 rounded-3xl p-6 border border-white/5 h-fit">
                <div className="relative w-32 h-32 rounded-3xl bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center overflow-hidden group">
                  {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" /> : <Camera className="text-slate-500" />}
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={(e) => {
                    const file = e.target.files[0];
                    if(file) { setFormData({...formData, image: file}); setImagePreview(URL.createObjectURL(file)); }
                  }} />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] text-white font-bold uppercase">Change Photo</div>
                </div>
                <span className="text-[9px] text-slate-500 mt-4 font-black uppercase tracking-widest">Employee Portrait</span>
              </div>

              <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'ZK ID / Employee ID*', name: 'employee_id' },
                  { label: 'Full Name*', name: 'name' },
                  { label: 'Email Address*', name: 'email', type: 'email' },
                  { label: 'Phone Number*', name: 'phone' },
                  { label: 'Iqama Number', name: 'iqama_number' },
                  { label: 'Nationality', name: 'nationality' }
                ].map((field) => (
                  <div key={field.name} className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold tracking-wider">{field.label}</label>
                    <input 
                      required={field.label.includes('*')}
                      type={field.type || 'text'}
                      name={field.name}
                      value={formData[field.name]}
                      onChange={handleChange}
                      className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                ))}

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold tracking-wider">Iqama Expiry Date</label>
                  <div className="relative">
                    <input type="date" name="iqama_expire" value={formData.iqama_expire} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold tracking-wider">Blood Group</label>
                  <select name="blood_group" value={formData.blood_group} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none">
                    <option value="">Select Group</option>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold tracking-wider">Date of Birth</label>
                  <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
                </div>

                <div className="md:col-span-3 space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold tracking-wider">Emergency Contact (Person / Relation / Phone)</label>
                  <input name="emergency_contact" value={formData.emergency_contact} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-black uppercase tracking-[0.2em]">
              <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div> Deployment & Financials
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-white/5 p-6 rounded-[2rem] border border-white/5">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold">Store / Department</label>
                <select name="department" value={formData.department} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none">
                  <option value="">Assign Store</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold">Designation</label>
                <input name="designation" value={formData.designation} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold">Shift Start</label>
                <input type="time" name="shift_start" value={formData.shift_start} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold">Shift End</label>
                <input type="time" name="shift_end" value={formData.shift_end} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>

              <div className="bg-blue-500/10 p-4 rounded-2xl border border-blue-500/20 flex flex-col justify-center text-center">
                <span className="text-[9px] text-blue-500 font-black tracking-widest uppercase">Calc Duty Hours</span>
                <span className="text-xl font-black text-white">{formData.duty_hour} <span className="text-xs text-slate-500 tracking-normal">HRS/DAY</span></span>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold">Basic Salary (SAR)</label>
                <input type="number" name="salary" value={formData.salary} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold">Food Allowance</label>
                <input type="number" name="food_allowance" value={formData.food_allowance} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase ml-1 font-bold">Conveyance</label>
                <input type="number" name="conveyance" value={formData.conveyance} onChange={handleChange} className="w-full bg-[#1a1d2b] border border-white/10 rounded-xl p-3 text-white" />
              </div>

              <div className="md:col-span-4 bg-emerald-500/10 p-5 rounded-3xl border border-emerald-500/20 flex justify-between items-center px-10">
                <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-3">
                  <Banknote className="text-emerald-500" size={20}/> Adjusted Gross Salary
                </span>
                <div className="text-3xl font-black text-emerald-400 italic">
                  {grossSalary.toLocaleString()} <span className="text-sm font-bold text-emerald-600">SAR</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-6 pt-6 border-t border-white/5">
            <button type="button" onClick={onClose} className="text-slate-500 font-bold uppercase tracking-widest text-xs hover:text-white transition-colors">Abort Changes</button>
            <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white px-16 py-4 rounded-2xl font-black flex items-center gap-3 active:scale-95 disabled:opacity-50 transition-all shadow-xl shadow-blue-600/20 uppercase tracking-tighter">
              {loading ? <Loader2 className="animate-spin" /> : <Save size={18}/>} Commit Dossier Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditEmployeeModal;