import type { ResourceState } from "../data/resource";
import { RepeatIcon } from "./icons";

/**
 * A calm stand-in for a section whose data is still on its way — or could not
 * be fetched. Render it only while `state.status !== "ready"`.
 */
export default function DataNotice({
  state,
  loadingMessage,
  onRetry,
  className,
}: {
  state: ResourceState<unknown>;
  loadingMessage?: string;
  onRetry?: () => void;
  className?: string;
}) {
  if (state.status === "error") {
    return (
      <div
        role="alert"
        className={`rounded-2xl border border-ochre bg-ochre-soft p-5 text-lg text-ink ${
          className ?? ""
        }`}
      >
        <p className="font-bold">I couldn&rsquo;t reach your memories just now.</p>
        <p className="mt-1 text-ink-soft">{state.error}</p>
        {onRetry && (
          <button type="button" onClick={() => void onRetry()} className="btn-secondary mt-4">
            <RepeatIcon className="h-5 w-5" />
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!loadingMessage) return null;

  return (
    <p role="status" className={`text-lg text-ink-soft ${className ?? ""}`}>
      {loadingMessage}
    </p>
  );
}
