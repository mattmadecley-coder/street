"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./fit-wars.module.css";

const COMMENTARY_DURATION_MS = 5000;

type Message = { id: string; body: string; link_label: string | null; link_url: string | null; position: number };
type Matchup = {
  id: string;
  position: number;
  duration_ms: number;
  left: { id: string; display_name: string; image_url: string };
  right: { id: string; display_name: string; image_url: string };
  messages: Message[];
};
type TransparentProduct = { id: string; title: string; imageUrl: string; transparentFraction: number; width: number; height: number; format: string | null };
type Experience = {
  campaign: { code: string; school_name: string; label: string; headline: string; results_headline: string; results_copy: string; results_note: string; marketing_label: string };
  matchups: Matchup[];
  publicUrl: string;
  transparentProducts: TransparentProduct[];
};

function id() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pickMessage(messages: Message[], left: string, right: string) {
  if (messages.length) return messages[Math.floor(Math.random() * messages.length)];
  return { id: "fallback", body: Math.random() > 0.5 ? "Not bad. But we have seen harder pieces on Street." : "Think you can dress better? Prove it.", link_label: null, link_url: null, position: 1 };
}

export default function FitWarsClient({ experience, preview = false }: { experience: Experience; preview?: boolean }) {
  const { campaign, matchups } = experience;
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"compare" | "commentary" | "email" | "success" | "error">("compare");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sessionId = useRef(id());
  const roundTimer = useRef<number | null>(null);
  const current = matchups[round];
  const isLast = round === matchups.length - 1;
  const progressLabel = phase === "email" || phase === "success" ? `${matchups.length} / ${matchups.length}` : `${Math.min(round + 1, matchups.length)} / ${matchups.length}`;
  const commentaryProducts = useMemo(() => {
    if (!message || !experience.transparentProducts.length) return [];
    return [...experience.transparentProducts].sort((left, right) => `${message.id}:${left.id}`.localeCompare(`${message.id}:${right.id}`)).slice(0, 10);
  }, [experience.transparentProducts, message]);

  const utm = useMemo(() => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    return { utmSource: params.get("utm_source"), utmMedium: params.get("utm_medium"), utmCampaign: params.get("utm_campaign"), utmContent: params.get("utm_content") };
  }, []);

  async function event(type: string, metadata: Record<string, unknown> = {}, matchupId?: string) {
    if (preview) return;
    try {
      await fetch(`/api/fit-wars/${encodeURIComponent(campaign.code)}/events`, {
        method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
        body: JSON.stringify({ type, sessionId: sessionId.current, eventId: id(), matchupId, metadata, ...utm, referrer: typeof document !== "undefined" ? document.referrer : null }),
      });
    } catch {}
  }

  useEffect(() => {
    void event("landing");
    if (current) void event("matchup_view", {}, current.id);
    return () => { if (roundTimer.current) window.clearTimeout(roundTimer.current); };
    // Only the initial landing event should fire here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === "compare" && current && round > 0) void event("matchup_view", {}, current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, phase]);

  function advance() {
    if (isLast) {
      setPhase("email");
      void event("email_form_view");
      void event("session_complete");
      return;
    }
    setRound((value) => value + 1);
    setSelected(null);
    setMessage(null);
    setPhase("compare");
  }

  async function vote(choiceId: string) {
    if (!current || phase !== "compare" || busy) return;
    setBusy(true);
    setSelected(choiceId);
    setError("");
    try {
      if (!preview) {
        const response = await fetch(`/api/fit-wars/${encodeURIComponent(campaign.code)}/vote`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId.current, matchupId: current.id, choiceId, eventId: id() }),
        });
        const data = await response.json() as { ok: boolean; error?: string };
        if (!data.ok) throw new Error(data.error ?? "That vote could not be saved.");
      }
      const picked = pickMessage(current.messages, current.left.display_name, current.right.display_name);
      setMessage(picked);
      setPhase("commentary");
      void event("commentary_view", { messageId: picked.id }, current.id);
      roundTimer.current = window.setTimeout(advance, COMMENTARY_DURATION_MS);
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "That vote could not be saved. Try again.");
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function submitResults(eventObject: React.FormEvent) {
    eventObject.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!preview) {
        const response = await fetch(`/api/fit-wars/${encodeURIComponent(campaign.code)}/results`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId.current, email, marketingOptIn: marketing, eventId: id() }),
        });
        const data = await response.json() as { ok: boolean; error?: string };
        if (!data.ok) throw new Error(data.error ?? "We couldn't send the results.");
      }
      setPhase("success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We couldn't send the results.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    void event("share");
    try {
      if (navigator.share) await navigator.share({ title: `${campaign.school_name} Fit Wars`, text: "Vote on the best fit.", url: experience.publicUrl });
      else await navigator.clipboard.writeText(experience.publicUrl);
    } catch {}
  }

  return (
    <div className={`${styles.shell} ${phase === "compare" || phase === "error" ? styles.compareShell : ""}`}>
      {preview ? <div className={styles.previewNotice}>Preview mode · this campaign is not public yet.</div> : null}
      <header className={styles.topbar}>
        <a href="/" className={styles.logo} aria-label="Street home">STREET</a>
        <div className={styles.campaignMeta}>
          <div className={styles.campaignLabel}>{campaign.label || `${campaign.school_name} FIT WARS`}</div>
          <div className={styles.progress} aria-label={`Round ${progressLabel}`}>{progressLabel}</div>
        </div>
      </header>

      {phase === "compare" || phase === "error" ? (
        <section className={styles.compareStage} aria-labelledby="fit-wars-question">
          <h1 id="fit-wars-question">{campaign.headline}</h1>
          <div className={styles.votes} aria-label="Choose an outfit">
            {[current.left, current.right].map((outfit, index) => (
              <button key={outfit.id} type="button" className={`${styles.outfit} ${selected === outfit.id ? styles.selected : ""}`} onClick={() => void vote(outfit.id)} disabled={busy} aria-label={`Choose ${index === 0 ? "left" : "right"} outfit`}>
                <img src={outfit.image_url} alt={`${index === 0 ? "Left" : "Right"} outfit`} loading={round === 0 ? "eager" : "lazy"} />
              </button>
            ))}
          </div>
          {phase === "error" ? <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => setPhase("compare")}>Try again</button></div> : null}
        </section>
      ) : null}

      {phase === "commentary" && message ? (
        <section className={styles.interstitial} aria-live="polite">
          <div className={styles.commentaryProducts} aria-hidden="true">
            {commentaryProducts.map((product) => <img key={product.id} className={styles.commentaryProduct} src={product.imageUrl} alt="" />)}
          </div>
          <div className={styles.interstitialCopy}>{message.body}{message.link_url ? <> <a href={message.link_url} onClick={() => void event("street_click", { url: message.link_url }, current.id)}>{message.link_label || "Shop it on Street"}</a></> : null}</div>
          <div className={styles.timer} aria-hidden="true"><span /></div>
        </section>
      ) : null}

      {phase === "email" || phase === "success" ? (
        <section className={styles.resultsStage} aria-labelledby="results-title">
          {phase === "success" ? (
            <div className={styles.success}>
              <p className={styles.roundLabel}>IN YOUR INBOX</p>
              <h1 id="results-title">RESULTS ARE ON THE WAY.</h1>
              <p>Check {email}. While you wait, there is more to discover on Street.</p>
              <div className={styles.successActions}><a href="/catalog" className={styles.primaryLink}>EXPLORE STREET</a><button type="button" onClick={() => void share()} className={styles.secondaryLink}>SHARE FIT WARS</button></div>
            </div>
          ) : (
            <form className={styles.resultsForm} onSubmit={submitResults}>
              <p className={styles.roundLabel}>ALL ROUNDS COMPLETE</p>
              <h1 id="results-title">{campaign.results_headline}</h1>
              <p>{campaign.results_copy}</p>
              <p>{campaign.results_note}</p>
              <label className={styles.emailLabel} htmlFor="fit-wars-email">Email address</label>
              <input id="fit-wars-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(eventObject) => setEmail(eventObject.target.value)} required placeholder="you@example.com" />
              <label className={styles.checkbox}><input type="checkbox" checked={marketing} onChange={(eventObject) => setMarketing(eventObject.target.checked)} /> <span>{campaign.marketing_label}</span></label>
              <p className={styles.privacy}>Your results request is separate from marketing consent. See our <a href="/privacy">privacy policy</a>.</p>
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              <button className={styles.submit} type="submit" disabled={!email || busy}>{busy ? "SENDING…" : "SEND ME THE RESULTS"}</button>
              <button type="button" className={styles.shareButton} onClick={() => void share()}>SHARE THIS CAMPAIGN</button>
            </form>
          )}
        </section>
      ) : null}

      <div className={styles.preload} aria-hidden="true">{matchups.slice(round + 1, round + 2).flatMap((next) => [next.left, next.right]).map((outfit) => <img key={outfit.id} src={outfit.image_url} alt="" />)}</div>
    </div>
  );
}
