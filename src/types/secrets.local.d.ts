// Ambient declaration for the operator-only secrets file. The actual
// `secrets.local.json` is gitignored and not always present — we only
// need the type so TypeScript can compile. The runtime loader in
// api-key-pool.ts does the actual dynamic import.
declare module "*secrets.local.json" {
  const value: {
    providers?: Record<string, Array<{ key: string; label?: string }>>;
  };
  export default value;
  export const providers: Record<string, Array<{ key: string; label?: string }>> | undefined;
}
