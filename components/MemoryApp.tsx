"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Heart,
  ImagePlus,
  Layers3,
  MapPin,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  CapabilitiesSchema,
  type Capabilities,
  type Memory,
} from "@/lib/contracts";
import { api } from "@/lib/client";
import { demoMemory, demoTrip } from "@/lib/demo";
import { formatDate } from "@/lib/memory";
import {
  importArchive,
  listMemories,
  removeMemory,
  saveMemory,
} from "@/lib/storage";
import Connections from "./Connections";
import CreateMemory from "./CreateMemory";
import MemoryViewer from "./MemoryViewer";

export default function MemoryApp() {
  const [route, setRoute] = useState("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    setCapabilities(await api("capabilities", CapabilitiesSchema));
  }, []);

  useEffect(() => {
    const navigate = () => {
      setRoute(window.location.hash.slice(1));
      window.scrollTo(0, 0);
    };
    navigate();
    window.addEventListener("hashchange", navigate);
    void (async () => {
      let stored = await listMemories();
      try {
        if (
          localStorage.getItem("memory.seeded.demoTrip") !== "1" &&
          !stored.some((memory) => memory.id === demoTrip.id)
        ) {
          localStorage.setItem("memory.seeded.demoTrip", "1");
          await saveMemory(demoTrip);
          stored = await listMemories();
        }
      } catch {
        /* optional bundled sample; local storage may be unavailable */
      }
      setMemories(stored);
    })()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    void refresh().catch(() => setCapabilities(null));
    return () => window.removeEventListener("hashchange", navigate);
  }, [refresh]);

  const save = useCallback(async (memory: Memory) => {
    await saveMemory(memory);
    setMemories((current) =>
      [memory, ...current.filter((item) => item.id !== memory.id)].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt),
      ),
    );
  }, []);
  async function create(memory: Memory) {
    await save(memory);
    window.location.hash = `memory/${memory.id}`;
  }
  async function importFile(file?: File) {
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const memory = await importArchive(file);
      setMemories(await listMemories());
      window.location.hash = `memory/${memory.id}`;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This backup could not be imported.",
      );
    } finally {
      setImporting(false);
      if (importInput.current) importInput.current.value = "";
    }
  }

  const activeId = route.startsWith("memory/") ? route.slice(7) : null;
  const activeMemory =
    activeId === demoMemory.id
      ? demoMemory
      : memories.find((memory) => memory.id === activeId);
  const filtered = memories.filter(
    (memory) =>
      (!favorites || memory.favorite) &&
      `${memory.title} ${memory.place} ${memory.description}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const isViewer = !!activeId && !!activeMemory;

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a href="#" className="wordmark" aria-label="Memory home">
          <Aperture size={29} strokeWidth={1.65} />
          memory<span className="wordmark-period">.</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#" aria-current={!route ? "page" : undefined}>
            Your memories
          </a>
          <a
            href="#about"
            aria-current={route === "about" ? "page" : undefined}
          >
            The idea
          </a>
        </nav>
        <a
          className={`connection-link ${route === "connections" ? "active" : ""}`}
          href="#connections"
          aria-label="Connections"
        >
          <Settings2 size={16} />
          <span>Connections</span>
        </a>
      </header>
      {error && (
        <div className="global-error" role="alert">
          {error}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div id="main-content" tabIndex={-1}>
        {!route && (
          <main className="library page-width">
            <section className="library-hero">
              <div className="hero-copy">
                <p className="eyebrow">
                  <span className="little-line" /> FOR THE PLACES THAT STAY WITH
                  YOU
                </p>
                <h1>
                  You had to
                  <br />
                  be there.
                  <br />
                  <em>Now you can.</em>
                </h1>
                <p>
                  Your photographs, a sense of place, and a way back.
                  <br className="wide-only" /> Turn a trip into a memory you can
                  step inside.
                </p>
                <a href="#new" className="button primary">
                  <Plus size={18} /> Create a memory <ArrowRight size={17} />
                </a>
                <span className="hero-footnote">
                  Start with 5–10 photos. Keep the feeling.
                </span>
              </div>
              <a
                href={`#memory/${demoMemory.id}`}
                className="hero-photograph"
                aria-label="Explore the sample mountain memory"
              >
                <img
                  src="/demo/lake.jpg"
                  alt="A still alpine lake reflecting a mountain and a small cabin"
                  fetchPriority="high"
                />
                <span className="sample-tag">
                  <Aperture size={14} /> Sample photos
                </span>
                <div className="hero-photo-caption">
                  <div>
                    <span>TAKE THE SCENIC ROUTE</span>
                    <h2>A mountain state of mind</h2>
                    <p>Preview a five-stop photo journal.</p>
                  </div>
                  <span className="round-arrow">
                    <ArrowRight size={23} />
                  </span>
                </div>
                <div className="photo-coordinate">
                  A sample memory, waiting for you
                </div>
              </a>
            </section>
            <div className="quiet-divider">
              <span>
                <ShieldCheck size={15} /> Private by default
              </span>
              <span>
                <Layers3 size={15} /> More than a camera roll
              </span>
              <span>
                <BookOpen size={15} /> A place for the little details
              </span>
            </div>
            <section className="collection" aria-labelledby="collection-title">
              <div className="collection-header">
                <div>
                  <h2 id="collection-title">
                    Your collection
                    <span>{memories.length.toString().padStart(2, "0")}</span>
                  </h2>
                  <p>Places you’ve been. Feelings you can come back to.</p>
                </div>
                <div className="collection-actions">
                  <button
                    className="text-button"
                    disabled={importing}
                    onClick={() => importInput.current?.click()}
                  >
                    <ArrowDownToLine size={16} />
                    {importing ? "Importing backup…" : "Import a memory"}
                  </button>
                  <a className="button secondary" href="#new">
                    <Plus size={16} /> New memory
                  </a>
                </div>
              </div>
              <input
                ref={importInput}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                tabIndex={-1}
                onChange={(event) => void importFile(event.target.files?.[0])}
              />
              {!!memories.length && (
                <div className="collection-tools">
                  <div className="filter-tabs">
                    <button
                      className={!favorites ? "selected" : ""}
                      onClick={() => setFavorites(false)}
                    >
                      All memories
                    </button>
                    <button
                      className={favorites ? "selected" : ""}
                      onClick={() => setFavorites(true)}
                    >
                      <Heart size={14} /> Favorites
                    </button>
                  </div>
                  <label className="search-field">
                    <Search size={16} />
                    <span className="visually-hidden">Search memories</span>
                    <input
                      type="search"
                      placeholder="Search memories"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </div>
              )}
              {loading ? (
                <div className="library-loading" role="status">
                  Opening your collection…
                </div>
              ) : memories.length === 0 ? (
                <div className="collection-empty">
                  <div className="empty-polaroids" aria-hidden="true">
                    <div />
                    <div>
                      <ImagePlus size={28} strokeWidth={1.25} />
                    </div>
                  </div>
                  <div>
                    <h3>Create your first memory</h3>
                    <p>Upload 5–10 photos from a trip to get started.</p>
                    <a href="#new" className="text-link">
                      Keep your first memory <ArrowRight size={16} />
                    </a>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="filtered-empty">
                  <h3>No memories found.</h3>
                  <p>Try another search or come back to all your memories.</p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery("");
                      setFavorites(false);
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="memory-grid">
                  {filtered.map((memory) => (
                    <article className="memory-card" key={memory.id}>
                      <a href={`#memory/${memory.id}`}>
                        <div className="memory-card-image">
                          <img
                            src={memory.photos[0].image}
                            alt={memory.photos[0].title}
                            loading="lazy"
                          />
                          <span className="photo-count">
                            {memory.photos.length} moments
                          </span>
                        </div>
                        <div className="memory-card-meta">
                          <span>{formatDate(memory.date)}</span>
                          <ArrowRight size={18} />
                        </div>
                        <h3>{memory.title}</h3>
                        <p>
                          <MapPin size={13} />
                          {memory.place || "Somewhere worth remembering"}
                        </p>
                      </a>
                      <button
                        className={`favorite-button ${memory.favorite ? "saved" : ""}`}
                        aria-label={
                          memory.favorite
                            ? `Unfavorite ${memory.title}`
                            : `Favorite ${memory.title}`
                        }
                        aria-pressed={memory.favorite}
                        onClick={() =>
                          void save({
                            ...memory,
                            favorite: !memory.favorite,
                          }).catch((e) => setError(e.message))
                        }
                      >
                        <Heart
                          size={17}
                          fill={memory.favorite ? "currentColor" : "none"}
                        />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </main>
        )}
        <div hidden={route !== "new"}>
          <CreateMemory onCreate={create} />
        </div>
        {route === "connections" && (
          <Connections capabilities={capabilities} refresh={refresh} />
        )}
        {route === "about" && (
          <main className="about-page page-width">
            <p className="eyebrow">THE IDEA BEHIND MEMORY</p>
            <h1>
              A photograph shows you
              <br />
              what it looked like.
              <br />
              <em>Keep how it felt, too.</em>
            </h1>
            <p>
              We take hundreds of pictures, then leave them in a camera roll.
              Memory makes a little place for the ones that matter: the path
              down to the water, the view from the window, the corner you went
              back to twice.
            </p>
            <div className="about-steps">
              <section>
                <span>Bring the photographs</span>
                <p>
                  Choose 5–10 photos from a place you visited. Put them in your
                  own order and add the details only you know.
                </p>
              </section>
              <section>
                <span>Find your way back</span>
                <p>
                  Move between your saved stops. Optional depth gives a
                  photograph a little space; a live world lets you explore what
                  might lie beyond it.
                </p>
              </section>
              <section>
                <span>Know what’s real</span>
                <p>
                  Your photos and recollections stay separate from generated
                  scenes. AI can invent details. This is a way to revisit a
                  feeling, not an exact map or a factual reconstruction.
                </p>
              </section>
            </div>
            <a className="button primary" href="#new">
              Keep a memory <ArrowRight size={17} />
            </a>
            <div className="privacy-banner">
              <ShieldCheck size={24} />
              <p>
                Your collection lives in this browser, not in an account. Export
                a backup to keep it safe or take it to another device. Clearing
                site data removes the local collection. Sample photography is
                from Unsplash.
              </p>
            </div>
          </main>
        )}
        {isViewer && (
          <MemoryViewer
            key={activeMemory.id}
            memory={activeMemory}
            isDemo={activeId === demoMemory.id}
            capabilities={capabilities}
            onSave={save}
            onDelete={async () => {
              await removeMemory(activeMemory.id);
              setMemories((current) =>
                current.filter((memory) => memory.id !== activeMemory.id),
              );
              window.location.hash = "";
            }}
          />
        )}
        {activeId && !activeMemory && !loading && (
          <main className="page-width not-found">
            <h1>This memory isn’t on this device.</h1>
            <p>
              Import its backup in your collection, or return to your saved
              memories.
            </p>
            <a className="button primary" href="#">
              Back to memories <ChevronRight size={16} />
            </a>
          </main>
        )}
        {route &&
          !["new", "connections", "about"].includes(route) &&
          !activeId && (
            <main className="page-width not-found">
              <h1>A little off the path.</h1>
              <a href="#" className="button primary">
                Back to memories
              </a>
            </main>
          )}
      </div>
      {!isViewer && (
        <footer className="site-footer page-width">
          <span>
            <Aperture size={17} /> A little closer to being there.
          </span>
          <span>Made for remembering. Not scrolling.</span>
          <a href="#connections">
            Stored on this device <ShieldCheck size={13} />
          </a>
        </footer>
      )}
    </>
  );
}
