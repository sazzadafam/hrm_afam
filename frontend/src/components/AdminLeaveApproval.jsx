import React, { useState, useEffect } from "react";
import api from "../api/axios";
import { 
  CheckCircle, XCircle, Eye, FileText, 
  Search, Filter, AlertCircle, Clock 
} from "lucide-react";

const AdminLeaveApproval = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Endpoint should return merged Leave + User/Employee data
      const res = await api.get(`/admin/leave/${filter}`);
      setRequests(res.data || []);
    } catch (err) {
      console.error("Failed to fetch leave requests", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, status) => {
    try {
      await api.patch(`/admin/leave/${id}/approve`, { status });
      // Refresh list after action
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert("Action failed: " + err.response?.data?.detail);
    }
  };

  const filteredData = requests.filter(req => 
    req.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.leave_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Leave Approvals</h2>
          <p className="text-slate-500 text-sm">Review and manage employee leave applications</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Search employee..."
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 outline-none"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Employee</th>
              <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Type & Duration</th>
              <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Reason</th>
              <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Document</th>
              <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan="5" className="p-20 text-center"><div className="inline-block w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div></td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan="5" className="p-20 text-center text-slate-400 font-medium">No requests found.</td></tr>
            ) : filteredData.map((req) => (
              <tr key={req.id} className="hover:bg-slate-50/50 transition">
                <td className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                      {req.user?.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{req.user?.name}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">ID: {req.user?.employee_id || "N/A"}</p>
                    </div>
                  </div>
                </td>
                <td className="p-5">
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${req.leave_type === 'Medical' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                    {req.leave_type}
                  </span>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    {new Date(req.start_date).toLocaleDateString('en-GB')} - {new Date(req.end_date).toLocaleDateString('en-GB')}
                  </p>
                </td>
                <td className="p-5">
                  <p className="text-xs text-slate-500 max-w-[200px] truncate" title={req.reason}>
                    {req.reason || "No reason provided"}
                  </p>
                </td>
                <td className="p-5">
                  {req.medical_report_url ? (
                    <a 
                      href={`http://localhost:8000/${req.medical_report_url}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-bold text-xs"
                    >
                      <FileText size={14} /> View Report
                    </a>
                  ) : (
                    <span className="text-slate-300 text-xs">No file</span>
                  )}
                </td>
                <td className="p-5">
                  <div className="flex items-center justify-center gap-2">
                    <button 
                      onClick={() => handleAction(req.id, "approved")}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition shadow-sm border border-emerald-100"
                      title="Approve"
                    >
                      <CheckCircle size={18} />
                    </button>
                    <button 
                      onClick={() => handleAction(req.id, "rejected")}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition shadow-sm border border-rose-100"
                      title="Reject"
                    >
                      <XCircle size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminLeaveApproval;