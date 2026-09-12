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
import {
  JourneyResponseSchema,
  TokenResponseSchema,
  type Memory,
  type Photo,
} from "@/lib/contracts";
import { api } from "@/lib/client";
import {
  buildClipPrompt,
  buildWorldPrompt,
  navigationInput,
} from "@/lib/memory";
import { imageData } from "@/lib/storage";

export default function LiveWorld(props: {
  memory: Memory;
  photo: Photo;
  seedImage: string;
  onClose: () => void;
  onClip?: (photoId: string, url: string) => void;
}) {
  const token = useRef<Promise<string> | null>(null);
  const getToken = useCallback(() => {
    if (!token.current) {
      const request = api("token", TokenResponseSchema, {
        consent: true,
      }).then((result) => result.jwt);
      request.catch(() => {
        if (token.current === request) token.current = null;
      });
      token.current = request;
    }
    return token.current;
  }, []);
  const resetToken = useCallback(() => {
    token.current = null;
  }, []);
  return (
    <LingbotWorld2Provider jwtToken={getToken}>
      <WorldSession {...props} resetToken={resetToken} />
    </LingbotWorld2Provider>
  );
}

function WorldSession({
  memory,
  photo,
  seedImage,
  onClose,
  onClip,
  resetToken,
}: {
  memory: Memory;
  photo: Photo;
  seedImage: string;
  onClose: () => void;
  onClip?: (photoId: string, url: string) => void;
  resetToken: () => void;
}) {
  const world = useLingbotWorld2();
  const track = useLingbotWorld2Track("main_video");
  const video = useRef<HTMLVideoElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const frameReceived = useRef(false);
  const latest = useRef(world);
  latest.current = world;
  const [phase, setPhase] = useState<
    | "connecting"
    | "preparing"
    | "streaming"
    | "paused"
    | "failed"
    | "ended"
    | "journey"
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
  const attempts = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectNow = useRef<() => void>(() => {});
  const clips = useRef<(string | undefined)[]>([]);
  const journeyDone = useRef(false);
  const journeyAbort = useRef<AbortController | null>(null);
  const [journeyIndex, setJourneyIndex] = useState(0);
  const [journeyStatus, setJourneyStatus] = useState("");
  const [journeyTick, setJourneyTick] = useState(0);

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
  const scheduleRetry = useCallback(() => {
    if (
      cancelled.current ||
      retryTimer.current ||
      ["failed", "ended", "journey"].includes(phaseRef.current)
    )
      return;
    if (attempts.current >= 3) {
      fail(
        "Reactor could not connect after several attempts. Check Connections and your account credits, or make a video journey instead.",
      );
      return;
    }
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      connectNow.current();
    }, 1200 * attempts.current + 800);
  }, [fail]);
  const startJourney = useCallback(async () => {
    clearInput();
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
    void latest.current.disconnect();
    setError("");
    setHasFrame(false);
    frameReceived.current = false;
    setPhase("journey");
    setJourneyIndex(0);
    journeyDone.current = false;
    clips.current = memory.photos.map((item) => item.clip);
    const controller = new AbortController();
    journeyAbort.current = controller;
    const missing = memory.photos.filter((item) => !item.clip).length;
    let finished = 0;
    let firstError = "";
    setJourneyStatus(
      missing ? `Creating ${missing} clips at once…` : "",
    );
    await Promise.all(
      memory.photos.map(async (stop, i) => {
        if (
          clips.current[i] ||
          cancelled.current ||
          controller.signal.aborted
        )
          return;
        try {
          let task: string | undefined;
          let video: string | undefined;
          while (!video) {
            const result = await api(
              "journey",
              JourneyResponseSchema,
              task
                ? { consent: true, task }
                : {
                    consent: true,
                    image: await imageData(stop.image),
                    prompt: buildClipPrompt(memory, stop),
                  },
              controller.signal,
            );
            video = result.video;
            task = result.task;
          }
          clips.current[i] = video;
          onClip?.(stop.id, video);
        } catch (error) {
          if (controller.signal.aborted || cancelled.current) return;
          if (!firstError)
            firstError =
              error instanceof Error
                ? error.message
                : "A clip could not be generated.";
        } finally {
          finished += 1;
          setJourneyStatus(
            `Creating clips… ${finished} of ${missing} ready`,
          );
          setJourneyTick((tick) => tick + 1);
        }
      }),
    );
    if (firstError) setError(firstError);
    journeyDone.current = true;
    setJourneyTick((tick) => tick + 1);
  }, [memory, onClip, clearInput]);

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
      !["failed", "ended", "journey"].includes(phaseRef.current)
    )
      scheduleRetry();
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
    if (phase !== "journey") return;
    const element = video.current;
    const clip = clips.current[journeyIndex];
    if (!element || !clip) return;
    element.srcObject = null;
    if (element.src !== clip) element.src = clip;
    void element.play().catch(() => setPlaybackBlocked(true));
  }, [phase, journeyIndex, journeyTick]);

  useEffect(() => {
    if (phase !== "journey") return;
    const total = memory.photos.length;
    if (journeyIndex >= total) {
      setPhase("ended");
      return;
    }
    if (journeyDone.current && !clips.current[journeyIndex]) {
      let next = journeyIndex;
      while (next < total && !clips.current[next]) next += 1;
      setJourneyIndex(next);
    }
  }, [phase, journeyIndex, journeyTick, memory.photos.length]);

  useEffect(() => {
    cancelled.current = false;
    connectNow.current = () => {
      if (cancelled.current) return;
      attempts.current += 1;
      setAttempt(attempts.current);
      if (attempts.current > 1) resetToken();
      void latest.current.connect().catch(() => {
        if (!cancelled.current) scheduleRetry();
      });
    };
    const connect = setTimeout(() => connectNow.current(), 0);
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - began.current) / 1000);
      setElapsed(seconds);
      if (phaseRef.current === "journey") return;
      if (
        seconds >= 180 &&
        !["ended", "failed"].includes(phaseRef.current)
      ) {
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
      if (phaseRef.current === "journey") {
        video.current?.pause();
        setPlaybackBlocked(true);
      } else if (phaseRef.current === "streaming") void setPlayback(true);
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled.current = true;
      clearTimeout(connect);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      journeyAbort.current?.abort();
      clearInterval(timer);
      clearInput();
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      void latest.current.disconnect();
    };
  }, [clearInput, fail, setPlayback, scheduleRetry, resetToken]);

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
          onEnded={() => {
            if (phaseRef.current === "journey")
              setJourneyIndex((value) => value + 1);
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
            {phase === "journey"
              ? "Making your video journey…"
              : phase === "connecting"
                ? "Finding a way back…"
                : "Bringing your photograph to life…"}
          </h3>
          <p>
            {phase === "journey"
              ? journeyStatus || "Preparing your stops…"
              : attempt > 1
                ? `Connection retry ${attempt} of 3.`
                : world.status === "waiting"
                  ? "Waiting for a Reactor GPU."
                  : "Keep this tab open. You can end the session at any time."}
          </p>
        </div>
      )}
      <div className="live-topline">
        <span className="scene-badge">
          {phase === "journey"
            ? "AI-generated video · Runware"
            : "AI-generated · Reactor"}
        </span>
        <span className="session-time">
          {phase === "journey"
            ? `Stop ${Math.min(journeyIndex + 1, memory.photos.length)} of ${memory.photos.length}`
            : `${Math.max(0, 180 - elapsed)}s remaining`}
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
          <button
            className="button light"
            onClick={() => void startJourney()}
          >
            Make a video journey instead
          </button>
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
          {phase !== "journey" && (
            <>
              <button
                className="glass-button"
                disabled={
                  !hasFrame ||
                  busy ||
                  !["streaming", "paused"].includes(phase)
                }
                onClick={() => void setPlayback(phase !== "paused")}
              >
                {phase === "paused" ? (
                  <Play size={16} />
                ) : (
                  <Pause size={16} />
                )}
                {phase === "paused" ? "Resume walk" : "Pause"}
              </button>
              <button
                className="glass-button"
                disabled={!hasFrame}
                onClick={capture}
              >
                <Camera size={16} /> Save frame
              </button>
            </>
          )}
          <button
            className="glass-button"
            onClick={() => {
              clearInput();
              journeyAbort.current?.abort();
              void latest.current.disconnect();
              onClose();
            }}
          >
            <Square size={13} />
            {phase === "journey" ? "End journey" : "End walk"}
          </button>
        </div>
        {phase !== "journey" && (
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
        )}
        {phase === "journey" ? (
          <p className="world-disclaimer">
            {journeyStatus ||
              "Each stop is a generated clip. Surroundings are imagined."}
          </p>
        ) : (
          <p className="world-disclaimer">
            Movement applies to the next generated chunk. Surroundings are
            imagined, not a verified reconstruction.
          </p>
        )}
      </div>
    </div>
  );
}
