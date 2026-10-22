import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { api, displayName, formatMoney } from "../api";
import type { Transaction } from "../types";
import { Empty, PageSkeleton, Status } from "./DashboardPage";

export default function TransactionsPage() {
  const [items, setItems] = useState<Transaction[]>([]); const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [reversals, setReversals] = useState<{ count: number; reversalAmount: number; providerCharges: number; totalSpend: number } | null>(null);
  const load = () => { setLoading(true); Promise.all([
    api<Transaction[]>(`/admin/transactions?take=100${status ? `&status=${status}` : ""}`).then(setItems),
    api<{ count: number; reversalAmount: number; providerCharges: number; totalSpend: number }>("/admin/transactions/money-limit-reversals").then(setReversals).catch(() => setReversals(null)),
  ]).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, [status]);
  const filtered = items.filter((tx) => `${tx.reference} ${displayName(tx.user?.profile)} ${tx.type}`.toLowerCase().includes(query.toLowerCase()));
  if (error && !items.length) return <Empty title="Couldn’t load transactions" detail={error} />;
  if (loading && !items.length) return <PageSkeleton />;
  return <><div className="page-toolbar"><div><span className="eyebrow">LEDGER ACTIVITY</span><h2>Every movement, accounted for.</h2></div><div className="toolbar-actions"><label className="search-box"><Search size={18} /><input placeholder="Search reference or customer" value={query} onChange={(e) => setQuery(e.target.value)} /></label><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="successful">Successful</option><option value="failed">Failed</option><option value="reversed">Reversed</option></select><button className="icon-button" onClick={load}><RefreshCw size={18} /></button></div></div>
    {reversals && <section className="panel"><div className="panel-head"><div><span className="eyebrow">MONEY LIMIT REVERSALS</span><h2>{formatMoney(reversals.totalSpend)}</h2></div><span className="soft-pill">{reversals.count} reversals</span></div><p>Returned funds: {formatMoney(reversals.reversalAmount)} · Provider charges: {formatMoney(reversals.providerCharges)}</p></section>}
    <section className="panel"><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Reference</th><th>Type</th><th>Amount</th><th>Fee</th><th>Status</th><th>Date</th></tr></thead><tbody>{filtered.map((tx) => <tr key={tx.id}><td><strong>{displayName(tx.user?.profile, tx.user?.phoneNumber)}</strong></td><td className="mono">{tx.reference}</td><td>{tx.type.replaceAll("_", " ")}</td><td><strong>{formatMoney(tx.amount, tx.currency)}</strong></td><td>{formatMoney(tx.fee, tx.currency)}</td><td><Status value={tx.status} /></td><td>{new Date(tx.createdAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td></tr>)}</tbody></table></div></section></>;
}
