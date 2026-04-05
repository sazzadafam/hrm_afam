import React, { useState, useEffect, useMemo } from 'react';
import { Search, UserPlus, Archive, Users, Download, Filter } from 'lucide-react';
import EmployeeTable from '../components/EmployeeTable';
import AddEmployeeModal from '../components/AddEmployeeModal';
import PastEmployees from '../components/PastEmployees';
import EditEmployeeModal from '../components/EditEmployeeModal';
import api from '../api/axios';

const EmployeesPage = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState("active");
  const [sortByDept, setSortByDept] = useState("all");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false); 
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/users/');
      setEmployees(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error("Fetch error:", err);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchEmployees(); 
  }, []);

  const handleEditClick = (employee) => {
    setSelectedEmployee(employee);
    setIsEditModalOpen(true);
  };

  //Get Unique Departments for the Sort Dropdown
  const departmentList = useMemo(() => {
    const depts = employees
      .map(emp => emp.department)
      .filter(dept => dept && dept !== "");
    return ["all", ...new Set(depts)];
  }, [employees]);

  //Filter and Sort Logic
  const filteredEmployees = useMemo(() => {
    return employees
      .filter(emp => {
        const matchesSearch = 
          emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
          emp.employee_id?.toString().includes(searchTerm);
        
        const matchesDept = sortByDept === "all" || emp.department === sortByDept;
        const isActive = emp.is_active !== false; 

        return matchesSearch && matchesDept && isActive;
      })
      .sort((a, b) => {
        if (a.department < b.department) return -1;
        if (a.department > b.department) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [employees, searchTerm, sortByDept]);

  const handleDownloadCSV = () => {
    if (employees.length === 0) {
      alert("No data available to download.");
      return;
    }

    const headers = [
      "Employee ID", "Name", "Email", "Phone", "Department", "Designation", "Salary", "Emergency Contact", "Iqama Number"
      ];

    const csvRows = filteredEmployees.map(emp => [
      emp.employee_id || '',
      `"${emp.name || ''}"`,
      `"${emp.email || ''}"`,
      `"${emp.phone || ''}"`,
      `"${emp.department || ''}"`,
      `"${emp.designation || ''}"`,
      emp.salary || 0,
      `"${emp.emergency_contact || ''}"`,
      `"${emp.iqama_number || ''}"`
    ].join(','));

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AFAM_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <section className="space-y-6 animate-in fade-in duration-700">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-white italic tracking-tight"></h1>
            <p className="text-slate-500 text-xs uppercase tracking-widest mt-1">AFAM Employee Management</p>
          </div>
          
          <div className="flex flex-wrap gap-3 w-full lg:w-auto">
            {/* VIEW SWITCHER */}
            <div className="bg-slate-900/50 p-1 rounded-xl border border-white/5 flex">
              <button 
                onClick={() => setView("active")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                  view === "active" ? 'bg-[#167454] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Users size={14} /> Active
              </button>
              <button 
                onClick={() => setView("archived")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                  view === "archived" ? 'bg-red-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Archive size={14} /> Archive
              </button>
            </div>

            {/* DEPARTMENT SORT/FILTER */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select 
                value={sortByDept}
                onChange={(e) => setSortByDept(e.target.value)}
                className="bg-slate-900/60 border border-slate-800 text-sm text-white pl-10 pr-8 py-2.5 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500/50 appearance-none transition-all cursor-pointer"
              >
                <option value="all">All Departments</option>
                {departmentList.filter(d => d !== "all").map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* SEARCH */}
            <div className="relative flex-grow md:flex-grow-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search name or ID..." 
                className="bg-slate-900/60 border border-slate-800 text-sm text-white pl-10 pr-4 py-2.5 rounded-xl outline-none w-full md:w-64 focus:ring-1 focus:ring-[#ef4444]/50 transition-all placeholder:text-slate-600"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* ACTIONS */}
            <button 
              onClick={handleDownloadCSV}
              disabled={loading || employees.length === 0}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 border border-white/5 transition-all active:scale-95 disabled:opacity-50 text-xs"
            >
              <Download size={16} /> Export
            </button>

            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-[#137049] hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95 text-xs"
            >
              <UserPlus size={18} /> New Employee
            </button>
          </div>
        </div>

        {/* MAIN TABLE AREA */}
        <div className="bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
          {view === "active" ? (
            <EmployeeTable 
              employees={filteredEmployees} 
              loading={loading} 
              onRefresh={fetchEmployees}
              onEdit={handleEditClick} // Pass the edit handler to the table
            />
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
              <PastEmployees onRefresh={fetchEmployees} />
            </div>
          )}
        </div>

        {/* Add Employee Modal */}
        <AddEmployeeModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onRefresh={fetchEmployees} 
        />

        {/* Edit Employee Modal */}
        <EditEmployeeModal 
          isOpen={isEditModalOpen} 
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedEmployee(null);
          }} 
          onRefresh={fetchEmployees}
          employee={selectedEmployee}
        />
      </section>
    </>
  );
};

export default EmployeesPage;