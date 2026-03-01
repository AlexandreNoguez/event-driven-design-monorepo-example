import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { MESSAGE_CATALOG_V1 } from '../../packages/shared/src/messaging/contracts';

interface EnvelopeLike {
  kind?: unknown;
  type?: unknown;
  occurredAt?: unknown;
  correlationId?: unknown;
  version?: unknown;
  producer?: unknown;
  payload?: unknown;
}

test('docs event examples cover the entire v1 catalog and keep envelope basics valid', async () => {
  const examplesDir = path.join(process.cwd(), 'docs', 'events', 'examples');
  const files = (await readdir(examplesDir))
    .filter((file) => file.endsWith('.json'))
    .sort();

  const observedTypes = new Set<string>();

  for (const file of files) {
    const raw = await readFile(path.join(examplesDir, file), 'utf8');
    const envelope = JSON.parse(raw) as EnvelopeLike;

    assert.equal(typeof envelope.type, 'string', `${file} must define a string "type"`);
    assert.equal(typeof envelope.kind, 'string', `${file} must define a string "kind"`);
    assert.equal(typeof envelope.producer, 'string', `${file} must define a string "producer"`);
    assert.equal(typeof envelope.correlationId, 'string', `${file} must define a string "correlationId"`);
    assert.equal(typeof envelope.payload, 'object', `${file} must define an object "payload"`);
    assert.equal(envelope.version, 1, `${file} must use version=1`);

    const occurredAt = typeof envelope.occurredAt === 'string' ? Date.parse(envelope.occurredAt) : Number.NaN;
    assert.ok(Number.isFinite(occurredAt), `${file} must define a valid ISO date in "occurredAt"`);

    const catalogEntry = MESSAGE_CATALOG_V1[envelope.type as keyof typeof MESSAGE_CATALOG_V1];
    assert.ok(catalogEntry, `${file} references a type outside the v1 catalog`);
    assert.equal(envelope.kind, catalogEntry.kind, `${file} must match the catalog kind for ${String(envelope.type)}`);

    observedTypes.add(envelope.type as string);
  }

  const catalogTypes = Object.keys(MESSAGE_CATALOG_V1).sort();
  assert.deepEqual(
    Array.from(observedTypes).sort(),
    catalogTypes,
    'docs/examples must contain one example for each v1 message type',
  );
});
