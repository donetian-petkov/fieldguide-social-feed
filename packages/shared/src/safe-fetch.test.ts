import assert from 'node:assert/strict';
import test from 'node:test';

import { BlockedAddressError, isPublicAddress, safeFetch } from './safe-fetch.js';

test('isPublicAddress rejects private, loopback, link-local and mapped addresses', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['8.8.8.8', '151.101.1.69', '2606:4700::1111']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test('safeFetch refuses loopback URLs, by IP and by hostname', async () => {
  await assert.rejects(safeFetch('http://127.0.0.1:9/'), BlockedAddressError);
  await assert.rejects(safeFetch('http://[::1]:9/'), BlockedAddressError);
  await assert.rejects(safeFetch('http://localhost:9/'), BlockedAddressError);
  await assert.rejects(safeFetch('http://169.254.169.254/latest/meta-data/'), BlockedAddressError);
});

test('safeFetch refuses non-http schemes', async () => {
  await assert.rejects(safeFetch('file:///etc/passwd'), /Unsupported URL scheme/);
});
