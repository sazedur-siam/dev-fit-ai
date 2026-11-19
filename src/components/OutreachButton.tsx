"use client";

import { useState } from "react";
import type { OutreachDraft, OutreachTone } from "@/lib/outreach";

/**
 * "Draft message" on a fit result: Gemini writes a first-contact email from the
 * facts of this match; the PM edits it, then copies it, opens it in their own
 * email client, or saves it to their private notes on the developer. DevFit
 * never sends anything itself.
 */
export function OutreachButton({
  developerId,
  developerName,
  analysisId,
}: {
  developerId: string;
  developerName: string;
  /** Null when the analysis couldn't be saved; drafting needs it. */
  analysisId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<OutreachTone>("friendly");
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate() {
    if (!analysisId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, developerId, tone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setDraft(json.draft as OutreachDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setNotice("Copied.");
    } catch {
      setNotice("Couldn't copy automatically; select the text and copy it.");
    }
  }

  async function saveToNotes() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/developers/${encodeURIComponent(developerId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: `Outreach drafted: ${draft.subject}\n\n${draft.body}` }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setNotice(`Saved to your notes on ${developerName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const mailto = draft
    ? `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
    : "#";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!analysisId}
        title={analysisId ? undefined : "This run wasn't saved to history, so it can't be drafted from."}
        aria-expanded={open}
        className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-body transition hover:border-accent hover:text-heading disabled:cursor-not-allowed disabled:opacity-50"
      >
        ✉ Draft message
      </button>

      {open && (
        <div className="mt-4 w-full basis-full rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-body">
              Tone
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as OutreachTone)}
                className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-heading"
              >
                <option value="friendly">Friendly</option>
                <option value="formal">Formal</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-contrast transition hover:bg-accent-hover disabled:opacity-50"
            >
              {busy && !draft ? "Writing…" : draft ? "Rewrite" : "Write draft"}
            </button>
            <span className="text-[11px] text-muted">
              Drafted by Gemini from this match. You review and send it yourself.
            </span>
          </div>

          {error && <p className="mt-3 text-xs font-medium text-danger-fg">{error}</p>}

          {draft && (
            <div className="mt-4 space-y-2">
              {draft.warnings.map((w) => (
                <p
                  key={w}
                  className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs font-medium text-warn-fg"
                >
                  {w}
                </p>
              ))}
              <input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                aria-label="Subject"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-heading focus:border-accent focus:outline-none"
              />
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={9}
                aria-label="Message"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-body focus:border-accent focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-body hover:text-heading"
                >
                  Copy
                </button>
                <a
                  href={mailto}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-body hover:text-heading"
                >
                  Open in email
                </a>
                <button
                  type="button"
                  onClick={() => void saveToNotes()}
                  disabled={busy}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-body hover:text-heading disabled:opacity-50"
                >
                  Save to notes
                </button>
                {notice && <span className="text-xs text-ok-fg">{notice}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
