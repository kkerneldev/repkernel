#!/usr/bin/env python3
"""Validate the repository's source data without downloading release assets."""
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


def validate(source):
    errors = []

    def fail(path, message):
        errors.append(f"{path}: {message}")

    def text(obj, key, path):
        value = obj.get(key)
        if not isinstance(value, str) or not value.strip():
            fail(f"{path}.{key}", "expected a non-empty string")
        return value

    def url(obj, key, path):
        value = text(obj, key, path)
        if isinstance(value, str):
            try:
                parsed = urlparse(value)
                if parsed.scheme not in ("http", "https") or not parsed.hostname:
                    fail(f"{path}.{key}", "expected an absolute HTTP(S) URL")
            except ValueError:
                fail(f"{path}.{key}", "invalid URL")

    if not isinstance(source, dict):
        return ["source: expected an object"]
    text(source, "name", "source")
    apps = source.get("apps")
    if not isinstance(apps, list) or not apps:
        return errors + ["source.apps: expected a non-empty array"]
    bundles = set()
    for i, app in enumerate(apps):
        path = f"apps[{i}]"
        if not isinstance(app, dict):
            fail(path, "expected an object")
            continue
        for key in ("name", "developerName"):
            text(app, key, path)
        bundle = text(app, "bundleIdentifier", path)
        if isinstance(bundle, str):
            if bundle in bundles:
                fail(path + ".bundleIdentifier", "duplicate app identifier")
            bundles.add(bundle)
        url(app, "iconURL", path)
        versions = app.get("versions")
        if not isinstance(versions, list) or not versions:
            fail(path + ".versions", "expected a non-empty array")
            continue
        seen = set()
        for j, version in enumerate(versions):
            vp = f"{path}.versions[{j}]"
            if not isinstance(version, dict):
                fail(vp, "expected an object")
                continue
            number = text(version, "version", vp)
            build = version.get("buildVersion", "")
            if isinstance(number, str) and isinstance(build, str):
                identity = (number, build)
                if identity in seen:
                    fail(vp, "duplicate version and build")
                seen.add(identity)
            url(version, "downloadURL", vp)
            date = text(version, "date", vp)
            if isinstance(date, str):
                try:
                    datetime.fromisoformat(date.replace("Z", "+00:00"))
                except ValueError:
                    fail(vp + ".date", "expected an ISO date")
            size = version.get("size")
            if type(size) is not int or size <= 0:
                fail(vp + ".size", "expected a positive integer")
            sha = version.get("sha256")
            if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", sha):
                fail(vp + ".sha256", "expected 64 hexadecimal characters")
    featured = source.get("featuredApps", [])
    if not isinstance(featured, list):
        fail("featuredApps", "expected an array")
    else:
        for i, bundle in enumerate(featured):
            if not isinstance(bundle, str) or bundle not in bundles:
                fail(f"featuredApps[{i}]", "unknown app identifier")
    return errors


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "source.json"
    try:
        source = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"{path}: {exc}", file=sys.stderr)
        return 1
    errors = validate(source)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"{path.name}: OK ({len(source['apps'])} apps)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
