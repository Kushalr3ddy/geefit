#!/usr/bin/env python3
"""Refresh the self-hosted IBM Plex woff2 files in site/assets/fonts/.

Not part of serving the site — GitHub Pages ships the committed .woff2 files
as-is. Run this from the repo root only when a weight or subset needs to change,
then commit the result and update the @font-face block in site/assets/styles.css.
"""
import re, urllib.request, pathlib

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
OUT = pathlib.Path("site/assets/fonts")
WANT = {"latin", "latin-ext"}

JOBS = [("IBM Plex Sans", "ibm-plex-sans", [400, 500, 600, 700]),
        ("IBM Plex Serif", "ibm-plex-serif", [400, 600])]

def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=30).read()
    return data if binary else data.decode()

ranges = {}
for family, slug, weights in JOBS:
    for w in weights:
        css = get("https://fonts.googleapis.com/css2?family=%s:wght@%d&display=swap"
                  % (family.replace(" ", "+"), w))
        # split into "/* subset */ @font-face {...}" chunks
        for subset, block in re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S):
            if subset not in WANT:
                continue
            url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
            ur = re.search(r"unicode-range:\s*([^;]+);", block).group(1).strip()
            name = "%s-%d-%s.woff2" % (slug, w, subset)
            (OUT / name).write_bytes(get(url, binary=True))
            ranges[subset] = ur
            print("%-34s %6d bytes" % (name, (OUT / name).stat().st_size))

print()
for s, r in ranges.items():
    print("%s:\n  %s\n" % (s, r))
