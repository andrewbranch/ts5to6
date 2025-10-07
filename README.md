# ts5to6

A command-line tool to migrate TypeScript configuration files to be compatible with TypeScript 6.0.

## Overview

TypeScript 6.0 introduces several deprecations and breaking changes. This tool automatically migrates tsconfig.json files to account for two configuration breaking changes:

- **`baseUrl` deprecation**: Before TypeScript 4.1, `baseUrl` was required in order to use `paths`. Many users only used it to enable `paths`, but never removed it after it became unnecessary. This tool can safely remove `baseUrl` and update `paths` mappings if necessary.
- **`rootDir` default value change**: TypeScript 6.0 changed how `rootDir` is inferred when unspecified. This tool can set explicit `rootDir` values to maintain TypeScript 5.x behavior.

## Usage

```bash
# Choose which fix you need, or run each in series:
npx @andrewbranch/ts5to6 --fixBaseUrl .
npx @andrewbranch/ts5to6 --fixRootDir .

# Or to start with a config not named 'tsconfig.json':
npx @andrewbranch/ts5to6 --fixBaseUrl ./tsconfig.app.json
npx @andrewbranch/ts5to6 --fixRootDir ./tsconfig.app.json
```

From the starting tsconfig.json file, the tool will recursively run on `references`, and also try to discover and update any related config files that will see a change through `extends`.
