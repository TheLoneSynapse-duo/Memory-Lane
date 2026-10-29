/**
 * The actions the companion can take on the person's behalf.
 *
 * One definition each, used two ways:
 *
 *   - inline session  → clientTools(): "type": "function". The browser runs
 *     them (src/data/agentTools.ts) against the Memory Lane API, which needs
 *     no public URL. This is the default, quickest way to run the app.
 *   - stored agent    → httpTools(baseUrl): AssemblyAI calls the same
 *     endpoints itself, so they still work on a phone call.
 *
 * Either way the logic lives in server/routes/agent.js, once.
 * https://www.assemblyai.com/docs/voice-agents/voice-agent-api/tools/overview
 *
 * Descriptions are addressed to the model and say *when* to call, not just
 * what the tool does — that is the model's main signal.
 */
export const TOOL_DEFS = [
  {
    name: "who_am_i",
    description:
      "Get the personal details of the person you are speaking with: their name, what they like to be called, and the line they wrote about themselves. Call this whenever they ask who they are, what their name is, what they should call you, or anything about them personally. Their own name is the one thing they should never have to be told twice.",
    parameters: { type: "object", properties: {} },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "GET", path: "/me" },
  },
  {
    name: "remember_my_name",
    description:
      "Save the person's own name or what they like to be called, so you know it from now on. Call this the moment they tell you their name, correct how you addressed them, or ask you to remember what to call them. Only save what they actually said — never a name you have inferred.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Their full name, as they said it. Empty if they only gave what to call them.",
        },
        preferredName: {
          type: "string",
          description: "What they like to be called, e.g. Maggie. Empty if they did not say.",
        },
      },
      required: [],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "POST", path: "/me" },
  },
  {
    name: "what_day_is_it",
    description:
      "Get the current day, date and time of day. Call this whenever the person asks what day it is, what the time is, whether it is morning or afternoon, or sounds unsure about when they are. It returns a sentence already written for speaking, so use its wording instead of reading the numbers aloud.",
    parameters: { type: "object", properties: {} },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "GET", path: "/now" },
  },
  {
    name: "find_person",
    description:
      "Look up one familiar person and get what Memory Lane knows about them: how they are related, a short life story, when they last met, what they love, and any note saved about them. Call this whenever the person asks who someone is, or mentions a person you are not certain about. Pass whatever they called them — a name like Ellen, or a relationship like daughter, grandson or chess friend. In the app this also brings their card onto the screen so they can see the face while you talk; that happens on its own, so do not announce it. If it could mean more than one person the result lists the candidates, so ask which they mean; if nothing matches it lists everyone in the circle.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Who they mean: a name (Ellen, Aunt Dorothy) or the relationship as they said it (my daughter, grandson, chess friend).",
        },
      },
      required: ["name"],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "GET", path: "/person" },
  },
  {
    name: "get_day",
    description:
      "Get what is happening today, what is coming up in the next few days, and the memory of the day. Call this whenever the person asks about their day, the time, an appointment, or who is visiting.",
    parameters: { type: "object", properties: {} },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "GET", path: "/context" },
  },
  {
    name: "recall_memories",
    description:
      "Search the notes and photos the person has saved with Memory Lane. Call this when they ask what they once told you, whether they saved something, or about a person, place or moment. Omit 'about' to see the most recent ones.",
    parameters: {
      type: "object",
      properties: {
        about: {
          type: "string",
          description: "A word or two to search for, e.g. Ruby, harbor, chess. Key words rather than a whole sentence — a place, a person, a year. Leave empty for the most recent memories.",
        },
      },
      required: [],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "GET", path: "/memories" },
  },
  {
    name: "remember_this",
    description:
      "Save something the person wants to keep: a name, a note, a plan, something that happened. Call this only when they clearly ask you to remember it, then confirm in one short sentence.",
    parameters: {
      type: "object",
      properties: {
        who: {
          type: "string",
          description: "Who or what the note is about, e.g. Ruby, the doctor, the garden.",
        },
        note: {
          type: "string",
          description: "The thing to keep, in their own words where possible.",
        },
      },
      required: ["who", "note"],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "POST", path: "/remember" },
  },
  {
    name: "cancel_reminder",
    description:
      "Take a plan off: an appointment, a visit, a call — today's, or one on a later day. Call this only when the person clearly wants it gone, or says they are not going — if they are merely unsure, ask them first. Pass what they called it, in their words, and the day only if they said which day. If more than one plan could be meant, the result lists the plans with their days so you can ask which.",
    parameters: {
      type: "object",
      properties: {
        what: {
          type: "string",
          description: "What to take off, in their words, e.g. Ruby's lunch, the doctor, chess night.",
        },
        day: {
          type: "string",
          description: "Which day they mean, only if they said one: tomorrow, Wednesday, the 5th, or a date like 2026-10-05. Empty when they mean today or did not say.",
        },
        reason: {
          type: "string",
          description: "Why, in their words, if they said why. May be empty.",
        },
      },
      required: ["what"],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "POST", path: "/cancel" },
  },
  {
    name: "move_reminder",
    description:
      "Change when a plan happens — today's, or one on a later day — or correct what it is called. Call this when the person says a plan is at a different time, or on a different day. Pass what they called it, in their words, the new time, and the day only if they said which day. Say the new time or day back to them afterwards so they can correct you.",
    parameters: {
      type: "object",
      properties: {
        what: {
          type: "string",
          description: "What to move, in their words, e.g. Ruby's lunch, the telephone call, chess night.",
        },
        time: {
          type: "string",
          description: "The new time, as they said it, e.g. 1pm, after lunch, this evening. Leave empty only when they are just correcting the wording or the day.",
        },
        day: {
          type: "string",
          description: "The day it should happen on now, only if they said one: today, tomorrow, Friday, the 5th, or a date like 2026-10-05. Empty when it is not changing.",
        },
        headline: {
          type: "string",
          description: "A new short headline, only if they corrected what it is called.",
        },
        details: {
          type: "string",
          description: "A new description, only if they added or corrected a detail.",
        },
        reason: {
          type: "string",
          description: "Why, in their words, if they said why. May be empty.",
        },
      },
      required: ["what"],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "POST", path: "/move" },
  },
  {
    name: "add_to_today",
    description: "Add a reminder to today's plan. Call this when the person asks to be reminded of something later today, or tells you about an arrangement they want kept.",
    parameters: {
      type: "object",
      properties: {
        time: {
          type: "string",
          description: "When it happens, as they said it, e.g. 3pm, after lunch, this evening.",
        },
        what: { type: "string", description: "A short headline, e.g. Call Ellen." },
        details: { type: "string", description: "Any extra detail worth keeping. May be empty." },
      },
      required: ["what"],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "POST", path: "/today" },
  },
  {
    name: "edit_memory",
    description:
      "Correct a memory that has already been saved: the year or date it happened, what it is called, or the note with it. Call this when they say something they kept is wrong — 'that was 2019, not 2021', 'change the year', 'it was Ruby, not Ellen' — rather than saving a new note beside it. Pass a word or two of their own to find it, and only what they asked to change. The result says plainly whether it changed and what it became; if it says nothing changed or it could not tell which memory, say so and ask which they mean — never claim a change it did not make.",
    parameters: {
      type: "object",
      properties: {
        about: {
          type: "string",
          description: "Which memory, in a word or two of their own — a name, a place, a year from it. A fragment, not a sentence.",
        },
        date: {
          type: "string",
          description: "When it happened or was saved, as they said it: a year (2019), March 2019, or 3 March 2019. Empty if they did not say.",
        },
        name: {
          type: "string",
          description: "A corrected name for it — who is in it, or what it is called. Empty if they did not correct it.",
        },
        note: {
          type: "string",
          description: "The note as it should read now, in their own words. Empty if they did not correct it.",
        },
      },
      required: ["about"],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "POST", path: "/edit-memory" },
  },
  {
    name: "define_word",
    description:
      "Look up what a word or short phrase means. Call this whenever the person asks what a word means, how it is used, how it is pronounced or how to spell it — 'what does solitary mean', 'what's a bungalow', 'define honour'. It returns plain definitions written for speaking, so give them one of them in your own slow words rather than reading the entry aloud. If nothing comes back, say so gently and do not guess.",
    parameters: {
      type: "object",
      properties: {
        word: {
          type: "string",
          description: "The word or short phrase they asked about, exactly as they said it.",
        },
      },
      required: ["word"],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "GET", path: "/define" },
  },
  {
    name: "search_the_web",
    description:
      "Search the wider world for something Memory Lane does not know: a fact, a place, a date, a person in the news, how something works, who someone famous is. Call this whenever they ask about anything beyond their own life, their day and what they have saved — before you answer, never after. The result comes back as a few short summaries, so answer in one or two warm sentences of your own and never read out links, lists or full pages. Never use it for anything about them or their family: their own details come only from who_am_i, find_person and recall_memories.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to look for, as a few words rather than a whole question, e.g. capital of France, when did the Humber bridge open.",
        },
      },
      required: ["query"],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    http: { method: "GET", path: "/search" },
  },
  {
    name: "go_to",
    description:
      "Take the person to one of Memory Lane's screens, so they can ask out loud instead of reaching for the buttons. Call this only when they clearly ask to go, open, show or take them somewhere: 'go to memories', 'show me today', 'open the camera', 'take me home', 'back to the stories'. Pass the closest of the six screens below. If they are only talking about their memories or about today, answer them instead of moving — this is for when they ask to move. Confirm in one short sentence as the screen changes.",
    parameters: {
      type: "object",
      properties: {
        page: {
          type: "string",
          description:
            "Which screen, as one word: home, faces (the people they know), camera, stories, memories (the memory library), today (their day).",
        },
      },
      required: ["page"],
    },
    execution_mode: "hold",
    timeout_seconds: 15,
    // Deliberately no `http`: moving a screen only means something where there
    // is one, so a phone call never sees this tool. See httpTools().
  },
];

/** The tools as an inline session declares them: the browser answers them. */
export function clientTools() {
  return TOOL_DEFS.map(({ name, description, parameters, execution_mode, timeout_seconds }) => ({
    type: "function",
    name,
    description,
    parameters,
    execution_mode,
    timeout_seconds,
  }));
}

/**
 * The tools as a stored agent declares them: AssemblyAI makes the request.
 *
 * Tools without an `http` entry are left out on purpose — `go_to` moves the
 * screen the browser is showing, which a server-side call cannot do, and on a
 * phone there is no screen to move at all.
 */
export function httpTools(baseUrl) {
  return TOOL_DEFS.filter(({ http }) => http).map(
    ({ name, description, parameters, execution_mode, timeout_seconds, http }) => ({
      name,
      description,
      parameters,
      execution_mode,
      timeout_seconds,
      http: { url: `${baseUrl}${http.path}`, http_method: http.method },
    })
  );
}
