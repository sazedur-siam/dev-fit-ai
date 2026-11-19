"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROVIDER_META,
  describeModel,
  isValidModelId,
  type LlmModelOption,
} from "@/lib/providers";
import {
  LLM_PROVIDERS,
  type KeyStatus,
  type LlmProvider,
  type LlmSettings,
} from "@/lib/types";

/** Monogram tile per provider. Plain letters, no vendor logos. */
const MARK: Record<LlmProvider, { letter: string; className: string }> = {
  gemini: { letter: "G", className: "bg-iris-500/15 text-iris-600 dark:text-iris-300" },
  openai: { letter: "O", className: "bg-ink-500/15 text-heading" },
  anthropic: { letter: "C", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
};

function ProviderMark({ provider, size = "md" }: { provider: LlmProvider; size?: "sm" | "md" }) {
  const mark = MARK[provider];
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-extrabold ${mark.className} ${
        size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-base"
      }`}
    >
      {mark.letter}
    </span>
  );
}

function keyStatusFor(settings: LlmSettings, provider: LlmProvider): KeyStatus | undefined {
  return settings.keys.find((k) => k.kind === provider);
}

const FIELD =
  "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-heading placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line";

/**
 * Settings card for the AI provider and model, plus the picker dialog that
 * changes them. Keys typed here go to the server once and come back only as
 * masked previews.
 */
export function AiModelSettings({
  initial,
  serverKeyAllowed,
}: {
  initial: LlmSettings;
  /** False for self-registered accounts, which never use the server's keys. */
  serverKeyAllowed: boolean;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busyKind, setBusyKind] = useState<LlmProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { active, activeSource } = settings;
  const meta = PROVIDER_META[active.provider];

  async function reload() {
    const res = await fetch("/api/llm");
    const json = await res.json();
    if (res.ok) setSettings(json.settings as LlmSettings);
  }

  async function removeKey(provider: LlmProvider) {
    setBusyKind(provider);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/keys?kind=${provider}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not delete key");
      await reload();
      router.refresh();
      setNotice(`${PROVIDER_META[provider].keyLabel} removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete key");
    } finally {
      setBusyKind(null);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-heading">AI model</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-body">
            Reads the repo or your description, then writes the explanations. Two calls
            per fit run. Scoring never uses it: the ranking is the same whichever model
            you pick.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
            activeSource === "none"
              ? "bg-warn-bg text-warn-fg ring-warn-line"
              : "bg-ok-bg text-ok-fg ring-ok-line"
          }`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${activeSource === "none" ? "bg-warn-fg" : "bg-accent"}`}
          />
          {activeSource === "user" ? "Your key" : activeSource === "env" ? "Server key" : "No key"}
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-danger-line bg-danger-bg p-3 text-sm font-medium text-danger-fg">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-xl border border-ok-line bg-ok-bg p-3 text-sm font-medium text-ok-fg">
          {notice}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
        <ProviderMark provider={active.provider} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-heading">
            {describeModel(active.provider, active.model)}
          </div>
          <div className="truncate text-xs text-muted">
            {meta.vendor} · <code className="font-mono">{active.model}</code>
            {!settings.chosen && " · default"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-contrast transition hover:bg-accent-hover"
        >
          Change model
        </button>
      </div>

      {activeSource === "none" && (
        <p className="mt-3 text-xs font-medium text-warn-fg">
          Fit runs will fail until you add an {meta.keyLabel} or pick a provider you have a key for.
        </p>
      )}

      <h3 className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        Saved provider keys
      </h3>
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
        {LLM_PROVIDERS.map((provider) => {
          const status = keyStatusFor(settings, provider);
          const onServer = settings.serverProviders.includes(provider);
          return (
            <li key={provider} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
              <ProviderMark provider={provider} size="sm" />
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-semibold text-heading">{PROVIDER_META[provider].label}</div>
                <div className="text-muted">
                  {status?.isSet ? (
                    <>
                      <code className="font-mono">{status.preview}</code>
                      {status.updatedAt && ` · updated ${status.updatedAt.slice(0, 10)}`}
                    </>
                  ) : onServer ? (
                    "Not set · the server's key is used"
                  ) : (
                    "Not set"
                  )}
                </div>
              </div>
              {status?.isSet && (
                <button
                  type="button"
                  disabled={busyKind === provider}
                  onClick={() => void removeKey(provider)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-body transition hover:border-danger-line hover:bg-danger-bg hover:text-danger-fg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyKind === provider ? "Deleting…" : "Delete"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {open && (
        <ModelPickerDialog
          settings={settings}
          serverKeyAllowed={serverKeyAllowed}
          onClose={() => setOpen(false)}
          onSaved={(next) => {
            setSettings(next);
            setOpen(false);
            setError(null);
            setNotice(`Now using ${describeModel(next.active.provider, next.active.model)}.`);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

type ModelList =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "loaded"; models: LlmModelOption[] }
  | { state: "error"; message: string };

type TestResult =
  | { state: "idle" }
  | { state: "running" }
  | { state: "ok"; ms: number }
  | { state: "fail"; message: string };

const CUSTOM = "__custom__";
/** Shared, so a provider with no list yet doesn't hand useMemo a new object each render. */
const IDLE_LIST: ModelList = { state: "idle" };

function ModelPickerDialog({
  settings,
  serverKeyAllowed,
  onClose,
  onSaved,
}: {
  settings: LlmSettings;
  serverKeyAllowed: boolean;
  onClose: () => void;
  onSaved: (next: LlmSettings) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [provider, setProvider] = useState<LlmProvider>(settings.active.provider);
  /** The chosen model per provider, so switching tabs doesn't lose a pick. */
  const [picked, setPicked] = useState<Record<LlmProvider, string>>(() => {
    const out = { ...settings.defaults };
    out[settings.active.provider] = settings.active.model;
    return out;
  });
  /** Providers where the user chose "Other model id…" and is typing one. */
  const [customMode, setCustomMode] = useState<Partial<Record<LlmProvider, boolean>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<LlmProvider, string>>>({});
  const [lists, setLists] = useState<Partial<Record<LlmProvider, ModelList>>>({});
  const [filter, setFilter] = useState("");
  const [test, setTest] = useState<TestResult>({ state: "idle" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = PROVIDER_META[provider];
  const stored = keyStatusFor(settings, provider);
  const hasStored = Boolean(stored?.isSet);
  const onServer = settings.serverProviders.includes(provider);
  const draftKey = (drafts[provider] ?? "").trim();
  const canUse = hasStored || onServer || draftKey.length > 0;
  const list = lists[provider] ?? IDLE_LIST;

  // Open as a modal: the browser traps focus, handles Escape and the backdrop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const options = useMemo(() => {
    const curated = meta.models;
    const live = list.state === "loaded" ? list.models : [];
    const seen = new Set(curated.map((m) => m.id));
    const merged = [...curated, ...live.filter((m) => !seen.has(m.id))];
    const q = filter.trim().toLowerCase();
    return q
      ? merged.filter((m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q))
      : merged;
  }, [meta.models, list, filter]);

  const knownIds = new Set([
    ...meta.models.map((m) => m.id),
    ...(list.state === "loaded" ? list.models.map((m) => m.id) : []),
  ]);
  const current = picked[provider];
  // An id that isn't in any list (typed earlier, or saved before) shows as custom.
  const selection = customMode[provider] || !knownIds.has(current) ? CUSTOM : current;
  const model = current.trim();
  const modelValid = isValidModelId(model);

  async function loadModels(p: LlmProvider, key?: string) {
    setLists((prev) => ({ ...prev, [p]: { state: "loading" } }));
    try {
      const res = await fetch("/api/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p, apiKey: key || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not load models");
      setLists((prev) => ({
        ...prev,
        [p]: json.live ? { state: "loaded", models: json.models } : { state: "idle" },
      }));
    } catch (err) {
      setLists((prev) => ({
        ...prev,
        [p]: { state: "error", message: err instanceof Error ? err.message : "Could not load models" },
      }));
    }
  }

  // Load the live list once per provider when a stored or server key exists.
  useEffect(() => {
    if (lists[provider] === undefined && (hasStored || onServer)) void loadModels(provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  function choose(id: string) {
    setTest({ state: "idle" });
    if (id === CUSTOM) {
      setCustomMode((prev) => ({ ...prev, [provider]: true }));
      // Start empty rather than pre-filled with a listed id.
      if (knownIds.has(current)) setPicked((prev) => ({ ...prev, [provider]: "" }));
      return;
    }
    setCustomMode((prev) => ({ ...prev, [provider]: false }));
    setPicked((prev) => ({ ...prev, [provider]: id }));
  }

  function switchProvider(next: LlmProvider) {
    setProvider(next);
    setFilter("");
    setTest({ state: "idle" });
    setError(null);
  }

  async function runTest() {
    setTest({ state: "running" });
    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey: draftKey || undefined }),
      });
      const json = await res.json();
      if (json.ok) setTest({ state: "ok", ms: json.ms });
      else setTest({ state: "fail", message: json.error || "The test call failed" });
    } catch {
      setTest({ state: "fail", message: "Could not reach the server" });
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/llm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey: draftKey || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not save");
      onSaved(json.settings as LlmSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      aria-labelledby="model-picker-title"
      className="m-auto w-[min(42rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-body shadow-pop backdrop:bg-ink-950/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[min(46rem,calc(100dvh-2rem))] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id="model-picker-title" className="text-base font-bold text-heading">
              Choose your AI model
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Your key, your quota. The ranking itself never changes with the model.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-heading"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Provider */}
          <div role="radiogroup" aria-label="Provider" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {LLM_PROVIDERS.map((p) => {
              const selected = p === provider;
              const own = keyStatusFor(settings, p)?.isSet;
              const server = settings.serverProviders.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => switchProvider(p)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-accent bg-accent-soft ring-2 ring-accent-line"
                      : "border-line hover:border-line-strong hover:bg-surface-2"
                  }`}
                >
                  <ProviderMark provider={p} />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-heading">{PROVIDER_META[p].label}</span>
                    <span className={`block text-[11px] font-semibold ${own || server ? "text-ok-fg" : "text-muted"}`}>
                      {own ? "Key saved" : server ? "Server key" : "No key yet"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Key */}
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="picker-key" className="text-xs font-bold text-heading">
                {meta.keyLabel}
              </label>
              <a
                href={meta.keyLink}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-accent-soft-fg transition hover:text-accent"
              >
                Get a key →
              </a>
            </div>
            {hasStored && (
              <p className="mt-1 text-xs text-muted">
                Saved as <code className="font-mono">{stored?.preview}</code>
                {stored?.updatedAt && ` · updated ${stored.updatedAt.slice(0, 10)}`}. Leave
                blank to keep it.
              </p>
            )}
            {!hasStored && onServer && serverKeyAllowed && (
              <p className="mt-1 text-xs text-muted">
                The server has a {meta.label} key you can use. Add your own to use your quota instead.
              </p>
            )}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="picker-key"
                type="password"
                autoComplete="off"
                value={drafts[provider] ?? ""}
                onChange={(e) => {
                  setDrafts((prev) => ({ ...prev, [provider]: e.target.value }));
                  setTest({ state: "idle" });
                }}
                placeholder={hasStored ? "Paste a new key to replace" : meta.keyPlaceholder}
                className={`${FIELD} flex-1 font-mono placeholder:font-sans`}
              />
              {draftKey && (
                <button
                  type="button"
                  onClick={() => void loadModels(provider, draftKey)}
                  className="rounded-lg border border-line px-3.5 py-2 text-xs font-semibold text-body transition hover:bg-surface-2"
                >
                  Load models with this key
                </button>
              )}
            </div>
          </div>

          {/* Model */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span id="picker-model-label" className="text-xs font-bold text-heading">
                Model
              </span>
              <span className="text-[11px] text-muted">
                {list.state === "loading"
                  ? `Loading ${meta.label} models…`
                  : list.state === "loaded"
                    ? `${list.models.length} available to your key`
                    : canUse
                      ? "Suggested models"
                      : "Suggested models · add a key to see all"}
              </span>
            </div>
            {list.state === "error" && (
              <p className="mt-1 text-xs font-medium text-danger-fg">{list.message}</p>
            )}
            {(list.state === "loaded" && list.models.length > 6) && (
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter models"
                aria-label="Filter models"
                className={`${FIELD} mt-2 py-2`}
              />
            )}
            <div
              role="radiogroup"
              aria-labelledby="picker-model-label"
              className="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-xl border border-line p-1.5"
            >
              {options.map((m) => {
                const selected = selection === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => choose(m.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                      selected ? "bg-accent-soft" : "hover:bg-surface-2"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                        selected ? "border-accent bg-accent" : "border-line-strong"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-heading">{m.label}</span>
                      <span className="block truncate font-mono text-[11px] text-muted">{m.id}</span>
                    </span>
                    {m.note && <span className="shrink-0 text-[11px] text-muted">{m.note}</span>}
                    {m.id === settings.defaults[provider] && !m.note?.includes("default") && (
                      <span className="shrink-0 text-[11px] text-muted">default</span>
                    )}
                  </button>
                );
              })}
              {options.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted">No models match &ldquo;{filter}&rdquo;.</p>
              )}
              <button
                type="button"
                role="radio"
                aria-checked={selection === CUSTOM}
                onClick={() => choose(CUSTOM)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
                  selection === CUSTOM ? "bg-accent-soft" : "hover:bg-surface-2"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                    selection === CUSTOM ? "border-accent bg-accent" : "border-line-strong"
                  }`}
                />
                <span className="text-sm font-semibold text-heading">Other model id…</span>
              </button>
            </div>
            {selection === CUSTOM && (
              <input
                autoFocus
                value={current}
                onChange={(e) => {
                  setPicked((prev) => ({ ...prev, [provider]: e.target.value }));
                  setTest({ state: "idle" });
                }}
                placeholder={`e.g. ${meta.defaultModel}`}
                aria-label="Custom model id"
                className={`${FIELD} mt-2 font-mono placeholder:font-sans`}
              />
            )}
            {selection === CUSTOM && model && !modelValid && (
              <p className="mt-1 text-xs text-danger-fg">
                Use the id exactly as {meta.vendor} writes it: letters, digits, dots, dashes.
              </p>
            )}
          </div>

          {/* Test */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <button
              type="button"
              disabled={!canUse || !modelValid || test.state === "running"}
              onClick={() => void runTest()}
              className="rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-bold text-heading transition hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {test.state === "running" ? "Testing…" : "Test connection"}
            </button>
            <p className="min-w-0 flex-1 text-xs" aria-live="polite">
              {test.state === "idle" &&
                (canUse ? (
                  <span className="text-muted">Makes one tiny real call to {model || "the model"}.</span>
                ) : (
                  <span className="text-muted">Add a key to test.</span>
                ))}
              {test.state === "running" && <span className="text-muted">Calling {meta.label}…</span>}
              {test.state === "ok" && (
                <span className="font-semibold text-ok-fg">
                  Works. Replied in {(test.ms / 1000).toFixed(1)}s.
                </span>
              )}
              {test.state === "fail" && <span className="font-medium text-danger-fg">{test.message}</span>}
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-danger-line bg-danger-bg p-3 text-sm font-medium text-danger-fg">
              {error}
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-body transition hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !canUse || !modelValid}
            onClick={() => void save()}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-contrast transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : `Use ${modelValid ? describeModel(provider, model) : "this model"}`}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
