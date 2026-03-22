import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import AdminLayout from './pages/AdminLayout'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Orders from './pages/Orders'
import Trips from './pages/Trips'
import Deliveries from './pages/Deliveries'
import Reports from './pages/Reports'
import DeliveryBoy from './pages/DeliveryBoy'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="loading">
      <div className="spinner" />
      <span>Loading...</span>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-center" toastOptions={{ style: { fontFamily: 'Nunito', fontWeight: 700, borderRadius: 10 } }} />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/delivery" element={<ProtectedRoute><DeliveryBoy /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="customers" element={<Customers />} />
            <Route path="orders" element={<Orders />} />
            <Route path="trips" element={<Trips />} />
            <Route path="deliveries" element={<Deliveries />} />
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
