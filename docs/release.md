# Release gates

This is 1.0.0-dev.0, not an accepted production release. Before any npm publication:

1. Pass typecheck, lint, deterministic tests, build and isolated package smoke on supported Node/platform targets.
2. Run real OpenAI/xAI and Codex desktop paths separately, following local-testing.md.
3. Review numbered semantic/critical/multilingual cases and keep compatibility evidence.
4. Review standard-data age, update if needed, then revalidate.
5. Update CHANGELOG and version deliberately; publish only through a separately authorized release.

This implementation does not publish a package or create a release. NPM credentials are unnecessary for development.

The existing tag publication workflow now runs all deterministic gates and blocks development previews. For a reviewed release, provide evaluations/release-acceptance.json with openai, xai, codexDesktop, semantics, multilingual and languageRegistry records, each containing accepted: true, reviewedBy and evidence (the evidence path or link). These records document actual review; setting a flag does not perform a test. Configure the GitHub npm-release environment according to the project's release authorization process.
