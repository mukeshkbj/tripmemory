"use client";

import { useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import type { Capabilities } from "@/lib/contracts";
import { api } from "@/lib/client";

export default function Connections({
  capabilities,
  refresh,
}: {
  capabilities: Capabilities | null;
  refresh: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function changeAccess(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        capabilities?.unlocked ? "lock" : "unlock",
        z.object({ ok: z.literal(true) }),
        { code },
      );
      setCode("");
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not change access. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="settings page-width">
      <a className="text-link" href="#">
        <ArrowLeft size={16} /> Back to memories
      </a>
      <h1>AI connections</h1>
      <p className="intro-copy">
        Photos and notes stay in this browser. AI actions send selected photos
        to the provider and use credits.
      </p>
      <section className="access-section">
        <LockKeyhole size={24} />
        <div>
          <h2>
            {capabilities?.unlocked
              ? "AI features unlocked"
              : "Unlock AI features"}
          </h2>
          <form className="unlock-form" onSubmit={changeAccess}>
            {capabilities?.unlocked ? (
              <div className="row">
                <span className="success-text">
                  <Check size={16} /> Ready to use
                </span>
                <button
                  className="button secondary"
                  disabled={busy}
                  aria-busy={busy}
                >
                  Lock access
                </button>
                <a className="text-link" href="#">
                  Open a memory
                </a>
              </div>
            ) : (
              <>
                <label htmlFor="access-code">Access code</label>
                <div className="row">
                  <input
                    id="access-code"
                    type="password"
                    autoComplete="current-password"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    required
                    maxLength={200}
                  />
                  <button
                    className="button primary"
                    disabled={busy || !capabilities?.accessRequired}
                    aria-busy={busy}
                  >
                    Unlock cloud
                  </button>
                </div>
                <p className="field-hint">
                  {capabilities?.accessRequired
                    ? "Use MEMORY_ACCESS_CODE from your server environment. API keys stay on the server."
                    : "Set MEMORY_ACCESS_CODE on the server to enable AI access."}
                </p>
              </>
            )}
          </form>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      <div className="connection-list">
        {[
          {
            name: "Reactor",
            description: "Live worlds",
            detail:
              "LingBot World 2. Walk with WASD and look with arrow keys. Sessions last up to 3 minutes.",
            enabled: capabilities?.reactor,
            config: "REACTOR_API_KEY",
            href: "https://www.reactor.inc/models/lingbot-world-2/api",
            letter: "R",
          },
          {
            name: "Modal",
            description: "Spatial photographs",
            detail:
              "Depth Anything V2 estimates depth on an L4 GPU for parallax views.",
            enabled: capabilities?.modal,
            config: "MODAL_DEPTH_URL · MODAL_TOKEN_ID · MODAL_TOKEN_SECRET",
            href: "https://modal.com/docs/guide/webhook-proxy-auth",
            letter: "M",
          },
          {
            name: "Runware",
            description: "Landscape generation",
            detail:
              "FLUX.2 Pro generates a scene from up to three reference photos. Source photos are kept separately.",
            enabled: capabilities?.runware,
            config: "RUNWARE_API_KEY",
            href: "https://runware.ai/docs/models/bfl-flux-2-pro",
            letter: "r",
          },
        ].map((service) => (
          <section className="connection" key={service.name}>
            <div className="service-mark">{service.letter}</div>
            <div className="connection-info">
              <div className="connection-title">
                <h2>{service.name}</h2>
                <span
                  className={`status-label ${service.enabled ? "connected" : ""}`}
                >
                  {service.enabled ? (
                    <>
                      <Check size={13} /> Configured
                    </>
                  ) : (
                    "Not configured"
                  )}
                </span>
              </div>
              <h3>{service.description}</h3>
              <p>{service.detail}</p>
              {!service.enabled && <code>{service.config}</code>}
            </div>
            <a
              className="icon-button"
              aria-label={`${service.name} documentation`}
              href={service.href}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={17} />
            </a>
          </section>
        ))}
      </div>
      <div className="setup-footer">
        <p>Open a memory to prepare spatial views or start a live walk.</p>
        <button
          className="button secondary"
          onClick={() =>
            void refresh().catch(() =>
              setError("Could not refresh connection status."),
            )
          }
        >
          <RefreshCw size={15} /> Refresh status
        </button>
      </div>
    </main>
  );
}
