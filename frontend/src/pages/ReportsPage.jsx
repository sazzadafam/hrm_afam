import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { Search } from 'lucide-react';

const ReportsPage = () => {
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const month = new Date().getMonth() + 1; // Current month
  const year = new Date().getFullYear();   // Current year

  // Fetch raw attendance logs
  useEffect(() => {
    api.get(`/admin/attendance/logs?month=${month}&year=${year}`)
      .then(res => setLogs(res.data))
      .catch(err => console.error(err));
  }, [month, year]);

  // Extract unique employees
  const employeesMap = {};
  logs.forEach(log => {
    if (!employeesMap[log.employee_id]) {
      employeesMap[log.employee_id] = {
        employee_id: log.employee_id,
        name: log.name || 'Unknown'
      };
    }
  });
  const employees = Object.values(employeesMap);

  // Generate days of the month
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Filter employees by search
  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.employee_id.includes(searchTerm)
  );

  // Group logs by employee and date
  const logsByEmpDate = {};
  logs.forEach(log => {
    const empId = log.employee_id;
    const dateKey = log.timestamp.split(' ')[0]; // 'YYYY-MM-DD'
    if (!logsByEmpDate[empId]) logsByEmpDate[empId] = {};
    if (!logsByEmpDate[empId][dateKey]) logsByEmpDate[empId][dateKey] = [];
    logsByEmpDate[empId][dateKey].push(log);
  });

  return (
    <div className="p-8 bg-[#0f172a] min-h-screen text-slate-200">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Employee Attendance Logs</h1>
          <p className="text-slate-400 text-sm">Showing IN/OUT logs from ZKTeco machine or manual entries</p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
          <input
            type="text"
            placeholder="Search employee..."
            className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 pl-10 pr-4 outline-none focus:border-blue-500"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Attendance Table */}
      <div className="overflow-auto bg-slate-900/50 border border-white/5 rounded-2xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/5 font-bold uppercase text-slate-400 sticky top-0">
            <tr>
              <th className="p-2 sticky left-0 bg-slate-900 z-10">Employee</th>
              {dates.map(day => (
                <th key={day} className="p-2 text-center">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredEmployees.map(emp => (
              <tr key={emp.employee_id} className="hover:bg-white/5 transition-colors">
                {/* Employee Name */}
                <td className="p-2 sticky left-0 bg-slate-900 z-10 font-bold">{emp.name}</td>

                {/* Attendance per day */}
                {dates.map(day => {
                  const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                  const dayLogs = logsByEmpDate[emp.employee_id]?.[dateKey] || [];
                  return (
                    <td key={day} className="p-2 text-center align-top">
                      {dayLogs.map(log => (
                        <div
                          key={log.id}
                          className={`text-[10px] ${log.type === 'IN' ? 'text-green-400' : 'text-red-400'}`}
                        >
                          {log.type}: {log.timestamp.split(' ')[1].slice(0,5)} ({log.source})
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportsPage;