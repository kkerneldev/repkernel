#!/usr/bin/env python3
"""Syncs source.json with the IPA files attached to GitHub releases and writes a news card per new version.

For every app in source.json the script:
  1. finds the release asset whose file name matches the app's downloadURL,
  2. downloads the IPA and reads version / minimum iOS from its Info.plist,
  3. updates version, date, size, sha256 (+ release notes) in source.json,
  4. if the version changed: adds an entry to news.json and to source.json["news"] (AltStore's News tab)
     and draws assets/news/<bundle>-<version>.png.

Re-running with nothing new changes nothing. Environment:
  GITHUB_REPOSITORY  owner/name (set by GitHub Actions)     GITHUB_TOKEN  optional, raises API limits
  NEWS_LANG          language of the card label and news titles: ru (default) or en
  SITE_URL           where the site is hosted (default https://rep.kerneldev.qzz.io), used for news image links
  NEWS_NOTIFY        "true" makes AltStore show a notification for each news item (default false)
Notes for the news: text of the release that holds the IPA, or notes/<bundleId>.txt if that file exists.
Usage:  python3 scripts/sync_release.py [--source source.json] [--dry-run]
"""
import hashlib, io, json, os, plistlib, re, sys, tempfile, urllib.parse, urllib.request, zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import news_card

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS_LIMIT = 30
MONTHS_RU = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def http(url, token=None, accept=None):
    headers = {"User-Agent": "kernels-source-sync"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if accept:
        headers["Accept"] = accept
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=180)


def fetch_releases(repo, token):
    with http(f"https://api.github.com/repos/{repo}/releases?per_page=50", token, "application/vnd.github+json") as r:
        return json.load(r)


def download(url, token=None):
    h, buf = hashlib.sha256(), io.BytesIO()
    with http(url, token) as r:
        for chunk in iter(lambda: r.read(1 << 20), b""):
            h.update(chunk)
            buf.write(chunk)
    return buf.getvalue(), h.hexdigest()


def read_plist(ipa_bytes):
    with zipfile.ZipFile(io.BytesIO(ipa_bytes)) as z:
        names = [n for n in z.namelist() if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", n)]
        if not names:
            raise ValueError("Info.plist not found in IPA")
        return plistlib.loads(z.read(names[0]))


def clean_notes(text):
    """Release body (markdown) -> short plain text, one change per line."""
    out = []
    for line in (text or "").replace("\r", "").splitlines():
        if re.match(r"^\s{0,3}#{1,6}\s", line):                  # headings are dropped
            continue
        line = re.sub(r"^\s*(?:[-*+•]|\d+[.)])\s+", "", line)    # bullets
        line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)     # links
        line = re.sub(r"[*_`~]{1,3}", "", line).strip()
        if line and not re.fullmatch(r"[-=_\s]+", line):
            out.append(line)
    return "\n".join(out)


def read_notes(bundle_id, release):
    """notes/<bundleId>.txt wins. The release text is used only when the release holds a single IPA,
    otherwise we can't tell which app it describes."""
    p = os.path.join(ROOT, "notes", bundle_id + ".txt")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return clean_notes(f.read())
    ipas = [a for a in release.get("assets", []) if a["name"].lower().endswith(".ipa")]
    return clean_notes(release.get("body") or "") if len(ipas) <= 1 else ""


def date_text(iso, lang):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return f"{d.day} {MONTHS_RU[d.month - 1]} {d.year}" if lang == "ru" else f"{MONTHS_EN[d.month - 1]} {d.day}, {d.year}"


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def find_asset(releases, filename):
    """Newest release asset with this file name -> (asset, release)."""
    best = None
    for rel in releases:
        if rel.get("draft"):
            continue
        for a in rel.get("assets", []):
            if a["name"] == filename and (best is None or a["updated_at"] > best[0]["updated_at"]):
                best = (a, rel)
    return best


def add_source_news(source, app, entry, lang):
    """AltStore's own News tab: adds an item to source.json["news"] (same card as image)."""
    site = os.environ.get("SITE_URL", "https://rep.kerneldev.qzz.io").rstrip("/")
    caption = "; ".join(entry["notes"].splitlines()) if entry["notes"] else (
        "Доступна новая версия приложения" if lang == "ru" else "A new version is available")
    if len(caption) > 240:
        caption = caption[:237].rstrip() + "…"
    title = f"{entry['app']} {entry['version']} " + ("— новая версия" if lang == "ru" else "is out")
    item = {
        "title": title,
        "identifier": f"{entry['id']}-{entry['version']}",
        "caption": caption,
        "date": entry["date"][:10],
        "tintColor": "E11D2E",
        "imageURL": f"{site}/{entry['image']}",
        "notify": os.environ.get("NEWS_NOTIFY", "false").lower() == "true",
        "url": f"{site}/#app={urllib.parse.quote(entry['id'])}",
        "appID": entry["id"],
    }
    items = [n for n in source.get("news", []) if n.get("identifier") != item["identifier"]]
    items.insert(0, item)
    source["news"] = items[:NEWS_LIMIT]


def process_app(source, app, asset, release, ipa, sha, lang, news, now_iso, dry):
    """Update one app in place. Returns a short status string."""
    info = read_plist(ipa)
    version = str(info.get("CFBundleShortVersionString") or info.get("CFBundleVersion") or "").strip()
    if not version:
        raise ValueError("no version in Info.plist")
    min_os = str(info.get("MinimumOSVersion") or "")
    date = asset["updated_at"]
    bundle = app.get("bundleIdentifier") or app.get("name")

    modern = bool(app.get("versions"))
    v = app["versions"][0] if modern else app   # else: legacy flat format
    prev_version, prev_sha = v.get("version"), v.get("sha256")
    if prev_version == version and prev_sha == sha:
        return "up to date"

    notes = read_notes(bundle, release)
    v.update({"version": version, "size": len(ipa), "sha256": sha, "downloadURL": v.get("downloadURL") or asset["browser_download_url"]})
    v["date" if modern else "versionDate"] = date
    if min_os:
        v["minOSVersion"] = min_os
    if notes:
        v["localizedDescription" if modern else "versionDescription"] = notes
    if modern and "version" in app:  # some sources mirror the latest at top level
        app["version"] = version

    changed_version = prev_version is not None and prev_version != version
    if not changed_version:
        return f"refreshed {version} (hash/size only)"

    image_rel = f"assets/news/{re.sub(r'[^A-Za-z0-9._-]', '_', bundle)}-{version}.png"
    entry = {"id": bundle, "app": app.get("name"), "version": version, "date": date, "notes": notes, "image": image_rel}
    news["items"] = [e for e in news.get("items", []) if not (e["id"] == bundle and e["version"] == version)]
    news["items"].insert(0, entry)
    news["items"].sort(key=lambda e: e["date"], reverse=True)
    del news["items"][NEWS_LIMIT:]
    news["updated"] = now_iso
    add_source_news(source, app, entry, lang)
    if not dry:
        icon = None
        if app.get("iconURL"):
            try:
                icon = http(app["iconURL"]).read()
            except Exception as e:  # the card falls back to a letter icon
                print("  icon not loaded:", e)
        news_card.make_card(os.path.join(ROOT, image_rel), app.get("name") or "App", version, notes, icon, lang, date_text(date, lang))
    return f"NEW {prev_version} -> {version}, card {image_rel}"


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    source_path = os.path.join(ROOT, args[args.index("--source") + 1] if "--source" in args else "source.json")
    repo = os.environ.get("GITHUB_REPOSITORY") or "kkerneldev/repkernel"
    token = os.environ.get("GITHUB_TOKEN")
    lang = os.environ.get("NEWS_LANG", "ru")
    source = load_json(source_path, None)
    if not source:
        sys.exit(f"cannot read {source_path}")
    news_path = os.path.join(ROOT, "news.json")
    news = load_json(news_path, {"updated": "", "items": []})
    releases = fetch_releases(repo, token)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed = False

    for app in source.get("apps", []):
        v = (app.get("versions") or [app])[0]
        url = v.get("downloadURL")
        if not url:
            continue
        filename = urllib.parse.unquote(urllib.parse.urlparse(url).path.rsplit("/", 1)[-1])
        found = find_asset(releases, filename)
        if not found:
            print(f"{app.get('name')}: asset {filename} not found in releases, skipped")
            continue
        asset, release = found
        try:
            ipa, sha = download(asset["browser_download_url"], token)
            status = process_app(source, app, asset, release, ipa, sha, lang, news, now_iso, dry)
        except Exception as e:
            print(f"{app.get('name')}: ERROR {e}")
            continue
        print(f"{app.get('name')}: {status}")
        changed = changed or status != "up to date"

    if changed and not dry:
        save_json(source_path, source)
        save_json(news_path, news)
        print("saved source.json and news.json")
    elif dry:
        print("dry run, nothing written")


if __name__ == "__main__":
    main()
