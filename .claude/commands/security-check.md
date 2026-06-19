---
description: Run the OctoTusk mobile data-leak checklist over the current diff.
argument-hint: [base ref, default HEAD]
allowed-tools: Bash(git diff:*)
---
Mobile-relevant changes:
!`git diff --name-only | grep -E 'app/m/|lib/mobile/|app/api/holdings|app/api/snapshot|public/sw.js|next.config.js' || echo "(none)"`

Run the 10-point leak checklist (see the `security-reviewer` agent definition) over those files, then dispatch the `security-reviewer` agent for judgement on anything grep cannot decide. Finally hand off to the built-in `/security-review` skill for the broad branch-level pass. Emit PASS / FAIL with file:line citations; treat any fail as blocking.
