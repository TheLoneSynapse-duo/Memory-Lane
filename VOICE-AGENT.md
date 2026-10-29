# The Memory Lane companion

Everything the voice assistant can do, and what to say to get it. For how it is
built and why, see [the README](README.md#the-voice-assistant).

The button in the corner of every screen opens a short consent step first, then
starts the call. Closing the panel ends it — the microphone never keeps
listening behind a dismissed screen.

## Turning it on

```bash
cp .env.example .env      # then set ASSEMBLYAI_API_KEY
npm run server            # alongside npm run dev, as usual
```

With no key the app still runs; the companion's panel simply says it is not set
up yet.

---

## What it can do

Thirteen things, in the order you are most likely to need them.

### 1. Who they are — `who_am_i` / `remember_my_name`

The personal details from the welcome step and the profile dialog: their name,
what they like to be called, and the line they wrote about themselves. Saying
their name back is what makes it feel like a companion rather than a call
centre.

- "What's my name?"
- "What should I call you?"
- "Do you know who I am?"

If they tell you their name — or correct how you addressed them —
`remember_my_name` keeps it, in the app and on this device, so it is never
asked for twice. The name also reaches the transcription prompt, so it is
spelled right when it is spoken.

### 2. Say what day and time it is — `what_day_is_it`

The most repeated question there is, answered the way a person would say it:
*"It is Sunday evening, the 27th of September. It is quarter to ten."*

- "What day is it?"
- "What's the time?"
- "Is it morning or afternoon?"

### 3. Look someone up — `find_person`

Gets the whole card: how you are related, the short life story, when you last
met, what they love, and anything you have saved about them.

It understands a **name or a relationship**, so you do not have to remember the
name to get the answer:

- "**Do I know Ruby?**"
- "Who's Ellen?"
- "Who is my daughter?"
- "Tell me about my grandson."
- "Who's my chess friend?"
- "Who's the neighbour?"

If two people could be meant — "my friend" is both Jamal and Dorothy — it asks
which, rather than guessing. If nobody matches, it offers the names it does know.

> While it talks, **their card opens on screen**: the face, the photographs and
> the "something to say". Seeing is the point; hearing is not enough.

### 4. Describe the day — `get_day`

Today's plan, what is coming up over the next few days, and the memory of the
day.

- "What's happening today?"
- "Who's coming to visit?"
- "What's on this week?"

### 5. Search what has been saved — `recall_memories`

Reads back everything entered anywhere in the app: the notes and photographs
in the memory library, the written moments on Home, and the photo stories.

- "What did I tell you about Ruby?"
- "Did I save anything?"
- "Have I kept anything about the garden?"
- "What was the story about the harbour?"

### 6. Keep something — `remember_this`

Saves a note into the memory library, exactly as a photograph would be kept. It
appears on the Home screen while the call is still going.

- "Remember that Ruby loves chocolate cookies."
- "Make a note that the shed key is in the drawer."
- "I want to keep that the boiler man was kind."

### 7. Correct something already saved — `edit_memory`

The memory library and the written moments on Home, both of which are "a
memory" to the person saying it. When something they kept is wrong, it is
changed where it stands rather than a new note being written beside it.

- "Change the year of the harbour memory to 2019."
- "That was 2021, not 2019."
- "It was Ruby, not Ellen."
- "The note should say the shed key is in the drawer."

Only what they asked for changes — a year keeps the month and day it already
had. If it cannot find which memory they mean, or cannot tell the date, it says
so and asks rather than claiming a change it did not make.

### 8. Add a reminder to today — `add_to_today`

- "Remind me to call Ellen at three."
- "Put chess on for tonight at seven."

### 9. Take a plan off — `cancel_reminder`

Today's, or one on any day coming up. Only when they clearly want it gone; if
it is unclear the companion asks first.

- "I'm not going to chess tonight."
- "Take Ruby's lunch off today."
- "Cancel the chess on Wednesday."
- "The river walk on Saturday is off."

> Nothing is destroyed. The plan is only hidden, and the change is written to
> the record a family member reads: `GET /api/schedule/changes`.

### 10. Move a plan — `move_reminder`

Today's, or one on any day coming up — the time, the day, or the wording.

- "David's call is at half past seven now."
- "Move Ruby's lunch to one o'clock."
- "Chess is on Thursday this week."
- "Ellen's call is on Friday now."

### 11. Take me there — `go_to`

Hands-free navigation: the screen moves while the call keeps going, so nobody
has to reach for the buttons mid-sentence. Only when they ask to move — talking
about memories is not a request to open them.

- "Go to memories."
- "Show me today."
- "Open the camera."
- "Take me home."

The six screens are `home`, `faces`, `camera`, `stories`, `memories` and
`today`. This one has no endpoint: it runs in the browser, because a phone call
has no screen to move.

### 12. What a word means — `define_word`

The dictionary, for a word they have forgotten — or never quite knew. One
plain meaning, spoken slowly, rather than a page of results.

- "What does solitary mean?"
- "What's a bungalow?"
- "Define honour for me."

If there is no entry it says so gently and offers to look the phrase up more
widely instead of inventing a meaning.

### 13. Search the wider world — `search_the_web`

Everything outside Memory Lane: a fact, a place, a date, how something works,
who someone famous is. It answers in one or two sentences of its own from a few
short summaries, and never reads out links.

- "Who wrote Jane Eyre?"
- "What's the capital of Japan?"
- "When did the Humber bridge open?"

What they ask about **their own life** never comes from a search: their name,
their people and their days come only from the app.

It works with no keys at all — meanings come from Wiktionary and searches from
Wikipedia. For Google, put `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_CSE_ID`
in `.env` (Brave: `BRAVE_SEARCH_API_KEY`); see `.env.example`.

---

## Things worth trying

| Say this | What happens |
| "What's my name?" | Answered from the personal details, with the name they like |
| --- | --- |
| "Do I know Ruby?" | Ruby's card opens, and the companion tells you about her |
| "Who is my daughter?" | Finds Ellen from the relationship — no name needed |
| "What day is it?" | The day, the date and the time of day, spoken plainly |
| "What's happening today?" | Today's plan and what is coming up |
| "Remember that Ruby loves chocolate cookies" | Saved to the memory library, visible before the call ends |
| "Change the year of the harbour memory to 2019" | Changed where it stands — and it says what it now reads |
| "Remind me to call Ellen at three" | Added to today's plan |
| "I'm not going to chess tonight" | Taken off today, kept in the record for family |
| "Cancel the chess on Wednesday" | Wednesday's chess is off, kept in the record for family |
| "Chess is on Thursday this week" | Wednesday's chess moves to Thursday |
| "What did I tell you about the garden?" | Reads back anything saved about it |
| "Go to memories" | The screen moves to the memory library, the call carrying on |
| "What does bungalow mean?" | One plain meaning, from the dictionary |
| "Who wrote Jane Eyre?" | Looked up online, answered in a sentence |

---

## How it behaves

Not every part of the companion is a tool. These are the rules it follows
whatever it is doing, and for this use case they matter more than the tools:

- Short, slow sentences. One idea and at most one question per reply.
- Never argues, quizzes, tests or corrects, and never points out that something
  was forgotten.
- Answers a repeated question **fully and warmly each time**, as if it were the
  first — never "I already told you".
- Waits through a pause: it reads the meaning of what was said rather than
  counting silence, so stopping mid-sentence does not cut them off — and it
  answers as soon as the sentence is plainly finished instead of waiting out a
  fixed delay first. Interrupting it is still allowed.- Answers **only** from what the tools return. It never invents a person, a date or a family detail.
- Never says something was saved, changed, moved or taken off unless the tool's own result says so — and when asked for a change, it makes the change rather than saying it cannot.
- If it does not know, it says so gently and offers to keep it for next time.
- Never mentions the tools, and never reads out links, lists or whole pages. If
  it did look something up, it simply says what it found.
- Only takes something off the day when they clearly want it — *the day is
  theirs, not the companion's.*

The transcript of what was said is on screen while the call runs, with Mute and
End always one tap away. A wave sits above it the whole time: the microphone
while it listens, a pulse travelling along the bars while it works on an
answer, and the reply itself while it speaks — so the moment between a question
and the answer is shown rather than left silent.

## What it will not do

- No guessing: a wrong fact about their own family is worse than "I don't know".
  A search is for the world outside — never for them, the people they know, or
  what they have saved.
- No memory quizzes or testing of any kind.
- It cannot delete a saved memory, and it cannot delete an event — only hide it.
- No medical advice, and nothing that dials out on its own.

## Example: "Do I know Ruby?"

1. The companion calls `find_person` with `Ruby`.
2. `GET /api/agent/person?name=Ruby` returns her relationship, her story, when
   you last met, what she loves and a conversation starter.
3. Ruby's card opens on screen behind the conversation.
4. It says something like *"Ruby is your granddaughter. She studies design in
   the city and visits most Saturdays with her sketchbook."*

If the name is not one it knows, step 2 returns everyone in the circle instead,
and it asks which of them they mean.

---

## Where it lives

| File | What it holds |
| --- | --- |
| `server/agent/persona.js` | Who the companion is: prompt, greeting, voice, name keyterms |
| `server/agent/tools.js` | The tools, as the model sees them |
| `server/routes/agent.js` | The session routes, and the tool endpoints |
| `server/routes/schedule.js` | `GET /api/schedule/changes`, the record of edits |
| `src/data/voiceAgent.ts` | The live session: audio, transcripts, tool answers |
| `src/data/agentTools.ts` | Runs the tools against this app's own API |
| `src/components/VoiceWave.tsx` | The wave: listening, thinking, speaking |
| `src/data/agentFocus.ts` | Asks the screen to move: a person's card, or a whole screen |
| `src/components/VoiceAgent.tsx` | The button, the consent step, the panel |

## Two ways to run it

| | Inline (the default) | Stored agent |
| --- | --- | --- |
| How | the session carries the prompt and tools; the browser runs them | an agent on your AssemblyAI account, with HTTP tools |
| Needs | `ASSEMBLYAI_API_KEY` | that, plus a public `MEMORY_LANE_BASE_URL` |
| Good for | local use and browser testing | a deployed app, and the same companion by phone |

Thirteen things either way — twelve by phone, since `go_to` has no screen to
move. To publish the stored version:

```bash
MEMORY_LANE_BASE_URL=https://your-app.example.com npm run agent:publish
```
