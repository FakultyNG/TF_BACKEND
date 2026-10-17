import { useEffect, useState } from "react";
import { Search, UserRound, X } from "lucide-react";
import { api, displayName } from "../api";
import type { User } from "../types";
import { Empty, PageSkeleton, Status } from "./DashboardPage";

export default function UsersPage({ canManage }: { canManage: boolean }) {
  const [users, setUsers] = useState<User[]>([]); const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<User | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = () => api<User[]>("/admin/users?take=100").then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const filtered = users.filter((user) => `${displayName(user.profile)} ${user.phoneNumber}`.toLowerCase().includes(query.toLowerCase()));
  async function setTier(tier: User["accountTier"]) {
    if (!selected) return; setBusy(true);
    try { await api(`/admin/users/${selected.id}/profile/operational`, { method: "PATCH", body: JSON.stringify({ accountTier: tier }) }); setSelected({ ...selected, accountTier: tier }); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Update failed"); } finally { setBusy(false); }
  }
  if (error && !users.length) return <Empty title="Couldn’t load customers" detail={error} />;
  if (!users.length && !error) return <PageSkeleton />;
  return <>
    <div className="page-toolbar"><div><span className="eyebrow">CUSTOMER DIRECTORY</span><h2>{users.length.toLocaleString()} accounts</h2></div><label className="search-box"><Search size={18} /><input placeholder="Search name or phone" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Tier</th><th>KYC</th><th>Wallet</th><th>Joined</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id} className="clickable" onClick={() => setSelected(user)}><td><div className="person-cell"><span className="avatar">{user.profile?.profileImageUrl ? <img src={user.profile.profileImageUrl} /> : <UserRound size={16} />}</span><strong>{displayName(user.profile)}</strong></div></td><td className="mono">{user.phoneNumber}</td><td><span className={`tier tier-${user.accountTier}`}>{user.accountTier}</span></td><td><Status value={user.kycRecords?.[0]?.status ?? "not_started"} /></td><td><Status value={user.walletStatus} /></td><td>{new Date(user.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</td></tr>)}</tbody></table></div></section>
    {selected && <div className="modal-layer" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}><aside className="drawer"><button className="drawer-close" onClick={() => setSelected(null)}><X size={20} /></button><div className="drawer-avatar">{selected.profile?.profileImageUrl ? <img src={selected.profile.profileImageUrl} /> : (selected.profile?.firstName?.[0] ?? "U")}</div><span className="eyebrow">CUSTOMER PROFILE</span><h2>{displayName(selected.profile)}</h2><p className="muted">{selected.phoneNumber}</p><div className="detail-grid"><div><small>Account status</small><Status value={selected.status} /></div><div><small>Wallet</small><Status value={selected.walletStatus} /></div><div><small>KYC</small><Status value={selected.kycRecords?.[0]?.status ?? "not_started"} /></div><div><small>Current tier</small><span className={`tier tier-${selected.accountTier}`}>{selected.accountTier}</span></div></div>{canManage && <div className="form-block"><label>Money limit tier<select disabled={busy} value={selected.accountTier} onChange={(e) => setTier(e.target.value as User["accountTier"])}><option value="citizen">Citizen</option><option value="captain">Captain</option><option value="prime">Prime</option></select></label><p className="helper">Changes immediately apply the configured send, receive and balance limits.</p></div>}</aside></div>}
  </>;
}
