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

function Loader() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0ea5e9, #0369a1)' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>💧</div>
      <div style={{ color: 'white', fontFamily: "'Baloo 2'", fontSize: 20, fontWeight: 700 }}>SMS Water Supply</div>
      <div style={{ marginTop: 16, display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.7)', animation: `bounce 1s ${i * 0.2}s infinite` }} />
        ))}
      </div>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }`}</style>
    </div>
  )
}

// Only used for protected pages — NOT for login/register
function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth()

  if (loading) return <Loader />
  if (!user) return <Navigate to="/login" replace />

  if (allowedRoles && !allowedRoles.includes(role)) {
    if (role === 'delivery') return <Navigate to="/delivery" replace />
    if (role === 'customer') return <Navigate to="/customer" replace />
    return <Navigate to="/" replace />
  }

  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-center"
          toastOptions={{ style: { fontFamily: 'Nunito', fontWeight: 700, borderRadius: 10 } }}
        />
        <Routes>
          {/* Public — NO protection, always show immediately */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Customer panel */}
          <Route path="/customer" element={
            <ProtectedRoute allowedRoles={['customer']}>
              <CustomerPanel />
            </ProtectedRoute>
          } />

          {/* Delivery boy panel */}
          <Route path="/delivery" element={
            <ProtectedRoute allowedRoles={['delivery', 'admin']}>
              <DeliveryBoy />
            </ProtectedRoute>
          } />

          {/* Admin panel */}
          <Route path="/" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="customers" element={<Customers />} />
            <Route path="orders" element={<Orders />} />
            <Route path="trips" element={<Trips />} />
            <Route path="deliveries" element={<Deliveries />} />
            <Route path="reports" element={<Reports />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
