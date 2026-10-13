import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
const graph = new Map();
async function scan(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {await scan(file); continue;}
    if (!file.endsWith('.ts')) continue;
    const source = await readFile(file, 'utf8'), edges = [];
    for (const match of source.matchAll(/(?:import|export)\s+(?:type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/g)) {
      const dependency = match[1];
      if (/^src\/(contracts|core|model|schema|internal)\//.test(file) && /^(openai|@modelcontextprotocol|node:(?:fs|https?|net|tls))/.test(dependency)) throw new Error('Runtime boundary violation: ' + file);
      if (/^src\/(contracts|model)\//.test(file) && dependency.startsWith('node:')) throw new Error('Contract/model side effect: ' + file);
      if (/^src\/schema\//.test(file) && dependency.includes('/core/')) throw new Error('Schema depends on core: ' + file);
      if (dependency.startsWith('.')) edges.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), dependency)).replace(/\.js$/, '.ts'));
    }
    graph.set(file, edges);
  }
}
await scan('src'); const active = new Set(), done = new Set();
function visit(file) {if (active.has(file)) throw new Error('Import cycle: ' + file); if (done.has(file)) return; active.add(file); for (const child of graph.get(file) ?? []) visit(child); active.delete(file); done.add(file);}
for (const file of graph.keys()) visit(file);
console.log('Import boundaries and cycles checked: ' + graph.size + ' modules.');
