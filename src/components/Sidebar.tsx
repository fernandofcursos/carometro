import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, color: '#6366f1', bgColor: '#eef2ff' },
  { path: '/analytics', label: 'Analytics', icon: BarChart3, color: '#10b981', bgColor: '#ecfdf5' },
  { path: '/users', label: 'Users', icon: Users, color: '#f59e0b', bgColor: '#fffbeb' },
  { path: '/notifications', label: 'Notifications', icon: Bell, color: '#ef4444', bgColor: '#fef2f2' },
  { path: '/settings', label: 'Settings', icon: Settings, color: '#64748b', bgColor: '#f8fafc' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`hidden sm:flex flex-col bg-white border-r border-gray-200 h-screen sticky top-0 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">D</span>
            </div>
            <span className="font-bold text-lg text-gray-900">Dashboard</span>
          </motion.div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          )}
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'font-semibold'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`p-2 rounded-lg transition-all duration-200 ${
                    isActive ? 'scale-110' : 'group-hover:scale-105'
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: item.bgColor, color: item.color }
                      : {}
                  }
                >
                  <item.icon className="w-5 h-5" />
                </div>
                {!collapsed && (
                  <span className="text-sm">{item.label}</span>
                )}
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="sidebarIndicator"
                    className="absolute left-0 w-1 h-8 rounded-r-full"
                    style={{ backgroundColor: item.color }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center">
              <span className="text-white font-semibold text-xs">JD</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">John Doe</p>
              <p className="text-xs text-gray-500 truncate">john@example.com</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
