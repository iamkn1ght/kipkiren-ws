import type { NextFunction, Request, Response } from 'express';
import { BlockList, isIPv4, isIPv6 } from 'node:net';

/**
 * The real visitor IP, safe whether or not Cloudflare's proxy is in front.
 *
 * Behind the proxy every request reaches Railway from a Cloudflare address, so
 * req.ip alone would make every visitor share one rate-limit bucket (one bad
 * actor would lock everyone out). Cloudflare puts the visitor in
 * CF-Connecting-IP. We trust that header ONLY when the connecting hop really is
 * Cloudflare; anyone calling the Railway origin directly cannot spoof it.
 *
 * Ranges: https://www.cloudflare.com/ips/ (stable; review yearly).
 */
const CF_V4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
const CF_V6 = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
  '2a06:98c0::/29', '2c0f:f248::/32',
];

const cloudflare = new BlockList();
for (const r of CF_V4) { const [net, bits] = r.split('/'); cloudflare.addSubnet(net!, Number(bits), 'ipv4'); }
for (const r of CF_V6) { const [net, bits] = r.split('/'); cloudflare.addSubnet(net!, Number(bits), 'ipv6'); }

const stripMapped = (ip: string) => (ip.startsWith('::ffff:') && isIPv4(ip.slice(7)) ? ip.slice(7) : ip);

export function isCloudflareIp(raw: string | undefined): boolean {
  if (!raw) return false;
  const ip = stripMapped(raw);
  if (isIPv4(ip)) return cloudflare.check(ip, 'ipv4');
  if (isIPv6(ip)) return cloudflare.check(ip, 'ipv6');
  return false;
}

export function clientIp(req: Request): string {
  const hop = req.ip ?? '';
  const cf = req.header('cf-connecting-ip');
  if (cf && isCloudflareIp(hop) && (isIPv4(cf) || isIPv6(cf))) return cf;
  return stripMapped(hop) || 'unknown';
}

/**
 * When CLOUDFLARE_ONLY=true (set once api.ws is proxied), refuse requests that
 * did not come through Cloudflare, so floods cannot bypass the proxy by hitting
 * the Railway origin address directly. Off by default.
 */
export function cloudflareOnly(enabled: boolean) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled || isCloudflareIp(req.ip)) { next(); return; }
    res.status(403).json({ error: 'direct_origin_access_blocked' });
  };
}
