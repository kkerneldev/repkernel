# repkernel
an altstore repository en/ru


The app page supports English and Russian and shares the language preference with the home page.
App subtitles and descriptions can provide translations via localizedSubtitles and localizedDescriptions.

Validate source data locally (Python 3.12+, no dependencies):

```sh
python scripts/validate_source.py
```

Checks include required app/version fields, duplicate app identifiers and version/build pairs,
download URLs, dates, sizes, SHA-256 format, and featured app references.
GitHub Actions runs this check for source changes and before committing release sync results.


Offline browsing uses a Service Worker on HTTPS (or localhost). After the
"Pages and catalogue are available offline" message appears, the homepage and
app pages work without a connection, including app pages not previously opened.
Catalogue requests prefer the network and fall back to the last valid saved
response after 4.5 seconds. Reconnecting refreshes the catalogue automatically.
The status strip shows when the saved data was fetched, not the app release date.

Images are saved as they are viewed (up to 60 images); unseen screenshots may
not be available offline. IPA files, release APIs and installer links are never
cached. Offline browsing does not download or install apps.
A first-ever visit without a connection cannot load the site.
Bump VERSION in sw.js when changing the offline shell; an updated worker takes
over after existing site tabs close. Browsers may evict cached data under storage
pressure.
