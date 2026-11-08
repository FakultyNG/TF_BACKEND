import { useEffect, useState } from "react";
import { Camera, CheckCircle2, ScanFace, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { Empty, PageSkeleton } from "./DashboardPage";

type KycLivenessSetting = {
  enabled: boolean;
  mode: "static" | "bytid_liveness";
  source: "admin" | "environment";
  updatedAt?: string | null;
};

export default function KycSettingsPage() {
  const [setting, setSetting] = useState<KycLivenessSetting | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<KycLivenessSetting>("/admin/cash-drop/kyc-liveness")
      .then(setSetting)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load KYC settings"));
  }, []);

  async function update(enabled: boolean) {
    if (!setting || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api<KycLivenessSetting>("/admin/cash-drop/kyc-liveness", {
        method: "PATCH",
        body: JSON.stringify({ enabled })
      });
      setSetting(updated);
      setSuccess(enabled
        ? "BytID liveness is now required before BVN face matching."
        : "Liveness is off. Face-shot-to-BVN matching remains required.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update KYC settings");
    } finally {
      setBusy(false);
    }
  }

  if (!setting && error) return <Empty title="Couldn’t load KYC settings" detail={error} />;
  if (!setting) return <PageSkeleton />;

  return <>
    <section className="page-toolbar">
      <div><span className="eyebrow">IDENTITY VERIFICATION</span><h2>New-user face verification</h2><p className="muted">Choose whether registration includes BytID’s live anti-spoof check.</p></div>
    </section>
    {error && <div className="error-banner settings-message">{error}</div>}
    {success && <div className="success-banner settings-message"><CheckCircle2 size={17} />{success}</div>}
    <section className="panel kyc-settings-panel">
      <div className="kyc-setting-main">
        <div className={`setting-icon ${setting.enabled ? "enabled" : ""}`}><ScanFace size={27} /></div>
        <div>
          <span className="eyebrow">BYTID LIVENESS</span>
          <h2>{setting.enabled ? "Liveness verification enabled" : "Direct BVN face match enabled"}</h2>
          <p>{setting.enabled
            ? "The user completes BytID liveness, then their verified live face is matched with the BVN image."
            : "The app captures a face shot and matches it directly with the BVN image. Registration proceeds only after a match."}</p>
        </div>
        <label className="toggle-control">
          <input type="checkbox" checked={setting.enabled} disabled={busy} onChange={(event) => void update(event.target.checked)} />
          <span aria-hidden="true" />
          <strong>{busy ? "Updating…" : setting.enabled ? "Enabled" : "Disabled"}</strong>
        </label>
      </div>
      <div className="verification-paths">
        <article className={!setting.enabled ? "active" : ""}><Camera size={20} /><div><strong>Liveness disabled</strong><p>Face shot → BVN image comparison → continue only if matched</p></div></article>
        <article className={setting.enabled ? "active" : ""}><ShieldCheck size={20} /><div><strong>Liveness enabled</strong><p>BytID live check → BVN image comparison → continue only if matched</p></div></article>
      </div>
      <p className="setting-meta">Face matching cannot be disabled. Current setting source: <strong>{setting.source}</strong>{setting.updatedAt ? ` · Last changed ${new Date(setting.updatedAt).toLocaleString("en-NG")}` : ""}</p>
    </section>
  </>;
}
