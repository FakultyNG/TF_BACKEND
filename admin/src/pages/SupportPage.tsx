import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { FileText, Image, Paperclip, Search, Send } from "lucide-react";
import { api, displayName } from "../api";
import type { ChatMessage, Conversation } from "../types";

type Thread = { user: { id: string; phoneNumber: string; profile?: Conversation["profile"] }; messages: ChatMessage[] };

export default function SupportPage({ canReply }: { canReply: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([]); const [active, setActive] = useState<Conversation | null>(null);
  const [thread, setThread] = useState<Thread | null>(null); const [search, setSearch] = useState(""); const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const bottom = useRef<HTMLDivElement>(null);
  const loadList = () => api<{ items: Conversation[] }>(`/admin/support/tickets/conversations/list${search ? `?search=${encodeURIComponent(search)}` : ""}`).then((r) => { setConversations(r.items); if (!active && r.items[0]) setActive(r.items[0]); }).catch((e) => setError(e.message));
  const loadThread = () => active && api<Thread>(`/admin/support/tickets/conversations/${active.userId}`).then(setThread).catch((e) => setError(e.message));
  useEffect(() => { const id = setTimeout(loadList, 250); return () => clearTimeout(id); }, [search]);
  useEffect(() => { setThread(null); loadThread(); if (!active) return; const id = setInterval(loadThread, 5000); return () => clearInterval(id); }, [active?.userId]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [thread?.messages.length]);
  async function send(event: FormEvent) {
    event.preventDefault(); if (!active || (!message.trim() && !files.length)) return; setBusy(true); setError("");
    try {
      const attachmentUrls: string[] = [];
      for (const file of files) { const form = new FormData(); form.append("file", file); const uploaded = await api<{ attachmentUrl: string }>("/admin/support/tickets/attachments/upload", { method: "POST", body: form }); attachmentUrls.push(uploaded.attachmentUrl); }
      await api(`/admin/support/tickets/conversations/${active.userId}/messages`, { method: "POST", body: JSON.stringify({ message: message.trim() || "Attachment", attachmentUrls }) });
      setMessage(""); setFiles([]); await loadThread(); await loadList();
    } catch (e) { setError(e instanceof Error ? e.message : "Message failed"); } finally { setBusy(false); }
  }
  function addFiles(event: ChangeEvent<HTMLInputElement>) { setFiles(Array.from(event.target.files ?? []).slice(0, 5)); event.target.value = ""; }
  return <section className="chat-shell">
    <aside className="conversation-list"><div className="chat-list-head"><div><span className="eyebrow">INBOX</span><h2>Messages</h2></div><span className="count-badge">{conversations.length}</span></div><label className="search-box compact"><Search size={17} /><input placeholder="Find a customer" value={search} onChange={(e) => setSearch(e.target.value)} /></label><div className="conversation-scroll">{conversations.map((item) => <button key={item.userId} className={active?.userId === item.userId ? "active" : ""} onClick={() => setActive(item)}><span className="conversation-avatar">{item.profile?.profileImageUrl ? <img src={item.profile.profileImageUrl} /> : (item.profile?.firstName?.[0] ?? "U")}</span><div><strong>{displayName(item.profile, item.phoneNumber)}</strong><p>{item.hasAttachment ? "📎 " : ""}{item.lastMessage}</p></div><small>{item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : ""}</small></button>)}</div></aside>
    <div className="chat-room">{active ? <><header className="chat-header"><span className="conversation-avatar large">{active.profile?.profileImageUrl ? <img src={active.profile.profileImageUrl} /> : (active.profile?.firstName?.[0] ?? "U")}</span><div><h3>{displayName(active.profile, active.phoneNumber)}</h3><p>{active.phoneNumber} · <span className="online-text">Transfa customer</span></p></div></header><div className="message-scroll">{thread?.messages.map((item) => <div className={`message-row ${item.sender === "admin" ? "mine" : ""}`} key={item.id}><div className="message-bubble"><p>{item.message}</p>{item.attachments?.map((file) => <a href={file.url} target="_blank" rel="noreferrer" key={file.id}>{file.fileType.startsWith("image/") ? <Image size={16} /> : <FileText size={16} />}<span>{file.fileName}</span></a>)}<small>{new Date(item.createdAt).toLocaleString("en-NG", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</small></div></div>)}<div ref={bottom} /></div>{error && <div className="chat-error">{error}</div>}{canReply && <form className="composer" onSubmit={send}>{files.length > 0 && <div className="file-preview">{files.map((file) => <span key={file.name}>{file.name}</span>)}</div>}<label className="attach-button"><Paperclip size={20} /><input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={addFiles} /></label><textarea rows={1} placeholder="Write a message…" value={message} onChange={(e) => setMessage(e.target.value)} /><button disabled={busy || (!message.trim() && !files.length)}>{busy ? <span className="button-spinner" /> : <Send size={19} />}</button></form>}</> : <div className="no-chat"><MessageCircleIcon /><h3>Your conversations live here</h3><p>Select a customer to open the full message history.</p></div>}</div>
  </section>;
}

function MessageCircleIcon() { return <div className="empty-chat-icon"><Send size={26} /></div>; }
