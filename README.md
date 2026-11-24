# flow-stepper

A [Claude Code](https://claude.com/claude-code) skill that turns a system architecture or business process into an interactive, step-by-step flow diagram page: one tab per data flow, click "next" to watch the data move node by node, with a source reference on every step and ⚠ marks on the parts that tend to break.

## Install

Copy this folder into your skills directory:

```
git clone https://github.com/daniel31515-rgb/flow-stepper ~/.claude/skills/flow-stepper
```

Then ask Claude for an architecture / data-flow diagram.

## Contents

- `SKILL.md` — instructions Claude follows (written in Traditional Chinese)
- `assets/template.html` — the page engine; Claude only fills in the `PAGE` / `FLOWS` data
- `scripts/check-flows.js` — layout checker (overlaps, edges crossing boxes, text too long): `node scripts/check-flows.js <page.html>`
