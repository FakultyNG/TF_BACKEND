import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Bell, ChevronDown, CircleDollarSign, LayoutDashboard, LogOut, Menu, MessageCircle,
  ReceiptText, ShieldCheck, Users, X
} from "lucide-react";
import { api, authStore, displayName } from "./api";
import type { Admin } from "./types";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import TransactionsPage from "./pages/TransactionsPage";
import SupportPage from "./pages/SupportPage";
import NotificationsPage from "./pages/NotificationsPage";
import TeamPage from "./pages/TeamPage";

type Section = "dashboard" | "users" | "transactions" | "support" | "notifications" | "team";

const sectionFromHash = (): Section => {
  const value = location.hash.replace("#", "") as Section;
  return ["dashboard", "users", "transactions", "support", "notifications", "team"].includes(value) ? value : "dashboard";
};

export default function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(Boolean(authStore.get()));

  useEffect(() => {
    if (!authStore.get()) return;
    api<Admin>("/admin/auth/me")
      .then(setAdmin)
      .catch(() => authStore.clear())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <Splash />;
  if (!admin) return <Login onLogin={setAdmin} />;
  return <Shell admin={admin} onLogout={() => { authStore.clear(); setAdmin(null); }} />;
}

function Splash() {
  return <div className="splash"><Brand /><span className="spinner" /></div>;
}

function Login({ onLogin }: { onLogin: (admin: Admin) => void }) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      const result = await api<{ accessToken: string; admin: Admin }>("/admin/auth/login", {
        method: "POST", body: JSON.stringify({ phoneNumber, passcode })
      });
      authStore.set(result.accessToken);
      onLogin(result.admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally { setBusy(false); }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="orb orb-one" /><div className="orb orb-two" />
        <Brand inverse />
        <div className="login-copy">
          <span className="eyebrow light">TRANSFA OPERATIONS</span>
          <h1>Money moves.<br />You stay in control.</h1>
          <p>A secure home for customer care, compliance and every transaction in between.</p>
        </div>
        <div className="signal-card"><span className="signal-dot" /><div><strong>Live operations</strong><small>Connected to your Railway backend</small></div></div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <span className="eyebrow">ADMIN ACCESS</span>
          <h2>Welcome back</h2>
          <p className="muted">Use the administrator phone number and passcode configured in Railway.</p>
          <label>Phone number<input autoComplete="username" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="234 800 000 0000" required /></label>
          <label>5-digit passcode<input type="password" inputMode="numeric" maxLength={5} pattern="[0-9]{5}" autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ""))} placeholder="•••••" required /></label>
          {error && <div className="error-banner">{error}</div>}
          <button className="primary-button" disabled={busy}>{busy ? <><span className="button-spinner" /> Signing in</> : "Open dashboard"}</button>
          <p className="security-note"><ShieldCheck size={16} /> Access is logged and permission controlled.</p>
        </form>
      </section>
    </main>
  );
}

function Shell({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  const [section, setSection] = useState<Section>(sectionFromHash());
  const [mobileNav, setMobileNav] = useState(false);
  const permissions = admin.permissions ?? [];
  const can = (permission: string) => admin.role === "SUPER_ADMIN" || permissions.includes(permission);
  const items = useMemo(() => [
    { id: "dashboard" as Section, label: "Overview", icon: LayoutDashboard, permission: "dashboard.view" },
    { id: "users" as Section, label: "Customers", icon: Users, permission: "users.view" },
    { id: "transactions" as Section, label: "Transactions", icon: ReceiptText, permission: "transactions.view" },
    { id: "support" as Section, label: "Messages", icon: MessageCircle, permission: "support.view" },
    { id: "notifications" as Section, label: "Broadcasts", icon: Bell, permission: "notifications.view" },
    { id: "team" as Section, label: "Admin team", icon: ShieldCheck, permission: "admins.manage" }
  ].filter((item) => can(item.permission)), [admin.role, permissions.join("|")]);

  useEffect(() => {
    const listener = () => setSection(sectionFromHash());
    addEventListener("hashchange", listener);
    if (!items.some((item) => item.id === section) && items[0]) location.hash = items[0].id;
    return () => removeEventListener("hashchange", listener);
  }, [items, section]);

  const navigate = (next: Section) => { location.hash = next; setSection(next); setMobileNav(false); };
  const page: Record<Section, ReactNode> = {
    dashboard: <DashboardPage />,
    users: <UsersPage canManage={can("users.manage")} />,
    transactions: <TransactionsPage />,
    support: <SupportPage canReply={can("support.reply")} />,
    notifications: <NotificationsPage canSend={can("notifications.send")} />,
    team: <TeamPage />
  };
  const title = items.find((item) => item.id === section)?.label ?? "Overview";
  const profile = admin.profile ?? { firstName: admin.firstName, lastName: admin.lastName };

  return (
    <div className="app-shell">
      {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-top"><Brand /><button className="icon-button mobile-only" onClick={() => setMobileNav(false)}><X size={20} /></button></div>
        <nav>{items.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span>{id === "support" && <i />}</button>)}</nav>
        <div className="sidebar-foot">
          <div className="mini-avatar">{(profile?.firstName?.[0] || "A").toUpperCase()}</div>
          <div><strong>{displayName(profile, "Transfa Admin")}</strong><small>{admin.role.replace("_", " ")}</small></div>
          <button onClick={onLogout} title="Sign out"><LogOut size={18} /></button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileNav(true)}><Menu size={22} /></button>
          <div><span className="eyebrow">OPERATIONS</span><h1>{title}</h1></div>
          <div className="top-actions"><span className="live-pill"><i /> Live</span><button className="profile-chip"><span>{(profile?.firstName?.[0] || "A").toUpperCase()}</span><ChevronDown size={15} /></button></div>
        </header>
        <div className="page-content">{page[section]}</div>
      </main>
    </div>
  );
}

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <div className={`brand ${inverse ? "inverse" : ""}`}><span className="brand-mark"><CircleDollarSign size={20} /></span><strong>Transfa</strong><small>admin</small></div>;
}
