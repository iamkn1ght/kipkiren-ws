import { useState } from 'react';
import { AuthProvider, useAuth, portalForRole } from './auth.tsx';
import { Landing } from './Landing.tsx';
import { LegalPage, type LegalDocId } from './Legal.tsx';
import { RolePicker } from './RolePicker.tsx';
import { LoginScreen } from './LoginScreen.tsx';
import { SignupScreen } from './SignupScreen.tsx';
import { ClientPortal } from './ClientPortal.tsx';
import { AdminPortal } from './AdminPortal.tsx';
import { TaskView } from './TaskView.tsx';

function Router() {
  const { session, picked, bootstrapping, pickRole, signOut } = useAuth();
  const [entered, setEntered] = useState(false);
  const [authMode, setAuthMode] = useState<'default' | 'signup'>('default');
  const [legal, setLegal] = useState<LegalDocId | null>(null);

  const enterSignIn = () => { setAuthMode('default'); setEntered(true); };
  const enterSignUp = () => { setAuthMode('signup'); setEntered(true); };

  if (bootstrapping) {
    return <div className="boot">Loading...</div>;
  }

  // Public landing (home) - shown to anyone not signed in who hasn't entered.
  if (!entered && !session) {
    if (legal) {
      return (
        <LegalPage
          doc={legal}
          onBack={() => setLegal(null)}
          onOpen={setLegal}
          onSignIn={() => { setLegal(null); enterSignIn(); }}
        />
      );
    }
    return <Landing onSignIn={() => { setLegal(null); enterSignIn(); }} onSignUp={() => { setLegal(null); enterSignUp(); }} onLegal={setLegal} />;
  }

  // Inside the app - signup, or pick role → shared login → portal (by real JWT role).
  let view;
  if (session) {
    const target = portalForRole(session.claims.role);
    view = target === 'admin' ? <AdminPortal />
      : target === 'technical_delivery' ? <TaskView />
      : <ClientPortal />;
  } else if (authMode === 'signup') {
    view = <SignupScreen
      onBack={() => { setAuthMode('default'); setEntered(false); }}
      onSwitchToSignin={() => { setAuthMode('default'); pickRole('client'); }}
    />;
  } else if (picked) {
    view = <LoginScreen role={picked} onBack={() => void signOut()} onCreateAccount={picked === 'client' ? enterSignUp : undefined} />;
  } else {
    view = <RolePicker onPick={pickRole} onExit={() => setEntered(false)} />;
  }

  return view;
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
