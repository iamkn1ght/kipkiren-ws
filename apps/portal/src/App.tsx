import { useState } from 'react';
import { AuthProvider, useAuth, portalForRole } from './auth.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import { Landing } from './Landing.tsx';
import { RolePicker } from './RolePicker.tsx';
import { LoginScreen } from './LoginScreen.tsx';
import { ClientPortal } from './ClientPortal.tsx';
import { AdminPortal } from './AdminPortal.tsx';
import { TaskView } from './TaskView.tsx';

function Router() {
  const { session, picked, bootstrapping, pickRole, signOut } = useAuth();
  const [entered, setEntered] = useState(false);

  if (bootstrapping) {
    return <div className="boot">Loading...</div>;
  }

  // Public landing (home) - shown to anyone not signed in who hasn't entered.
  if (!entered && !session) {
    return <Landing onSignIn={() => setEntered(true)} />;
  }

  // Inside the app - pick role → shared login → portal (by real JWT role).
  let view;
  if (session) {
    const target = portalForRole(session.claims.role);
    view = target === 'admin' ? <AdminPortal />
      : target === 'technical_delivery' ? <TaskView />
      : <ClientPortal />;
  } else if (picked) {
    view = <LoginScreen role={picked} onBack={() => void signOut()} />;
  } else {
    view = <RolePicker onPick={pickRole} onExit={() => setEntered(false)} />;
  }

  return (
    <>
      <ThemeToggle />
      {view}
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
