# Release gates

This is 1.0.0-dev.0, not an accepted production release. Before any npm publication:

1. Pass typecheck, lint, deterministic tests, build, isolated package smoke and global installation smoke on supported Node/platform targets, including exact Node 20.0.0.
2. Run real OpenAI/xAI and Codex desktop paths separately, following local-testing.md.
3. Review numbered semantic/critical/multilingual cases and keep compatibility evidence.
4. Review standard-data age, update if needed, then revalidate.
5. Update CHANGELOG and version deliberately; publish only through a separately authorized release.

This implementation does not publish a package or create a release. NPM credentials are unnecessary for development.

The tag publication workflow runs deterministic gates and blocks development previews. For a reviewed release, provide an external JSON file through INTENT_RELEASE_EVIDENCE (default: the sibling intent-runtime-results/release-acceptance.json), with openai, xai, codexDesktop, semantics, multilingual and languageRegistry records, each containing accepted: true, reviewedBy and evidence (the evidence path or link). These records document actual review; setting a flag does not perform a test. Evidence and reports must stay outside the repository. Configure the GitHub npm-release environment according to the project's release authorization process. The approved version must become the default latest tag for the unversioned global installation command to deliver the feature.
