# Wild — Backstage custom scaffolder action

A fresh Backstage app, created with `@backstage/create-app@latest`, with a
custom scaffolder action registered and wired into the example template.

## What was added on top of the default scaffold

- [`packages/backend/src/scaffolder/myCustomAction.ts`](packages/backend/src/scaffolder/myCustomAction.ts) —
  the action itself: id `my:custom:action`, creates a new file (default
  `my-custom-action.txt`, both the filename and content are overridable via
  input) in the template's temp workspace directory
  (`ctx.workspacePath`).
- [`packages/backend/src/scaffolder/module.ts`](packages/backend/src/scaffolder/module.ts) —
  a backend module that registers the action against
  `scaffolderActionsExtensionPoint`.
- [`packages/backend/src/index.ts`](packages/backend/src/index.ts) — one
  line added, `backend.add(scaffolderModuleCustomExtensions)`, alongside
  the other `scaffolder` plugin registrations.
- [`examples/template/template.yaml`](examples/template/template.yaml) —
  rewritten so `my:custom:action` is the **only** step (the default
  `fetch-base` / `publish` / `register` / `notify` steps were removed, per
  the case study brief).
- [`packages/backend/src/scaffolder/myCustomAction.test.ts`](packages/backend/src/scaffolder/myCustomAction.test.ts) —
  a unit test using Backstage's own `createMockActionContext` test helper.

## Verifying this

```bash
yarn install
yarn tsc              # full project type-check
yarn workspace backend test --testPathPatterns myCustomAction --watchAll=false
```

The type-check passes cleanly against the real installed
`@backstage/plugin-scaffolder-node` types — the schema/handler shapes in
`myCustomAction.ts` aren't guessed, they're what the installed package
actually requires.

The handler itself was also executed directly (compiled with plain `tsc`,
run with plain `node`, no Jest/SWC involved) against a real temporary
directory, confirming:
- `action.id === 'my:custom:action'`
- the file is actually created with the expected content
- `ctx.output('path', ...)` is called correctly

**Note on `yarn workspace backend test`:** running the Jest-based test
suite in *this* sandboxed build environment hit an unrelated environment
issue — `@swc/core`'s native binding refuses to load because of an
App-Container ACL already present on this sandbox's user profile
(`%LOCALAPPDATA%\swc`), which is a property of this particular sandboxed
session, not of the code. The direct `tsc` + `node` execution above is
unaffected by this (no SWC involved) and passed. Running
`yarn workspace backend test` in a normal, non-sandboxed terminal should
work as expected.

## Prerequisites installed to build this

This machine had neither Yarn nor a real Python interpreter available.
Yarn Classic was installed globally (`npm install -g yarn`) to satisfy
`create-app`'s prerequisite check — Python is only needed by `node-gyp` for
optional native dependencies and wasn't required for this task.

The scaffolded app's seeded `yarn.lock` referenced a Yarn patch
(`got@patch:...#~/.yarn/patches/got-npm-11.8.2-c1eb105458.patch`) that is
internal to Backstage's own monorepo and isn't published — it broke
`yarn install` for anyone using `create-app` standalone. Fixed with a
`resolutions` override (`"got": "11.8.2"`) in the root `package.json`.
