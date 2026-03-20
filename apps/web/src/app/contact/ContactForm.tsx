"use client";

import { useState, useEffect, useRef } from "react";

type IssueType = "bug" | "wrong-price" | "store-request" | "enhancement" | "feedback";

const ISSUE_TYPES: Array<{ value: IssueType; label: string }> = [
  { value: "bug", label: "Bug report" },
  { value: "wrong-price", label: "Wrong price/printing" },
  { value: "store-request", label: "New store request" },
  { value: "enhancement", label: "Feature idea" },
  { value: "feedback", label: "General feedback" },
];

const SHOW_CARD = new Set<IssueType>(["bug", "wrong-price"]);
const SHOW_STORE_SELECT = new Set<IssueType>(["bug", "wrong-price"]);
const SHOW_STORE_INPUT = new Set<IssueType>(["store-request"]);
const SHOW_URL = new Set<IssueType>(["store-request"]);
const REQUIRED_STORE = new Set<IssueType>(["wrong-price", "store-request"]);

type Status = "idle" | "submitting" | "success" | "error";

type Suggestion = { id: string; name: string };
type Store = { id: string; name: string };
type Printing = { id: string; label: string };

const DESCRIPTION_PLACEHOLDER: Record<IssueType, string> = {
  bug: "What happened? What did you expect to happen?",
  "wrong-price": "What price did you see, and what should it be?",
  "store-request": "Any other details about the store.",
  enhancement: "What would you like to see added or changed?",
  feedback: "Whatever's on your mind.",
};

export function ContactForm() {
  const [type, setType] = useState<IssueType>("bug");
  const [description, setDescription] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardId, setCardId] = useState<string | null>(null);
  const [printing, setPrinting] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Card autocomplete
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLUListElement>(null);

  // Stores from DB
  const [stores, setStores] = useState<Store[]>([]);

  // Printings for selected card
  const [printings, setPrintings] = useState<Printing[]>([]);

  // Fetch enabled stores on mount
  useEffect(() => {
    fetch("/api/contact/stores")
      .then((r) => r.json())
      .then((data: Store[]) => setStores(data))
      .catch(() => {/* silently fall back to empty */});
  }, []);

  // Fetch printings when a card is selected
  useEffect(() => {
    if (!cardId) { setPrintings([]); setPrinting(""); return; }
    fetch(`/api/contact/printings?cardId=${encodeURIComponent(cardId)}`)
      .then((r) => r.json())
      .then((data: Printing[]) => setPrintings(data))
      .catch(() => setPrintings([]));
  }, [cardId]);

  // Card name autocomplete search
  useEffect(() => {
    if (!SHOW_CARD.has(type) || cardName.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(cardName)}`);
        if (!res.ok) return;
        const data = await res.json() as { results: Suggestion[] };
        setSuggestions(data.results.slice(0, 6));
      } catch {
        // silently ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cardName, type]);

  function selectCard(s: Suggestion) {
    setCardName(s.name);
    setCardId(s.id);
    setSuggestions([]);
    setShowSuggestions(false);
    setPrinting("");
  }

  function handleCardNameChange(value: string) {
    setCardName(value);
    setCardId(null);
    setPrintings([]);
    setPrinting("");
    setShowSuggestions(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, description, cardName, printing, storeName, storeUrl, email, website: honeypot,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg((data as { error?: string }).error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  function resetForm() {
    setStatus("idle");
    setDescription("");
    setCardName("");
    setCardId(null);
    setPrinting("");
    setPrintings([]);
    setStoreName("");
    setStoreUrl("");
    setEmail("");
    setSuggestions([]);
  }

  const inputClass =
    "w-full rounded-lg border border-subtle bg-muted px-4 py-2.5 text-cream placeholder-cream-dim/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent text-sm";
  const labelClass = "block text-sm font-medium text-cream mb-1.5";
  const hintClass = "text-xs text-cream-dim/60 mt-1";

  if (status === "success") {
    return (
      <div className="bg-surface border border-subtle rounded-lg p-8 text-center space-y-2">
        <p className="text-lg font-semibold text-cream">Report submitted</p>
        <p className="text-cream-dim text-sm leading-relaxed">
          Thanks for taking the time — it'll be read and actioned.
        </p>
        <button onClick={resetForm} className="mt-3 text-sm text-accent hover:underline">
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-subtle rounded-lg p-5 space-y-5">
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        aria-hidden="true"
        tabIndex={-1}
        style={{ display: "none" }}
      />

      {/* Issue type */}
      <div>
        <label htmlFor="type" className={labelClass}>What are you reporting?</label>
        <select
          id="type"
          value={type}
          onChange={(e) => setType(e.target.value as IssueType)}
          className={inputClass}
        >
          {ISSUE_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Card name with autocomplete */}
      {SHOW_CARD.has(type) && (
        <div className="relative">
          <label htmlFor="cardName" className={labelClass}>
            Card name{" "}
            {type !== "wrong-price" && (
              <span className="text-cream-dim/50 font-normal">(optional)</span>
            )}
          </label>
          <input
            id="cardName"
            type="text"
            value={cardName}
            onChange={(e) => handleCardNameChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="e.g. Lightning Bolt"
            required={type === "wrong-price"}
            autoComplete="off"
            className={inputClass}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul
              ref={suggestionRef}
              className="absolute z-10 mt-1 w-full rounded-lg border border-subtle bg-surface shadow-lg overflow-hidden"
            >
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  onMouseDown={() => selectCard(s)}
                  className="px-4 py-2 text-sm text-cream cursor-pointer hover:bg-muted"
                >
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Printing dropdown — shown when a card has been selected from autocomplete */}
      {SHOW_CARD.has(type) && printings.length > 0 && (
        <div>
          <label htmlFor="printing" className={labelClass}>
            Printing <span className="text-cream-dim/50 font-normal">(optional)</span>
          </label>
          <select
            id="printing"
            value={printing}
            onChange={(e) => setPrinting(e.target.value)}
            className={inputClass}
          >
            <option value="">All printings / not sure</option>
            {printings.map((p) => (
              <option key={p.id} value={p.label}>{p.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Store dropdown from DB — bug / wrong-price */}
      {SHOW_STORE_SELECT.has(type) && (
        <div>
          <label htmlFor="storeName" className={labelClass}>
            Store{" "}
            {!REQUIRED_STORE.has(type) && (
              <span className="text-cream-dim/50 font-normal">(optional)</span>
            )}
          </label>
          <select
            id="storeName"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            required={REQUIRED_STORE.has(type)}
            className={inputClass}
          >
            <option value="">Select a store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Store name free text — new store request */}
      {SHOW_STORE_INPUT.has(type) && (
        <div>
          <label htmlFor="storeNameInput" className={labelClass}>Store name</label>
          <input
            id="storeNameInput"
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="e.g. Manaleak Australia"
            required
            className={inputClass}
          />
        </div>
      )}

      {/* Store URL — new store request */}
      {SHOW_URL.has(type) && (
        <div>
          <label htmlFor="storeUrl" className={labelClass}>Store URL</label>
          <input
            id="storeUrl"
            type="url"
            value={storeUrl}
            onChange={(e) => setStoreUrl(e.target.value)}
            placeholder="https://example.com.au"
            required
            className={inputClass}
          />
          <p className={hintClass}>
            Stores need a publicly accessible product listing page to be scraped.
          </p>
        </div>
      )}

      {/* Description */}
      <div>
        <label htmlFor="description" className={labelClass}>Description</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={DESCRIPTION_PLACEHOLDER[type]}
          rows={4}
          required
          minLength={20}
          className={`${inputClass} resize-y`}
        />
        <p className={hintClass}>Minimum 20 characters.</p>
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className={labelClass}>
          Email{" "}
          <span className="text-cream-dim/50 font-normal">(optional — for follow-up only)</span>
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
      </div>

      {status === "error" && (
        <p className="text-red-400 text-sm">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-lg bg-cta px-4 py-2.5 font-medium text-cream hover:bg-price transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {status === "submitting" ? "Submitting…" : "Submit report"}
      </button>
    </form>
  );
}
