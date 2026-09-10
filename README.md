# SKWTR IDE
[![SKWTR IDE Screenshot](./.github/screenshot.png)](https://github.com/glenngenre/ide)

[![License](https://img.shields.io/github/license/glenngenre/ide?color=2185d0&style=flat-square)](https://github.com/glenngenre/ide/blob/master/LICENSE)

## About
**SKWTR IDE** is a browser-based code editor for writing and running code in a wide range of languages, with an AI assistant built in. It started as a fork of [Judge0 IDE](https://github.com/judge0/ide) and has since been substantially rewritten: the front end is reorganized into ES modules, code execution and AI features go through a dedicated authenticated backend, and the editor keeps your work safe with local draft autosave.

Code execution is still powered by [Judge0](https://judge0.com) under the hood, via the SKWTR API.

## Features
- **Run code in many languages** – the language list is loaded from the backend at startup; the Monaco editor switches syntax mode automatically. Supports stdin, compiler options, and command-line arguments.
- **AI assistant** – a chat panel that sees your current source code, plus optional inline (ghost-text) completions in the editor. Toggle inline suggestions and choose a model from the assistant panel.
- **Draft autosave** – your source, stdin, language, options, and file name are saved to `localStorage` (debounced, plus a periodic safety save). A status indicator shows *unsaved / saving / saved*, and you can **Restore Draft** or **Clear Draft** from the File menu.
- **Open / Save / Save As** – open local files (language is inferred from the extension) and download your source back to disk.
- **Authentication** – a login modal gates the IDE; the JWT is stored locally and sent with every API request.
- **Configurable layout and styles** – `default`, `minimal`, and `standalone` styles, light/dark/system theme, and fine-grained UI toggles via query parameters (e.g. `?judge0.style=minimal&judge0.theme=dark&judge0.styleOptions.showNavigation=false`).
- **Embeddable** – control the IDE from a parent page through `postMessage` (`get`, `set`, `run`). See [`embed/`](./embed/README.md).
- **PWA / offline shell** – includes a `manifest.json` and service worker.

### Keyboard shortcuts
| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘ + Enter` | Run |
| `Ctrl/⌘ + S` | Save |
| `Ctrl/⌘ + Shift + S` | Save As |
| `Ctrl/⌘ + O` | Open file |
| `Ctrl/⌘ + +` / `-` / `0` | Increase / decrease / reset font size |
| `` Ctrl/⌘ + ` `` | Focus source editor |


## Development
Requires Node.js 20+.

```sh
npm install
npm run dev       # dev server with HMR at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the production build locally
```

Monaco is bundled from npm via Vite. [`js/editor/monaco.js`](./js/editor/monaco.js) loads the core editor, all editor features, and only the syntax definitions the IDE maps languages to, so the CSS/HTML/JSON/TypeScript language services (and their workers) stay out of the bundle. Static files in `public/` (favicons, images, manifest, service worker, SQLite sample data) are served as-is from the site root. jQuery, Semantic UI, GoldenLayout, and KaTeX are still loaded from a CDN in `index.html`.

### Docker
The `DockerFile` is a multi-stage build: Node builds `dist/`, nginx serves it.

```sh
docker build -f DockerFile -t skwtr-ide .
docker run -p 8080:80 skwtr-ide
```

### Backend
The IDE expects an API at `https://api.apps.skwtr.com/ide/v1` providing:

- `POST /auth/login` – returns `{ token, role, username }`
- `GET  /code/languages`, `POST /code/run`, `GET /code/status/:token` – Judge0-compatible execution
- `POST /ai/chat`, `POST /ai/complete` – AI chat and inline completions

To point the front end at a different backend, update the base URL in [`js/constants.js`](./js/constants.js), [`js/auth.js`](./js/auth.js), and [`js/integrations/ai.js`](./js/integrations/ai.js).

## Credits
SKWTR IDE is a heavily modified fork of [**Judge0 IDE**](https://github.com/judge0/ide), created by [Herman Zvonimir Došilović](https://github.com/hermanzdosilovic) and the [Judge0 contributors](https://github.com/judge0/ide/graphs/contributors). Code execution is provided by [Judge0](https://judge0.com). Thank you for building and open-sourcing the foundation this project stands on.

Rewrite and ongoing development by [Glenn Genre](https://github.com/glenngenre).

## License
SKWTR IDE is licensed under the [MIT License](./LICENSE), the same license as the original Judge0 IDE.
