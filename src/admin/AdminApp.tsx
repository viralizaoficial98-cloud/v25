import { lazy, Suspense, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, CalendarClock, ClipboardList, FileText, Image, LayoutDashboard, LogOut, Mail, Menu, MessageCircleQuestion,
  ScanLine, Settings, ShieldCheck, Ticket, Users, UsersRound, Wallet, X,
} from 'lucide-react';
import { Alert, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Logo } from '@/components/site/Navbar';
import { errorMessage } from '@/lib/errors';
import { api } from '@/lib/http';
import { cn } from '@/lib/cn';
import type { StaffRole } from '@/lib/types';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { AdminSessionProvider, ROLE_LABEL, useAdmin } from './session';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
const TicketTypes = lazy(() => import('./pages/TicketTypes'));
const CheckIn = lazy(() => import('./pages/CheckIn'));
const MediaAdmin = lazy(() => import('./pages/MediaAdmin'));
const TimelineAdmin = lazy(() => import('./pages/TimelineAdmin'));
const MembersAdmin = lazy(() => import('./pages/MembersAdmin'));
const FaqAdmin = lazy(() => import('./pages/FaqAdmin'));
const SettingsAdmin = lazy(() => import('./pages/SettingsAdmin'));
const EmailsAdmin = lazy(() => import('./pages/EmailsAdmin'));
const Reports = lazy(() => import('./pages/Reports'));
const UsersAdmin = lazy(() => import('./pages/UsersAdmin'));
const AuditLog = lazy(() => import('./pages/AuditLog'));

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: StaffRole[];
  element: ReactNode;
}

const ALL: StaffRole[] = ['admin', 'financeiro', 'checkin'];
const FIN: StaffRole[] = ['admin', 'financeiro'];
const ADM: StaffRole[] = ['admin'];

export const NAV_ITEMS: NavItem[] = [
  { to: '', label: 'Dashboard', icon: LayoutDashboard, roles: ALL, element: <Dashboard /> },
  { to: 'pagamentos', label: 'Validação de pagamentos', icon: Wallet, roles: FIN, element: <Orders preset="review" /> },
  { to: 'pedidos', label: 'Inscrições e pedidos', icon: ClipboardList, roles: FIN, element: <Orders /> },
  { to: 'checkin', label: 'Check-in', icon: ScanLine, roles: ['admin', 'checkin'], element: <CheckIn /> },
  { to: 'ingressos', label: 'Ingressos, lotes e stock', icon: Ticket, roles: ADM, element: <TicketTypes /> },
  { to: 'relatorios', label: 'Relatórios', icon: BarChart3, roles: FIN, element: <Reports /> },
  { to: 'galeria', label: 'Fotografias e vídeos', icon: Image, roles: ADM, element: <MediaAdmin /> },
  { to: 'historia', label: 'Linha do tempo', icon: CalendarClock, roles: ADM, element: <TimelineAdmin /> },
  { to: 'integrantes', label: 'Integrantes', icon: UsersRound, roles: ADM, element: <MembersAdmin /> },
  { to: 'faq', label: 'FAQ', icon: MessageCircleQuestion, roles: ADM, element: <FaqAdmin /> },
  { to: 'configuracoes', label: 'Evento e conteúdos', icon: Settings, roles: ADM, element: <SettingsAdmin /> },
  { to: 'emails', label: 'Emails e SMTP', icon: Mail, roles: ADM, element: <EmailsAdmin /> },
  { to: 'equipa', label: 'Utilizadores e permissões', icon: Users, roles: ADM, element: <UsersAdmin /> },
  { to: 'auditoria', label: 'Registo de auditoria', icon: FileText, roles: ADM, element: <AuditLog /> },
];

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(201,164,92,.15),transparent_60%)] px-4">
      <div className="w-full max-w-sm space-y-5 rounded-3xl border border-gold/20 bg-ink-800/80 p-8 shadow-card">
        <div className="text-center">
          <Logo className="justify-center" />
          <h1 className="mt-4 text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-xs text-cream/50">{subtitle}</p>}
        </div>
        {children}
        <Link to="/" className="block text-center text-xs text-cream/45 hover:text-gold-light">← Voltar ao site</Link>
      </div>
    </div>
  );
}

function Login() {
  useDocumentTitle('Entrar · Painel V25');
  const { signIn } = useAdmin();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else {
        await api('/auth/forgot', { json: { email: email.trim() } });
        setSent(true);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title={mode === 'login' ? 'Painel administrativo' : 'Recuperar palavra-passe'} subtitle="Acesso restrito à equipa autorizada">
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
        {mode === 'login' && (
          <Field label="Palavra-passe">{(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        )}
        {error && <Alert tone="bad">{error}</Alert>}
        {sent && mode === 'forgot' && (
          <Alert tone="ok">Se o email pertencer a uma conta activa, receberá uma ligação válida durante 1 hora.</Alert>
        )}
        <Button type="submit" className="w-full" loading={busy}>{mode === 'login' ? 'Entrar' : 'Enviar ligação'}</Button>
        <button type="button" className="block w-full text-center text-xs text-gold-light hover:underline" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setError(null); setSent(false); }}>
          {mode === 'login' ? 'Esqueci-me da palavra-passe' : 'Voltar ao início de sessão'}
        </button>
      </form>
    </AuthCard>
  );
}

/** Primeira instalação: cria o administrador inicial com o SETUP_TOKEN do .env do servidor. */
function Setup() {
  useDocumentTitle('Instalação · Painel V25');
  const { refresh, signIn } = useAdmin();
  const [f, setF] = useState({ setup_token: '', full_name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) return setError('As palavras-passe não coincidem.');
    setBusy(true);
    setError(null);
    try {
      await api('/setup/admin', { json: { setup_token: f.setup_token.trim(), full_name: f.full_name, email: f.email.trim(), password: f.password } });
      await refresh();
      await signIn(f.email.trim(), f.password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <AuthCard title="Instalação do painel" subtitle="Criar o primeiro administrador">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Código de instalação (SETUP_TOKEN)">{(id) => <Input id={id} value={f.setup_token} onChange={set('setup_token')} required autoComplete="off" />}</Field>
        <Field label="Nome">{(id) => <Input id={id} value={f.full_name} onChange={set('full_name')} />}</Field>
        <Field label="Email">{(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} required autoComplete="username" />}</Field>
        <Field label="Palavra-passe" hint="Mínimo 10 caracteres, com letras e números.">{(id, d) => <Input id={id} aria-describedby={d} type="password" value={f.password} onChange={set('password')} required autoComplete="new-password" />}</Field>
        <Field label="Confirmar palavra-passe">{(id) => <Input id={id} type="password" value={f.confirm} onChange={set('confirm')} required autoComplete="new-password" />}</Field>
        {error && <Alert tone="bad">{error}</Alert>}
        <Button type="submit" className="w-full" loading={busy}>Criar administrador</Button>
      </form>
    </AuthCard>
  );
}

/** Definição de palavra-passe a partir do email (recuperação ou convite). Token no fragmento #token=. */
function ResetPassword() {
  useDocumentTitle('Definir palavra-passe · Painel V25');
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAdmin();
  const token = decodeURIComponent(/token=([^&]+)/.exec(hash)?.[1] ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('As palavras-passe não coincidem.');
    setBusy(true);
    setError(null);
    try {
      await refresh(); // obtém token CSRF
      await api('/auth/reset', { json: { token, password } });
      setDone(true);
      window.history.replaceState(null, '', window.location.pathname);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Definir palavra-passe">
      {done ? (
        <div className="space-y-4">
          <Alert tone="ok">Palavra-passe definida. Já pode iniciar sessão.</Alert>
          <Button className="w-full" onClick={() => navigate('/admin', { replace: true })}>Iniciar sessão</Button>
        </div>
      ) : !token ? (
        <Alert tone="bad">Ligação inválida. Peça uma nova em “Esqueci-me da palavra-passe”.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nova palavra-passe" hint="Mínimo 10 caracteres, com letras e números.">{(id, d) => <Input id={id} aria-describedby={d} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />}</Field>
          <Field label="Confirmar">{(id) => <Input id={id} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />}</Field>
          {error && <Alert tone="bad">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>Guardar</Button>
        </form>
      )}
    </AuthCard>
  );
}

function Shell() {
  const { user, role, loading, needsSetup, signOut } = useAdmin();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin/redefinir')) return <ResetPassword />;
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!user) return needsSetup ? <Setup /> : <Login />;
  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md space-y-4 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-gold" />
          <h1 className="text-2xl">Sem permissões atribuídas</h1>
          <p className="text-sm text-cream/60">A sua conta ({user.email}) não tem um perfil activo na equipa do V25. Peça a um administrador para lhe atribuir um perfil.</p>
          <Button variant="outline" onClick={signOut}>Terminar sessão</Button>
        </div>
      </div>
    );
  }
  const items = NAV_ITEMS.filter((n) => n.roles.includes(role));
  const nav = (
    <nav aria-label="Painel" className="space-y-1">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to === '' ? '/admin' : `/admin/${n.to}`}
          end={n.to === ''}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition', isActive ? 'bg-gold/15 text-gold-light' : 'text-cream/65 hover:bg-white/5 hover:text-cream')
          }
        >
          <n.icon className="h-4 w-4 shrink-0" aria-hidden /> {n.label}
        </NavLink>
      ))}
    </nav>
  );
  const footer = (
    <div className="mt-6 border-t border-white/10 pt-4 text-xs text-cream/50">
      <p className="truncate">{user.email}</p>
      <p className="text-gold">{ROLE_LABEL[role]}</p>
      <button type="button" onClick={signOut} className="mt-3 inline-flex items-center gap-2 text-cream/70 hover:text-rose-200">
        <LogOut className="h-4 w-4" /> Terminar sessão
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-ink/90 px-4 backdrop-blur lg:hidden">
        <Logo />
        <button type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="p-2">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 top-14 z-30 overflow-y-auto bg-ink p-4 lg:hidden">
          {nav}
          {footer}
        </div>
      )}
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-ink-800/60 p-4 lg:flex">
          <Link to="/" className="mb-8 mt-2 px-2"><Logo /></Link>
          {nav}
          <div className="mt-auto">{footer}</div>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <Suspense fallback={<div className="py-20 text-center"><Spinner /></div>}>
            <Routes>
              {items.map((n) => (
                <Route key={n.to} index={n.to === ''} path={n.to === '' ? undefined : n.to} element={n.element} />
              ))}
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function AdminApp() {
  useDocumentTitle('Painel · V25 — O Legado');
  return (
    <AdminSessionProvider>
      <Shell />
    </AdminSessionProvider>
  );
}
