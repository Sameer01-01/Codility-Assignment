import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/index.js';
import { Login } from './pages/Login.js';
import { Signup } from './pages/Signup.js';
import { Dashboard } from './pages/Dashboard.js';
import { Projects } from './pages/Projects.js';
import { QueueDetail } from './pages/QueueDetail.js';
import { JobExplorer } from './pages/JobExplorer.js';
import { Workers } from './pages/Workers.js';
import { DeadLetterQueue } from './pages/DeadLetterQueue.js';
import { Metrics } from './pages/Metrics.js';
import {
  Folder,
  Sliders,
  Calendar,
  Server,
  ShieldAlert,
  BarChart3,
  LogOut,
  User,
  Activity,
  LayoutDashboard
} from 'lucide-react';

const SidebarLink: React.FC<{ to: string; label: string; icon: React.ReactNode }> = ({ to, label, icon }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-sm ${
        isActive
          ? 'bg-brandPrimary text-white shadow-lg shadow-brandPrimary/10'
          : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
};

const ProtectedLayout: React.FC = () => {
  const { isAuthenticated, user, logout, activeProject, activeOrg } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row relative">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-darkCard border-r border-gray-850 flex flex-col justify-between shrink-0 p-4 space-y-8 relative z-20">
        <div className="space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-8 h-8 bg-gradient-to-tr from-brandPrimary to-brandSecondary rounded-lg flex items-center justify-center shadow shadow-brandPrimary/30">
              <Activity className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-montserrat font-bold text-white tracking-wider text-base">JobScheduler</span>
          </div>

          {/* Org & Project selector */}
          <div className="bg-[#080d16]/80 p-3.5 rounded-xl border border-gray-850 space-y-2.5">
            <div>
              <span className="block text-[10px] text-gray-500 uppercase font-semibold">Active Org</span>
              <span className="text-white text-sm font-semibold truncate block">{activeOrg?.name || 'None'}</span>
            </div>
            {activeProject && (
              <div className="pt-2.5 border-t border-gray-850/50">
                <span className="block text-[10px] text-gray-500 uppercase font-semibold">Workspace Project</span>
                <span className="text-brandPrimary text-xs font-bold truncate block">{activeProject.name}</span>
              </div>
            )}
          </div>

          {/* Navigation links */}
          <nav className="flex flex-col gap-1.5">
            <SidebarLink to="/dashboard" label="Dashboard" icon={<LayoutDashboard className="w-4.5 h-4.5" />} />
            <SidebarLink to="/projects" label="Projects" icon={<Folder className="w-4.5 h-4.5" />} />
            <SidebarLink to="/queues" label="Queues" icon={<Sliders className="w-4.5 h-4.5" />} />
            <SidebarLink to="/jobs" label="Job Explorer" icon={<Calendar className="w-4.5 h-4.5" />} />
            <SidebarLink to="/workers" label="Active Workers" icon={<Server className="w-4.5 h-4.5" />} />
            <SidebarLink to="/dead-letter" label="Dead Letter Queue" icon={<ShieldAlert className="w-4.5 h-4.5" />} />
            <SidebarLink to="/metrics" label="Metrics" icon={<BarChart3 className="w-4.5 h-4.5" />} />
          </nav>
        </div>

        {/* Footer auth panel */}
        <div className="pt-4 border-t border-gray-850 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-300">
              <User className="w-4 h-4" />
            </div>
            <div className="text-xs max-w-[120px] truncate">
              <div className="font-semibold text-white truncate">{user?.name}</div>
              <div className="text-gray-500 truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
            title="Log Out"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </aside>

      {/* Main container */}
      <main className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/queues" element={<QueueDetail />} />
          <Route path="/jobs" element={<JobExplorer />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/dead-letter" element={<DeadLetterQueue />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
