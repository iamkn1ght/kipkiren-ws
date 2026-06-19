import { AuthProvider, useAuth, portalForRole } from './auth.tsx';
import { RolePicker } from './RolePicker.tsx';
import { LoginScreen } from './LoginScreen.tsx';
import { ClientPortal } from './ClientPortal.tsx';
import { AdminPortal } from './AdminPortal.tsx';
import { TaskView } from './TaskView.tsx';

function Router() {
  const { session, picked, bootstrapping, pickRole, signOut } = useAuth();

  if (bootstrapping) {
    return <div className="boot">Loading…</div>;
  }

  // 1. Role picker (landing)
  if (!picked) {
    return <RolePicker onPick={pickRole} />;
  }

  // 2. Shared login (themed by picked role). Bypass skips straight to a session.
  if (!session) {
    return <LoginScreen role={picked} onBack={() => void signOut()} />;
  }

  // 3. Portal — by the real JWT role (authoritative; a client can't reach admin).
  const target = portalForRole(session.claims.role);
  if (target === 'admin') return <AdminPortal />;
  if (target === 'technical_delivery') return <TaskView />;
  return <ClientPortal />;
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
