export function escapeToken(token: string): string { return token.replace(/~/g, '~0').replace(/\//g, '~1'); }
export function tokens(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/') || /~(?![01])/.test(pointer)) throw new TypeError('Invalid JSON Pointer');
  return pointer.slice(1).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~'));
}
export function resolve(root: unknown, pointer: string): { found: boolean; value?: unknown } {
  const parts = tokens(pointer); let value = root;
  for (const key of parts) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return { found: false };
    if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) return { found: false };
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return { found: false };
    value = descriptor.value;
  }
  return { found: true, value };
}
