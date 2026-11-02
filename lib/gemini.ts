// Server-side only: uses the secret GEMINI_API_KEY.
// Models are tried in order; busy models (429/5xx) fall through to the next.
const MODELS = (process.env.GEMINI_MODEL || "gemini-3.8-flash,gemini-3.5-flash,gemini-flash-latest")
  .split(",")
  .map((model) => model.trim());

type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

class RetryableError extends Error {}

export async function generate(parts: Part[], generationConfig?: object) {
  let lastError: Error = new Error("No Gemini models configured.");

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { text: await generateWith(model, parts, generationConfig), model };
      } catch (error) {
        if (!(error instanceof RetryableError)) throw error;
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function generateWith(model: string, parts: Part[], generationConfig?: object) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
    }
  );
  const json = await res.json();

  if (!res.ok) {
    const message = json.error?.message ?? `Gemini request failed (${res.status}).`;
    // Overloaded, rate limited, or unavailable to this key: try again / next model.
    if (res.status === 429 || res.status >= 500 || res.status === 404) {
      throw new RetryableError(message);
    }
    throw new Error(message);
  }

  const text: string | undefined = json.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("");
  if (!text) {
    throw new RetryableError("Gemini returned an empty response.");
  }
  return text.trim();
}

const DESCRIBE_PROMPT =
  "Describe this image in 4-6 sentences. Cover the main subject first, " +
  "then what is happening, the setting, notable objects, colors, facial " +
  "expressions or body language, and any text visible in the image. Be " +
  "specific and literal; only mention what is actually visible, and do " +
  "not try to be funny.";

function withHint(prompt: string, hint?: string) {
  return hint
    ? `${prompt}\n\nThe uploader added this context (trust it unless the ` +
        `image clearly contradicts it): ${hint}`
    : prompt;
}

// Step 1 of the prompt chain: image -> plain text description.
export async function describeImage(base64: string, mimeType: string, hint?: string) {
  const prompt = withHint(DESCRIBE_PROMPT, hint);
  const { text, model } = await generate([
    { inline_data: { mime_type: mimeType, data: base64 } },
    { text: prompt },
  ]);
  return { description: text, prompt, model };
}

const AUDIENCE =
  "You write captions for a meme site for Columbia University students. " +
  "The audience is chronically online college students who live in the " +
  "dorms and are still figuring out New York City.";

const STYLE =
  "Vary the style: relatable student life, internet slang, deadpan, " +
  "wholesome. Keep it clever, not mean, and never punch down.";

// Keeps photo captions about the actual photo instead of generic jokes.
const GROUNDING =
  "Every caption must clearly be about THIS specific image: refer to a " +
  "concrete detail you can see (the subject, an action, an object, an " +
  "expression, the setting, or visible text). Someone reading the caption " +
  "next to the photo should instantly get the connection. Do not invent " +
  "people, places, or events that aren't shown. Only joke about Columbia " +
  "or NYC if the image is actually about them.";

function parseCaptions(value: unknown, count: number) {
  const captions = (Array.isArray(value) ? value : [])
    .map((caption) => String(caption).trim())
    .filter(Boolean)
    .slice(0, count);
  if (!captions.length) {
    throw new Error("Gemini didn't return any captions.");
  }
  return captions;
}

export function captionPrompt(description: string, count = 5, hint?: string) {
  return withHint(
    `${AUDIENCE} Look at the attached image and write ${count} short, funny ` +
      `captions (under 120 characters each) for it. ${GROUNDING} ${STYLE}\n\n` +
      `A literal description of the image, to help you notice details:\n${description}`,
    hint
  );
}

// Step 2 of the prompt chain: image + description -> funny captions.
// The model sees the photo again so captions stay tied to what's in it.
export async function writeCaptions(
  image: { base64: string; mimeType: string },
  description: string,
  { count = 5, hint }: { count?: number; hint?: string } = {}
) {
  const prompt = captionPrompt(description, count, hint);
  const { text, model } = await generate(
    [{ inline_data: { mime_type: image.mimeType, data: image.base64 } }, { text: prompt }],
    {
      responseMimeType: "application/json",
      responseSchema: { type: "ARRAY", items: { type: "STRING" } },
    }
  );
  return { captions: parseCaptions(JSON.parse(text), count), prompt, model };
}

function headlinePrompt(headlines: string[], count = 5) {
  return (
    `${AUDIENCE} Below are today's headlines from campus and NYC news. ` +
    `Pick the ONE headline that is best for light-hearted humor. Never ` +
    `pick stories about death, violence, crime, assault, illness, ` +
    `protests, war, or anything a reader could be hurt by; prefer quirky ` +
    `campus life, food, transit, weather, sports, and city oddities. ` +
    `Then write ${count} short, funny captions (under 120 characters ` +
    `each) reacting to it. ${STYLE}\n\n` +
    headlines.map((headline, i) => `${i}. ${headline}`).join("\n")
  );
}

// Picks the headline with the most comedic potential and captions it.
export async function captionHeadline(headlines: string[], count = 5) {
  const prompt = headlinePrompt(headlines, count);
  const { text, model } = await generate([{ text: prompt }], {
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        index: { type: "INTEGER" },
        captions: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["index", "captions"],
    },
  });

  const result = JSON.parse(text);
  const index = Number(result.index);
  if (!Number.isInteger(index) || !headlines[index]) {
    throw new Error("Gemini picked a headline that doesn't exist.");
  }
  return { index, captions: parseCaptions(result.captions, count), prompt, model };
}
