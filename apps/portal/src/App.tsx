import { useState } from 'react';
import { AuthProvider, useAuth, portalForRole, type PortalRole } from './auth.tsx';
import { Landing } from './Landing.tsx';
import { LegalPage, type LegalDocId } from './Legal.tsx';
import { RolePicker } from './RolePicker.tsx';
import { LoginScreen } from './LoginScreen.tsx';
import { SignupScreen } from './SignupScreen.tsx';
import { ClientPortal } from './ClientPortal.tsx';
import { AdminPortal } from './AdminPortal.tsx';
import { TaskView } from './TaskView.tsx';
import { KlpToggle } from './klpTheme.tsx';

// Which audience this deployment serves. Set per Cloudflare Pages project:
//   ws.kipkiren.co.ke     -> VITE_PORTAL_AUDIENCE=client  (public site + client portal)
//   studio.kipkiren.co.ke -> VITE_PORTAL_AUDIENCE=staff   (admin + delivery task view)
// Unset -> 'all' (every role), so nothing is locked out before the split is wired.
type Audience = 'client' | 'staff' | 'all';
const AUDIENCE = (((import.meta.env.VITE_PORTAL_AUDIENCE as string) || 'all').trim() as Audience);

const CLIENT_URL = 'https://ws.kipkiren.co.ke';
const STAFF_URL = 'https://studio.kipkiren.co.ke';

function audienceAllows(portal: PortalRole): boolean {
  if (AUDIENCE === 'all') return true;
  if (AUDIENCE === 'client') return portal === 'client';
  return portal === 'admin' || portal === 'technical_delivery'; // staff
}

// Shown when someone's real role doesn't belong on this domain (client on studio,
// or staff on ws). The API's JWT role is the real boundary; this is just a signpost.
function WrongDomain({ onSignOut }: { onSignOut: () => void }) {
  const onStaff = AUDIENCE === 'staff';
  const href = onStaff ? CLIENT_URL : STAFF_URL;
  const label = onStaff ? 'client portal' : 'staff console';
  return (
    <div className="klp">
      <div className="klp-container klp-authwrap">
        <div className="klp-topbrand">
          <span className="mark">K</span>
          <span className="name">Kipkiren<small>WEB SERVICES</small></span>
          <div className="klp-topbrand-r"><KlpToggle /></div>
        </div>
        <div className="klp-auth-grid">
          <div className="intro klp-auth-intro">
            <span className="klp-eyebrow teal">Wrong door</span>
            <h1 className="klp-display-lg">This isn't your portal.</h1>
            <p className="klp-lead">Your account belongs to the {label}. Head there to sign in.</p>
            <div className="klp-portal-actions">
              <a className="klp-btn primary" href={href}>Go to the {label} &rarr;</a>
              <button type="button" className="klp-btn ghost" onClick={onSignOut}>Sign out</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Router() {
  const { session, picked, bootstrapping, pickRole, signOut } = useAuth();
  // Staff console has no public marketing landing - go straight to sign-in.
  const [entered, setEntered] = useState(AUDIENCE === 'staff');
  const [authMode, setAuthMode] = useState<'default' | 'signup'>('default');
  const [legal, setLegal] = useState<LegalDocId | null>(null);

  const enterSignIn = () => { setAuthMode('default'); setEntered(true); if (AUDIENCE === 'client') pickRole('client'); };
  const enterSignUp = () => { setAuthMode('signup'); setEntered(true); };

  if (bootstrapping) return <div className="boot">Loading...</div>;

  // Signed in: route by REAL JWT role, but block the wrong audience for this domain.
  if (session) {
    const target = portalForRole(session.claims.role);
    if (!audienceAllows(target)) return <WrongDomain onSignOut={() => void signOut()} />;
    return target === 'admin' ? <AdminPortal />
      : target === 'technical_delivery' ? <TaskView />
      : <ClientPortal />;
  }

  // Public marketing landing - client / all audiences only.
  if (AUDIENCE !== 'staff' && !entered) {
    if (legal) {
      return <LegalPage doc={legal} onBack={() => setLegal(null)} onOpen={setLegal} onSignIn={() => { setLegal(null); enterSignIn(); }} />;
    }
    return <Landing onSignIn={() => { setLegal(null); enterSignIn(); }} onSignUp={() => { setLegal(null); enterSignUp(); }} onLegal={setLegal} />;
  }

  // Self-service signup (client-facing only).
  if (authMode === 'signup' && AUDIENCE !== 'staff') {
    return <SignupScreen
      onBack={() => { setAuthMode('default'); setEntered(false); }}
      onSwitchToSignin={() => { setAuthMode('default'); pickRole('client'); }}
    />;
  }

  // Login (themed by the picked workspace).
  if (picked) {
    return <LoginScreen role={picked} onBack={() => void signOut()}
      onCreateAccount={picked === 'client' && AUDIENCE !== 'staff' ? enterSignUp : undefined} />;
  }

  // Role picker - filtered to this audience (staff: admin + task view; all: everyone).
  return <RolePicker onPick={pickRole} audience={AUDIENCE}
    onExit={AUDIENCE === 'staff' ? undefined : () => setEntered(false)} />;
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
