# Playwright MCP QA pass

Tool: [Playwright MCP](https://github.com/microsoft/playwright-mcp), added to Claude Code with
`claude mcp add playwright -- cmd /c npx -y "@playwright/mcp@latest"`.

| # | Finding (how Playwright found it) | Fix | Before → After |
|---|---|---|---|
| 1 | Console warning on every load: Cytoscape `label` is deprecated for `width` (console log) | Explicit width from label length | 2 warnings per load → 0 |
| 2 | Step buttons announced as glyphs `button "⏮"`, `"◀"` (accessibility snapshot) | `aria-label`s | `button "⏮"` → `button "First step"` |
| 3 | Tool tabs were plain buttons; "Minimize" tab and button had identical names (strict-mode locator error) | WAI-ARIA `tablist`/`tab`/`tabpanel` + arrow keys | no tab roles → `tab "Test" [selected]` |
| 4 | Input box named only by placeholder; diagram canvas had no accessible name | `aria-label`s; canvas is `role="img"` with a generated description | — → "NFA state diagram. States: q0 (start), …" |
| 5 | Phone (390×844): header 210px in 4 wrapped rows, toolbar wrapping over the diagram (`before-prod-390.png`) | Two-row header, single-line scrollable toolbar, taller canvas | header 210px → 91px, canvas 360px → 506px |
| 6 | Diagram clipped after the canvas resized (regression caught during fix 5) and never fitted in dev mode | `ResizeObserver` → `cy.resize()` + re-fit | right-edge clipping at 390/768/1366 and on rotation → none |

Screenshots: `before-*.png` (before fixes; `before-prod-*` are the production site), `after-*.png` (after fixes).
