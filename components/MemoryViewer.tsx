"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  Footprints,
  Heart,
  Image,
  Layers3,
  MapPin,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  DepthResponseSchema,
  EnhanceResponseSchema,
  type Capabilities,
  type Memory,
} from "@/lib/contracts";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/memory";
import { exportArchive, imageData } from "@/lib/storage";

const SpatialPhoto = dynamic(() => import("./SpatialPhoto"), { ssr: false });
const LiveWorld = dynamic(() => import("./LiveWorld"), {
  ssr: false,
  loading: () => (
    <div className="world-loading">
      <span className="spinner" />
      <p>Opening the world controls…</p>
    </div>
  ),
});
type Panel = "none" | "depth" | "enhance" | "walk" | "delete";

export default function MemoryViewer({
  memory,
  isDemo,
  capabilities,
  onSave,
  onDelete,
}: {
  memory: Memory;
  isDemo: boolean;
  capabilities: Capabilities | null;
  onSave: (memory: Memory) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [current, setCurrent] = useState(memory);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"photo" | "spatial" | "live">("photo");
  const [panel, setPanel] = useState<Panel>("none");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [useEnhanced, setUseEnhanced] = useState(false);
  const [references, setReferences] = useState<string[]>([]);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [quiet, setQuiet] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const panelTrigger = useRef<HTMLElement | null>(null);
  const pointer = useRef<{
    x: number;
    y: number;
    origin: { x: number; y: number };
  } | null>(null);
  const cancel = useRef(false);
  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const photo = current.photos[index];
  const seed = useEnhanced && photo.enhanced ? photo.enhanced : photo.image;
  const isLocal = mode !== "live";
  const canCloud = !!capabilities?.unlocked && !isDemo;
  const ready =
    panel === "depth"
      ? capabilities?.modal
      : panel === "enhance"
        ? capabilities?.runware
        : capabilities?.reactor;
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancel.current = true;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (panel === "none") return;
    const element = stage.current?.querySelector<HTMLElement>(".cloud-panel");
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
    return () => {
      if (panelTrigger.current?.isConnected)
        panelTrigger.current.focus({ preventScroll: true });
    };
  }, [panel]);
  useEffect(() => {
    if (!busy && !editingNote && !saveError) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const leaving = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!link || link.getAttribute("href") === "#main-content") return;
      const message = busy
        ? "Leave while cloud processing is running? Completed photos are saved, but the current request may still use credits."
        : "Leave this memory with unsaved changes? Save your note or export a backup first to keep them.";
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leaving, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leaving, true);
    };
  }, [busy, editingNote, saveError]);

  const currentRef = useRef(current);
  currentRef.current = current;
  async function persist(next: Memory) {
    setCurrent(next);
    setSaveError("");
    try {
      await onSave(next);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save changes.";
      setSaveError(message);
      throw e;
    }
  }
  const saveClip = useCallback(
    (photoId: string, url: string, clipTo?: string) => {
      const next = {
        ...currentRef.current,
        photos: currentRef.current.photos.map((item) =>
          item.id === photoId
            ? { ...item, clip: url, clipTo: clipTo || undefined }
            : item,
        ),
      };
      currentRef.current = next;
      setCurrent(next);
      void onSave(next).catch(() => {});
    },
    [onSave],
  );
  function chooseStop(next: number) {
    if (busy || editingNote || next < 0 || next >= current.photos.length)
      return;
    setIndex(next);
    setMode("photo");
    setPanel("none");
    setError("");
    setUseEnhanced(false);
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  }
  function openPanel(next: Panel) {
    panelTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPanel(next);
    setConsent(false);
    setError("");
    setReferences([photo.id]);
  }

  async function prepareDepth() {
    setBusy(true);
    setError("");
    cancel.current = false;
    abort.current = new AbortController();
    let next = current;
    try {
      const pending = current.photos.filter((item) => !item.depth);
      for (let i = 0; i < pending.length; i++) {
        if (cancel.current) break;
        setProgress(
          `Preparing photograph ${i + 1} of ${pending.length}. Completed views are saved as we go.`,
        );
        const result = await api(
          "depth",
          DepthResponseSchema,
          { consent: true, image: await imageData(pending[i].image) },
          abort.current.signal,
        );
        if (!alive.current) return;
        next = {
          ...next,
          photos: next.photos.map((item) =>
            item.id === pending[i].id ? { ...item, depth: result.depth } : item,
          ),
        };
        await persist(next);
      }
      if (next.photos[index].depth) setMode("spatial");
      setPanel("none");
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Spatial preparation failed. Completed stops are safe; retry to prepare the remaining photos.",
        );
    } finally {
      if (alive.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  async function enhance() {
    setBusy(true);
    setError("");
    setProgress(
      "Preparing a landscape scene with Runware. Your source photograph stays untouched.",
    );
    abort.current = new AbortController();
    try {
      const selected = [
        photo,
        ...current.photos.filter(
          (item) => item.id !== photo.id && references.includes(item.id),
        ),
      ];
      const result = await api(
        "enhance",
        EnhanceResponseSchema,
        {
          consent: true,
          images: await Promise.all(
            selected.map((item) => imageData(item.image)),
          ),
          prompt: `Create a natural photorealistic landscape scene based on reference image 1. Preserve its composition, architecture, terrain, season, and lighting. Expand gently to landscape framing without adding new landmarks or people. Other reference images provide context only; do not collage or merge locations. Place: ${current.place}. Scene: ${photo.title}. Recollection: ${photo.note}. No text, watermarks, or invented signage.`,
        },
        abort.current.signal,
      );
      if (!alive.current) return;
      await persist({
        ...current,
        photos: current.photos.map((item) =>
          item.id === photo.id ? { ...item, enhanced: result.image } : item,
        ),
      });
      setUseEnhanced(true);
      setMode("photo");
      setPanel("none");
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "The scene could not be generated.",
        );
    } finally {
      if (alive.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  const originalLabel = isDemo
    ? "Sample photograph"
    : useEnhanced
      ? "AI-generated · Runware"
      : "Your photograph";

  return (
    <main className={`viewer-page ${quiet ? "quiet-view" : ""}`}>
      <div className="viewer-heading">
        <div>
          <a href="#" className="text-link">
            <ArrowLeft size={16} /> Your memories
          </a>
          <div className="viewer-title-row">
            <h1>{current.title}</h1>
            {isDemo && <span className="small-badge">Sample memory</span>}
          </div>
          <p>
            <MapPin size={14} />
            {current.place || "Somewhere worth remembering"}
            <span>·</span>
            {formatDate(current.date)}
          </p>
        </div>
        <div className="viewer-heading-actions">
          {!isDemo && (
            <>
              <button
                className={`icon-button ${current.favorite ? "favorite-active" : ""}`}
                aria-label={
                  current.favorite
                    ? "Remove from favorites"
                    : "Add to favorites"
                }
                aria-pressed={current.favorite}
                onClick={() =>
                  void persist({
                    ...current,
                    favorite: !current.favorite,
                  }).catch(() => {})
                }
              >
                <Heart
                  size={19}
                  fill={current.favorite ? "currentColor" : "none"}
                />
              </button>
              <button
                className="button secondary"
                onClick={() => exportArchive(current)}
              >
                <Download size={16} /> Export backup
              </button>
            </>
          )}
          <button
            className="icon-button"
            aria-label={quiet ? "Show journal" : "Focus on photograph"}
            aria-pressed={quiet}
            onClick={() => setQuiet(!quiet)}
          >
            <Expand size={18} />
          </button>
        </div>
      </div>
      {saveError && (
        <div className="save-warning" role="alert">
          <span>
            {saveError} Changes remain open here. Export a backup now, or retry
            saving.
          </span>
          <button
            className="button secondary"
            onClick={() => void persist(current).catch(() => {})}
          >
            Retry save
          </button>
          <button
            className="button secondary"
            onClick={() => exportArchive(current)}
          >
            Export backup
          </button>
        </div>
      )}
      <div className="viewer-layout">
        <div className="viewer-main">
          <div
            ref={stage}
            className={`photo-stage ${mode === "live" ? "is-live" : ""}`}
            tabIndex={0}
            role="region"
            aria-label={`${photo.title}. ${mode === "spatial" ? "Spatial photograph" : "Photograph"} viewer. Use plus and minus to zoom or arrow buttons to look around.`}
            onKeyDown={(event) => {
              if (!isLocal || event.target !== event.currentTarget) return;
              const moves: Record<string, { x: number; y: number }> = {
                ArrowLeft: { x: -0.2, y: 0 },
                ArrowRight: { x: 0.2, y: 0 },
                ArrowUp: { x: 0, y: -0.2 },
                ArrowDown: { x: 0, y: 0.2 },
              };
              if (moves[event.key]) {
                event.preventDefault();
                const step = moves[event.key];
                setOffset((current) => ({
                  x: clamp(current.x + step.x),
                  y: clamp(current.y + step.y),
                }));
              }
            }}
            onPointerDown={(event) => {
              if (
                !isLocal ||
                (event.target as HTMLElement).closest(
                  "button, a, input, .cloud-panel",
                )
              )
                return;
              event.currentTarget.setPointerCapture(event.pointerId);
              pointer.current = {
                x: event.clientX,
                y: event.clientY,
                origin: offset,
              };
            }}
            onPointerMove={(event) => {
              if (!pointer.current || !isLocal) return;
              setOffset({
                x: clamp(
                  pointer.current.origin.x +
                    (event.clientX - pointer.current.x) / 220,
                ),
                y: clamp(
                  pointer.current.origin.y +
                    (event.clientY - pointer.current.y) / 220,
                ),
              });
            }}
            onPointerUp={() => {
              pointer.current = null;
            }}
            onPointerCancel={() => {
              pointer.current = null;
            }}
          >
            {mode === "spatial" && photo.depth ? (
              <SpatialPhoto
                image={photo.image}
                depth={photo.depth}
                offset={offset}
                zoom={zoom}
                alt={photo.title}
              />
            ) : (
              <img
                className="scene-image"
                src={seed}
                alt={photo.title}
                style={{
                  transform: `scale(${Math.max(1.04, zoom)}) translate(${offset.x * 1.7}%, ${offset.y * 1.7}%)`,
                }}
              />
            )}
            {mode === "live" ? (
              <LiveWorld
                memory={current}
                photo={photo}
                seedImage={seed}
                onClip={saveClip}
                onClose={() => {
                  setMode("photo");
                  setPanel("none");
                }}
              />
            ) : (
              <>
                <div className="scene-top">
                  <span className="scene-badge">
                    {mode === "spatial" ? (
                      <Layers3 size={13} />
                    ) : (
                      <Image size={13} />
                    )}
                    {mode === "spatial"
                      ? "Spatial photo · Estimated depth"
                      : originalLabel}
                  </span>
                  <span className="scene-badge scene-counter">
                    {String(index + 1).padStart(2, "0")}
                    <span>/</span>
                    {String(current.photos.length).padStart(2, "0")}
                  </span>
                </div>
                <div className="scene-bottom">
                  <div>
                    <span className="scene-eyebrow">
                      A MOMENT TO COME BACK TO
                    </span>
                    <h2>{photo.title}</h2>
                    <p>
                      {mode === "spatial"
                        ? "Drag gently to explore the depth of this photograph."
                        : "Take your time. You’re right where you left off."}
                    </p>
                  </div>
                  <button
                    className="button light"
                    onClick={() => openPanel("walk")}
                  >
                    <Footprints size={17} /> Step inside{" "}
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div
                  className="photo-pan-controls"
                  aria-label="Photo view controls"
                >
                  <button
                    aria-label="Pan left"
                    onClick={() =>
                      setOffset((current) => ({
                        ...current,
                        x: clamp(current.x - 0.2),
                      }))
                    }
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    aria-label="Pan up"
                    onClick={() =>
                      setOffset((current) => ({
                        ...current,
                        y: clamp(current.y - 0.2),
                      }))
                    }
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    aria-label="Pan down"
                    onClick={() =>
                      setOffset((current) => ({
                        ...current,
                        y: clamp(current.y + 0.2),
                      }))
                    }
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    aria-label="Pan right"
                    onClick={() =>
                      setOffset((current) => ({
                        ...current,
                        x: clamp(current.x + 0.2),
                      }))
                    }
                  >
                    <ArrowRight size={15} />
                  </button>
                  <span />
                  <button
                    aria-label="Zoom out"
                    disabled={zoom <= 1}
                    onClick={() =>
                      setZoom((value) => Math.max(1, value - 0.15))
                    }
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    aria-label="Zoom in"
                    disabled={zoom >= 1.9}
                    onClick={() =>
                      setZoom((value) => Math.min(2, value + 0.15))
                    }
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    aria-label="Reset photo view"
                    onClick={() => {
                      setOffset({ x: 0, y: 0 });
                      setZoom(1);
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </>
            )}
            {panel !== "none" && (
              <section
                className="cloud-panel"
                tabIndex={-1}
                aria-labelledby="cloud-panel-title"
                onKeyDown={(event) => {
                  if (event.key === "Escape" && !busy) {
                    event.stopPropagation();
                    setPanel("none");
                  }
                }}
              >
                <button
                  className="icon-button panel-close"
                  disabled={busy}
                  aria-label="Close options"
                  onClick={() => setPanel("none")}
                >
                  <X size={18} />
                </button>
                {panel === "delete" ? (
                  <>
                    <Trash2 size={24} />
                    <h3 id="cloud-panel-title">Delete this memory?</h3>
                    <p>
                      This removes “{current.title}” and all its saved photos
                      and notes from this browser. It cannot be undone. Export a
                      backup first if you want to keep it.
                    </p>
                    <div className="row">
                      <button
                        className="button secondary"
                        onClick={() => setPanel("none")}
                      >
                        Keep memory
                      </button>
                      <button
                        className="button destructive"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await onDelete();
                          } catch {
                            setError(
                              "This memory could not be deleted. Try again.",
                            );
                            setBusy(false);
                          }
                        }}
                      >
                        Delete memory
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="panel-icon">
                      {panel === "walk" ? (
                        <Footprints size={24} />
                      ) : panel === "depth" ? (
                        <Layers3 size={24} />
                      ) : (
                        <Sparkles size={24} />
                      )}
                    </span>
                    <h3 id="cloud-panel-title">
                      {panel === "walk"
                        ? "Start a live walk"
                        : panel === "depth"
                          ? "Prepare spatial views"
                          : "Generate a landscape"}
                    </h3>
                    <p>
                      {panel === "walk"
                        ? "Reactor uses this photo to generate a live world you can walk through. Use WASD to move and arrow keys to look. The walk lasts up to 3 minutes; scenery beyond the photo is imagined."
                        : panel === "depth"
                          ? `Modal will estimate depth for ${current.photos.filter((item) => !item.depth).length} remaining photos. This adds subtle parallax, not a complete 3D reconstruction. Each finished photo is saved so you can resume later.`
                          : "Runware makes one landscape scene from this photograph and up to two additional references. Choose only photos of the same surroundings. The result is AI-generated, not a restored original."}
                    </p>
                    {panel === "enhance" && (
                      <div
                        className="reference-picker"
                        aria-label="Reference photos"
                      >
                        {current.photos.map((item) => (
                          <label
                            key={item.id}
                            className={
                              references.includes(item.id) ? "selected" : ""
                            }
                          >
                            <img src={item.image} alt={item.title} />
                            <input
                              type="checkbox"
                              aria-label={`Use ${item.title} as a reference`}
                              checked={references.includes(item.id)}
                              disabled={
                                item.id === photo.id ||
                                busy ||
                                (!references.includes(item.id) &&
                                  references.length >= 3)
                              }
                              onChange={(event) =>
                                setReferences((value) =>
                                  event.target.checked
                                    ? [...value, item.id]
                                    : value.filter((id) => id !== item.id),
                                )
                              }
                            />
                            <span>
                              {item.id === photo.id ? "Source" : "Reference"}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    {isDemo ? (
                      <div className="panel-info">
                        This is a read-only sample.{" "}
                        <a href="#new">Create your own memory</a> to use cloud
                        features.
                      </div>
                    ) : !canCloud || !ready ? (
                      <div className="panel-info">
                        {!ready
                          ? "This service isn’t configured yet."
                          : "Cloud access is locked."}{" "}
                        Your photo journal still works.{" "}
                        <a href="#connections">
                          Set up Connections <ArrowRight size={13} />
                        </a>
                      </div>
                    ) : (
                      <>
                        <label className="consent-label">
                          <input
                            type="checkbox"
                            checked={consent}
                            disabled={busy}
                            onChange={(event) =>
                              setConsent(event.target.checked)
                            }
                          />
                          <span>
                            Send the selected photo{panel === "walk" ? "" : "s"}{" "}
                            to{" "}
                            {panel === "walk"
                              ? "Reactor"
                              : panel === "depth"
                                ? "Modal"
                                : "Runware"}
                            . I understand this uses paid cloud resources
                            {panel !== "depth" ? " and may invent details" : ""}
                            .
                          </span>
                        </label>
                        <button
                          className="button primary"
                          disabled={!consent || busy}
                          aria-busy={busy}
                          onClick={() => {
                            if (panel === "walk") {
                              setPanel("none");
                              setMode("live");
                            } else if (panel === "depth") void prepareDepth();
                            else void enhance();
                          }}
                        >
                          {busy && <span className="spinner" />}
                          {panel === "walk"
                            ? "Start live walk"
                            : panel === "depth"
                              ? "Prepare spatial views"
                              : "Generate landscape scene"}
                          <ArrowRight size={16} />
                        </button>
                      </>
                    )}
                  </>
                )}
                {progress && (
                  <p className="processing-label" role="status">
                    {progress}
                  </p>
                )}
                {busy && panel === "depth" && (
                  <button
                    className="text-button"
                    onClick={() => {
                      cancel.current = true;
                      setProgress(
                        "Stopping after this photo finishes. Completed views will be kept.",
                      );
                    }}
                  >
                    Stop after this photo
                  </button>
                )}
                {error && (
                  <p className="error-message" role="alert">
                    {error}
                  </p>
                )}
              </section>
            )}
          </div>
          <div className="viewer-toolbar">
            <div className="view-tabs" aria-label="View mode">
              <button
                className={mode === "photo" ? "selected" : ""}
                disabled={busy}
                onClick={() => {
                  setMode("photo");
                  setUseEnhanced(false);
                }}
              >
                <Image size={15} /> Photograph
              </button>
              <button
                className={mode === "spatial" ? "selected" : ""}
                disabled={busy}
                onClick={() => {
                  if (photo.depth) {
                    setMode("spatial");
                    setUseEnhanced(false);
                  } else openPanel("depth");
                }}
              >
                <Layers3 size={15} /> Spatial view
              </button>
              {photo.enhanced && (
                <button
                  className={useEnhanced ? "selected" : ""}
                  disabled={busy}
                  onClick={() => {
                    setUseEnhanced(true);
                    setMode("photo");
                  }}
                >
                  <Sparkles size={14} /> Generated scene
                </button>
              )}
            </div>
            <span className="view-helper">
              {mode === "live"
                ? "Live world · AI-generated"
                : mode === "spatial"
                  ? "Estimated depth, not measured geometry"
                  : "Drag to pan · + / − to zoom"}
            </span>
          </div>
          <div className="filmstrip-header">
            <h3>Your way back</h3>
            <span>
              {index + 1} of {current.photos.length} moments
            </span>
            <div>
              <button
                className="icon-button"
                disabled={index === 0 || busy || editingNote}
                aria-label="Previous stop"
                onClick={() => chooseStop(index - 1)}
              >
                <ChevronLeft size={19} />
              </button>
              <button
                className="icon-button"
                disabled={
                  index === current.photos.length - 1 || busy || editingNote
                }
                aria-label="Next stop"
                onClick={() => chooseStop(index + 1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </div>
          <ol className="filmstrip">
            {current.photos.map((item, i) => (
              <li key={item.id}>
                <button
                  aria-label={`Visit ${item.title}`}
                  aria-current={i === index ? "step" : undefined}
                  className={i === index ? "selected" : ""}
                  disabled={busy || editingNote}
                  onClick={() => chooseStop(i)}
                >
                  <div>
                    <img src={item.image} alt="" />
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {item.depth && (
                      <span className="depth-ready">
                        <Layers3 size={12} />
                      </span>
                    )}
                  </div>
                  <p>{item.title}</p>
                </button>
              </li>
            ))}
          </ol>
          {editingNote && (
            <p className="field-hint">
              Save or cancel your note before changing stops.
            </p>
          )}
        </div>
        <aside className="memory-journal">
          <div className="journal-heading">
            <span className="journal-mark">
              <Aperture size={15} />
            </span>
            <span>THE LITTLE DETAILS</span>
          </div>
          <h2>
            What stays
            <br />
            <em>with you.</em>
          </h2>
          <div className="journal-note">
            <span className="note-quote">“</span>
            {editingNote ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  try {
                    await persist({
                      ...current,
                      photos: current.photos.map((item) =>
                        item.id === photo.id ? { ...item, note } : item,
                      ),
                    });
                    setEditingNote(false);
                  } catch {}
                }}
              >
                <label className="visually-hidden" htmlFor="stop-note">
                  Note for {photo.title}
                </label>
                <textarea
                  id="stop-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                  rows={5}
                  autoFocus
                />
                <div className="row">
                  <button className="button primary small" type="submit">
                    Save note
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setEditingNote(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p>
                  {photo.note ||
                    "The sound, the smell, the person beside you. What do you want to remember about this moment?"}
                </p>
                {!isDemo && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setNote(photo.note);
                      setEditingNote(true);
                    }}
                  >
                    <Pencil size={13} />
                    {photo.note ? "Edit this note" : "Add your recollection"}
                  </button>
                )}
              </>
            )}
          </div>
          <div className="trip-context">
            <span>ABOUT THIS MEMORY</span>
            <p>
              {current.description ||
                "A small collection of moments from somewhere worth remembering."}
            </p>
          </div>
          <div
            className="journey-line"
            aria-label="Photo sequence, not a geographic map"
          >
            {current.photos.map((item, i) => (
              <button
                key={item.id}
                className={i === index ? "selected" : ""}
                disabled={busy || editingNote}
                aria-label={`Jump to stop ${i + 1}: ${item.title}`}
                onClick={() => chooseStop(i)}
              >
                <span>{i === index ? <Aperture size={13} /> : i + 1}</span>
              </button>
            ))}
          </div>
          <p className="route-caption">
            Your photo route. Not a geographic map.
          </p>
          {!isDemo && (
            <div className="journal-actions">
              <button
                className="text-button"
                disabled={busy || mode === "live"}
                onClick={() => openPanel("depth")}
              >
                <Layers3 size={15} /> Prepare spatial views{" "}
                <ArrowRight size={14} />
              </button>
              <button
                className="text-button"
                disabled={busy || mode === "live"}
                onClick={() => openPanel("enhance")}
              >
                <Sparkles size={15} />
                {photo.enhanced
                  ? "Regenerate landscape scene"
                  : "Create a landscape scene"}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div className="journal-privacy">
            <ShieldCheck size={16} />
            <p>
              {isDemo
                ? "A sample to show you around. Your own memories will live privately in this browser."
                : "Saved on this device. Export a backup to keep these moments safe."}
            </p>
          </div>
          {isDemo ? (
            <a href="#new" className="button primary">
              Make it your own <Plus size={16} />
            </a>
          ) : (
            <button
              className="text-button delete-link"
              disabled={busy || mode === "live"}
              onClick={() => openPanel("delete")}
            >
              <Trash2 size={13} /> Delete memory
            </button>
          )}
        </aside>
      </div>
      <div className="viewer-footer">
        <span>
          <Check size={13} />
          {isDemo
            ? "Sample photography · Unsplash"
            : "Your photo copies stay separate from AI-generated scenes."}
        </span>
        <span>Stay a little longer.</span>
      </div>
    </main>
  );
}
