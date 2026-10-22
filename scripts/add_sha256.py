#!/usr/bin/env python3
"""Adds a `sha256` field to the latest version of each app in source.json.

Usage:
    python3 scripts/add_sha256.py source.json            # downloads every latest IPA and hashes it
    python3 scripts/add_sha256.py source.json --dry-run  # only prints the hashes

Run it locally (or in a GitHub Action) after you publish new IPA files. The page shows the
hash in the app details; AltStore ignores unknown fields, so the source stays valid.
"""
import hashlib, json, sys, urllib.request

def sha256_of(url):
    h = hashlib.sha256()
    req = urllib.request.Request(url, headers={"User-Agent": "kernels-source-sha256"})
    with urllib.request.urlopen(req, timeout=120) as r:
        for chunk in iter(lambda: r.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    path, dry = args[0], "--dry-run" in sys.argv
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    for app in data.get("apps", []):
        versions = app.get("versions") or []
        if not versions:
            continue
        v = versions[0]
        url = v.get("downloadURL")
        if not url:
            continue
        digest = sha256_of(url)
        print(f"{app.get('name')} {v.get('version')}: {digest}")
        v["sha256"] = digest
    if not dry:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("saved", path)

if __name__ == "__main__":
    main()
