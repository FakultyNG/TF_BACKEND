import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, MessageCircle, Users } from "lucide-react";
import { api, displayName, formatMoney } from "../api";
import type { Transaction } from "../types";

type Dashboard = { summary: { users: number; activeUsers: number; walletBalance: number; todayTransactions: number; todayVolume: number; openConversations: number }; recentTransactions: Transaction[] };

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<Dashboard>("/admin/dashboard").then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <Empty title="Couldn’t load your overview" detail={error} />;
  if (!data) return <PageSkeleton />;
  const cards = [
    { label: "Customer wallets", value: formatMoney(data.summary.walletBalance), note: `${data.summary.activeUsers.toLocaleString()} active users`, icon: CircleDollarSign, tone: "red" },
    { label: "Total customers", value: data.summary.users.toLocaleString(), note: "Verified Transfa accounts", icon: Users, tone: "purple" },
    { label: "Volume today", value: formatMoney(data.summary.todayVolume), note: `${data.summary.todayTransactions} transactions`, icon: ArrowUpRight, tone: "green" },
    { label: "Open conversations", value: data.summary.openConversations.toLocaleString(), note: "Support needs attention", icon: MessageCircle, tone: "orange" }
  ];
  return <>
    <section className="welcome-card"><div><span className="eyebrow light">TODAY AT TRANSFA</span><h2>Keep every money moment moving.</h2><p>Live operational health, customer activity and the latest transfers in one view.</p></div><div className="pulse-visual"><span /><span /><span /><strong>TF</strong></div></section>
    <section className="metric-grid">{cards.map(({ label, value, note, icon: Icon, tone }) => <article className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon size={20} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">MONEY MOVEMENT</span><h2>Recent transactions</h2></div><span className="soft-pill">Live feed</span></div>
      <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Reference</th><th>Type</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead><tbody>{data.recentTransactions.map((tx) => <tr key={tx.id}><td><div className="person-cell"><span>{tx.type.includes("fund") ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><div><strong>{displayName(tx.user?.profile, tx.user?.phoneNumber)}</strong><small>{tx.user?.phoneNumber}</small></div></div></td><td className="mono">{tx.reference}</td><td>{tx.type.replaceAll("_", " ")}</td><td><strong>{formatMoney(tx.amount, tx.currency)}</strong></td><td><Status value={tx.status} /></td><td>{new Date(tx.createdAt).toLocaleString("en-NG", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</td></tr>)}</tbody></table></div>
    </section>
  </>;
}

export function Status({ value }: { value: string }) { return <span className={`status status-${value}`}>{value.replaceAll("_", " ")}</span>; }
export function Empty({ title, detail }: { title: string; detail: string }) { return <div className="empty-state"><strong>{title}</strong><p>{detail}</p></div>; }
export function PageSkeleton() { return <div className="skeleton-page"><div /><div className="metric-grid"><i /><i /><i /><i /></div><div /></div>; }
