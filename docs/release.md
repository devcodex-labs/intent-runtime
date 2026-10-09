# Release gates

This is 1.0.0-dev.0, an unpublished development preview. A production release requires separately authorized npm publication.

1. Choose a stable package version, update the changelog and commit to main. Wait for that exact commit to pass quality plus Windows/Linux/macOS on Node 20.0.0 and 24.x, including package, installation, maintenance, adversarial-validation and MCP protocol checks.
2. Run actual OpenAI, xAI, Codex CLI and Codex desktop acceptance using local-testing.md. Independently review every semantic/additional and multilingual case, record accuracy against an agreed minimum, and resolve critical failures. Controlled candidates and mocked fetch do not establish model accuracy.
3. Review the shipped language registry date and record the decision to update or retain it. Keep raw evidence, reports and the acceptance manifest outside the repository.
4. Run the **Review Release Evidence** workflow manually with the exact commit and the reviewed manifest JSON. It checks source hashes, review completeness/age and the successful CI matrix, then uploads an external release-acceptance artifact. It publishes no package.
5. Review that run and copy its run ID and the displayed manifest SHA-256 into the protected npm-release environment variables RELEASE_EVIDENCE_RUN_ID and RELEASE_EVIDENCE_SHA256. Configure environment reviewers according to the project's authorization process.
6. After release authorization, create v<package-version> for the same accepted commit. The publication workflow downloads the selected artifact outside the checkout, verifies its digest and all evidence again, and only then reaches npm publish. Changes require a new accepted manifest and matrix.

## Acceptance manifest

Use schemaVersion: 1, repository: "devcodex-labs/intent-runtime", commit: the full Git SHA, version: the stable package version, ciRunId: its successful main-branch CI run, hashes and reviews.

hashes maps every file in scripts/release-evidence.mjs RELEASE_INPUTS to its SHA-256. releaseHashes(repositoryRoot) returns the expected map. It covers the Prompt, all three evaluation datasets, evaluation schemas/assertions and both language registries.

reviews contains openai, xai, codexCli, codexDesktop, semantics, multilingual and languageRegistry. Every record requires accepted: true, reviewedBy, reviewedAt (ISO date within the last 90 days) and evidence (an inspectable path or link). The fields must describe actual review:

- Provider records also require the actual model and positive apiCalls.
- Client records require clientVersion and os.
- semantics requires reviewedCaseIds matching every ID in semantics.jsonl and additional.jsonl; multilingual requires every ID in languages.jsonl. Both require accuracy between 0 and 1, an agreed positive minimumAccuracy and criticalFailures: 0.
- languageRegistry requires fileDate and freshnessDecision, explaining why the dated snapshot is acceptable or was refreshed.

For a local gate check, set INTENT_RELEASE_EVIDENCE to the external manifest path and run node scripts/check-release.mjs from a clean, committed checkout. GH_TOKEN supplies read access to private repository Actions metadata. INTENT_RELEASE_EVIDENCE_SHA256 optionally verifies the approved digest; the publication workflow always sets it. Missing evidence, development versions, changed inputs, uncommitted changes, incomplete reviews and unsuccessful or different-commit CI runs block publication.

A manifest is a reviewer attestation backed by linked evidence. The gate verifies its identity and required fields; it does not independently execute providers or grade semantics. npm credentials are unnecessary for development and this repair work performs no publication.
