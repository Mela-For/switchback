const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
/** Haiku, not Sonnet/Opus — this is narrow extractive summarization, not a task that needs a stronger model. Keep AI usage cheap and fast per the "used narrowly" design principle (see ARCHITECTURE.md). */
const MODEL = 'claude-haiku-4-5-20251001';
/** Below this length, a description is already short enough to show as-is — skip the AI call entirely. */
const SUMMARIZE_THRESHOLD_CHARS = 400;
const FALLBACK_TRUNCATE_CHARS = 300;
/** Placeholder — the real instruction text isn't published. */
const SUMMARY_PROMPT = '[prompt omitted]';

/**
 * Summarizes a plain-text facility description into 2-3 sentences. Short descriptions pass
 * through unchanged (no AI call). If the Anthropic call fails for any reason, falls back to a
 * truncated version of the original rather than failing the whole recreation.gov lookup —
 * summarization is a nice-to-have, not the point of the feature.
 */
export async function summarizeDescription(description: string, apiKey: string): Promise<string> {
  if (description.length < SUMMARIZE_THRESHOLD_CHARS) return description;

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            // Prompt text omitted from this public snapshot. It asks for a short, extractive summary
            // focused on concrete details over marketing language — see ARCHITECTURE.md.
            content: `${SUMMARY_PROMPT}\n\n${description}`,
          },
        ],
      }),
    });
    if (!res.ok) return truncate(description);
    const data = (await res.json()) as { content?: { text?: string }[] };
    const text = data.content?.[0]?.text?.trim();
    return text || truncate(description);
  } catch {
    return truncate(description);
  }
}

function truncate(text: string): string {
  return text.length > FALLBACK_TRUNCATE_CHARS ? `${text.slice(0, FALLBACK_TRUNCATE_CHARS)}…` : text;
}
