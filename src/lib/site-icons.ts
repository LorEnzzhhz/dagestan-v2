/** Map a source URL to a recognizable site/app icon. Brand icons come from
 *  the simpleicons CDN; everything else falls back to Google's favicon service. */
const BRANDS: [suffix: string, slug: string][] = [
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["tiktok.com", "tiktok"],
  ["instagram.com", "instagram"],
  ["facebook.com", "facebook"],
  ["github.com", "github"],
  ["brave.com", "brave"],
  ["search.brave.com", "brave"],
  ["x.com", "x"],
  ["twitter.com", "x"],
  ["reddit.com", "reddit"],
  ["wikipedia.org", "wikipedia"],
  ["archive.org", "internetarchive"],
  ["stackoverflow.com", "stackoverflow"],
  ["npmjs.com", "npm"],
  ["pypi.org", "pypi"],
  ["netflix.com", "netflix"],
  ["crunchyroll.com", "crunchyroll"],
  ["tubitv.com", "tubi"],
];

export function siteIconUrl(url: string, size = 64): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
  for (const [suffix, slug] of BRANDS) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return `https://cdn.simpleicons.org/${slug}`;
    }
  }
  return `https://www.google.com/s2/favicons?domain=${host}&sz=${size}`;
}

export interface Source {
  title: string;
  url: string;
  snippet: string;
}
