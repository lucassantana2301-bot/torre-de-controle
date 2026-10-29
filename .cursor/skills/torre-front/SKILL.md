---
name: torre-front
description: Applies the project's frontend skills (frontend-design, ui-ux-pro-max, shadcn patterns) to the Torre de Controle without changing stack. Use when designing, restyling, reviewing, or building UI, CSS, pages, KPIs, tables, modals, or the sidebar.
---

# Torre Front

Read these skills before changing UI:

1. [frontend-design](../frontend-design/SKILL.md) — visual direction, type, restraint ([Anthropic](https://github.com/anthropics/skills/tree/main/skills/frontend-design))
2. [ui-design](../ui-design/SKILL.md) — a11y, hierarchy, proximity ([PyModel](https://github.com/PyModel/react-frontend-skills/tree/main/skills/ui-design))
3. [web-design-guidelines](../web-design-guidelines/SKILL.md) — overflow, focus, copy ([Vercel via PyModel](https://github.com/PyModel/react-frontend-skills/tree/main/skills/web-design-guidelines))
4. [ui-ux-pro-max](../ui-ux-pro-max/SKILL.md) — search styles, UX, charts, React stack
5. [ui-styling](../ui-styling/SKILL.md) — shadcn composition and a11y as *patterns only*

Sources: [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design), [react-frontend-skills](https://github.com/PyModel/react-frontend-skills), [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).

## Stack (do not replace)

This app is Vite + React + TypeScript + CSS. Tokens live in `src/styles.css` (`:root`) and `src/ui/ui.css`. Font is Segoe UI. Theme is Arklok red `#da291c`.

Do **not** install or migrate to Next.js, Tailwind, shadcn CLI, Radix, or Lucide. Map shadcn ideas onto existing classes (`btn`, `home-card`, `status-badge`, `page-header`).

For ui-ux-pro-max searches use `--stack react`. On Windows run `python`, not `python3`.

## Product

Operational control tower for Arklok: Alloca07 × SPfly / Jamef / Certex. Audience is gestor + analista. First fold answers: how is the operation, what is off, where to act. Details stay below.

## When implementing

- Reuse tokens: `--arklok-red`, `--bg-card`, `--text-primary`, `--status-success|warning|danger|info`, `--space-*`, `--motion`
- Keep Portuguese, sentence case, verbs that name the action
- Visible focus, `prefers-reduced-motion`, light and dark
- Work lists: vertical scroll only (`overflow-y: auto`, `overflow-x: hidden`)
- Verify changed screens in the browser
