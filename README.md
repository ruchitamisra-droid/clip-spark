# Clip Spark

Build a web app called "ClipScout" for a podcast host who runs "No Ordinary Life" (a resilience/reinvention interview podcast on YouTube). The tool takes a YouTube video URL and surfaces the 5 moments most likely to work well as short-form viral clips (like Reels/TikTok/Shorts), using AI analysis of the video's transcript - NOT actual video downloading or cutting (no video files are produced, just timestamp recommendations with links back to YouTube).



Core flow:



1. Landing page: a text input for a YouTube video URL, and a "Find viral clips" button. Clean, warm, modern dark UI fitting a podcast/content-creator tool (not corporate SaaS) - app name "ClipScout" with tagline "Find your podcast's most shareable moments."



2. When submitted, a backend function should:

   a. Parse the YouTube video ID from the URL (support youtube.com/watch?v=, youtu.be/, and URLs with extra query params).

   b. Fetch video metadata (title, channel name, thumbnail) using YouTube's public oEmbed endpoint: https://www.youtube.com/oembed?url=<video_url>&format=json (no API key needed).

   c. Fetch the video's caption/transcript track (attempt to retrieve the timed text transcript that YouTube auto-generates for most videos). If no captions/transcript are available for the video, return a clear friendly error explaining that this video has no captions to analyze - don't crash.

   d. Send the transcript (with timestamps) to an AI model via the built-in Lovable AI integration, with a prompt instructing it to act as a viral short-form content strategist and identify the 5 best clip-worthy segments (each 15-60 seconds long) based on: strong hooks, emotional peaks, surprising or vulnerable admissions, quotable lines, humor, or concrete actionable insight - especially fitting for a resilience/reinvention/founder-story podcast. For each of the 5, the AI should return: start_time_seconds, end_time_seconds, a suggested short-form title/hook (under 10 words), and a one-sentence reason it could perform well.

   e. Save the analysis (video URL, title, thumbnail, channel, and the 5 clip suggestions) into a Supabase table so it's kept in a history.



3. Results view: show the video thumbnail and title at the top. Below, 5 ranked clip cards (#1-#5), each showing: the time range (mm:ss-mm:ss) and duration, the suggested title/hook, the one-sentence reasoning, a "Watch this moment" button that opens https://www.youtube.com/watch?v=<id>&t=<start_time_seconds>s in a new tab, and a small "copy timestamp link" icon button.



4. Below the results, a "Past analyses" history section listing previously analyzed videos (thumbnail + title + date) - clicking one reloads its saved 5 clips instantly without re-running the analysis.



5. Handle error states gracefully and visibly: invalid/unrecognized URL, video not found or private, no transcript available - each with a clear friendly message, never a blank screen or raw error.



6. No login/auth needed - single shared workspace is fine.



Use React + Tailwind for the frontend, Supabase for storage, and the Lovable AI integration for the transcript analysis step (do not ask the user for an external API key for the AI part). Prioritize the core flow (URL in -> 5 clip suggestions out) working reliably over extra polish.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cd1f3615-b261-47bf-ac4e-0cb05bfb0059).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
