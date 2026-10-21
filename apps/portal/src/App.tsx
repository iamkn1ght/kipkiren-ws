import { useEffect, useState } from 'react';
import { AuthProvider, useAuth, hasStoredSession, portalForRole, type PortalRole } from './auth.tsx';
import { Landing } from './Landing.tsx';
import { LegalPage, legalDocFromPath, type LegalDocId } from './Legal.tsx';
import { ServicePage, serviceFromPath, type ServiceId } from './Services.tsx';

// Public content pages with real URLs: legal/FAQ and the service pages.
type PageId = LegalDocId | ServiceId;
const pageFromPath = (p: string): PageId | null => legalDocFromPath(p) ?? serviceFromPath(p);
const isServicePage = (id: PageId): id is ServiceId => serviceFromPath(`/${id}`) !== null;
import { RolePicker } from './RolePicker.tsx';
import { LoginScreen } from './LoginScreen.tsx';
import { SignupScreen } from './SignupScreen.tsx';
import { ForgotPassword, SetPassword, parseRecoveryHash } from './ResetPassword.tsx';
import { ClientPortal } from './ClientPortal.tsx';
import { AdminPortal } from './AdminPortal.tsx';
import { TaskView } from './TaskView.tsx';
import { KlpToggle } from './klpTheme.tsx';
import { NotFound } from './NotFound.tsx';

// Which audience this deployment serves. Set per Cloudflare Pages project:
//   ws.kipkiren.co.ke     -> VITE_PORTAL_AUDIENCE=client  (public site + client portal)
//   studio.kipkiren.co.ke -> VITE_PORTAL_AUDIENCE=staff   (admin + delivery task view)
// Unset -> 'all' (every role), so nothing is locked out before the split is wired.
type Audience = 'client' | 'staff' | 'all';
const AUDIENCE = (((import.meta.env.VITE_PORTAL_AUDIENCE as string) || 'all').trim() as Audience);

const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1';

// Staff on a shared ('all') deployment reach the workspace picker at /staff.
// Everyone else who clicks "Sign in" goes straight to the client login - the
// JWT role still routes a staff member to their console after login.
const STAFF_PATH = '/staff';

// Real routes. Everything else gets the 404 page (the SPA fallback serves
// index.html for any URL). /portal and /admin prefixes stay valid: the Paystack
// card callback returns clients to /portal/proforma/<id>.
function isKnownPath(path: string): boolean {
  const p = path.replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/index.html' || p === STAFF_PATH) return true;
  if (pageFromPath(p)) return true;
  return p === '/portal' || p.startsWith('/portal/') || p === '/admin' || p.startsWith('/admin/');
}

const CLIENT_URL = 'https://ws.kipkiren.co.ke';
const STAFF_URL = 'https://studio.kipkiren.co.ke';

// The staff console gets its own tab identity; the client build keeps the
// marketing <title> from index.html.
if (AUDIENCE === 'staff' && typeof document !== 'undefined') {
  document.title = 'Kipkiren WS · Delivery Console';
}

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
  const [staffEntry] = useState(() => AUDIENCE === 'all' && window.location.pathname.replace(/\/+$/, '') === STAFF_PATH);
  const showPicker = AUDIENCE === 'staff' || staffEntry || DEV_AUTH_BYPASS;
  // Staff console has no public marketing landing - go straight to sign-in.
  const [entered, setEntered] = useState(AUDIENCE === 'staff' || staffEntry);
  const [authMode, setAuthMode] = useState<'default' | 'signup'>('default');
  // Legal/FAQ pages have real URLs (/terms, /privacy, ...) so they can be
  // linked, indexed and given to payment providers. Keep state and URL in sync.
  const [legal, setLegalState] = useState<PageId | null>(() => (AUDIENCE === 'staff' ? null : pageFromPath(window.location.pathname)));
  const setLegal = (id: PageId | null) => {
    const path = id ? `/${id}` : '/';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setLegalState(id);
  };
  const [notFound, setNotFound] = useState(() => !isKnownPath(window.location.pathname));
  useEffect(() => {
    const onPop = () => {
      setLegalState(pageFromPath(window.location.pathname));
      setNotFound(!isKnownPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const goHome = () => {
    window.history.pushState(null, '', '/');
    setNotFound(false); setLegalState(null); setEntered(AUDIENCE === 'staff');
  };
  const [showForgot, setShowForgot] = useState(false);
  // Invite/recovery links land with a token in the URL hash. Parse once at mount.
  const [recovery, setRecovery] = useState(() => parseRecoveryHash());

  const enterSignIn = () => { setAuthMode('default'); setEntered(true); if (!showPicker) pickRole('client'); };
  const enterSignUp = () => { setAuthMode('signup'); setEntered(true); };

  const landing = (
    <Landing onSignIn={() => { setLegal(null); enterSignIn(); }} onSignUp={() => { setLegal(null); enterSignUp(); }} onLegal={setLegal} />
  );

  const legalPage = (id: PageId) => (isServicePage(id)
    ? <ServicePage page={id} onBack={() => setLegal(null)} onOpen={setLegal} onStart={() => { setLegal(null); enterSignUp(); }} />
    : <LegalPage doc={id} onBack={() => setLegal(null)} onOpen={setLegal} onSignIn={() => { setLegal(null); enterSignIn(); }} />
  );

  // Unknown URL: the site-wide 404, before anything else (signed in or not).
  if (notFound) {
    return <NotFound onHome={goHome} onSignIn={() => { goHome(); enterSignIn(); }} />;
  }

  // Public visitors keep seeing the (prerendered) landing while the session
  // refresh runs, instead of a loader replacing it. Likely-signed-in tabs and
  // the staff console still wait on the loader.
  if (bootstrapping) {
    if (AUDIENCE !== 'staff' && !entered && !recovery && !hasStoredSession()) return legal ? legalPage(legal) : landing;
    return <div className="boot">Loading...</div>;
  }

  // Highest priority: completing an invite or a password recovery from an email
  // link (works on any domain/audience, signed in or not).
  if (recovery) {
    return <SetPassword ctx={recovery} onDone={() => { setRecovery(null); void signOut(); setEntered(true); }} />;
  }

  // Forgot-password screen (reached from the login screen).
  if (showForgot && !session) {
    return <ForgotPassword onBack={() => setShowForgot(false)} />;
  }

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
      return legalPage(legal);
    }
    return landing;
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
    return <LoginScreen role={picked}
      onBack={showPicker ? () => void signOut() : () => { void signOut(); setEntered(false); }}
      backLabel={showPicker ? 'Change role' : 'Back to site'}
      onForgot={() => setShowForgot(true)}
      onCreateAccount={picked === 'client' && AUDIENCE !== 'staff' ? enterSignUp : undefined} />;
  }

  // Signed out with no workspace picked: public visitors go back to the site.
  if (!showPicker) return legal ? legalPage(legal) : landing;

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
