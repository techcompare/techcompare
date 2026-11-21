
# Stuck On A Word

Stuck On A Word is a fast, browser-based word puzzle desk with three tools:

- **Word Finder** for patterns, included or excluded letters, position filters, and Scrabble racks.
- **Unscrambler** for full anagrams and shorter words that can be made from a set of tiles.
- **Wordle Helper** for green, yellow, and grey clues, including repeated-letter handling.

The site is a static HTML, CSS, and JavaScript project. The public-domain ENABLE word list is loaded in the browser, so searches stay on the user’s device and do not require an account or backend.

## Local preview

Serve the repository from a local web server so the dictionary can be fetched:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deployment

The project is configured for static hosting and includes a `netlify.toml` file. No build step or package installation is required.
