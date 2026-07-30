# Agent instructions

<!-- santi020k-quality-policy:start -->
## ESLint and TypeScript quality policy

- Treat every ESLint warning and TypeScript diagnostic as work to resolve, not successful output.
- Run the repository's canonical lint and type-check commands before handoff. Use
  `--max-warnings=0` for every direct ESLint command, including workspace scripts and
  `lint-staged`; never use `--quiet` to hide warnings.
- Fix the underlying implementation. Do not lower rule severity, widen ignores, or add
  `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `any`, unsafe casts, or non-null assertions
  merely to make a check pass.
- A narrow suppression is acceptable only when the root cause cannot be fixed safely. Explain why,
  scope it to the smallest surface, and leave a tracking path.
- Fix all safe and feasible diagnostics you encounter, including pre-existing ones exposed by the
  work. Never finish while feasible warnings or type errors remain.
- If an external or unrelated blocker cannot be resolved safely, report the exact command, file,
  and diagnostic instead of hiding it.
- Do not add ESLint or TypeScript to a repository that does not use that toolchain solely for
  uniformity; apply this policy when that toolchain exists or is introduced for project reasons.
<!-- santi020k-quality-policy:end -->
