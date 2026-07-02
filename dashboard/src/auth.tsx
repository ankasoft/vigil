/**
 * Auth context — admin token login.
 *
 * Token is kept in localStorage and sent as X-Admin-Token on every API call
 * by `api.ts`. When the worker returns 401, api.ts dispatches a window event
 * and this provider clears the token and re-opens the login modal.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const TOKEN_KEY = 'vigil_admin_token';
export const UNAUTHORIZED_EVENT = 'vigil:unauthorized';

interface AuthCtx {
  token: string | null;
  setToken: (t: string | null) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );
  const [showLogin, setShowLogin] = useState<boolean>(
    () => !localStorage.getItem(TOKEN_KEY),
  );

  const setToken = (t: string | null) => {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      setTokenState(t);
      setShowLogin(false);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setTokenState(null);
      setShowLogin(true);
    }
  };

  useEffect(() => {
    const fn = () => setToken(null);
    window.addEventListener(UNAUTHORIZED_EVENT, fn);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, fn);
  }, []);

  return (
    <Ctx.Provider value={{ token, setToken, logout: () => setToken(null) }}>
      {!showLogin && children}
      {showLogin && <LoginModal onSubmit={(t) => setToken(t)} />}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be inside <AuthProvider>');
  return c;
}

function LoginModal({ onSubmit }: { onSubmit: (t: string) => void }) {
  const [t, setT] = useState('');
  const [reveal, setReveal] = useState(false);

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/80 flex items-center justify-center p-4">
      <div className="card p-6 w-full max-w-md">
        <h1 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-sky-500" />
          Vigil
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Admin token required. This is the value you assigned to the Worker with{' '}
          <code className="px-1 rounded bg-slate-200 dark:bg-slate-800">
            wrangler secret put ADMIN_TOKEN
          </code>
          .
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = t.trim();
            if (trimmed) onSubmit(trimmed);
          }}
          className="space-y-3"
        >
          <div className="flex gap-1">
            <input
              type={reveal ? 'text' : 'password'}
              className="input"
              placeholder="Admin token"
              value={t}
              onChange={(e) => setT(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setReveal(!reveal)}
              tabIndex={-1}
            >
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>
          <button className="btn w-full" type="submit" disabled={!t.trim()}>
            Log in
          </button>
        </form>
      </div>
    </div>
  );
}
