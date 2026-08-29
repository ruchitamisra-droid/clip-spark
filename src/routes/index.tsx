import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Clapperboard, Copy, Check, ExternalLink, Loader2, Search, AlertTriangle } from "lucide-react";

import { analyzeVideo, listAnalyses, type Analysis } from "@/lib/clips.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ClipScout — Find your podcast's most shareable moments" },
      {
        name: "description",
        content:
          "Paste a YouTube episode link and ClipScout surfaces the 5 moments most likely to work as Reels, TikToks and Shorts.",
      },
      { property: "og:title", content: "ClipScout — Find your podcast's most shareable moments" },
      {
        property: "og:description",
        content:
          "AI transcript analysis that ranks the 5 most clip-worthy moments in any YouTube podcast episode.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function ClipCard({ clip, rank, videoId }: { clip: Analysis["clips"][number]; rank: number; videoId: string }) {
  const [copied, setCopied] = useState(false);
  const link = `https://www.youtube.com/watch?v=${videoId}&t=${clip.start_time_seconds}s`;
  const duration = clip.end_time_seconds - clip.start_time_seconds;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition-colors hover:border-primary/50">
      <div className="flex items-start gap-4">
        <div className="bg-gradient-warm flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-primary-foreground">
          #{rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-secondary-foreground">
              {fmt(clip.start_time_seconds)}–{fmt(clip.end_time_seconds)}
            </span>
            <span>{duration}s</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-snug text-foreground">{clip.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{clip.reason}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button asChild size="sm">
              <a href={link} target="_blank" rel="noreferrer">
                <ExternalLink /> Watch this moment
              </a>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Copy timestamp link"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Index() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const queryClient = useQueryClient();

  const runAnalyze = useServerFn(analyzeVideo);
  const fetchHistory = useServerFn(listAnalyses);

  const history = useQuery({ queryKey: ["analyses"], queryFn: () => fetchHistory({}) });

  const mutation = useMutation({
    mutationFn: (value: string) => runAnalyze({ data: { url: value } }),
    onSuccess: (result) => {
      if (result.ok) {
        setError(null);
        setAnalysis(result.analysis);
        void queryClient.invalidateQueries({ queryKey: ["analyses"] });
      } else {
        setAnalysis(null);
        setError(result.error);
      }
    },
    onError: () => {
      setAnalysis(null);
      setError("We couldn't reach the analyzer. Please check your connection and try again.");
    },
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-5 py-14">
        <header className="text-center">
          <div className="glow-warm bg-gradient-warm mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
            <Clapperboard className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            Clip<span className="text-gradient-warm">Scout</span>
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Find your podcast&apos;s most shareable moments.
          </p>
        </header>

        <form
          className="mt-10 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) {
              setError("Paste a YouTube video link first.");
              return;
            }
            setError(null);
            mutation.mutate(url);
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="h-12 flex-1 rounded-xl bg-card text-base"
            aria-label="YouTube video URL"
          />
          <Button type="submit" size="lg" className="h-12 rounded-xl" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Search />}
            {mutation.isPending ? "Scouting…" : "Find viral clips"}
          </Button>
        </form>

        {mutation.isPending && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Pulling the transcript and reading the episode — this usually takes 20–40 seconds.
          </p>
        )}

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p>{error}</p>
          </div>
        )}

        {analysis && (
          <section className="mt-12">
            <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
              {analysis.thumbnail && (
                <img
                  src={analysis.thumbnail}
                  alt={`Thumbnail for ${analysis.title}`}
                  className="h-20 w-32 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{analysis.title}</h2>
                <p className="text-sm text-muted-foreground">{analysis.channel ?? "Unknown channel"}</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {analysis.clips.map((clip, i) => (
                <ClipCard key={i} clip={clip} rank={i + 1} videoId={analysis.video_id} />
              ))}
            </div>
          </section>
        )}

        {(history.data?.length ?? 0) > 0 && (
          <section className="mt-16">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Past analyses
            </h2>
            <div className="mt-4 space-y-2">
              {history.data?.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setAnalysis(item);
                    setError(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50"
                >
                  {item.thumbnail && (
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="h-12 w-20 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
