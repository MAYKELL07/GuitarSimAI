import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
// The bridge and source checker are dependency-free Node modules.
// @ts-expect-error JavaScript server module
import { compareSource, safeSourceURL } from "../server/source-check.mjs";
// @ts-expect-error JavaScript server module
import { startServer } from "../server/index.mjs";

test("source identity checks distinguish matching metadata, hidden scripts, access and version", () => {
  const match = compareSource(
    "<h1>Goodness of God — Bethel Music</h1><p>Free guitar chords. Live version.</p>",
    "Goodness of God",
    "Bethel Music",
    "live",
  );
  assert.equal(match.titleMatch, true);
  assert.equal(match.artistMatch, true);
  assert.equal(match.versionMatch, true);
  assert.equal(match.access, "free stated on page");
  assert.equal(match.accuracy, "Not verified against the recording");
  const wrong = compareSource(
    "<h1>Goodness of God</h1><script>Bethel Music</script><p>Subscribe to unlock charts</p>",
    "Goodness of God",
    "Bethel Music",
    "acoustic",
  );
  assert.equal(wrong.artistMatch, false);
  assert.equal(wrong.versionMatch, false);
  assert.equal(wrong.access, "restricted");
  assert.equal(
    compareSource("<h1>Unknown</h1>", "Unknown", "Artist").access,
    "not independently confirmed",
  );
  assert.equal(
    compareSource(
      "<h1>A different song</h1><nav>Goodness of God — Bethel Music</nav>",
      "Goodness of God",
      "Bethel Music",
    ).titleMatch,
    false,
    "a navigation link is not a song-title match",
  );
});
test("source fetcher refuses local network and non-HTTPS URLs", async () => {
  for (const url of [
    "http://example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "https://example.com:3000",
  ])
    await assert.rejects(safeSourceURL(url));
});
test("local assistant rejects cross-origin requests, bad payloads and unknown endpoints", async () => {
  const server = await startServer(5198);
  try {
    const cross = await fetch("http://127.0.0.1:5198/api/ask", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(cross.status, 403);
    const contentType = await fetch("http://127.0.0.1:5198/api/ask", {
      method: "POST",
      body: "{}",
    });
    assert.equal(contentType.status, 415);
    const unknown = await fetch("http://127.0.0.1:5198/api/not-a-route");
    assert.equal(unknown.status, 404);
    const nullPayload = await fetch("http://127.0.0.1:5198/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    assert.equal(nullPayload.status, 400);
    const hostStatus = await new Promise<number>((resolve) => {
      const req = http.get(
        "http://127.0.0.1:5198/api/status",
        { headers: { Host: "evil.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode!);
        },
      );
      req.on("error", () => resolve(0));
    });
    assert.equal(hostStatus, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
