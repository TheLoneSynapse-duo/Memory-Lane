import type { StoryScene } from "../data/stories";

/**
 * The line drawing that illustrates a story. It lives in its own file so the
 * story card and the story editor can draw the same picture.
 */
export default function SceneArt({ scene }: { scene: StoryScene }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-16 w-16 text-terracotta/80 sm:h-20 sm:w-20"
    >
      {scene === "cake" && (
        <>
          <path d="M3 20h18" />
          <path d="M6 12.5h12V16H6z" />
          <path d="M5.5 16a4.8 4.8 0 0 0 13 0" />
          <path d="M9 12.5V9" />
          <path d="M12 12.5V9" />
          <path d="M15 12.5V9" />
          <path d="M9 9 8.4 10.6a.7.7 0 0 0 1.2 0L9 9Z" />
          <path d="M12 9l-.6 1.6a.7.7 0 0 0 1.2 0L12 9Z" />
          <path d="M15 9l-.6 1.6a.7.7 0 0 0 1.2 0L15 9Z" />
        </>
      )}
      {scene === "garden" && (
        <>
          <path d="M12 20V8" />
          <path d="M12 15c-2.5 0-4.5-1.2-6-3" />
          <path d="M12 13c2.5 0 4.5-1.2 6-3" />
          <circle cx="12" cy="5.4" r="2.8" />
          <circle cx="12" cy="5.4" r="1.1" />
        </>
      )}
      {scene === "tea" && (
        <>
          <path d="M4.5 21h15" />
          <path d="M7 21v-2.5" />
          <path d="M17 21v-2.5" />
          <path d="M6 10h12v6.5a4.5 4.5 0 0 1-9-1V10Z" />
          <path d="M18 12h1.2a1.8 1.8 0 0 1 0 3.6H18" />
          <path d="M8.5 7.5c-1.2-1 .8-2-.2-3.5" />
          <path d="M12.5 7.5c-1.2-1 .8-2-.2-3.5" />
        </>
      )}
      {scene === "wedding" && (
        <>
          <circle cx="9.5" cy="9" r="3.8" />
          <circle cx="14.5" cy="9" r="3.8" />
          <circle cx="12" cy="9" r="0.9" fill="currentColor" stroke="none" />
          <path d="M5.5 19.5l.35.95.95.35-.95.35-.35.95-.35-.95-.95-.35.35-.35.95-.35Z" />
        </>
      )}
      {scene === "robin" && (
        <>
          <path d="M3 19c3.5-.8 7-1.6 11-1.6 3 0 5.5-.9 7-1.9" />
          <circle cx="11" cy="12.5" r="4.3" />
          <circle cx="16.3" cy="7.8" r="2.9" />
          <path d="M18.6 6.6l2.4-.7-.5 2.3" />
          <circle cx="16.9" cy="7" r="0.55" fill="currentColor" stroke="none" />
          <path d="M9.4 16.9l-.8 2M12.6 16.6l.8 2" />
        </>
      )}
      {scene === "sunday" && (
        <>
          <path d="M6.5 5.5h11" />
          <path d="M6 9.5h12l-1.1 9.2a1.2 1.2 0 0 1-1.2 1H8.3a1.2 1.2 0 0 1-1.2-1L6 9.5Z" />
          <path d="M6.2 6.5 4.5 8.4" />
          <path d="M17.8 6.5 19.5 8.4" />
          <path d="M12 3.5c.8 0 .8 1.2 0 1.2s-.8-1.2 0-1.2Z" />
          <path d="M10 2.5c-.9-.6-2-.5-2.5.3" />
          <path d="M14 2.5c.9-.6 2-.5 2.5.3" />
        </>
      )}
    </svg>
  );
}
