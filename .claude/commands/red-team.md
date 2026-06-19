---
description: Adversarial review of the current plan or working-tree diff.
argument-hint: [what to scrutinize]
allowed-tools: Bash(git diff:*), Bash(git status:*)
---
Current diff:
!`git diff --stat`

Working tree:
!`git status --porcelain`

Dispatch the `red-teamer` agent to adversarially review the above (focus: $ARGUMENTS). It must verify claims against source and return a ranked risk list plus any blocking issue that must change the plan.
