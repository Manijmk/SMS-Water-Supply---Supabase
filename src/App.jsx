import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminLayout from './pages/AdminLayout'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Orders from './pages/Orders'
import Trips from './pages/Trips'
import Deliveries from './pages/Deliveries'
import Reports from './pages/Reports'
import AdminUsers from './pages/AdminUsers'
import DeliveryBoy from './pages/DeliveryBoy'
import CustomerPanel from './pages/CustomerPanel'

function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>
  if (!user) return <Navigate to="/login" />
  if (allowedRoles && !allowedRoles.includes(role)) {
    if (role === 'admin') return <Navigate to="/" />
    if (role === 'delivery') return <Navigate to="/delivery" />
    return <Navigate to="/customer" />
  }
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="orders" element={<Orders />} />
        <Route path="trips" element={<Trips />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>
      <Route path="/delivery" element={<ProtectedRoute allowedRoles={['delivery']}><DeliveryBoy /></ProtectedRoute>} />
      <Route path="/customer" element={<ProtectedRoute allowedRoles={['customer']}><CustomerPanel /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '14px',
              background: '#0f172a',
              color: '#f1f5f9',
              fontSize: '14px',
              fontWeight: '600',
              padding: '14px 20px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.15)',
            },
            success: { iconTheme: { primary: '#14b8a6', secondary: '#fff' } },
            error: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}