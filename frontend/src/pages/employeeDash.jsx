import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Send, User, Bell, Clock, LogOut, FileText } from 'lucide-react';

const EmployeeDash = () => {
  const [activeTab, setActiveTab] = useState('attendance');
  const [user, setUser] = useState({ name: "Loading...", role: "Employee" });

  useEffect(() => {
    // Fetch User Profile on Load
    const fetchProfile = async () => {
      try {
        const res = await axios.get('http://localhost:8000/api/v1/employee/me', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setUser(res.data);
      } catch (err) { console.error("Profile fetch failed"); }
    };
    fetchProfile();
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-white flex flex-col shadow-2xl">
        <div className="p-8 text-2xl font-black tracking-tight border-b border-slate-800">
          AFAM <span className="text-blue-500">HRM</span>
        </div>
        <nav className="flex-1 p-6 space-y-3">
          <TabButton icon={<Clock size={20}/>} label="Attendance" active={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')} />
          <TabButton icon={<Send size={20}/>} label="Leave Request" active={activeTab === 'leave'} onClick={() => setActiveTab('leave')} />
          <TabButton icon={<Bell size={20}/>} label="Events" active={activeTab === 'events'} onClick={() => setActiveTab('events')} />
          <TabButton icon={<User size={20}/>} label="My Profile" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
        </nav>
        <div className="p-6 border-t border-slate-800">
          <button className="flex items-center space-x-3 text-slate-400 hover:text-red-400 transition w-full">
            <LogOut size={20}/> <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-10">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 capitalize tracking-tight">{activeTab}</h1>
            <p className="text-slate-500 text-sm mt-1">Welcome back, {user.full_name || 'User'}</p>
          </div>
          <div className="flex items-center space-x-4 bg-white p-2 pr-5 rounded-full shadow-sm border border-slate-200">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              {user.full_name?.charAt(0) || 'U'}
            </div>
            <div>
                <p className="text-sm font-bold text-slate-800 leading-none">{user.full_name}</p>
                <p className="text-xs text-slate-400 uppercase font-semibold mt-1">{user.role}</p>
            </div>
          </div>
        </header>

        <section className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100 min-h-[600px]">
          {activeTab === 'attendance' && <AttendanceView />}
          {activeTab === 'leave' && <LeaveRequestForm />}
          {activeTab === 'profile' && <ProfileView user={user} />}
          {activeTab === 'events' && <EventsView />}
        </section>
      </main>
    </div>
  );
};

const TabButton = ({ icon, label, active, onClick }) => (
  <button onClick={onClick} className={`w-full flex items-center space-x-4 p-4 rounded-xl transition-all duration-200 ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
    {icon} <span className="font-semibold">{label}</span>
  </button>
);

const LeaveRequestForm = () => {
    const [formData, setFormData] = useState({ leave_type: 'Casual', start_date: '', end_date: '', reason: '' });
    const [file, setFile] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const data = new FormData();
        Object.keys(formData).forEach(key => data.append(key, formData[key]));
        if (file) data.append('medical_report', file);

        try {
            await axios.post('http://localhost:8000/api/v1/employee/leave/request', data, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            alert("Request Submitted Successfully!");
        } catch (err) { alert(err.response?.data?.detail || "Error"); }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
            <div className="grid grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Leave Type</label>
                    <select className="w-full border-slate-200 border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50" 
                            onChange={e => setFormData({...formData, leave_type: e.target.value})}>
                        <option>Casual</option><option>Sick</option><option>Medical</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Start Date</label>
                    <input type="date" required className="w-full border-slate-200 border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
                           onChange={e => setFormData({...formData, start_date: e.target.value})} />
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Reason</label>
                <textarea className="w-full border-slate-200 border rounded-xl p-3 h-32 focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
                          onChange={e => setFormData({...formData, reason: e.target.value})}></textarea>
            </div>
            {formData.leave_type === 'Medical' && (
                <div className="p-4 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50">
                    <label className="flex items-center space-x-2 text-blue-700 font-bold mb-2"><FileText size={18}/> <span>Upload Medical Report (Required)</span></label>
                    <input type="file" onChange={e => setFile(e.target.files[0])} className="text-sm text-slate-500" />
                </div>
            )}
            <button type="submit" className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200">Submit Request</button>
        </form>
    );
};

const AttendanceView = () => (
    <div className="overflow-x-auto">
        <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-slate-800">Monthly Log</h2>
            <input type="month" className="border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <table className="w-full text-left">
            <thead>
                <tr className="text-slate-400 text-xs uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-4">Date</th><th className="pb-4">Clock In</th><th className="pb-4">Clock Out</th><th className="pb-4">Status</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {[1, 2, 3].map(d => (
                    <tr key={d} className="group hover:bg-slate-50 transition">
                        <td className="py-5 font-medium text-slate-700">April 0{d}, 2026</td>
                        <td className="py-5 text-slate-600 font-mono">08:5{d} AM</td>
                        <td className="py-5 text-slate-600 font-mono">06:0{d} PM</td>
                        <td className="py-5"><span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold italic">Present</span></td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const ProfileView = ({ user }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        <div className="md:col-span-1 bg-slate-50 rounded-3xl p-8 flex flex-col items-center text-center">
            <div className="w-32 h-32 bg-white rounded-full shadow-md flex items-center justify-center text-4xl text-blue-600 font-black border-4 border-white mb-4">
                {user.full_name?.charAt(0)}
            </div>
            <h3 className="text-xl font-bold text-slate-800">{user.full_name}</h3>
            <p className="text-blue-500 font-medium mb-6">{user.role}</p>
        </div>
        <div className="md:col-span-2 space-y-8">
            <div className="grid grid-cols-2 gap-8">
                <div><p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Email Address</p><p className="text-slate-800 font-medium">{user.email}</p></div>
                <div><p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Employee ID</p><p className="text-slate-800 font-medium">{user.id || 'N/A'}</p></div>
                <div><p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Department</p><p className="text-slate-800 font-medium">{user.department || 'Management'}</p></div>
                <div><p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Join Date</p><p className="text-slate-800 font-medium">Jan 12, 2024</p></div>
            </div>
        </div>
    </div>
);

const EventsView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl border-2 border-slate-100 bg-white hover:border-blue-200 transition group">
            <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition"><Calendar size={24}/></div>
                <span className="text-xs font-bold text-slate-400">MAY 15, 2026</span>
            </div>
            <h4 className="text-lg font-bold text-slate-800">Annual General Meeting</h4>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed">Reviewing the yearly performance for AFAM Supermarkets and Hotels.</p>
        </div>
    </div>
);

export default EmployeeDash;