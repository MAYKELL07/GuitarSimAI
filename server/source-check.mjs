import dns from "node:dns/promises";
import { isIP } from "node:net";
const normalize = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const blockedIP = (ip) => {
  if (ip.includes(":")) return true; // Conservative: public source checks use IPv4 only.
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
};
export async function safeSourceURL(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    (u.port && u.port !== "443") ||
    u.username ||
    u.password ||
    u.hostname === "localhost" ||
    isIP(u.hostname.replace(/[\[\]]/g, ""))
  )
    throw new Error("Only public HTTPS source pages are supported.");
  const addresses = await dns.lookup(u.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((a) => blockedIP(a.address)))
    throw new Error("Source resolved to a restricted network.");
  return u;
}
function textFromHTML(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}
export function compareSource(html, song, artist, version = "") {
  const text = textFromHTML(html),
    norm = normalize(text);
  const headings = [
    ...html.matchAll(/<(?:title|h1)\b[^>]*>([\s\S]*?)<\/(?:title|h1)>/gi),
  ]
    .map((m) => textFromHTML(m[1]))
    .join(" ");
  const titleMatch =
    normalize(song).length >= 3 &&
    normalize(headings).includes(normalize(song));
  const artistMatch =
    normalize(artist).length >= 2 && norm.includes(normalize(artist));
  const versionMatch = version.trim()
    ? norm.includes(normalize(version))
    : null;
  const paywall =
    /subscribe to (?:view|access|unlock)|purchase (?:this|the) (?:chart|score)|unlock (?:this|the) (?:tab|chart)|sign in to (?:view|access)/i.test(
      text,
    );
  const freeClaim =
    /free (?:guitar )?(?:tabs?|chords?|sheet music)|(?:tabs?|chords?) (?:are|for) free|download (?:for )?free/i.test(
      text,
    );
  return {
    titleMatch,
    artistMatch,
    versionMatch,
    access: paywall
      ? "restricted"
      : freeClaim
        ? "free stated on page"
        : "not independently confirmed",
    excerpt: text.slice(0, 240),
    accuracy: "Not verified against the recording",
  };
}
export async function checkSource(candidate, song, artist, version) {
  const base = {
    title: String(candidate.title ?? "").slice(0, 200),
    url: String(candidate.url ?? ""),
    publisher: String(candidate.publisher ?? "").slice(0, 100),
    type: String(candidate.type ?? "Tab / chords").slice(0, 80),
    aiEvidence: String(candidate.evidence ?? "").slice(0, 500),
    aiAccess: String(candidate.access ?? "unknown").slice(0, 100),
  };
  try {
    let u = await safeSourceURL(base.url),
      response;
    for (let redirects = 0; redirects < 4; redirects++) {
      response = await fetch(u, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": "Selah-GuitarSim/1.0 (source identity verification)",
          Accept: "text/html",
        },
      });
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        u = await safeSourceURL(
          new URL(response.headers.get("location"), u).href,
        );
        continue;
      }
      break;
    }
    if (
      !response?.ok ||
      !/text\/html/i.test(response.headers.get("content-type") ?? "")
    )
      throw new Error(
        `Page unavailable for checking (${response?.status ?? "redirect limit"}).`,
      );
    const reader = response.body.getReader();
    let bytes = 0,
      chunks = [];
    try {
      while (bytes < 1_000_000) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    const html = Buffer.concat(chunks).toString("utf8"),
      checks = compareSource(html, song, artist, version);
    const challenged =
      /just a moment|verify you are human|access denied|captcha/i.test(
        textFromHTML(html).slice(0, 2500),
      );
    return {
      ...base,
      url: u.href,
      ...checks,
      checkedAt: new Date().toISOString(),
      status: challenged
        ? "Could not inspect page"
        : checks.titleMatch && checks.artistMatch
          ? "Song identity matched"
          : "Identity not confirmed",
    };
  } catch (e) {
    return {
      ...base,
      checkedAt: new Date().toISOString(),
      status: "Could not inspect page",
      error: e.message,
      titleMatch: false,
      artistMatch: false,
      versionMatch: null,
      access: "not independently confirmed",
      accuracy: "Not verified against the recording",
    };
  }
}
