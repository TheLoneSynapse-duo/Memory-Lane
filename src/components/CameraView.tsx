import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { describeError } from "../data/api";
import { addSavedMemory, type MemoryDestination } from "../data/memoryStore";
import { DESTINATION_OPTIONS } from "./destinationOptions";
import PhotoGallery from "./PhotoGallery";
import { CameraIcon, CheckIcon, RepeatIcon, SparkleIcon } from "./icons";

type Stage = "idle" | "starting" | "live" | "captured" | "saved";

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function CameraView({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [metNote, setMetNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCaption, setSavedCaption] = useState("");
  const [savedFullDate, setSavedFullDate] = useState("");
  // Where the photo should be kept. "Who is this?" is selected by default so
  // photos with a face land on the person's page too — just untick it for
  // photos without a person.
  const [destinations, setDestinations] = useState<MemoryDestination[]>([
    "home",
    "faces",
  ]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  // Free the camera when leaving the screen.
  useEffect(() => {
    return () => stopCamera();
  }, []);

  // Attach the camera stream once the live <video> element is actually on screen.
  useEffect(() => {
    if (stage === "live" && videoRef.current && streamRef.current) {
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      video.play().catch(() => undefined);
    }
  }, [stage]);

  // Move focus to the first field when the review form appears.
  useEffect(() => {
    if (stage === "captured") {
      const t = window.setTimeout(() => nameInputRef.current?.focus(), 350);
      return () => window.clearTimeout(t);
    }
  }, [stage]);

  async function openCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "This browser can't open a live camera. You can still add a memory by choosing a photo from your device below."
      );
      return;
    }
    setStage("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      // The live <video> element only mounts on the render after this, so it is
      // attached to the stream in the effect below — attaching here would find
      // videoRef.current === null and silently skip, leaving a black frame.
      setStage("live");
    } catch {
      stopCamera();
      setCameraError(
        "The camera couldn't be opened — your browser may have blocked it. Choose a photo from your device instead."
      );
      setStage("idle");
    }
  }

  function stopPreview() {
    stopCamera();
    setCameraError(null);
    setStage("idle");
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    stopCamera();
    setPhoto(dataUrl);
    setStage("captured");
  }

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPhoto(reader.result);
        setSaveError(null);
        setStage("captured");
      }
    };
    reader.readAsDataURL(file);
  }

  const previewCaption = name.trim()
    ? `A photo with ${name.trim()} — today`
    : "A new memory — today";

  function toggleDestination(id: MemoryDestination) {
    setDestinations((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function saveMemory() {
    const cleanName = name.trim();
    const caption =
      (cleanName ? `A photo with ${cleanName}` : "A new memory") +
      ` · ${shortDate(new Date())}`;

    setSaving(true);
    setSaveError(null);
    try {
      await addSavedMemory({
        name: cleanName,
        metNote: metNote.trim(),
        caption,
        photoDataUrl: photo,
        destinations,
      });
      setSavedCaption(caption);
      setSavedFullDate(
        new Date().toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      );
      setStage("saved");
    } catch (error) {
      setSaveError(describeError(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!photo || saving) return;
    await saveMemory();
  }

  function resetAll() {
    stopCamera();
    setPhoto(null);
    setName("");
    setMetNote("");
    setCameraError(null);
    setSaveError(null);
    setDestinations(["home", "faces"]);
    setStage("idle");
  }

  return (
    <section
      className="animate-fade-up mx-auto w-full max-w-3xl px-5 pb-24 pt-6 sm:px-6 sm:pt-10"
      aria-label="Take a photo"
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFile}
        aria-label="Choose a photo from your device"
      />

      {stage === "idle" && (
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-terracotta">
            <SparkleIcon className="h-4 w-4" aria-hidden="true" />
            Camera
          </p>
          <h1 className="mt-2 font-heading text-4xl leading-tight text-ink">
            Take a photo to keep
          </h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
            Capture a face or a moment, add a short note, and it joins your memory
            library. If the camera can't open, you can pick a photo from your device
            instead.
          </p>

          {cameraError && (
            <p
              role="alert"
              className="mt-5 rounded-2xl border border-ochre bg-ochre-soft p-4 text-lg text-ink"
            >
              {cameraError}
            </p>
          )}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={openCamera} className="btn-primary">
              <CameraIcon className="h-6 w-6" />
              Take a photo
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-secondary"
            >
              Choose from my device
            </button>
          </div>

          <PhotoGallery
            scope="all"
            showAddTile={false}
            heading="Photos you've taken"
            blurb="Every photo kept with the camera, whichever page it was saved to. Tap one to see it big — then edit it, crop it, try a filter, save it to your device or take it away."
          />
        </div>
      )}

      {stage === "starting" && (
        <div className="py-16 text-center">
          <span
            className="mx-auto block h-12 w-12 animate-spin rounded-full border-4 border-ochre/30 border-t-terracotta"
            aria-hidden="true"
          />
          <p className="mt-5 text-lg font-semibold text-ink">
            Opening your camera…
          </p>
          <p className="mt-1 text-ink-soft">
            If your browser asks for permission, choose "Allow".
          </p>
        </div>
      )}

      {stage === "live" && (
        <div className="animate-fade-up">
          <h1 className="font-heading text-4xl leading-tight text-ink">
            Line up your photo
          </h1>
          <p className="mt-2 text-lg text-ink-soft">
            Take your time. Tap the big button when you're ready.
          </p>

          <div className="relative mx-auto mt-5 aspect-[4/3] max-w-lg overflow-hidden rounded-3xl border-4 border-card bg-black shadow-lg ring-1 ring-border">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
              aria-label="A live view from your camera"
            />
          </div>

          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={captureFrame}
              className="btn-primary"
              aria-label="Take the photo now"
            >
              <CameraIcon className="h-7 w-7" />
              Take the photo
            </button>
            <button type="button" onClick={stopPreview} className="btn-ghost">
              Stop the camera
            </button>
          </div>
        </div>
      )}

      {stage === "captured" && photo && (
        <form onSubmit={handleFormSubmit} className="animate-fade-up" noValidate>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-terracotta">
            <SparkleIcon className="h-4 w-4" aria-hidden="true" />
            Nearly there
          </p>
          <h2 className="mt-2 font-heading text-3xl leading-tight text-ink">
            Add a note to remember
          </h2>

          <div className="mt-5 flex items-center gap-5">
            <img
              src={photo}
              alt="The photo you just took"
              className="h-32 w-32 shrink-0 rounded-2xl object-cover shadow-md ring-1 ring-border"
            />
            <div className="min-w-0">
              <p className="text-lg font-bold text-ink">Your photo</p>
              <p className="mt-1 text-ink-soft">
                It will be saved with a short caption automatically.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="memory-name"
                className="block text-lg font-bold text-ink"
              >
                Who is in the photo?
              </label>
              <input
                id="memory-name"
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="e.g. The lady from the shop"
                className="mt-2 w-full rounded-2xl border-2 border-sand-deep bg-white p-4 text-lg leading-snug text-ink placeholder:text-ink-soft/80 focus:border-terracotta focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              />
            </div>

            <div>
              <label htmlFor="memory-note" className="block text-lg font-bold text-ink">
                How did you meet? <span className="text-ink-soft">(optional)</span>
              </label>
              <textarea
                id="memory-note"
                value={metNote}
                onChange={(e) => setMetNote(e.target.value)}
                rows={3}
                maxLength={280}
                placeholder="e.g. We met every Tuesday at the bowls club"
                className="mt-2 w-full resize-y rounded-2xl border-2 border-sand-deep bg-white p-4 text-lg leading-snug text-ink placeholder:text-ink-soft/80 focus:border-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              />
            </div>

            <p className="rounded-2xl bg-sand p-4 text-lg text-ink">
              <span className="font-bold">Caption:</span> {previewCaption}
            </p>

            <fieldset>
              <legend className="text-lg font-bold text-ink">
                Where should this photo be kept?
              </legend>
              <p className="mt-1 text-ink-soft">
                Choose one or more — it will appear in each place you pick.
              </p>
              <div
                className="mt-3 flex flex-wrap gap-3"
                role="group"
                aria-label="Places to keep this photo"
              >
                {DESTINATION_OPTIONS.map(({ id, label, hint, icon: Icon }) => {
                  const active = destinations.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleDestination(id)}
                      aria-pressed={active}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta active:scale-[0.97] ${
                        active
                          ? "border-terracotta bg-card shadow-sm"
                          : "border-sand-deep bg-transparent text-ink-soft hover:border-ochre"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${
                          active
                            ? "bg-terracotta text-white"
                            : "bg-sand text-ink-soft"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-base font-bold leading-tight text-ink">
                          {label}
                        </span>
                        <span className="block text-sm leading-tight text-ink-soft">
                          {hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {saveError && (
            <p
              role="alert"
              className="mt-6 rounded-2xl border border-ochre bg-ochre-soft p-4 text-lg text-ink"
            >
              {saveError} Your photo is still here — try saving again.
            </p>
          )}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              <CheckIcon className="h-6 w-6" />
              {saving ? "Saving your photo…" : "Save my photo"}
            </button>
            <button type="button" onClick={resetAll} className="btn-secondary flex-1">
              <RepeatIcon className="h-5 w-5" />
              Start again
            </button>
          </div>
        </form>
      )}

      {stage === "saved" && (
        <div className="animate-fade-up py-8 text-center" aria-live="polite">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sage text-ink ring-1 ring-border">
            <CheckIcon className="h-10 w-10" aria-hidden="true" />
          </span>
          <h2 className="mt-5 font-heading text-4xl leading-tight text-ink">
            Saved to your memories
          </h2>
          <p className="mx-auto mt-2 max-w-md text-lg text-ink-soft">
            <span className="font-bold text-ink">{savedCaption}</span> is kept safe
            since {savedFullDate} in{" "}
            {destinations
              .map((d) => DESTINATION_OPTIONS.find((o) => o.id === d)?.label ?? d)
              .join(" and ")}
            .
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button type="button" onClick={resetAll} className="btn-primary">
              <CameraIcon className="h-6 w-6" />
              Take another photo
            </button>
            <button type="button" onClick={onOpenLibrary} className="btn-secondary">
              Open my memory library
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
