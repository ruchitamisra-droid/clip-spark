CREATE TABLE public.analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  title TEXT NOT NULL,
  channel TEXT,
  thumbnail TEXT,
  clips JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyses TO anon, authenticated;
GRANT ALL ON public.analyses TO service_role;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read analyses" ON public.analyses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert analyses" ON public.analyses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE INDEX analyses_created_at_idx ON public.analyses (created_at DESC);