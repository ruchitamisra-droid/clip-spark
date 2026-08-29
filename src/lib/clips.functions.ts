import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ClipSuggestion = {
  start_time_seconds: number;
  end_time_seconds: number;
  title: string;
  reason: string;
};

export type Analysis = {
  id: string;
  video_id: string;
  video_url: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  clips: ClipSuggestion[];
  created_at: string;
};

export const analyzeVideo = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string() }).parse(data))
  .handler(async ({ data }): Promise<{ ok: true; analysis: Analysis } | { ok: false; error: string }> => {
    const {
      ClipScoutError,
      parseVideoId,
      fetchMeta,
      fetchTranscript,
      formatTranscript,
      analyzeTranscript,
    } = await import("./youtube.server");
    const { getServerSupabase } = await import("./supabase-public.server");

    try {
      const videoId = parseVideoId(data.url);
      if (!videoId) {
        return {
          ok: false,
          error: "That doesn't look like a YouTube link. Paste a URL like https://www.youtube.com/watch?v=… or https://youtu.be/…",
        };
      }
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) return { ok: false, error: "AI is not configured for this project yet." };

      const meta = await fetchMeta(videoId);
      const lines = await fetchTranscript(videoId);
      const clips = await analyzeTranscript(formatTranscript(lines), meta, apiKey);

      const supabase = getServerSupabase();
      const { data: row, error } = await supabase
        .from("analyses")
        .insert({
          video_id: videoId,
          video_url: `https://www.youtube.com/watch?v=${videoId}`,
          title: meta.title,
          channel: meta.channel,
          thumbnail: meta.thumbnail,
          clips,
        })
        .select()
        .single();

      if (error || !row) {
        return {
          ok: true,
          analysis: {
            id: "unsaved",
            video_id: videoId,
            video_url: `https://www.youtube.com/watch?v=${videoId}`,
            title: meta.title,
            channel: meta.channel,
            thumbnail: meta.thumbnail,
            clips,
            created_at: new Date().toISOString(),
          },
        };
      }
      return { ok: true, analysis: row as unknown as Analysis };
    } catch (err) {
      if (err instanceof ClipScoutError) return { ok: false, error: err.message };
      console.error(err);
      return { ok: false, error: "Something went wrong while analyzing this video. Please try again." };
    }
  });

export const listAnalyses = createServerFn({ method: "GET" }).handler(async (): Promise<Analysis[]> => {
  const { getServerSupabase } = await import("./supabase-public.server");
  const { data, error } = await getServerSupabase()
    .from("analyses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) return [];
  return (data ?? []) as unknown as Analysis[];
});
