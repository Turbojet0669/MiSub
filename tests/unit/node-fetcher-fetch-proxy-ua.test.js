import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSubscriptionNodes } from '../../functions/modules/subscription/node-fetcher.js';
import { buildSubscriptionNodeCacheKey } from '../../functions/services/subscription-service.js';

const encoder = new TextEncoder();

describe('fetchSubscriptionNodes fetch proxy UA forwarding', () => {
    beforeEach(() => {
        global.fetch = vi.fn(async (request) => {
            const requestUrl = typeof request === 'string' ? request : request.url;
            const parsed = new URL(requestUrl);
            const upstreamUa = parsed.searchParams.get('ua');

            if (upstreamUa !== 'clash-verge/v2.4.3') {
                return new Response('Gateway Time-out', { status: 504, statusText: 'Gateway Time-out' });
            }

            return new Response(
                encoder.encode('ss://YWVzLTEyOC1nY206cGFzc0BleGFtcGxlLmNvbTo4Mzg4#ok'),
                { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
            );
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('passes custom UA to fetch proxy as ua query parameter', async () => {
        const result = await fetchSubscriptionNodes(
            'http://47.242.55.240/link/token?clash=2',
            '机场',
            'v2rayN/7.23',
            'clash-verge/v2.4.3',
            false,
            '',
            'https://proxy.example.com/api?url='
        );

        expect(result.success).toBe(true);
        expect(result.nodes).toHaveLength(1);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const request = global.fetch.mock.calls[0][0];
        const calledUrl = typeof request === 'string' ? request : request.url;
        expect(calledUrl).toContain('ua=clash-verge%2Fv2.4.3');
        expect(calledUrl).toContain('url=http%3A%2F%2F47.242.55.240%2Flink%2Ftoken%3Fclash%3D2');
    });

    it('falls back to protective node cache when enabled and upstream fails', async () => {
        const subscription = {
            id: 'sub-cache',
            name: '机场',
            url: 'https://airport.example/sub',
            enableNodeCache: true
        };
        const storage = {
            async get(key) {
                if (key !== buildSubscriptionNodeCacheKey(subscription)) return null;
                return {
                    nodes: ['trojan://pass@cached.example.com:443#Cached'],
                    nodeCount: 1,
                    updatedAt: '2026-01-01T00:00:00.000Z'
                };
            },
            async put() {
                throw new Error('should not write on upstream failure');
            }
        };
        global.fetch = vi.fn(async () => new Response('Forbidden', { status: 403, statusText: 'Forbidden' }));

        const result = await fetchSubscriptionNodes(
            subscription.url,
            subscription.name,
            'MiSub-Test/1.0',
            null,
            false,
            '',
            null,
            false,
            false,
            true,
            storage,
            subscription
        );

        expect(result.success).toBe(true);
        expect(result.error).toBe('HTTP 403: Forbidden');
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].url).toBe('trojan://pass@cached.example.com:443#Cached');
    });
});
