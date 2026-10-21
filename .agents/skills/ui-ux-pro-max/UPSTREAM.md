# Upstream

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
Revision observed at installation: 56ea9cf174ed86786187daa9de0e6247cb0747e4
Installed: 2026-10-21 with the Codex skill-installer helper.
Path in source: `.claude/skills/ui-ux-pro-max`.
License: MIT, preserved in `LICENSE`.

Project installation: `.agents/skills/ui-ux-pro-max`. Available to skill discovery on the next turn; the calendar implementation read and used the installed guidance immediately.

Search scripts use Python 3 without additional packages. Example from the repository root:

```sh
python3 .agents/skills/ui-ux-pro-max/scripts/search.py 'keyboard focus modal' --domain ux
```

Do not replace the existing team's brand tokens with generated palettes. Calendar searches supported flat surfaces, readable typography, keyboard focus, semantic status labels and derived React state. The generated marketing-page composition did not match this application screen and was not persisted or applied. The calendar uses the team's existing theme and the user's Google Calendar interaction reference.

Local packaging adjustment: trailing whitespace in `scripts/design_system.py` removed; no behavioral changes.
