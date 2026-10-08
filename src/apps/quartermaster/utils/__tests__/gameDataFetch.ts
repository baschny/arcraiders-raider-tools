import { vi } from 'vitest';

// Real generated v2 files (structure + English text only), bundled by vite for the tests.
const files = import.meta.glob(
  [
    '../../../../../public/data/game/{items,recipes,research,blueprints,trades,benches,outpost,stencils,projects,quests,skilltree,amplification,maps,classification}.json',
    '../../../../../public/data/game/*.text.en.json',
  ],
  { eager: true, import: 'default' },
) as Record<string, unknown>;

const byUrl = new Map(
  Object.entries(files).map(([path, json]) => [`/data/game/${path.split('/').pop()}`, json]),
);

/** Serves /data/game/* from the real generated files in public/ (no network). */
export function stubGameDataFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const json = byUrl.get(url);
      if (!json) return { ok: false, status: 404, statusText: 'Not Found' };
      return { ok: true, json: async () => json };
    }),
  );
}
