import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const links = [
  { to: '/', icon: '📊', label: 'Dashboard', end: true },
  { to: '/customers', icon: '👥', label: 'Customers' },
  { to: '/orders', icon: '📋', label: 'Orders' },
  { to: '/trips', icon: '🚛', label: 'Trips' },
  { to: '/deliveries', icon: '📦', label: 'Deliveries' },
  { to: '/reports', icon: '📈', label: 'Reports' },
  { to: '/users', icon: '🔑', label: 'Users' },
]

export default function AdminLayout() {
  const [open, setOpen] = useState(false)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    toast.success('Logged out')
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <div className={`sidebar-overlay ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">💧</div>
          <h2>SMS Water Supply</h2>
          <p>Admin Dashboard</p>
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section-label">Main Menu</div>

        <nav className="sidebar-nav">
          {links.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="link-icon">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-divider" />

        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={handleLogout}>
            <span className="link-icon">🚪</span>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      <button className="menu-toggle" onClick={() => setOpen(!open)}>
        {open ? '✕' : '☰'}
      </button>
    </div>
  )
}