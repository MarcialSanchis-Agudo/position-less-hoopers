# Context-Reload Agent Instructions

You are running one condition in a matched PLH development experiment.

## Rules

1. Work only inside the provided workspace.
2. Read `TASK.md` and solve that task.
3. If `PLH_CONTEXT.md` exists, you may use it. Do not search outside the workspace for an equivalent file.
4. Do not modify tests.
5. Keep the public API unchanged unless TASK.md explicitly says otherwise.
6. Run `npm test` before finishing.
7. Stop after the task is solved; do not do unrelated refactors.

## Experimental integrity

Do not inspect:

- sibling warm/cold workspaces,
- the parent PLH repository,
- context packages outside this workspace,
- previous solutions to the same task.

The experiment measures the cost of reconstructing missing task context, so cross-condition leakage invalidates the pair.

