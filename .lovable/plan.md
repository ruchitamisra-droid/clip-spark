# Robust YouTube transcript fallback

## Goal
Make transcript retrieval more resilient while preserving the current no-transcript message when YouTube exposes no usable captions.

## Implementation
- Refactor the YouTube transcript helper into explicit, observable strategies: watch-page caption discovery, InnerTube player caption discovery, timed-text downloads, and the same InnerTube `get_transcript` flow used by YouTube’s transcript panel.
- Collect and prioritize every available caption track rather than trying only one: human English first, then English auto-generated, then other human tracks, then other auto-generated tracks.
- For each track, try JSON3, SRV1, SRV3, and default timed-text responses, with parsers for JSON events and XML `<text>` / `<p>` formats.
- Parse InnerTube transcript renderer payloads structurally, including nested `transcriptSegmentRenderer` entries and both `runs` and `simpleText` snippets.
- Add a shared two-attempt fetch helper with a short backoff for transient failures and rate limits, without making permanent failures excessively slow.
- Emit concise server-side diagnostics for each failed strategy, including method name, attempt, HTTP status when available, and empty/unparseable response outcomes. Do not expose internal diagnostics in the UI.
- Keep the existing friendly `no_transcript` error after all strategies and tracks are exhausted.

## Validation
- Add focused tests for JSON3, SRV1/SRV3 XML, transcript renderer parsing, track ordering, and retry behavior using mocked responses.
- Exercise the server function against a captioned public YouTube URL and confirm either a successful transcript or method/status diagnostics that identify the upstream block.
- Verify the existing user-facing error remains unchanged when all methods fail.

## Technical notes
- Keep all runtime helpers in `youtube.server.ts`; `clips.functions.ts` remains a thin `createServerFn` wrapper.
- Use only fetch/Web APIs compatible with the deployed server runtime.