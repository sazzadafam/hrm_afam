import React, { useState, useEffect } from 'react';
import axios from '../api/axios'; // Adjust this path to your axios instance
import { 
  Building2, Wallet, Timer, ShieldCheck, 
  Bell, Save, Globe, LayoutDashboard, 
  Plus, Edit3, Trash2, Check, X, Loader2
} from 'lucide-react';

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('departments');
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 1. Fetch Departments from Backend on load
  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await axios.get('/departments/'); // Matches the backend endpoint
      setDepartments(response.data);
    } catch (error) {
      console.error("Error fetching departments:", error);
    }
  };

  // 2. Add New Department (e.g., Afam Bakery)
  const handleAddDepartment = async () => {
    if (!newDeptName.trim()) return;
    setIsLoading(true);
    try {
      await axios.post('/departments', { name: newDeptName });
      setNewDeptName("");
      fetchDepartments(); // Refresh list
    } catch (error) {
      console.error("Error saving department:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Delete Department
  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this department?")) {
      try {
        await axios.delete(`/departments/${id}`);
        fetchDepartments();
      } catch (error) {
        console.error("Error deleting department:", error);
      }
    }
  };

  const tabs = [
    { id: 'company', label: 'Company Profile', icon: Building2 },
    { id: 'departments', label: 'Store', icon: LayoutDashboard },
    { id: 'payroll', label: 'Payroll & Tax', icon: Wallet },
    { id: 'attendance', label: 'Work Shifts', icon: Timer },
    { id: 'security', label: 'Roles & Security', icon: ShieldCheck },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  const SectionHeader = ({ title, description }) => (
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="text-sm text-slate-400 mt-1">{description}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white"></h1>
        <p className="text-slate-500 mt-1">Configure AFAM Group HRM global parameters.</p>
      </header>

      <div className="flex gap-8">
        {/* LEFT NAV */}
        <aside className="w-64 flex flex-col gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                activeTab === tab.id 
                ? 'bg-[#ef4444] text-white shadow-lg shadow-red-900/20' 
                : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800/50 hover:border-slate-700'
              }`}
            >
              <tab.icon size={18} />
              <span className="font-medium text-sm">{tab.label}</span>
            </button>
          ))}
        </aside>

        {/* RIGHT CONTENT AREA */}
        <main className="flex-1 bg-[#0f172a] rounded-2xl border border-slate-800/50 p-8 shadow-2xl min-h-[600px]">
          
          {/* 1. DEPARTMENTS SECTION */}
          {activeTab === 'departments' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex justify-between items-start">
                <SectionHeader 
                  title="Store Management" 
                  description="Add your stores like Platinum Super Market or Afam Bakery." 
                />
              </div>

              {/* Add New Dept Input Box */}
              <div className="flex gap-2 bg-[#020617] p-4 rounded-xl border border-slate-800">
                <input 
                  type="text" 
                  placeholder="Enter Store/Department Name..."
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-600"
                />
                <button 
                  onClick={handleAddDepartment}
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-[#ef4444] hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                  Add Department
                </button>
              </div>

              {/* List of Departments */}
              <div className="grid grid-cols-1 gap-3">
                {departments.length > 0 ? (
                  departments.map((dept) => (
                    <div key={dept.id} className="group flex items-center justify-between bg-[#020617] p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-[#ef4444] font-bold">
                          {dept.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="text-white font-medium">{dept.name}</h4>
                          <p className="text-[10px] text-slate-200 uppercase tracking-widest">Active Store</p>
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => handleDelete(dept.id)}
                          className="p-2 text-slate-500 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-slate-600 py-10">No departments added yet.</p>
                )}
              </div>
            </div>
          )}

          {/* 2. COMPANY PROFILE (Keep as is) */}
          {activeTab === 'company' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <SectionHeader title="Company Profile" description="General information used for reports and payslips." />
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Organization Name</label>
                  <input type="text" defaultValue="AFAM Group" className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-2.5 focus:border-[#ef4444] outline-none text-white" />
                </div>
                {/* ... other inputs ... */}
              </div>
            </div>
          )}

          {/* 3. ROLES & SECURITY (Keep as is) */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <SectionHeader title="Access Control" description="Restrict access to sensitive employee salary data." />
              {/* Table logic remains the same */}
            </div>
          )}

          {/* SAVE BUTTON FOOTER */}
          <div className="mt-12 pt-6 border-t border-slate-800 flex justify-end">
            <button className="flex items-center gap-2 bg-[#ef4444] hover:bg-red-500 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-red-900/40 active:scale-95">
              <Save size={20} />
              Save Settings
            </button>
          </div>

        </main>
      </div>
    </div>
  );
};

export default SettingsPage;














// import React, { useState } from 'react';
// import { 
//   Building2, Wallet, Timer, ShieldCheck, 
//   Bell, Save, Globe, LayoutDashboard, 
//   Plus, Edit3, Trash2, Users, Check, X
// } from 'lucide-react';

// const SettingsPage = () => {
//   const [activeTab, setActiveTab] = useState('company');

//   // Sidebar Tabs Configuration
//   const tabs = [
//     { id: 'company', label: 'Company Profile', icon: Building2 },
//     { id: 'departments', label: 'Departments', icon: LayoutDashboard },
//     { id: 'payroll', label: 'Payroll & Tax', icon: Wallet },
//     { id: 'attendance', label: 'Work Shifts', icon: Timer },
//     { id: 'security', label: 'Roles & Security', icon: ShieldCheck },
//     { id: 'notifications', label: 'Notifications', icon: Bell },
//   ];

//   /* --- Sub-Components for different views --- */

//   const SectionHeader = ({ title, description }) => (
//     <div className="mb-6">
//       <h2 className="text-xl font-semibold text-white">{title}</h2>
//       <p className="text-sm text-slate-400 mt-1">{description}</p>
//     </div>
//   );

//   return (
//     <div className="min-h-screen bg-[#020617] text-slate-200 p-8">
//       <header className="mb-8">
//         <h1 className="text-3xl font-bold text-white">Settings</h1>
//         <p className="text-slate-500 mt-1">Configure AFAM Group HRM global parameters.</p>
//       </header>

//       <div className="flex gap-8">
//         {/* LEFT NAV */}
//         <aside className="w-64 flex flex-col gap-2">
//           {tabs.map((tab) => (
//             <button
//               key={tab.id}
//               onClick={() => setActiveTab(tab.id)}
//               className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
//                 activeTab === tab.id 
//                 ? 'bg-[#ef4444] text-white shadow-lg shadow-red-900/20' 
//                 : 'bg-[#0f172a] text-slate-400 hover:text-white border border-slate-800/50 hover:border-slate-700'
//               }`}
//             >
//               <tab.icon size={18} />
//               <span className="font-medium text-sm">{tab.label}</span>
//             </button>
//           ))}
//         </aside>

//         {/* RIGHT CONTENT AREA */}
//         <main className="flex-1 bg-[#0f172a] rounded-2xl border border-slate-800/50 p-8 shadow-2xl min-h-[600px]">
          
//           {/* 1. COMPANY PROFILE */}
//           {activeTab === 'company' && (
//             <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
//               <SectionHeader title="Company Profile" description="General information used for reports and payslips." />
//               <div className="grid grid-cols-2 gap-6">
//                 <div className="space-y-2">
//                   <label className="text-xs font-semibold text-slate-500 uppercase">Organization Name</label>
//                   <input type="text" defaultValue="AFAM Group" className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-2.5 focus:border-[#ef4444] outline-none text-white" />
//                 </div>
//                 <div className="space-y-2">
//                   <label className="text-xs font-semibold text-slate-500 uppercase">Tax ID / TRN</label>
//                   <input type="text" placeholder="TRN-445-X" className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-2.5 focus:border-[#ef4444] outline-none text-white" />
//                 </div>
//                 <div className="space-y-2">
//                   <label className="text-xs font-semibold text-slate-500 uppercase">Primary Currency</label>
//                   <select className="w-full bg-[#020617] border border-slate-800 rounded-lg px-4 py-2.5 focus:border-[#ef4444] outline-none text-white">
//                     <option>USD ($)</option>
//                     <option>BDT (৳)</option>
//                     <option>SAR (﷼)</option>
//                   </select>
//                 </div>
//                 <div className="space-y-2">
//                   <label className="text-xs font-semibold text-slate-500 uppercase">Timezone</label>
//                   <div className="flex items-center gap-2 bg-[#020617] border border-slate-800 rounded-lg px-4 py-2.5 text-slate-300">
//                     <Globe size={16} /> <span>GMT +6:00 (Dhaka)</span>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           )}

//           {/* 2. DEPARTMENTS */}
//           {activeTab === 'departments' && (
//             <div className="space-y-6 animate-in fade-in duration-300">
//               <div className="flex justify-between items-start">
//                 <SectionHeader title="Department Management" description="Define and organize your corporate structure." />
//                 <button className="flex items-center gap-2 bg-[#ef4444] hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-red-900/30">
//                   <Plus size={18} /> New Dept
//                 </button>
//               </div>
//               <div className="grid grid-cols-1 gap-3">
//                 {['Information Technology', 'Human Resources', 'Finance & Accounts', 'Operations'].map((dept, i) => (
//                   <div key={i} className="group flex items-center justify-between bg-[#020617] p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-all">
//                     <div className="flex items-center gap-4">
//                       <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-[#ef4444] font-bold">
//                         {dept.charAt(0)}
//                       </div>
//                       <div>
//                         <h4 className="text-white font-medium">{dept}</h4>
//                         <p className="text-[10px] text-slate-500 uppercase tracking-widest">Active Department</p>
//                       </div>
//                     </div>
//                     <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
//                       <button className="p-2 text-slate-500 hover:text-white"><Edit3 size={16} /></button>
//                       <button className="p-2 text-slate-500 hover:text-red-500"><Trash2 size={16} /></button>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </div>
//           )}

//           {/* 3. ROLES & SECURITY (Critical for Salary Privacy) */}
//           {activeTab === 'security' && (
//             <div className="space-y-6 animate-in fade-in duration-300">
//               <SectionHeader title="Access Control" description="Restrict access to sensitive employee salary data." />
//               <div className="rounded-xl border border-slate-800 overflow-hidden bg-[#020617]">
//                 <table className="w-full text-left">
//                   <thead className="bg-slate-900/50 text-[10px] uppercase text-slate-500 font-bold">
//                     <tr>
//                       <th className="p-4">Module</th>
//                       <th className="p-4 text-center">Admin</th>
//                       <th className="p-4 text-center">HR</th>
//                       <th className="p-4 text-center">Employee</th>
//                     </tr>
//                   </thead>
//                   <tbody className="divide-y divide-slate-800/50">
//                     {[
//                       { m: 'Salary Records', a: true, h: true, e: false },
//                       { m: 'Attendance', a: true, h: true, e: true },
//                       { m: 'Bank Details', a: true, h: false, e: false },
//                       { m: 'System Settings', a: true, h: false, e: false },
//                     ].map((row, i) => (
//                       <tr key={i} className="text-sm text-slate-300 hover:bg-white/[0.02]">
//                         <td className="p-4 font-medium">{row.m}</td>
//                         <td className="p-4"><div className="flex justify-center">{row.a ? <Check size={18} className="text-green-500" /> : <X size={18} className="text-slate-700" />}</div></td>
//                         <td className="p-4"><div className="flex justify-center">{row.h ? <Check size={18} className="text-green-500" /> : <X size={18} className="text-slate-700" />}</div></td>
//                         <td className="p-4"><div className="flex justify-center">{row.e ? <Check size={18} className="text-green-500" /> : <X size={18} className="text-slate-700" />}</div></td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>
//             </div>
//           )}

//           {/* SAVE BUTTON FOOTER (Persistent) */}
//           <div className="mt-12 pt-6 border-t border-slate-800 flex justify-end">
//             <button className="flex items-center gap-2 bg-[#ef4444] hover:bg-red-500 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-red-900/40 active:scale-95">
//               <Save size={20} />
//               Save Settings
//             </button>
//           </div>

//         </main>
//       </div>
//     </div>
//   );
// };

// export default SettingsPage;