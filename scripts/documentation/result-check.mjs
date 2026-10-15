import assert from 'node:assert/strict';

export function pointer(root, text) {
  assert(typeof text === 'string' && (text === '' || text.startsWith('/')), 'Expected JSON Pointer: ' + text);
  assert(!/~(?![01])/u.test(text), 'Invalid pointer escape: ' + text);
  return text === '' ? root : text.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')).reduce((value, key) => {
    assert(value !== null && typeof value === 'object' && Object.hasOwn(value, key), text);
    return value[key];
  }, root);
}

function identities(snapshot, unique = false) {
  const sets = {intent: new Set(), constraint: new Set(), relation: new Set()};
  const all = new Set();
  const add = (kind, value) => {
    assert(typeof value.id === 'string');
    if (unique) assert(!all.has(value.id), 'Duplicate identity: ' + value.id);
    all.add(value.id); sets[kind].add(value.id);
  };
  function visit(nodes) {for (const node of nodes ?? []) {
    add('intent', node); node.constraints?.forEach(c => add('constraint', c));
    const refs = new Set();
    for (const ref of node.references ?? []) {assert(!refs.has(ref.id)); refs.add(ref.id);}
    visit(node.children);
  }}
  visit(snapshot?.intents);
  snapshot?.constraints?.forEach(c => add('constraint', c));
  snapshot?.relations?.forEach(r => add('relation', r));
  return sets;
}

// Documentation fixture checks, not an alternative public business Validator.
// Prior withdrawal examples carry an explicit baseline snapshot. Arbitrary
// Context strings are not treated as permission to reference any old ID.
export function checkResultLinks(result, materials) {
  const current = identities(result.effective, true), prior = identities(materials.baseline);
  const all = new Set(Object.values(current).flatMap(set => [...set]));
  for (const issue of result.issues ?? []) {assert(!all.has(issue.id), 'Duplicate issue identity'); all.add(issue.id);}
  for (const change of result.turn.changes) {
    if (change.target.kind !== 'unresolved') {
      const {kind, id} = change.target;
      assert(current[kind], 'Unknown target kind');
      if (change.operation === 'withdraw' && change.effect === 'applied') {
        assert(!current[kind].has(id) && prior[kind].has(id), 'Withdrawal must reference a supplied prior ' + kind);
      } else assert(current[kind].has(id), 'Target must be a current ' + kind);
    }
    if (change.conditionId !== undefined) assert(current.constraint.has(change.conditionId), 'conditionId must be a current constraint');
  }
  for (const id of result.turn.intentIds) assert(current.intent.has(id), 'turn.intentIds must reference current intents');
  for (const relation of result.effective.relations) assert(current.intent.has(relation.fromId) && current.intent.has(relation.toId));
  for (const entry of [...result.evidence ?? [], ...result.inferences]) pointer(result, entry.target);
  function sources(value) {
    if (!value || typeof value !== 'object') return;
    if ('root' in value && 'pointer' in value) {
      assert(Object.hasOwn(materials, value.root), 'Missing source root: ' + value.root);
      const source = pointer(materials[value.root], value.pointer);
      if (value.quote !== undefined) assert((typeof source === 'string' ? source : JSON.stringify(source)).includes(value.quote));
    }
    for (const child of Object.values(value)) sources(child);
  }
  sources(result);
}

// Runtime IDs are opaque. Canonical names make fixed documentation readable;
// the same replacement is applied to requests, baselines and results together.
export function readableIds(value) {
  const mapping = new Map(), counts = new Map();
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item !== 'string') return item;
    return item.replace(/(?:intent|constraint|relation|reference)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, id => {
      if (!mapping.has(id)) {
        const kind = id.slice(0, id.indexOf('-')), index = (counts.get(kind) ?? 0) + 1;
        counts.set(kind, index); mapping.set(id, kind + '-' + index);
      }
      return mapping.get(id);
    });
  }));
}
