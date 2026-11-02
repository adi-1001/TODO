const WORDS = [
  'maple', 'river', 'quartz', 'lantern', 'cedar', 'harbor', 'meadow', 'comet', 'violet', 'ember',
  'orchid', 'summit', 'pebble', 'willow', 'falcon', 'birch', 'canyon', 'glacier', 'saffron', 'tundra',
  'atlas', 'juniper', 'marble', 'nectar', 'oasis', 'prairie', 'raven', 'sierra', 'tidal', 'velvet',
  'aspen', 'basalt', 'cobalt', 'delta', 'fjord', 'grove', 'heron', 'iris', 'kestrel', 'lagoon',
];

export const MIN_SYNC_ID_LENGTH = 6;
export const RECOMMENDED_SYNC_ID_LENGTH = 16;

function randomInts(n: number): number[] {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return [...crypto.getRandomValues(new Uint32Array(n))];
  }
  return Array.from({ length: n }, () => Math.floor(Math.random() * 2 ** 32));
}

/** A private Sync ID such as "study-cedar-comet-iris-4821". */
export function generateSyncId(): string {
  const [a, b, c, d] = randomInts(4);
  return `study-${WORDS[a % WORDS.length]}-${WORDS[b % WORDS.length]}-${WORDS[c % WORDS.length]}-${1000 + (d % 9000)}`;
}
