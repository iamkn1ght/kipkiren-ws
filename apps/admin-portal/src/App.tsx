import { AdminPortal } from './AdminPortal.tsx';
import { LoginScreen } from './LoginScreen.tsx';
import { AuthProvider, useAuth, isAdminRole } from './auth.tsx';

function Router() {
  const { session, bootstrapping, signOut } = useAuth();

  if (bootstrapping) {
    return <div className="boot">Loading session…</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (!isAdminRole(session.claims.role)) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="gate-title">Not authorised</div>
          <p className="gate-body">
            This portal is for delivery leads and admins only. Your account is
            signed in as <code>{session.claims.role}</code>. Please sign out and
            use the client portal at <code>ws.kipkiren.co.ke</code>.
          </p>
          <button type="button" className="gate-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <AdminPortal />;
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
