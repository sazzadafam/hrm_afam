import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { X, Save, User, Calendar, LogIn, LogOut, AlertCircle, Search } from 'lucide-react';

const ManualEntryModal = ({ isOpen, onClose, onRefresh }) => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // State for the custom searchable dropdown
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [formData, setFormData] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    check_in: '', 
    check_out: '' 
  });

  useEffect(() => {
    if (isOpen) {
      const fetchEmployees = async () => {
        try {
          const response = await api.get('/admin/users/');
          const activeOnes = response.data.filter(emp => emp.is_active !== false);
          setEmployees(activeOnes);
        } catch (err) {
          console.error("Failed to load employees", err);
          setEmployees([]); 
        }
      };
      fetchEmployees();
    }
  }, [isOpen]);

  // HYPER-STRICT FILTER: Only matches exact visible text
  const filteredEmployees = employees.filter(emp => {
    // If the search bar is empty, show everyone
    if (!searchQuery) return true;

    // Force query to lowercase string and remove whitespace
    const query = String(searchQuery).toLowerCase().trim();
    
    // Force visible fields to strings (prevents crashes and hidden data matches)
    const visibleName = String(emp.name || '').toLowerCase();
    const visibleId = String(emp.employee_id || '').toLowerCase();

    // Only return true if the typed query is physically inside the name or ID
    return visibleName.includes(query) || visibleId.includes(query);
  });

  const handleSelectEmployee = (emp) => {
    setFormData({ ...formData, employee_id: emp.employee_id });
    // Display the selected person's name in the search box
    setSearchQuery(`${emp.name || 'Unknown'} (ID: ${emp.employee_id || 'N/A'})`);
    setIsDropdownOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.employee_id) {
      alert("Please search and select a staff member from the list.");
      return;
    }

    if (!formData.check_in && !formData.check_out) {
      alert("Please provide at least a Check-In or a Check-Out time.");
      return;
    }

    setLoading(true);
    try {
      let check_in_iso = null;
      let check_out_iso = null;

      if (formData.check_in) {
        check_in_iso = `${formData.date}T${formData.check_in}:00`;
      }
      
      if (formData.check_out) {
        let checkOutDate = formData.date;
        if (formData.check_in && formData.check_out < formData.check_in) {
          const dateObj = new Date(formData.date);
          dateObj.setDate(dateObj.getDate() + 1);
          checkOutDate = dateObj.toISOString().split('T')[0];
        }
        check_out_iso = `${checkOutDate}T${formData.check_out}:00`;
      }

      const payload = {
        employee_id: formData.employee_id,
        check_in: check_in_iso,
        check_out: check_out_iso
      };

      await api.post('/admin/actions/attendance/manual', payload);
      
      setFormData({ 
        employee_id: '', 
        date: new Date().toISOString().split('T')[0], 
        check_in: '', 
        check_out: '' 
      });
      setSearchQuery('');
      setIsDropdownOpen(false);

      onRefresh(); 
      onClose();   
    } catch (err) {
      console.error("Manual Entry Error:", err);
      alert("Error saving log: " + (err.response?.data?.detail || "Server error"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputStyle = "w-full bg-[#0b1220] border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-[#167454] focus:ring-1 focus:ring-[#167454]/20 transition-all [color-scheme:dark]";
  const labelStyle = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2 ml-1";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-[#1e293b] border border-white/5 rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden shadow-emerald-900/10">
        
        <div className="flex justify-between items-center p-8 border-b border-white/5 bg-white/[0.01]">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-3 italic">
              Attendance<span className="text-[#167454]">Correction</span>
            </h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Manual Biometric Sync</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors bg-slate-800/50 p-2 rounded-full">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-visible">
          
          {/* Custom Searchable Dropdown Section */}
          <div className="relative">
            <label className={labelStyle}><User size={14} className="text-slate-400" /> Staff Member</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or ID..."
                className={`${inputStyle} pl-10`}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                  // Clear selected ID if they edit the search string
                  if (formData.employee_id) {
                    setFormData({ ...formData, employee_id: '' });
                  }
                }}
                onFocus={() => setIsDropdownOpen(true)}
                onBlur={() => setIsDropdownOpen(false)}
              />
            </div>

            {/* Dropdown Options */}
            {isDropdownOpen && (
              <div className="absolute z-50 w-full mt-2 bg-[#0b1220] border border-white/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((emp) => (
                    <div
                      key={emp.employee_id || Math.random()} 
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevents input onBlur from firing first
                        handleSelectEmployee(emp);
                      }}
                      className="p-3 text-sm text-slate-300 hover:bg-[#167454]/20 hover:text-white cursor-pointer transition-colors border-b border-white/5 last:border-0"
                    >
                      <div className="font-semibold">{emp.name || 'Unknown User'}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {emp.department || 'No Department'} 
                        {emp.employee_id ? ` • ID: ${emp.employee_id}` : ''}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-sm text-slate-500 text-center italic">
                    No matching employees found
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className={labelStyle}><Calendar size={14} className="text-slate-400" /> Duty Date</label>
            <input
              type="date"
              required
              className={inputStyle}
              value={formData.date}
              onChange={(e) => setFormData({...formData, date: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelStyle}><LogIn size={14} className="text-emerald-500" /> Manual In</label>
              <input
                type="time"
                className={inputStyle.replace('focus:border-[#167454]', 'focus:border-emerald-500')}
                value={formData.check_in}
                onChange={(e) => setFormData({...formData, check_in: e.target.value})}
              />
            </div>
            <div>
              <label className={labelStyle}><LogOut size={14} className="text-rose-500" /> Manual Out</label>
              <input
                type="time"
                className={inputStyle.replace('focus:border-[#167454]', 'focus:border-rose-500')}
                value={formData.check_out}
                onChange={(e) => setFormData({...formData, check_out: e.target.value})}
              />
            </div>
          </div>

          <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
              This will overwrite or create a duty session for the selected date. Ensure times align with the employee's assigned shift.
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#167454] hover:bg-emerald-600 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
            >
              {loading ? "Processing..." : <><Save size={16} /> Sync Attendance</>}
            </button>
            <button 
              type="button"
              onClick={onClose}
              className="w-full py-3 text-slate-500 hover:text-slate-300 font-bold text-[10px] uppercase tracking-[0.2em] transition-colors"
            >
              Dismiss
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualEntryModal;










// import React, { useState, useEffect } from 'react';
// import api from '../api/axios';
// import { X, Save, User, Calendar, LogIn, LogOut, AlertCircle, Search } from 'lucide-react';

// const ManualEntryModal = ({ isOpen, onClose, onRefresh }) => {
//   const [employees, setEmployees] = useState([]);
//   const [loading, setLoading] = useState(false);
  
//   // New state for the custom searchable dropdown
//   const [searchQuery, setSearchQuery] = useState('');
//   const [isDropdownOpen, setIsDropdownOpen] = useState(false);

//   const [formData, setFormData] = useState({
//     employee_id: '',
//     date: new Date().toISOString().split('T')[0],
//     check_in: '', 
//     check_out: '' 
//   });

//   useEffect(() => {
//     if (isOpen) {
//       const fetchEmployees = async () => {
//         try {
//           const response = await api.get('/admin/users/');
//           const activeOnes = response.data.filter(emp => emp.is_active !== false);
//           setEmployees(activeOnes);
//         } catch (err) {
//           console.error("Failed to load employees", err);
//           setEmployees([]); 
//         }
//       };
//       fetchEmployees();
//     }
//   }, [isOpen]);

// // Filter employees strictly by visible name or ID
//   const filteredEmployees = employees.filter(emp => {
//     // Safely convert values to strings to prevent crashes with numeric IDs
//     const name = String(emp.name || '').toLowerCase();
//     const id = String(emp.employee_id || '').toLowerCase();
//     const query = searchQuery.toLowerCase().trim();

//     // Only return true if the query is in the visible name or ID
//     return name.includes(query) || id.includes(query);
//   });

//   // Handle selecting an employee from the custom dropdown
//   const handleSelectEmployee = (emp) => {
//     setFormData({ ...formData, employee_id: emp.employee_id });
//     setSearchQuery(`${emp.name || emp.employee_id} — ${emp.department}`);
//     setIsDropdownOpen(false);
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
    
//     if (!formData.employee_id) {
//       alert("Please search and select a staff member from the list.");
//       return;
//     }

//     if (!formData.check_in && !formData.check_out) {
//       alert("Please provide at least a Check-In or a Check-Out time.");
//       return;
//     }

//     setLoading(true);
//     try {
//       let check_in_iso = null;
//       let check_out_iso = null;

//       if (formData.check_in) {
//         check_in_iso = `${formData.date}T${formData.check_in}:00`;
//       }
      
//       if (formData.check_out) {
//         let checkOutDate = formData.date;
//         if (formData.check_in && formData.check_out < formData.check_in) {
//           const dateObj = new Date(formData.date);
//           dateObj.setDate(dateObj.getDate() + 1);
//           checkOutDate = dateObj.toISOString().split('T')[0];
//         }
//         check_out_iso = `${checkOutDate}T${formData.check_out}:00`;
//       }

//       const payload = {
//         employee_id: formData.employee_id,
//         check_in: check_in_iso,
//         check_out: check_out_iso
//       };

//       await api.post('/admin/actions/attendance/manual', payload);
      
//       // Reset form on success
//       setFormData({ 
//         employee_id: '', 
//         date: new Date().toISOString().split('T')[0], 
//         check_in: '', 
//         check_out: '' 
//       });
//       setSearchQuery('');
//       setIsDropdownOpen(false);

//       onRefresh(); 
//       onClose();   
//     } catch (err) {
//       console.error("Manual Entry Error:", err);
//       alert("Error saving log: " + (err.response?.data?.detail || "Server error"));
//     } finally {
//       setLoading(false);
//     }
//   };

//   if (!isOpen) return null;

//   const inputStyle = "w-full bg-[#0b1220] border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-[#167454] focus:ring-1 focus:ring-[#167454]/20 transition-all [color-scheme:dark]";
//   const labelStyle = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2 ml-1";

//   return (
//     <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
//       <div className="bg-[#1e293b] border border-white/5 rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden shadow-emerald-900/10">
        
//         <div className="flex justify-between items-center p-8 border-b border-white/5 bg-white/[0.01]">
//           <div>
//             <h2 className="text-xl font-black text-white flex items-center gap-3 italic">
//               Attendance<span className="text-[#167454]">Correction</span>
//             </h2>
//             <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Manual Biometric Sync</p>
//           </div>
//           <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors bg-slate-800/50 p-2 rounded-full">
//             <X size={20} />
//           </button>
//         </div>

//         <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-visible">
          
//           {/* Custom Searchable Dropdown Section */}
//           <div className="relative">
//             <label className={labelStyle}><User size={14} className="text-slate-400" /> Staff Member</label>
//             <div className="relative">
//               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
//               <input
//                 type="text"
//                 placeholder="Search by name or ID..."
//                 className={`${inputStyle} pl-10`}
//                 value={searchQuery}
//                 onChange={(e) => {
//                   setSearchQuery(e.target.value);
//                   setIsDropdownOpen(true);
//                   // Clear selected ID if they start typing something else
//                   if (formData.employee_id) {
//                     setFormData({ ...formData, employee_id: '' });
//                   }
//                 }}
//                 onFocus={() => setIsDropdownOpen(true)}
//                 onBlur={() => setIsDropdownOpen(false)}
//               />
//             </div>

//             {/* Dropdown Options */}
//             {isDropdownOpen && (
//               <div className="absolute z-50 w-full mt-2 bg-[#0b1220] border border-white/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
//                 {filteredEmployees.length > 0 ? (
//                   filteredEmployees.map((emp) => (
//                     <div
//                       key={emp.employee_id}
//                       // Use onMouseDown instead of onClick so it fires before the input's onBlur event
//                       onMouseDown={(e) => {
//                         e.preventDefault();
//                         handleSelectEmployee(emp);
//                       }}
//                       className="p-3 text-sm text-slate-300 hover:bg-[#167454]/20 hover:text-white cursor-pointer transition-colors border-b border-white/5 last:border-0"
//                     >
//                       <div className="font-semibold">{emp.name || emp.employee_id}</div>
//                       <div className="text-xs text-slate-500 mt-0.5">{emp.department} • ID: {emp.employee_id}</div>
//                     </div>
//                   ))
//                 ) : (
//                   <div className="p-4 text-sm text-slate-500 text-center italic">
//                     No matching employees found
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>

//           <div>
//             <label className={labelStyle}><Calendar size={14} className="text-slate-400" /> Duty Date</label>
//             <input
//               type="date"
//               required
//               className={inputStyle}
//               value={formData.date}
//               onChange={(e) => setFormData({...formData, date: e.target.value})}
//             />
//           </div>

//           <div className="grid grid-cols-2 gap-4">
//             <div>
//               <label className={labelStyle}><LogIn size={14} className="text-emerald-500" /> Manual In</label>
//               <input
//                 type="time"
//                 className={inputStyle.replace('focus:border-[#167454]', 'focus:border-emerald-500')}
//                 value={formData.check_in}
//                 onChange={(e) => setFormData({...formData, check_in: e.target.value})}
//               />
//             </div>
//             <div>
//               <label className={labelStyle}><LogOut size={14} className="text-rose-500" /> Manual Out</label>
//               <input
//                 type="time"
//                 className={inputStyle.replace('focus:border-[#167454]', 'focus:border-rose-500')}
//                 value={formData.check_out}
//                 onChange={(e) => setFormData({...formData, check_out: e.target.value})}
//               />
//             </div>
//           </div>

//           <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-3">
//             <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
//             <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
//               This will overwrite or create a duty session for the selected date. Ensure times align with the employee's assigned shift.
//             </p>
//           </div>

//           <div className="flex flex-col gap-3 pt-2">
//             <button
//               type="submit"
//               disabled={loading}
//               className="w-full bg-[#167454] hover:bg-emerald-600 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 active:scale-95 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
//             >
//               {loading ? "Processing..." : <><Save size={16} /> Sync Attendance</>}
//             </button>
//             <button 
//               type="button"
//               onClick={onClose}
//               className="w-full py-3 text-slate-500 hover:text-slate-300 font-bold text-[10px] uppercase tracking-[0.2em] transition-colors"
//             >
//               Dismiss
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// };

// export default ManualEntryModal;