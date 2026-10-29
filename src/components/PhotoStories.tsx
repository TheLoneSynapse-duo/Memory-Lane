import { useState } from "react";
import { reloadStories, useStoriesState, type Story } from "../data/stories";
import { reloadSavedMemories, useMemoriesState } from "../data/memoryStore";
import DataNotice from "./DataNotice";
import SceneArt from "./SceneArt";
import StoryEditor from "./StoryEditor";
import { PencilIcon, SparkleIcon } from "./icons";

export default function PhotoStories() {
  const storiesState = useStoriesState();
  const memoriesState = useMemoriesState();
  const stories = storiesState.data;

  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const savedPhotos = memoriesState.data.filter(
    (m) => m.destinations.includes("stories") && m.photoDataUrl
  );

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-terracotta">
        <SparkleIcon className="h-4 w-4" aria-hidden="true" />
        Photo stories
      </p>
      <h1 className="mt-2 font-heading text-3xl leading-tight text-ink sm:text-4xl">
        Pick a picture. Hear the day.
      </h1>
      <p className="mt-3 max-w-xl text-lg leading-relaxed text-ink-soft">
        A few familiar days, kept safe. Tap a story to hear it told once more.
      </p>

      {savedPhotos.length > 0 && (
        <section aria-labelledby="saved-photos-heading" className="mt-8">
          <h2
            id="saved-photos-heading"
            className="font-heading text-2xl leading-snug text-ink"
          >
            Your new photos
          </h2>
          <p className="mt-1 text-ink-soft">
            Moments you kept here from the camera, ready to become stories.
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {savedPhotos.map((m) => (
              <li
                key={m.id}
                className="animate-fade-up overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border"
              >
                <img
                  src={m.photoDataUrl ?? undefined}
                  alt={m.caption}
                  className="aspect-square w-full object-cover"
                />
                <p className="px-3 py-2.5 text-base font-bold leading-tight text-ink">
                  {m.caption}
                </p>
                {m.name && (
                  <p className="px-3 pb-3 text-sm text-ink-soft">
                    Remembered as {m.name}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {memoriesState.status === "error" && (
        <DataNotice
          state={memoriesState}
          onRetry={reloadSavedMemories}
          className="mt-6"
        />
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl text-ink">Stories to hear again</h2>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="btn-secondary"
          aria-haspopup="dialog"
        >
          <PencilIcon className="h-5 w-5" />
          Add or edit
        </button>
      </div>

      {storiesState.status !== "ready" ? (
        <DataNotice
          state={storiesState}
          loadingMessage="Fetching the stories you love…"
          onRetry={reloadStories}
          className="mt-4"
        />
      ) : stories.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-sand px-5 py-10 text-center">
          <p className="font-heading text-xl text-ink">No stories on the shelf</p>
          <p className="mt-1 text-lg text-ink-soft">
            Write one down before it slips away.
          </p>
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="btn-primary mt-5"
          >
            Add a story
          </button>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              open={openIds.has(story.id)}
              onToggle={() => toggle(story.id)}
            />
          ))}
        </ul>
      )}

      {editorOpen && <StoryEditor onClose={() => setEditorOpen(false)} />}
    </div>
  );
}

function StoryCard({
  story,
  open,
  onToggle,
}: {
  story: Story;
  open: boolean;
  onToggle: () => void;
}) {
  const storyId = `story-${story.id}`;

  return (
    <li className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border transition-shadow duration-300 hover:shadow-md">
      <article>
        <div
          className="flex h-40 items-center justify-center overflow-hidden sm:h-44"
          style={{ background: story.wash }}
        >
          {story.photoDataUrl ? (
            <img
              src={story.photoDataUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <SceneArt scene={story.scene} />
          )
          }
        </div>

        <div className="p-5 sm:p-6">
          <h2 className="font-heading text-2xl leading-snug text-ink">{story.title}</h2>
          <p className="mt-1.5 text-base font-bold text-ink-soft">{story.context}</p>

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={storyId}
            className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-transparent p-0 text-lg font-bold text-terracotta transition-colors duration-150 hover:text-terracotta-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          >
            {open ? "Hide the story" : "Hear the story"}
            <span
              aria-hidden="true"
              className={`inline-block transition-transform duration-300 ease-out ${
                open ? "rotate-90" : ""
              }`}
            >
              →
            </span>
          </button>

          {open && (
            <p
              id={storyId}
              className="fade-in-down mt-4 rounded-2xl bg-sand/70 p-4 text-lg leading-relaxed text-ink"
            >
              {story.story}
            </p>
          )}
        </div>
      </article>
    </li>
  );
}
