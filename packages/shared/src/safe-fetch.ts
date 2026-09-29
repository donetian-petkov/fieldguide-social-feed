import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

// Server-only helper: fetches outside URLs while refusing anything that resolves to a
// private, loopback, link-local or otherwise internal address. The address check runs
// inside the socket's own DNS lookup, so a hostname cannot pass the check and then
// re-resolve to an internal IP before connecting.

const blockedRanges = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  blockedRanges.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
] as const) {
  blockedRanges.addSubnet(network, prefix, 'ipv6');
}

export function isPublicAddress(address: string) {
  const family = net.isIP(address);
  if (family === 4) return !blockedRanges.check(address, 'ipv4');
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return !blockedRanges.check(mapped[1], 'ipv4');
    return !blockedRanges.check(address, 'ipv6');
  }
  return false;
}

export class BlockedAddressError extends Error {
  constructor(host: string) {
    super(`Refusing to fetch ${host}: it resolves to a private or internal address.`);
    this.name = 'BlockedAddressError';
  }
}

export type SafeFetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: { all?: boolean }, callback: LookupCallback) {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, '');
    if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
      return callback(new BlockedAddressError(hostname), '');
    }
    if (options.all) return callback(null, addresses);
    const first = addresses[0]!;
    callback(null, first.address, first.family);
  });
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function requestOnce(url: URL, options: Required<Omit<SafeFetchOptions, 'maxRedirects'>>, deadline: number) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && !isPublicAddress(host)) {
      reject(new BlockedAddressError(host));
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const remaining = Math.max(deadline - Date.now(), 1);
    const request = client.request(url, {
      method: 'GET',
      headers: options.headers,
      lookup: guardedLookup as unknown as net.LookupFunction,
      timeout: remaining
    });
    const timer = setTimeout(() => request.destroy(new Error(`Request to ${url.host} timed out.`)), remaining);

    request.on('timeout', () => request.destroy(new Error(`Request to ${url.host} timed out.`)));
    request.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.on('response', (response) => {
      const declared = Number(response.headers['content-length'] || '0');
      if (declared > options.maxBytes) {
        request.destroy(new Error('Response exceeds the size limit.'));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      response.on('data', (chunk: Buffer) => {
        received += chunk.byteLength;
        if (received > options.maxBytes) {
          request.destroy(new Error('Response exceeds the size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        clearTimeout(timer);
        resolve({ status: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks) });
      });
      response.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    request.end();
  });
}

/**
 * Drop-in replacement for `fetch(url)` for URLs that come from outside the app
 * (feeds, article links, image URLs). Returns a standard Response.
 */
export async function safeFetch(input: string | URL, init: SafeFetchOptions = {}) {
  const options = {
    headers: init.headers || {},
    timeoutMs: init.timeoutMs ?? 15_000,
    maxBytes: init.maxBytes ?? 5 * 1024 * 1024
  };
  const maxRedirects = init.maxRedirects ?? 5;
  const deadline = Date.now() + options.timeoutMs;
  let url = new URL(input);

  for (let hop = 0; ; hop += 1) {
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Unsupported URL scheme: ${url.protocol}`);
    }
    const result = await requestOnce(url, options, deadline);
    const location = result.headers.location;
    if (result.status >= 300 && result.status < 400 && result.status !== 304 && location) {
      if (hop >= maxRedirects) throw new Error('Too many redirects.');
      url = new URL(location, url);
      continue;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(result.headers)) {
      if (value === undefined) continue;
      for (const entry of Array.isArray(value) ? value : [value]) headers.append(key, entry);
    }
    const response = new Response(NULL_BODY_STATUSES.has(result.status) ? null : new Uint8Array(result.body), {
      status: result.status,
      headers
    });
    Object.defineProperty(response, 'url', { value: url.toString() });
    return response;
  }
}
