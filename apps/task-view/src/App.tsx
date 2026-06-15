import { TaskView } from './TaskView.tsx';
import { LoginScreen } from './LoginScreen.tsx';
import { AuthProvider, useAuth, isTechnicalDeliveryRole } from './auth.tsx';

function Router() {
  const { session, bootstrapping, signOut } = useAuth();

  if (bootstrapping) {
    return <div className="boot">Loading session…</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (!isTechnicalDeliveryRole(session.claims.role)) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="gate-title">Not authorised</div>
          <p className="gate-body">
            This view is for technical delivery only. Your account is signed in
            as <code>{session.claims.role}</code>. If you are a client or admin,
            please use the appropriate portal.
          </p>
          <button type="button" className="gate-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <TaskView />;
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
