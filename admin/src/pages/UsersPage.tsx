import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Save, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { api, displayName } from "../api";
import type { KycRecord, User } from "../types";
import { Empty, PageSkeleton, Status } from "./DashboardPage";

type UserDraft = {
  phoneNumber: string; firstName: string; lastName: string; email: string; dateOfBirth: string;
  gender: string; country: string; profileImageUrl: string; accountTier: User["accountTier"];
  walletStatus: string; supportNotes: string; riskNotes: string;
};
type KycDraft = {
  status: KycRecord["status"]; bvnVerified: boolean; selfieVerified: boolean; faceMatch: boolean;
  confidenceScore: string; firstName: string; middleName: string; lastName: string; email: string;
  phoneNumber: string; dateOfBirth: string; gender: string; country: string; syncProfile: boolean;
};

const toDateInput = (value?: string | null) => value ? value.slice(0, 10) : "";
const userDraft = (user: User): UserDraft => ({
  phoneNumber: user.phoneNumber, firstName: user.profile?.firstName ?? "", lastName: user.profile?.lastName ?? "",
  email: user.profile?.email ?? "", dateOfBirth: toDateInput(user.profile?.dateOfBirth), gender: user.profile?.gender ?? "",
  country: user.profile?.country ?? "", profileImageUrl: user.profile?.profileImageUrl ?? "", accountTier: user.accountTier,
  walletStatus: user.walletStatus, supportNotes: user.supportNotes ?? "", riskNotes: user.riskNotes ?? ""
});
const kycDraft = (record: KycRecord): KycDraft => ({
  status: record.status, bvnVerified: record.bvnVerified, selfieVerified: record.selfieVerified, faceMatch: record.faceMatch,
  confidenceScore: record.confidenceScore?.toString() ?? "", firstName: record.firstName ?? "", middleName: record.middleName ?? "",
  lastName: record.lastName ?? "", email: record.email ?? "", phoneNumber: record.phoneNumber ?? "",
  dateOfBirth: toDateInput(record.dateOfBirth), gender: record.gender ?? "", country: record.country ?? "", syncProfile: true
});

export default function UsersPage({ canManage, canManageKyc, canDelete }: { canManage: boolean; canManageKyc: boolean; canDelete: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [kyc, setKyc] = useState<KycDraft | null>(null);
  const [status, setStatus] = useState("active");
  const [statusReason, setStatusReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try { setUsers(await api<User[]>("/admin/users?take=100")); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn’t load customers"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = users.filter((user) =>
    `${displayName(user.profile)} ${user.phoneNumber} ${user.profile?.email ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );

  async function openUser(summary: User) {
    setSelected(summary); setDraft(userDraft(summary));
    setKyc(summary.kycRecords?.[0] ? kycDraft(summary.kycRecords[0]) : null);
    setStatus(summary.status); setError(""); setSuccess(""); setBusy("load");
    try {
      const full = await api<User>(`/admin/users/${summary.id}`);
      setSelected(full); setDraft(userDraft(full));
      setKyc(full.kycRecords?.[0] ? kycDraft(full.kycRecords[0]) : null); setStatus(full.status);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t load this customer"); }
    finally { setBusy(""); }
  }

  function closeDrawer() {
    setSelected(null); setDraft(null); setKyc(null); setError(""); setSuccess("");
    setDeleteReason(""); setDeleteConfirmation(""); setStatusReason("");
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault(); if (!selected || !draft) return;
    setBusy("profile"); setError(""); setSuccess("");
    try {
      const updated = await api<User>(`/admin/users/${selected.id}`, {
        method: "PATCH", body: JSON.stringify({ ...draft, email: draft.email || undefined,
          dateOfBirth: draft.dateOfBirth || undefined, profileImageUrl: draft.profileImageUrl || undefined })
      });
      setSelected(updated); setDraft(userDraft(updated)); setSuccess("Customer details saved."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(""); }
  }

  async function saveStatus(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    setBusy("status"); setError(""); setSuccess("");
    try {
      const updated = await api<User>(`/admin/users/${selected.id}/status`, {
        method: "PATCH", body: JSON.stringify({ status, reason: statusReason || undefined })
      });
      setSelected(updated); setDraft(userDraft(updated)); setSuccess(`Account status changed to ${status}.`);
      setStatusReason(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Status update failed"); }
    finally { setBusy(""); }
  }

  async function saveKyc(event: FormEvent) {
    event.preventDefault();
    const record = selected?.kycRecords?.[0];
    if (!selected || !record || !kyc) return;
    setBusy("kyc"); setError(""); setSuccess("");
    try {
      const updated = await api<KycRecord>(`/admin/kyc-records/${record.id}`, {
        method: "PATCH", body: JSON.stringify({ ...kyc,
          confidenceScore: kyc.confidenceScore === "" ? undefined : Number(kyc.confidenceScore),
          email: kyc.email || undefined, dateOfBirth: kyc.dateOfBirth || undefined })
      });
      const next = { ...selected, walletStatus: updated.status === "verified" ? "active" : "inactive", kycRecords: [updated] };
      setSelected(next); setKyc(kycDraft(updated)); setSuccess("KYC record saved."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "KYC update failed"); }
    finally { setBusy(""); }
  }

  async function permanentlyDelete(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    setBusy("delete"); setError(""); setSuccess("");
    try {
      await api(`/admin/users/${selected.id}`, { method: "DELETE",
        body: JSON.stringify({ reason: deleteReason, confirmation: deleteConfirmation }) });
      closeDrawer(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Permanent deletion failed"); }
    finally { setBusy(""); }
  }

  if (loading) return <PageSkeleton />;
  if (error && !users.length) return <Empty title="Couldn’t load customers" detail={error} />;

  return <>
    <div className="page-toolbar"><div><span className="eyebrow">CUSTOMER DIRECTORY</span><h2>{users.length.toLocaleString()} accounts</h2></div><label className="search-box"><Search size={18} /><input aria-label="Search customers" placeholder="Search name, phone or email" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Status</th><th>Tier</th><th>KYC</th><th>Wallet</th><th>Joined</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id} className="clickable" onClick={() => void openUser(user)}><td><div className="person-cell"><span className="avatar">{user.profile?.profileImageUrl ? <img src={user.profile.profileImageUrl} alt="" /> : <UserRound size={16} />}</span><strong>{displayName(user.profile)}</strong></div></td><td className="mono">{user.phoneNumber}</td><td><Status value={user.status} /></td><td><span className={`tier tier-${user.accountTier}`}>{user.accountTier}</span></td><td><Status value={user.kycRecords?.[0]?.status ?? "not_started"} /></td><td><Status value={user.walletStatus} /></td><td>{new Date(user.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</td></tr>)}</tbody></table>{!filtered.length && <div className="table-empty">No customers match this search.</div>}</div></section>

    {selected && draft && <div className="modal-layer" onMouseDown={(e) => e.target === e.currentTarget && closeDrawer()}><aside className="drawer customer-drawer" aria-label="Manage customer"><button className="drawer-close" onClick={closeDrawer} aria-label="Close customer"><X size={20} /></button><div className="drawer-avatar">{selected.profile?.profileImageUrl ? <img src={selected.profile.profileImageUrl} alt="" /> : (selected.profile?.firstName?.[0] ?? "U")}</div><span className="eyebrow">CUSTOMER MANAGEMENT</span><h2>{displayName(selected.profile)}</h2><p className="muted mono">{selected.id}</p>
      <div className="detail-grid"><div><small>Account status</small><Status value={selected.status} /></div><div><small>Wallet</small><Status value={selected.walletStatus} /></div><div><small>KYC</small><Status value={selected.kycRecords?.[0]?.status ?? "not_started"} /></div><div><small>Current tier</small><span className={`tier tier-${selected.accountTier}`}>{selected.accountTier}</span></div></div>
      {error && <div className="error-banner">{error}</div>}{success && <div className="success-banner"><ShieldCheck size={18} />{success}</div>}

      {canManage && <form className="management-section" onSubmit={saveUser}><div className="section-heading"><div><span className="eyebrow">PROFILE</span><h3>Customer details</h3></div><button className="primary-button fit" disabled={Boolean(busy)}><Save size={16} />{busy === "profile" ? "Saving…" : "Save details"}</button></div><div className="two-cols"><label>First name<input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} /></label><label>Last name<input value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} /></label><label>Phone number<input value={draft.phoneNumber} onChange={(e) => setDraft({ ...draft, phoneNumber: e.target.value })} required /></label><label>Email<input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label><label>Date of birth<input type="date" value={draft.dateOfBirth} onChange={(e) => setDraft({ ...draft, dateOfBirth: e.target.value })} /></label><label>Gender<input value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value })} /></label><label>Country<input value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} /></label><label>Profile image URL<input value={draft.profileImageUrl} onChange={(e) => setDraft({ ...draft, profileImageUrl: e.target.value })} /></label><label>Money limit tier<select value={draft.accountTier} onChange={(e) => setDraft({ ...draft, accountTier: e.target.value as User["accountTier"] })}><option value="citizen">Citizen</option><option value="captain">Captain</option><option value="prime">Prime</option></select></label><label>Wallet status<select value={draft.walletStatus} onChange={(e) => setDraft({ ...draft, walletStatus: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div><label>Support notes<textarea rows={3} value={draft.supportNotes} onChange={(e) => setDraft({ ...draft, supportNotes: e.target.value })} /></label><label>Risk notes<textarea rows={3} value={draft.riskNotes} onChange={(e) => setDraft({ ...draft, riskNotes: e.target.value })} /></label></form>}

      {canManage && <form className="management-section" onSubmit={saveStatus}><div className="section-heading"><div><span className="eyebrow">ACCESS</span><h3>Account status</h3></div></div><div className="two-cols"><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="suspended">Suspended</option><option value="disabled">Disabled</option></select></label><label>Reason<input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Reason for this change" /></label></div><button className="secondary-button" disabled={Boolean(busy)}>{busy === "status" ? "Updating…" : "Update account status"}</button><p className="helper">Suspending or disabling immediately revokes sessions, devices, CashDrop and DVA access. Restoring a verified customer re-enables their wallet and payment profile.</p></form>}

      <section className="management-section"><div className="section-heading"><div><span className="eyebrow">IDENTITY</span><h3>KYC record</h3></div></div>{selected.kycRecords?.[0] && kyc ? <form className="management-form" onSubmit={saveKyc}><div className="kyc-summary"><span>Provider: <strong>{selected.kycRecords[0].provider ?? "—"}</strong></span><span>BVN: <strong>{selected.kycRecords[0].bvnMasked ?? "—"}</strong></span><span>NIN: <strong>{selected.kycRecords[0].ninMasked ?? "—"}</strong></span></div><div className="two-cols"><label>KYC status<select disabled={!canManageKyc} value={kyc.status} onChange={(e) => setKyc({ ...kyc, status: e.target.value as KycRecord["status"] })}><option value="not_started">Not started</option><option value="pending">Pending</option><option value="bvn_verified">BVN verified</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label><label>Confidence score<input disabled={!canManageKyc} type="number" min="0" max="100" step="0.0001" value={kyc.confidenceScore} onChange={(e) => setKyc({ ...kyc, confidenceScore: e.target.value })} /></label><label>First name<input disabled={!canManageKyc} value={kyc.firstName} onChange={(e) => setKyc({ ...kyc, firstName: e.target.value })} /></label><label>Middle name<input disabled={!canManageKyc} value={kyc.middleName} onChange={(e) => setKyc({ ...kyc, middleName: e.target.value })} /></label><label>Last name<input disabled={!canManageKyc} value={kyc.lastName} onChange={(e) => setKyc({ ...kyc, lastName: e.target.value })} /></label><label>Email<input disabled={!canManageKyc} type="email" value={kyc.email} onChange={(e) => setKyc({ ...kyc, email: e.target.value })} /></label><label>Provider phone<input disabled={!canManageKyc} value={kyc.phoneNumber} onChange={(e) => setKyc({ ...kyc, phoneNumber: e.target.value })} /></label><label>Date of birth<input disabled={!canManageKyc} type="date" value={kyc.dateOfBirth} onChange={(e) => setKyc({ ...kyc, dateOfBirth: e.target.value })} /></label><label>Gender<input disabled={!canManageKyc} value={kyc.gender} onChange={(e) => setKyc({ ...kyc, gender: e.target.value })} /></label><label>Country<input disabled={!canManageKyc} value={kyc.country} onChange={(e) => setKyc({ ...kyc, country: e.target.value })} /></label></div><div className="check-grid"><label><input disabled={!canManageKyc} type="checkbox" checked={kyc.bvnVerified} onChange={(e) => setKyc({ ...kyc, bvnVerified: e.target.checked })} />BVN verified</label><label><input disabled={!canManageKyc} type="checkbox" checked={kyc.selfieVerified} onChange={(e) => setKyc({ ...kyc, selfieVerified: e.target.checked })} />Selfie verified</label><label><input disabled={!canManageKyc} type="checkbox" checked={kyc.faceMatch} onChange={(e) => setKyc({ ...kyc, faceMatch: e.target.checked })} />Face matched</label><label><input disabled={!canManageKyc} type="checkbox" checked={kyc.syncProfile} onChange={(e) => setKyc({ ...kyc, syncProfile: e.target.checked })} />Sync identity to profile</label></div>{canManageKyc && <button className="secondary-button" disabled={Boolean(busy)}>{busy === "kyc" ? "Saving…" : "Save KYC record"}</button>}</form> : <div className="notice">This customer has no KYC record yet.</div>}</section>

      {canDelete && <form className="management-section danger-zone" onSubmit={permanentlyDelete}><AlertTriangle size={22} /><div><span className="eyebrow">DANGER ZONE</span><h3>Delete customer permanently</h3><p>This irreversibly removes the customer and all linked wallet, transaction, KYC, support and payment records from the database.</p></div><label>Deletion reason<textarea required minLength={3} rows={3} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} /></label><label>Type <strong>DELETE {selected.phoneNumber}</strong><input required value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} /></label><button className="danger-button" disabled={Boolean(busy) || deleteConfirmation !== `DELETE ${selected.phoneNumber}`}><Trash2 size={17} />{busy === "delete" ? "Deleting permanently…" : "Permanently delete user"}</button></form>}
    </aside></div>}
  </>;
}
