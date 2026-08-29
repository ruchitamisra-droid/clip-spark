const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export class ClipScoutError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => ["embed", "shorts", "live", "v"].includes(p));
    const candidate = idx >= 0 ? parts[idx + 1] : undefined;
    if (candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate)) return candidate;
  }
  return null;
}

export type VideoMeta = { title: string; channel: string | null; thumbnail: string | null };

export async function fetchMeta(videoId: string): Promise<VideoMeta> {
  const target = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`,
    { headers: { "user-agent": UA } },
  );
  if (!res.ok) {
    throw new ClipScoutError(
      "video_not_found",
      "We couldn't find that video — it may be private, deleted, or the link is wrong.",
    );
  }
  const data = (await res.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };
  return {
    title: data.title ?? "Untitled video",
    channel: data.author_name ?? null,
    thumbnail: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export type TranscriptLine = { start: number; text: string };

type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function tracksFromWatchPage(videoId: string): Promise<CaptionTrack[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999&has_verified=1`, {
    headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
  });
  const html = await res.text();
  const marker = '"captionTracks":';
  const at = html.indexOf(marker);
  if (at === -1) return [];
  const start = html.indexOf("[", at);
  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return [];
  try {
    return JSON.parse(html.slice(start, end)) as CaptionTrack[];
  } catch {
    return [];
  }
}

const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const INNERTUBE_CLIENTS = [
  {
    clientName: "ANDROID",
    clientVersion: "19.09.37",
    androidSdkVersion: 30,
    hl: "en",
    userAgent: "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
  },
  {
    clientName: "IOS",
    clientVersion: "19.09.3",
    hl: "en",
    userAgent: "com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)",
  },
  { clientName: "WEB", clientVersion: "2.20240401.00.00", hl: "en", userAgent: UA },
  {
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    hl: "en",
    clientScreen: "EMBED",
    userAgent: UA,
  },
];

async function tracksFromInnertube(videoId: string): Promise<CaptionTrack[]> {
  for (const { userAgent, ...client } of INNERTUBE_CLIENTS) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": userAgent },
        body: JSON.stringify({
          context: { client, thirdParty: { embedUrl: "https://www.youtube.com" } },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
      };
      const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) return tracks;
    } catch {
      // try next client
    }
  }
  return [];
}

async function getCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  const fromPage = await tracksFromWatchPage(videoId);
  if (fromPage.length) return fromPage;
  return tracksFromInnertube(videoId);
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  return (
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode?.startsWith("en")) ??
    tracks[0]
  );
}


/** Fallback: the transcript panel API used by youtube.com itself. */
async function transcriptFromPanel(videoId: string): Promise<TranscriptLine[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
  });
  const html = await res.text();
  const params = /"getTranscriptEndpoint":\{"params":"([^"]+)"/.exec(html)?.[1];
  const visitorData = /"visitorData":"([^"]+)"/.exec(html)?.[1];
  const clientVersion = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1] ?? "2.20240401.00.00";
  if (!params) return [];

  const api = await fetch("https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": UA,
      origin: "https://www.youtube.com",
      referer: `https://www.youtube.com/watch?v=${videoId}`,
      ...(visitorData ? { "x-goog-visitor-id": visitorData } : {}),
    },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion, hl: "en", gl: "US", visitorData } },
      params,
    }),
  });
  if (!api.ok) return [];
  const text = await api.text();
  const lines: TranscriptLine[] = [];
  const re =
    /"transcriptSegmentRenderer":\{"startMs":"(\d+)","endMs":"\d+","snippet":\{("runs":\[[\s\S]*?\]|"simpleText":"[\s\S]*?")\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const chunk = m[2] ?? "";
    const parts = [...chunk.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1] ?? "");
    const simple = /"simpleText":"((?:[^"\\]|\\.)*)"/.exec(chunk)?.[1];
    let raw = parts.length ? parts.join("") : (simple ?? "");
    try {
      raw = JSON.parse(`"${raw}"`) as string;
    } catch {
      /* keep raw */
    }
    const clean = decodeEntities(raw);
    if (clean) lines.push({ start: Math.round(Number(m[1]) / 1000), text: clean });
  }
  return lines;
}

export async function fetchTranscript(videoId: string): Promise<TranscriptLine[]> {
  const lines: TranscriptLine[] = [];
  const tracks = await getCaptionTracks(videoId);
  const track = pickTrack(tracks);

  if (track?.baseUrl) {
    const base = track.baseUrl.replace(/&fmt=\w+/, "");
    for (const suffix of ["&fmt=json3", "&fmt=srv1", ""]) {
      let body = "";
      try {
        const res = await fetch(base + suffix, {
          headers: { "user-agent": UA, referer: "https://www.youtube.com/" },
        });
        if (!res.ok) continue;
        body = await res.text();
      } catch {
        continue;
      }
      if (!body.trim()) continue;

      try {
        const json = JSON.parse(body) as {
          events?: { tStartMs?: number; segs?: { utf8?: string }[] }[];
        };
        for (const ev of json.events ?? []) {
          const text = decodeEntities((ev.segs ?? []).map((s) => s.utf8 ?? "").join(""));
          if (!text) continue;
          lines.push({ start: Math.round((ev.tStartMs ?? 0) / 1000), text });
        }
      } catch {
        const re = /<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(body))) {
          const text = decodeEntities((m[2] ?? "").replace(/<[^>]+>/g, ""));
          if (text) lines.push({ start: Math.round(parseFloat(m[1] ?? "0")), text });
        }
      }
      if (lines.length > 0) break;
    }
  }

  if (lines.length === 0) {
    try {
      lines.push(...(await transcriptFromPanel(videoId)));
    } catch {
      /* fall through to error below */
    }
  }

  if (lines.length === 0) {
    throw new ClipScoutError(
      "no_transcript",
      "We couldn't get a transcript for this video. It may not have captions, or YouTube is blocking caption downloads for it right now — try another episode that has captions turned on.",
    );
  }
  return lines;
}


export function formatTranscript(lines: TranscriptLine[]): string {
  // Merge into ~10 second chunks to keep the prompt compact.
  const chunks: TranscriptLine[] = [];
  for (const line of lines) {
    const last = chunks[chunks.length - 1];
    if (last && line.start - last.start < 10) {
      last.text += " " + line.text;
    } else {
      chunks.push({ ...line });
    }
  }
  return chunks.map((c) => `[${c.start}s] ${c.text}`).join("\n");
}

export type Clip = {
  start_time_seconds: number;
  end_time_seconds: number;
  title: string;
  reason: string;
};

export async function analyzeTranscript(
  transcript: string,
  meta: VideoMeta,
  apiKey: string,
): Promise<Clip[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are a viral short-form content strategist for a resilience/reinvention/founder-story interview podcast. You find the moments in long interviews that perform best as Reels, TikToks and Shorts: strong hooks, emotional peaks, surprising or vulnerable admissions, quotable lines, humor, and concrete actionable insight. You only use timestamps that exist in the supplied transcript.",
        },
        {
          role: "user",
          content: `Video title: ${meta.title}\nChannel: ${meta.channel ?? "unknown"}\n\nTimestamped transcript:\n${transcript.slice(0, 120000)}\n\nPick the 5 best clip-worthy segments. Each clip must be between 15 and 60 seconds long and start on a natural hook. Return them ranked best-first.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_clips",
            description: "Return the 5 best short-form clip suggestions.",
            parameters: {
              type: "object",
              properties: {
                clips: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      start_time_seconds: { type: "number" },
                      end_time_seconds: { type: "number" },
                      title: { type: "string", description: "Hook title, under 10 words" },
                      reason: { type: "string", description: "One sentence on why it performs" },
                    },
                    required: ["start_time_seconds", "end_time_seconds", "title", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["clips"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_clips" } },
    }),
  });

  if (res.status === 429) {
    throw new ClipScoutError("rate_limit", "The AI is busy right now — please try again in a moment.");
  }
  if (res.status === 402) {
    throw new ClipScoutError("credits", "AI credits are exhausted. Add credits in your workspace to keep analyzing.");
  }
  if (!res.ok) {
    throw new ClipScoutError("ai_error", "The AI analysis failed. Please try again.");
  }

  const data = (await res.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) {
    throw new ClipScoutError("ai_error", "The AI didn't return any clip suggestions. Please try again.");
  }
  let parsed: { clips?: Clip[] };
  try {
    parsed = JSON.parse(args) as { clips?: Clip[] };
  } catch {
    throw new ClipScoutError("ai_error", "The AI response couldn't be read. Please try again.");
  }
  const clips = (parsed.clips ?? []).slice(0, 5).map((c) => {
    const start = Math.max(0, Math.round(c.start_time_seconds));
    let end = Math.round(c.end_time_seconds);
    if (!(end > start)) end = start + 30;
    if (end - start > 60) end = start + 60;
    if (end - start < 15) end = start + 15;
    return { start_time_seconds: start, end_time_seconds: end, title: c.title, reason: c.reason };
  });
  if (clips.length === 0) {
    throw new ClipScoutError("ai_error", "The AI didn't find any clip-worthy moments. Please try again.");
  }
  return clips;
}
