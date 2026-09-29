# Release

This package publishes to npm when a tag matching `v*` is pushed.

## Prerequisites

- GitHub repository: `devcodex-labs/intent-runtime`
- npm package: `@devcodex-labs/intent-runtime`
- GitHub Actions secret: `NPM_TOKEN`

## Release Steps

1. Update `package.json` version.
2. Run:

```bash
npm test
npm pack --dry-run
```

3. Commit the release changes.
4. Tag the commit:

```bash
git tag v0.1.0
git push origin main --tags
```

5. GitHub Actions publishes the package with public scoped package access.

## Notes

The workflow does not store npm tokens in source. It expects GitHub Actions to provide `NODE_AUTH_TOKEN` from the `NPM_TOKEN` repository secret.
