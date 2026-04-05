import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employee from './pages/EmployeesPage';
import EmployeeDetails from './pages/EmployeeDetails';
import Events from './pages/Events';
import ReportsPage from './pages/ReportsPage'; 
import { Toaster } from 'sonner';
import AttendanceDashboard from './pages/AttendanceDashboard';
import Payroll from './pages/Payroll';
import SettingsPage from './pages/SettingsPage';
import EmployeeDash from './pages/employeeDash';

// Standard Protection: Any valid logged-in user (Admin or Auditor)
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Admin-Only Protection: Strictly for 'admin' (Auditor gets redirected)
const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  
  if (!token) return <Navigate to="/login" replace />;
  
  // Restricted to Super Admin only
  if (role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function App() {
  return (
    <>
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
        {/* Public Route */}
        <Route path="/login" element={<Login />} />

        {/* ============================================================
            SHARED ROUTES: Accessible by Admin and Read-Only Admin (Auditor)
            ============================================================ */}
        
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Layout title="Dashboard">
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/attendance" 
          element={
            <ProtectedRoute>
              <Layout title="Attendance Management">
                <AttendanceDashboard />
              </Layout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/payroll" 
          element={
            <ProtectedRoute>
              <Layout title="Payroll Processing">
                <Payroll />
              </Layout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/employees" 
          element={
            <ProtectedRoute>
              <Layout title="Employees">
                <Employee />
              </Layout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/employees/:id" 
          element={
            <ProtectedRoute>
              <Layout title="Employee Dossier">
                <EmployeeDetails />
              </Layout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/events" 
          element={
            <ProtectedRoute>
              <Layout title="Company Announcements">
                <Events />
              </Layout>
            </ProtectedRoute>
          } 
        />

        {/* 2. NEW SHARED ROUTE: Reports Central */}
        <Route 
          path="/reports" 
          element={
            <ProtectedRoute>
              <Layout title="Reports Central">
                <ReportsPage />
              </Layout>
            </ProtectedRoute>
          } 
        />

        {/* ============================================================
            RESTRICTED ROUTES: Strictly for Master Admin
            ============================================================ */}
        
        <Route 
          path="/settings" 
          element={
            <AdminRoute>
              <Layout title="System Settings">
                <SettingsPage />
              </Layout>
            </AdminRoute>
          } 
        />

        {/* Redirects & Catch-all */}
        <Route path="/employee/dashboard" element={<EmployeeDash />} />
      </Routes>
    </>
  );
}

export default App;