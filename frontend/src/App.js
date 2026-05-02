import React from 'react';
import { Routes, Route, Navigate, BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';

import Layout from './components/Layout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employee from './pages/EmployeesPage';
import EmployeeDetails from './pages/EmployeeDetails';
import Events from './pages/Events';
import AttendanceDashboard from './pages/AttendanceDashboard';
import Payroll from './pages/Payroll';
import SettingsPage from './pages/SettingsPage';
import EmployeeDash from './pages/employeeDash';

// Standard Protection: Any valid logged-in user
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Admin-Only Protection: Strictly for 'admin'
const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  
  if (!token) return <Navigate to="/login" replace />;
  
  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function App() {
  return (
    <>
      {/* Notifications Provider */}
      <Toaster 
        theme="dark" 
        position="top-right" 
        richColors 
        expand={false}
        toastOptions={{
          style: {
            background: '#111827',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: '#fff',
          },
        }}
      />

      <Routes>
        {/* 1. ROOT REDIRECT: Fixes the "No routes matched location '/'" warning */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* 2. PUBLIC ROUTES */}
        <Route path="/login" element={<Login />} />
        <Route path="/employee/dashboard" element={<EmployeeDash />} />

        {/* 3. PROTECTED ROUTES (Shared by Admin and Auditor) */}
        <Route 
          path="/dashboard" 
          element={<ProtectedRoute><Layout title="Dashboard"><Dashboard /></Layout></ProtectedRoute>} 
        />
        <Route 
          path="/attendance" 
          element={<ProtectedRoute><Layout title="Attendance Management"><AttendanceDashboard /></Layout></ProtectedRoute>} 
        />
        <Route 
          path="/payroll" 
          element={<ProtectedRoute><Layout title="Payroll Processing"><Payroll /></Layout></ProtectedRoute>} 
        />
        <Route 
          path="/employees" 
          element={<ProtectedRoute><Layout title="Employees"><Employee /></Layout></ProtectedRoute>} 
        />
        <Route 
          path="/employees/:id" 
          element={<ProtectedRoute><Layout title="Employee Dossier"><EmployeeDetails /></Layout></ProtectedRoute>} 
        />
        <Route 
          path="/events" 
          element={<ProtectedRoute><Layout title="Company Announcements"><Events /></Layout></ProtectedRoute>} 
        />

        {/* 4. ADMIN-ONLY ROUTES */}
        <Route 
          path="/settings" 
          element={<AdminRoute><Layout title="System Settings"><SettingsPage /></Layout></AdminRoute>} 
        />

        {/* 5. CATCH-ALL: Redirects any undefined URL to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}


export default App;