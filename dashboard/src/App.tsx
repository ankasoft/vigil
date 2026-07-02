import { LogOut, Settings, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import { NotificationSettings } from './components/NotificationSettings';
import { ServerGrid } from './components/ServerGrid';
import { ToastHost } from './components/Toast';

type View = 'dashboard' | 'settings';

export default function App() {
  // Dark mode follows the OS preference.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.classList.toggle('dark', mq.matches);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <AuthProvider>
      <Shell />
      <ToastHost />
    </AuthProvider>
  );
}

function Shell() {
  const [view, setView] = useState<View>('dashboard');
  const { logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2 font-semibold"
          >
            <Shield size={20} className="text-sky-500" />
            <span>Vigil</span>
            <span className="text-xs font-normal text-slate-400 ml-1">stay vigilant</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView(view === 'settings' ? 'dashboard' : 'settings')}
              className={`btn-secondary ${view === 'settings' ? '!bg-sky-100 dark:!bg-sky-900/40' : ''}`}
              title="Notification settings"
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              onClick={logout}
              className="btn-secondary"
              title="Logout"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {view === 'dashboard' ? <ServerGrid /> : <NotificationSettings />}
      </main>
    </div>
  );
}
