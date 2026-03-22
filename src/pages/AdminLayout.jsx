import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const nav = [
  { to: '/', icon: '🏠', label: 'Dashboard', end: true },
  { to: '/customers', icon: '👥', label: 'Customers' },
  { to: '/orders', icon: '📋', label: 'Orders' },
  { to: '/trips', icon: '🚚', label: 'Trips' },
  { to: '/deliveries', icon: '📦', label: 'Deliveries' },
  { to: '/reports', icon: '📊', label: 'Reports' },
]

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    toast.success('Logged out')
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 240,
        background: 'linear-gradient(180deg, #0369a1 0%, #0ea5e9 100%)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 50,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        boxShadow: '4px 0 24px rgba(3,105,161,0.3)'
      }}
      className="sidebar"
      >
        {/* Brand */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28 }}>💧</span>
            <div>
              <div style={{ color: 'white', fontFamily: "'Baloo 2', cursive", fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>SMS Water</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Supply Management</div>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          {nav.map(({ to, icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 10,
                marginBottom: 4,
                color: isActive ? '#0369a1' : 'rgba(255,255,255,0.85)',
                background: isActive ? 'white' : 'transparent',
                fontWeight: 700,
                fontSize: 14,
                transition: 'all 0.15s',
                textDecoration: 'none'
              })}
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 8, paddingLeft: 4 }}>
            {user?.email}
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 14px', borderRadius: 10,
              background: 'rgba(255,255,255,0.15)',
              color: 'white', fontWeight: 700, fontSize: 13,
              width: '100%', border: 'none', cursor: 'pointer',
              transition: 'background 0.15s'
            }}
          >
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Desktop sidebar always visible */}
      <style>{`
        @media (min-width: 768px) {
          .sidebar { transform: translateX(0) !important; }
          .main-content { margin-left: 240px !important; }
        }
      `}</style>

      {/* Main Content */}
      <main className="main-content" style={{ flex: 1, minWidth: 0 }}>
        {/* Top bar */}
        <div style={{
          background: 'white',
          borderBottom: '1px solid var(--gray-200)',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          position: 'sticky', top: 0, zIndex: 30
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 22, padding: 4, color: 'var(--sky)'
            }}
          >☰</button>
          <span style={{ fontFamily: "'Baloo 2', cursive", fontSize: 18, fontWeight: 700, color: 'var(--sky-dark)' }}>
            💧 SMS Water Supply
          </span>
        </div>

        <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
