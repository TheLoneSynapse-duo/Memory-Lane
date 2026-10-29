/**
 * The companion's tools, run in the browser.
 *
 * When the agent calls a tool, the session (src/data/voiceAgent.ts) hands it
 * here and sends the result back over the WebSocket. Each tool is answered by
 * the Memory Lane API — the same endpoints `server/agent/publish.js` wires up
 * as HTTP tools for a deployed agent — so there is one implementation of the
 * behaviour, not two.
 */
import { apiGet, apiPost } from "./api";
import { focusPerson, goToPage, isAgentPage } from "./agentFocus";
import { reloadUpcomingEvents } from "./events";
import { reloadHome } from "./home";
import { reloadSavedMemories } from "./memoryStore";
import { saveProfile } from "./profile";
import { reloadSchedule } from "./scheduleStore";

export type ToolResult = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function runAgentTool(name: string, args: ToolResult): Promise<ToolResult> {
  switch (name) {
    case "who_am_i":
      return apiGet<ToolResult>("/agent/me");

    case "remember_my_name": {
      const result = await apiPost<ToolResult>("/agent/me", {
        name: str(args.name),
        preferredName: str(args.preferredName),
      });
      // The greeting at the top of every screen should change too — what they
      // just said is what they want to be called.
      if (result.saved === true && typeof result.name === "string") {
        saveProfile({
          name: result.name,
          preferredName: typeof result.preferredName === "string" ? result.preferredName : "",
        });
      }
      return result;
    }

    case "what_day_is_it":
      return apiGet<ToolResult>("/agent/now");

    case "find_person": {
      // `name` carries whatever they called the person: a name, or a
      // relationship such as "my daughter".
      const result = await apiGet<ToolResult>(
        `/agent/person?name=${encodeURIComponent(str(args.name))}`
      );
      // On a screen this is also a request to show them: the card opens behind
      // the conversation, so they can see the face while the companion talks.
      // On a phone there is nothing to show, and this is simply skipped.
      if (result.found === true && typeof result.id === "string") {
        focusPerson(result.id);
      }
      return result;
    }

    case "get_day":
      return apiGet<ToolResult>("/agent/context");

    case "go_to": {
      // Nothing to fetch: the screen moves here and now, which is the whole
      // point of asking out loud — hands free, without reaching for the rail.
      const page = args.page;
      if (!isAgentPage(page)) {
        // The model can correct itself once it knows what the screens are called.
        return { error: `There is no screen called "${str(page)}".`, pages: "home, faces, camera, stories, memories, today" };
      }
      goToPage(page);
      return { moved: true, page };
    }

    case "define_word":
      // The meaning comes from the API's own dictionary — one plain sentence,
      // not a page of results, because it is being spoken.
      return apiGet<ToolResult>(`/agent/define?word=${encodeURIComponent(str(args.word))}`);

    case "search_the_web":
      // The wider world, when the question is not about them or their day.
      return apiGet<ToolResult>(`/agent/search?query=${encodeURIComponent(str(args.query))}`);

    case "recall_memories": {
      const about = str(args.about);
      const query = about ? `?about=${encodeURIComponent(about)}` : "";
      return apiGet<ToolResult>(`/agent/memories${query}`);
    }

    case "cancel_reminder": {
      const result = await apiPost<ToolResult>("/agent/cancel", {
        what: str(args.what),
        day: str(args.day),
        reason: str(args.reason),
      });
      // Cancelling only hides it, but the day on screen still changes.
      if (result.cancelled) await Promise.all([reloadSchedule(), reloadUpcomingEvents()]);
      return result;
    }

    case "move_reminder": {
      const result = await apiPost<ToolResult>("/agent/move", {
        what: str(args.what),
        time: str(args.time),
        day: str(args.day),
        headline: str(args.headline),
        details: str(args.details),
        reason: str(args.reason),
      });
      if (result.moved) await Promise.all([reloadSchedule(), reloadUpcomingEvents()]);
      return result;
    }

    case "edit_memory": {
      const result = await apiPost<ToolResult>("/agent/edit-memory", {
        about: str(args.about),
        date: str(args.date),
        name: str(args.name),
        note: str(args.note),
      });
      // The library and the moments on Home both hold what counts as a memory,
      // so either could have been the one corrected.
      if (result.changed) await Promise.all([reloadSavedMemories(), reloadHome()]);
      return result;
    }

    case "remember_this": {
      const result = await apiPost<ToolResult>("/agent/remember", {
        who: str(args.who),
        note: str(args.note),
      });
      // The note lands in the library, so bring the screens on screen up to date.
      if (result.saved) await Promise.all([reloadSavedMemories(), reloadHome()]);
      return result;
    }

    case "add_to_today": {
      const result = await apiPost<ToolResult>("/agent/today", {
        time: str(args.time),
        what: str(args.what),
        details: str(args.details),
      });
      if (result.added) await Promise.all([reloadSchedule(), reloadUpcomingEvents()]);
      return result;
    }

    default:
      return { error: `Unknown tool "${name}".` };
  }
}

/** A short, human sentence for the tool that is running. */
export const TOOL_ACTIVITY: Record<string, string> = {
  who_am_i: "Checking who you are…",
  remember_my_name: "Keeping your name…",
  what_day_is_it: "Checking the day…",
  find_person: "Looking them up…",
  get_day: "Checking your day…",
  go_to: "Moving there…",
  define_word: "Checking what it means…",
  search_the_web: "Looking that up online…",
  recall_memories: "Looking through your memories…",
  remember_this: "Saving that for you…",
  edit_memory: "Changing that memory…",
  add_to_today: "Adding that to today…",
  cancel_reminder: "Taking that off…",
  move_reminder: "Changing the time…",
};
