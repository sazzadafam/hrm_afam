import React, { useState, useEffect, useCallback } from 'react';
import {User, Mail, Phone, MapPin, Briefcase, ShieldCheck, DollarSign, ArrowLeft, Edit, Download, Droplets, HeartPulse, Fingerprint} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import EditEmployeeModal from '../components/EditEmployeeModal'; 

const EmployeeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/users/${id}`); 
      setEmployee(res.data);
    } catch (err) {
      console.error("Dossier fetch error:", err.response?.data || err.message);
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  const handleExportPDF = () => {
    window.print();
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
      <div className="text-slate-500 animate-pulse font-black uppercase tracking-widest text-xs">
        Loading Personnel Dossier...
      </div>
    </div>
  );

  if (!employee) return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-center">
      <div>
        <div className="text-red-500 font-bold italic text-xl mb-4">PERSONNEL RECORD NOT FOUND</div>
        <button onClick={() => navigate('/employees')} className="text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest">
          Return to Dashboard
        </button>
      </div>
    </div>
  );

  const InfoBlock = ({ icon: Icon, label, value, colorClass = "text-white" }) => (
    <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-900/30 border border-white/5">
      <div className="p-2.5 rounded-xl bg-slate-800 border border-white/5 text-slate-400">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 mb-0.5">{label}</p>
        <p className={`text-sm font-bold ${colorClass}`}>{value || "---"}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-8 animate-in fade-in duration-500">
      
      {/* ID CARD PRINT STYLES */}
      <style>{`
        @media print {
          @page { size: auto; margin: 0mm; }
          body { background: white !important; -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-id-card {
            display: block !important;
            width: 85mm;
            height: 125mm;
            margin: 20mm auto;
            border-radius: 15px;
            border: 2px solid #ef4444;
            background: linear-gradient(to bottom, #0f172a 0%, #1e293b 100%) !important;
            color: white !important;
            padding: 20px;
            text-align: center;
            box-shadow: none;
            position: relative;
            overflow: hidden;
          }
          .print-id-card .logo-area { color: #ef4444; font-weight: 900; letter-spacing: 2px; margin-bottom: 15px; font-size: 14px; }
          .print-id-card .avatar { width: 100px; height: 100px; border-radius: 50%; border: 3px solid #ef4444; margin: 0 auto 15px; object-cover: cover; }
          .print-id-card .name { font-size: 20px; font-weight: 900; margin-bottom: 5px; color: white !important; text-transform: uppercase; }
          .print-id-card .title { font-size: 10px; color: #ef4444 !important; font-weight: 800; text-transform: uppercase; margin-bottom: 20px; }
          .print-id-card .details { text-align: left; background: rgba(255,255,255,0.05); border-radius: 10px; padding: 15px; font-size: 11px; }
          .print-id-card .detail-row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; }
          .print-id-card .footer { position: absolute; bottom: 15px; left: 0; width: 100%; font-size: 8px; opacity: 0.6; }
        }
        .print-id-card { display: none; }
      `}</style>

      {/* HIDDEN ID CARD FOR PRINTING */}
      <div className="print-id-card">
        <div className="logo-area uppercase font-black">Company Personnel</div>
        <img 
          src={employee.image_path ? `http://localhost:8000/${employee.image_path}` : `https://ui-avatars.com/api/?name=${employee.name}&background=0f172a&color=ef4444`} 
          alt="ID" className="avatar" 
        />
        <div className="name">{employee.name}</div>
        <div className="title">{employee.designation || 'Staff Member'}</div>
        <div className="details font-mono">
          <div className="detail-row"><span>ID NUMBER:</span> <span>{employee.employee_id}</span></div>
          <div className="detail-row"><span>DEPARTMENT:</span> <span>{employee.department || 'Store'}</span></div>
          <div className="detail-row"><span>BLOOD GRP:</span> <span>{employee.blood_group || 'N/A'}</span></div>
          <div className="detail-row"><span>NATIONALITY:</span> <span>{employee.nationality || 'Saudi Arabia'}</span></div>
        </div>
        <div className="footer uppercase tracking-widest">Official Security Credential</div>
      </div>

      {/* SCREEN UI */}
      <div className="flex justify-between items-center mb-10 no-print">
        <button onClick={() => navigate('/employees')} className="group flex items-center gap-2 text-slate-500 hover:text-white transition-colors">
          <div className="p-2 rounded-full group-hover:bg-slate-800 transition-colors"><ArrowLeft size={20} /></div>
          <span className="text-xs font-black uppercase tracking-widest">Back to List</span>
        </button>

        <div className="flex gap-3">
          <button onClick={handleExportPDF} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-800 text-slate-400 text-xs font-bold hover:bg-white/5 transition-all">
            <Download size={16} /> Export ID Card
          </button>
          <button onClick={() => setShowEditModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ef4444] text-white text-xs font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-900/20">
            <Edit size={16} /> Edit Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8 no-print">
        {/* Left Column (Profile Info) */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-[#1e293b]/40 border border-white/5 rounded-[2.5rem] p-8 text-center relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#ef4444]/10 to-transparent" />
            <div className="relative">
              <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-[#0f172a] mx-auto flex items-center justify-center overflow-hidden mb-6 shadow-xl">
                {employee.image_path ? (
                  <img src={`http://localhost:8000/${employee.image_path}`} alt={employee.name} className="w-full h-full object-cover" />
                ) : (
                  <User size={60} className="text-slate-600" />
                )}
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight leading-none mb-2 uppercase">{employee.name}</h2>
              <p className="text-[#ef4444] font-black uppercase text-[10px] tracking-[0.2em] mb-6 italic">{employee.designation || "Staff Member"}</p>
              
              <div className="flex justify-center gap-2 mb-8">
                <span className={`px-3 py-1 border rounded-full text-[9px] font-black uppercase tracking-widest ${employee.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                  {employee.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-8">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase">Employee ID</p>
                  <p className="text-white font-mono font-bold">{employee.employee_id}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase">Hiring Date</p>
                  <p className="text-white font-bold">{employee.hiring_date ? new Date(employee.hiring_date).toLocaleDateString() : '---'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6 space-y-4">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Medical Profile</h4>
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400"><Droplets size={14} className="text-[#ef4444]" /> Blood Group</div>
              <div className="text-white font-black text-sm">{employee.blood_group || "Not Set"}</div>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400"><HeartPulse size={14} className="text-emerald-500" /> Emergency</div>
              <div className="text-white font-black text-sm">{employee.emergency_contact || "Not Set"}</div>
            </div>
          </div>
        </div>

        {/* Right Column (Details) */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <section>
            <h3 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 mb-4">
              <ShieldCheck size={16} className="text-[#ef4444]" /> Identity & Contact
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoBlock icon={Mail} label="Corporate Email" value={employee.email} />
              <InfoBlock icon={Phone} label="Contact Number" value={employee.phone} />
              <InfoBlock icon={Fingerprint} label="Iqama / ID Number" value={employee.iqama_number} />
              <InfoBlock icon={MapPin} label="Nationality" value={employee.nationality || "Saudi Arabia"} />
            </div>
          </section>

          <section>
            <h3 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 mb-4">
              <Briefcase size={16} className="text-[#ef4444]" /> Employment Dossier
            </h3>
            <div className="bg-[#1e293b]/40 border border-white/5 rounded-3xl overflow-hidden shadow-inner p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Department</p>
                  <p className="text-white font-bold">{employee.department || 'Main Store'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Shift Schedule</p>
                  <p className="text-white font-bold">{employee.shift_start} - {employee.shift_end}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Duty Hours</p>
                  <p className="text-emerald-500 font-black">{employee.duty_hour ? `${employee.duty_hour}h / Day` : "---"}</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2 mb-4">
              <DollarSign size={16} className="text-[#ef4444]" /> Compensation
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/10 rounded-2xl p-6">
                <p className="text-[10px] font-black text-[#ef4444] uppercase tracking-widest mb-1">Gross Salary</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white">{Number(employee.gross_salary || 0).toLocaleString()}</span>
                  <span className="text-xs text-slate-500 font-bold uppercase">SAR</span>
                </div>
              </div>
              <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Iqama Expiry</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white">{employee.iqama_expire || "---" }</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* MODAL CONTROL */}
      <EditEmployeeModal 
        isOpen={showEditModal} 
        employee={employee} 
        onClose={() => setShowEditModal(false)} 
        onRefresh={() => {
          setShowEditModal(false);
          fetchEmployee();
        }} 
      />
    </div>
  );
};

export default EmployeeDetails;