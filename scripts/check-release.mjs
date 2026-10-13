import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== 'v' + metadata.version) throw new Error('Tag and package version differ.');
if (!/^2\.\d+\.\d+$/.test(metadata.version)) throw new Error('Publication requires a stable V2 version.');
const evidenceFile = process.env.INTENT_RELEASE_EVIDENCE;
if (!evidenceFile) throw new Error('V2 publication requires reviewed acceptance evidence.');
const bytes = await readFile(evidenceFile), hash = createHash('sha256').update(bytes).digest('hex');
if (process.env.INTENT_RELEASE_EVIDENCE_SHA256 && hash !== process.env.INTENT_RELEASE_EVIDENCE_SHA256) throw new Error('Reviewed evidence digest differs.');
const evidence = JSON.parse(bytes);
if (evidence.format !== 'intent-runtime-v2-acceptance-1' || evidence.commit !== commit || evidence.packageVersion !== metadata.version || evidence.contractVersion !== '2.0-draft.6') throw new Error('Acceptance evidence does not match this release.');
const gates = ['TAF-01','TAF-02','TAF-03','TAF-04','TAF-05','GATE-01','GATE-02','GATE-03'];
for (const id of gates) {
  const rows = evidence.gates?.filter(row => row.id === id);
  if (rows?.length !== 1 || rows[0].status !== 'passed' || typeof rows[0].evidence !== 'string' || !rows[0].evidence.trim()) throw new Error('Unclosed acceptance gate: ' + id);
}
for (const provider of ['openai','xai']) if (!evidence.providers?.some(r => r.provider === provider && r.status === 'passed' && r.model && r.evidence)) throw new Error('Missing actual provider acceptance: ' + provider);
for (const client of ['codex-cli','codex-desktop']) if (!evidence.hosts?.some(r => r.client === client && r.status === 'passed' && r.version && r.platform && r.evidence)) throw new Error('Missing actual host acceptance: ' + client);
for (const version of ['2025-06-18','2025-11-25','2026-07-28']) if (!evidence.protocols?.some(r => r.version === version && r.status === 'passed' && r.evidence)) throw new Error('Missing protocol evidence: ' + version);
if (!Number.isSafeInteger(evidence.semanticReview?.executed) || evidence.semanticReview.executed <= 0 || evidence.semanticReview.status !== 'passed' || !evidence.semanticReview.independentReviewer || !evidence.semanticReview.evidence) throw new Error('Missing independent semantic acceptance.');
const token = process.env.GH_TOKEN, repository = process.env.GITHUB_REPOSITORY ?? 'devcodex-labs/intent-runtime';
const headers = {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? {Authorization: 'Bearer ' + token} : {})};
async function api(route) {const response = await fetch('https://api.github.com/repos/' + repository + route, {headers, signal: AbortSignal.timeout(15000)}); if (!response.ok) throw new Error('Cannot verify exact platform CI.'); return response.json();}
if (!Number.isSafeInteger(evidence.ciRunId)) throw new Error('Missing exact CI run.');
const run = await api('/actions/runs/' + evidence.ciRunId);
if (run.head_sha !== commit || run.head_branch !== 'main' || run.event !== 'push' || run.status !== 'completed' || run.conclusion !== 'success' || run.path !== '.github/workflows/ci.yml') throw new Error('CI is not a successful exact main commit.');
const jobs = [];
for (let page = 1;; page++) {const data = await api(`/actions/runs/${evidence.ciRunId}/jobs?per_page=100&page=${page}`); jobs.push(...data.jobs); if (jobs.length >= data.total_count) break;}
for (const name of ['quality','docs', ...['ubuntu-latest','windows-latest','macos-latest'].flatMap(os => ['20.0.0','24.x'].map(node => `runtime (${os}, ${node})`))]) if (!jobs.some(j => j.name === name && j.conclusion === 'success')) throw new Error('Missing successful platform CI: ' + name);
console.log('Exact V2 release, reviewed gates and platform CI verified. Evidence SHA-256: ' + hash);
