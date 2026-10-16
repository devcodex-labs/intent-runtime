/** A trusted public origin permits one explicit proxy authority, never arbitrary forwarding headers. */
export function publicOrigin(value: unknown): URL | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value || value.trim() !== value) throw new Error('Invalid public origin');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) throw new Error('Invalid public origin');
  return url;
}
