"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ImagePlus,
  LockKeyhole,
  Plus,
  X,
} from "lucide-react";
import { MemorySchema, type Memory, type Photo } from "@/lib/contracts";
import { readPhoto } from "@/lib/storage";
import { movePhoto } from "@/lib/memory";

export default function CreateMemory({
  onCreate,
}: {
  onCreate: (memory: Memory) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function addFiles(files: File[]) {
    if (busy) return;
    if (photos.length + files.length > 10) {
      setError(
        "A memory holds up to 10 photos. Choose fewer photos or remove one first.",
      );
      return;
    }
    setBusy(true);
    setError("");
    const added: Photo[] = [];
    const failures: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`Reading photo ${i + 1} of ${files.length}`);
      try {
        added.push(await readPhoto(files[i]));
      } catch (e) {
        failures.push(
          e instanceof Error ? e.message : "A photo could not be read.",
        );
      }
    }
    setPhotos((current) => [...current, ...added]);
    setError(failures.join(" "));
    setBusy(false);
    setProgress("");
    if (input.current) input.current.value = "";
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const result = MemorySchema.safeParse({
      id: crypto.randomUUID(),
      title,
      place,
      date,
      description,
      photos,
      createdAt: new Date().toISOString(),
      favorite: false,
    });
    if (!result.success) {
      setError(
        "Give your memory a name, add 5–10 photos, and make sure every stop has a title.",
      );
      return;
    }
    setBusy(true);
    try {
      await onCreate(result.data);
      setPhotos([]);
      setTitle("");
      setPlace("");
      setDate("");
      setDescription("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your memory could not be saved. Your photos are still here.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="create-page page-width">
      <a className="text-link" href="#">
        <ArrowLeft size={16} /> Back to memories
      </a>
      <div className="create-heading">
        <div>
          <p className="eyebrow">A PLACE YOU CAN COME BACK TO</p>
          <h1>Let’s keep this one.</h1>
        </div>
        <p>
          A handful of photos.
          <br />A whole feeling.
        </p>
      </div>
      <form onSubmit={create} className="create-layout">
        <section className="photo-builder" aria-label="Memory photos">
          <div className="section-heading">
            <h2>Your photographs</h2>
            <span className="count-label">{photos.length} / 10 photos</span>
          </div>
          <p className="muted">
            Choose 5–10 photos from one place. Arrange them in the order you’d
            like to revisit.
          </p>
          <input
            ref={input}
            id="photo-files"
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            tabIndex={-1}
            onChange={(event) =>
              void addFiles(Array.from(event.target.files || []))
            }
            disabled={busy}
          />
          <button
            type="button"
            className={`drop-zone ${dragging ? "dragging" : ""} ${photos.length ? "compact" : ""}`}
            disabled={busy || photos.length >= 10}
            onClick={() => input.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void addFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <div className="upload-symbol">
              <ImagePlus size={27} strokeWidth={1.5} />
            </div>
            <strong>
              {photos.length ? "Add more photographs" : "Drop your photos here"}
            </strong>
            <span>or browse your camera roll</span>
            <small>JPG, PNG, WebP · up to 15 MB each</small>
          </button>
          {progress && (
            <p className="processing-label" role="status">
              <span className="spinner" />
              {progress}
            </p>
          )}
          <ol className="photo-sort-list">
            {photos.map((photo, index) => (
              <li key={photo.id}>
                <img src={photo.image} alt={`Selected photo ${index + 1}`} />
                <span className="photo-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <label className="photo-title-input">
                  <span className="visually-hidden">
                    Title for photo {index + 1}
                  </span>
                  <input
                    value={photo.title}
                    maxLength={100}
                    required
                    disabled={busy}
                    onChange={(event) =>
                      setPhotos((current) =>
                        current.map((p) =>
                          p.id === photo.id
                            ? { ...p, title: event.target.value }
                            : p,
                        ),
                      )
                    }
                  />
                </label>
                <div className="sort-actions">
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busy || index === 0}
                    aria-label={`Move photo ${index + 1} earlier`}
                    onClick={() =>
                      setPhotos((current) =>
                        movePhoto(current, index, index - 1),
                      )
                    }
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busy || index === photos.length - 1}
                    aria-label={`Move photo ${index + 1} later`}
                    onClick={() =>
                      setPhotos((current) =>
                        movePhoto(current, index, index + 1),
                      )
                    }
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Remove photo ${index + 1}`}
                    onClick={() =>
                      setPhotos((current) =>
                        current.filter((p) => p.id !== photo.id),
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {!photos.length && (
            <div className="photo-tip">
              <span>Little tip</span>
              <p>
                A wide view, a favorite corner, the path you took. Different
                angles help tell the story.
              </p>
            </div>
          )}
        </section>
        <section className="memory-details" aria-label="Memory details">
          <h2>Give it a little context.</h2>
          <p className="muted">
            The details that a photograph can’t quite hold.
          </p>
          <label htmlFor="memory-title">
            Name your memory <span>Required</span>
          </label>
          <input
            id="memory-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="That week we took the slow road"
            required
            maxLength={100}
          />
          <label htmlFor="memory-place">Where were you?</label>
          <input
            id="memory-place"
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            placeholder="A place, a neighborhood, a little nowhere"
            maxLength={120}
          />
          <label htmlFor="memory-date">
            When was it? <span>Optional</span>
          </label>
          <input
            id="memory-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <label htmlFor="memory-description">
            What do you want to remember? <span>Optional</span>
          </label>
          <textarea
            id="memory-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="The air smelled like pine. We had nowhere to be."
            rows={4}
            maxLength={1500}
          />
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary create-submit"
            disabled={busy || photos.length < 5}
            aria-busy={busy}
          >
            <Plus size={18} /> Create memory <ArrowRight size={17} />
          </button>
          <p className="field-hint">
            {photos.length < 5 ? (
              `Add ${5 - photos.length} more photo${photos.length === 4 ? "" : "s"} to create your memory.`
            ) : (
              <>
                <Check size={14} /> Your photos are ready.
              </>
            )}
          </p>
          <div className="local-note">
            <LockKeyhole size={15} />
            <p>
              Saved in this browser. No cloud upload or credits used. We save
              resized copies without location metadata; keep your original files
              too.
            </p>
          </div>
        </section>
      </form>
    </main>
  );
}
