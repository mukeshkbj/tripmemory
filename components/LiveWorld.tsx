"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LingbotWorld2Provider,
  useLingbotWorld2Track,
  useLingbotWorld2,
  useLingbotWorld2Message,
} from "@reactor-models/lingbot-world-2";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Pause,
  Play,
  Square,
} from "lucide-react";
import { TokenResponseSchema, type Memory, type Photo } from "@/lib/contracts";
import { api } from "@/lib/client";
import { buildWorldPrompt, navigationInput } from "@/lib/memory";

export default function LiveWorld(props: {
  memory: Memory;
  photo: Photo;
  seedImage: string;
  onClose: () => void;
}) {
  const token = useRef<Promise<string> | null>(null);
  const getToken = useCallback(() => {
    token.current ??= api("token", TokenResponseSchema, { consent: true }).then(
      (result) => result.jwt,
    );
    return token.current;
  }, []);
  return (
    <LingbotWorld2Provider jwtToken={getToken}>
      <WorldSession {...props} />
    </LingbotWorld2Provider>
  );
}

function WorldSession({
  memory,
  photo,
  seedImage,
  onClose,
}: {
  memory: Memory;
  photo: Photo;
  seedImage: string;
  onClose: () => void;
}) {
  const world = useLingbotWorld2();
  const track = useLingbotWorld2Track("main_video");
  const video = useRef<HTMLVideoElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const frameReceived = useRef(false);
  const latest = useRef(world);
  latest.current = world;
  const [phase, setPhase] = useState<
    "connecting" | "preparing" | "streaming" | "paused" | "failed" | "ended"
  >("connecting");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [hasFrame, setHasFrame] = useState(false);
  const [busy, setBusy] = useState(false);
  const playbackPending = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const staged = useRef(false);
  const held = useRef(new Set<string>());
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoHost = useRef<HTMLDivElement>(null);
  const began = useRef(Date.now());
  const cancelled = useRef(false);
  const wasReady = useRef(false);

  const sendInput = useCallback(() => {
    const input = navigationInput(held.current);
    const sdk = latest.current;
    if (sdk.status !== "ready") return;
    void sdk.setMoveLongitudinal({
      move_longitudinal:
        input.longitudinal === "backward" ? "back" : input.longitudinal,
    });
    void sdk.setMoveLateral({
      move_lateral:
        input.lateral === "left"
          ? "strafe_left"
          : input.lateral === "right"
            ? "strafe_right"
            : "idle",
    });
    void sdk.setLookHorizontal({ look_horizontal: input.horizontal });
    void sdk.setLookVertical({ look_vertical: input.vertical });
  }, []);
  const clearInput = useCallback(() => {
    held.current.clear();
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    sendInput();
  }, [sendInput]);
  const fail = useCallback(
    (message: string) => {
      clearInput();
      setError(message);
      setPhase("failed");
      void latest.current.disconnect();
    },
    [clearInput],
  );

  const setPlayback = useCallback(
    async (paused: boolean) => {
      if (playbackPending.current) return;
      playbackPending.current = true;
      setBusy(true);
      clearInput();
      const result = paused
        ? await latest.current.pause()
        : await latest.current.resume();
      playbackPending.current = false;
      if (cancelled.current) return;
      setBusy(false);
      if (result) {
        phaseRef.current = paused ? "paused" : "streaming";
        setPhase(phaseRef.current);
      } else
        fail(
          "The world did not acknowledge the playback command. Start a new walk from your photograph.",
        );
    },
    [clearInput, fail],
  );

  useLingbotWorld2Message((message) => {
    if (message.type === "command_error")
      fail(
        "The world model rejected a command. End this walk and start a new one from your source photo.",
      );
    if (
      message.type === "generation_started" ||
      message.type === "generation_resumed"
    )
      setPhase("streaming");
    if (message.type === "generation_paused") {
      clearInput();
      setPhase("paused");
    }
    if (message.type === "generation_complete") {
      clearInput();
      setPhase("ended");
      void latest.current.disconnect();
    }
  });

  useEffect(() => {
    if (world.status === "ready") wasReady.current = true;
    if (
      world.status === "disconnected" &&
      wasReady.current &&
      !["failed", "ended"].includes(phaseRef.current)
    )
      fail(
        "This session disconnected. Your memory is safe. Return to the photo to start again.",
      );
    if (
      world.lastError &&
      world.status === "disconnected" &&
      !["failed", "ended"].includes(phaseRef.current)
    )
      fail(
        "Reactor could not connect. Check Connections and your account credits, then start a new walk.",
      );
    if (world.status !== "ready" || staged.current) return;
    staged.current = true;
    setPhase("preparing");
    void (async () => {
      try {
        const response = await fetch(seedImage);
        if (!response.ok) throw new Error("photo");
        const file = await response.blob();
        if (cancelled.current) return;
        const reference = await latest.current.uploadFile(file);
        if (cancelled.current) return;
        const accepted = await latest.current.setImage({ image: reference });
        if (cancelled.current) return;
        if (!accepted) throw new Error("image");
        const prompt = await latest.current.setPrompt({
          prompt: buildWorldPrompt(memory, photo),
        });
        if (cancelled.current) return;
        if (!prompt) throw new Error("prompt");
        await latest.current.setRotationSpeedDeg({ rotation_speed_deg: 1 });
        await latest.current.start();
      } catch {
        if (!cancelled.current)
          fail(
            "This photo could not start a world. End the session and try another photo.",
          );
      }
    })();
  }, [world.status, world.lastError, memory, photo, seedImage, fail]);

  useEffect(() => {
    const element = video.current;
    if (!element || !track) return;
    element.srcObject = new MediaStream([track]);
    void element.play().catch(() => setPlaybackBlocked(true));
    return () => {
      element.srcObject = null;
    };
  }, [track]);

  useEffect(() => {
    cancelled.current = false;
    const connect = setTimeout(() => {
      void latest.current
        .connect()
        .catch(() =>
          fail("Reactor could not connect. Check Connections and try again."),
        );
    }, 0);
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - began.current) / 1000);
      setElapsed(seconds);
      if (seconds >= 180 && !["ended", "failed"].includes(phaseRef.current)) {
        clearInput();
        setPhase("ended");
        void latest.current.disconnect();
      } else if (
        seconds >= 90 &&
        !frameReceived.current &&
        !["ended", "failed"].includes(phaseRef.current)
      )
        fail(
          "The world took too long to start. End this session and check Reactor before retrying.",
        );
    }, 1000);
    const blur = () => {
      clearInput();
      if (phaseRef.current === "streaming") void setPlayback(true);
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled.current = true;
      clearTimeout(connect);
      clearInterval(timer);
      clearInput();
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      void latest.current.disconnect();
    };
  }, [clearInput, fail, setPlayback]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const value =
        event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (event.type === "keyup" && held.current.delete(value)) {
        sendInput();
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable=true]")
      )
        return;
      if (
        ![
          "w",
          "a",
          "s",
          "d",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
        ].includes(value) ||
        phaseRef.current !== "streaming" ||
        !frameReceived.current
      )
        return;
      event.preventDefault();
      if (event.type === "keydown") {
        if (event.repeat) return;
        held.current.add(value);
      } else held.current.delete(value);
      sendInput();
    };
    const focus = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable=true]")
      )
        clearInput();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    document.addEventListener("focusin", focus);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      document.removeEventListener("focusin", focus);
    };
  }, [sendInput, clearInput]);

  const canMove = phase === "streaming" && hasFrame;
  function capture() {
    const video = videoHost.current?.querySelector("video");
    if (!video?.videoWidth) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "memory-ai-generated-frame.png";
      link.click();
    } catch {
      setError(
        "This browser could not save the frame. Your session can continue.",
      );
    }
  }
  return (
    <div className="live-world">
      <div
        ref={videoHost}
        className={`world-video ${hasFrame ? "visible" : ""}`}
      >
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="AI-generated memory world"
          onPlaying={() => {
            frameReceived.current = true;
            setHasFrame(true);
            setPlaybackBlocked(false);
          }}
        />
      </div>
      {playbackBlocked && (
        <button
          className="button light playback-button"
          onClick={() =>
            void video.current
              ?.play()
              .then(() => setPlaybackBlocked(false))
              .catch(() =>
                setError(
                  "Playback is blocked. Check browser media permissions.",
                ),
              )
          }
        >
          Play world video
        </button>
      )}
      {!hasFrame && !["failed", "ended"].includes(phase) && (
        <div className="world-loading">
          <span className="spinner" />
          <h3>
            {phase === "connecting"
              ? "Finding a way back…"
              : "Bringing your photograph to life…"}
          </h3>
          <p>
            {world.status === "waiting"
              ? "Waiting for a Reactor GPU."
              : "Keep this tab open. You can end the session at any time."}
          </p>
        </div>
      )}
      <div className="live-topline">
        <span className="scene-badge">AI-generated · Reactor</span>
        <span className="session-time">
          {Math.max(0, 180 - elapsed)}s remaining
        </span>
      </div>
      {(phase === "failed" || phase === "ended") && (
        <div className="world-loading">
          <h3>
            {phase === "ended"
              ? "A good place to pause."
              : "We couldn’t keep this world open."}
          </h3>
          <p>
            {error ||
              "This walk has ended. Your photographs and notes are still here."}
          </p>
          <button className="button light" onClick={onClose}>
            Return to photograph
          </button>
        </div>
      )}
      {error && phase !== "failed" && (
        <p className="world-error" role="alert">
          {error}
        </p>
      )}
      <div className="world-bottom">
        <div className="world-actions">
          <button
            className="glass-button"
            disabled={
              !hasFrame || busy || !["streaming", "paused"].includes(phase)
            }
            onClick={() => void setPlayback(phase !== "paused")}
          >
            {phase === "paused" ? <Play size={16} /> : <Pause size={16} />}
            {phase === "paused" ? "Resume walk" : "Pause"}
          </button>
          <button
            className="glass-button"
            disabled={!hasFrame}
            onClick={capture}
          >
            <Camera size={16} /> Save frame
          </button>
          <button
            className="glass-button"
            onClick={() => {
              clearInput();
              void latest.current.disconnect();
              onClose();
            }}
          >
            <Square size={13} /> End walk
          </button>
        </div>
        <div className="navigation-pads">
          {[
            {
              title: "Walk · WASD",
              keys: ["w", "a", "s", "d"],
              labels: [
                "Walk forward",
                "Step left",
                "Walk backward",
                "Step right",
              ],
            },
            {
              title: "Look · arrows",
              keys: ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"],
              labels: ["Look up", "Look left", "Look down", "Look right"],
            },
          ].map((pad) => (
            <div className="navigation-pad" key={pad.title}>
              <span>{pad.title}</span>
              <div>
                {pad.keys.map((key, index) => {
                  const Icon = [ArrowUp, ArrowLeft, ArrowDown, ArrowRight][
                    index
                  ];
                  return (
                    <button
                      key={key}
                      aria-label={pad.labels[index]}
                      disabled={!canMove}
                      onPointerDown={(event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        held.current.add(key);
                        sendInput();
                      }}
                      onPointerUp={() => {
                        held.current.delete(key);
                        sendInput();
                      }}
                      onLostPointerCapture={clearInput}
                      onPointerCancel={clearInput}
                      onClick={(event) => {
                        if (event.detail === 0 && canMove) {
                          held.current.add(key);
                          sendInput();
                          pulseTimer.current = setTimeout(clearInput, 650);
                        }
                      }}
                    >
                      <Icon size={18} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="world-disclaimer">
          Movement applies to the next generated chunk. Surroundings are
          imagined, not a verified reconstruction.
        </p>
      </div>
    </div>
  );
}
