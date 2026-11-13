// Deep links (docs/spec/05-quality-delivery.md §12.3): only known screens, with ids that look like ids. Anything else
// — from a notification, another app or a web page — goes to the start-up gate.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const ALLOWED: RegExp[] = [
  /^\/$/,
  /^\/home$/,
  /^\/offer$/,
  /^\/earnings$/,
  /^\/trips$/,
  new RegExp(`^/trips/${UUID}$`, 'i'),
  /^\/wallet$/,
  /^\/documents$/,
  /^\/onboarding$/,
  /^\/support$/,
  /^\/safety$/,
  new RegExp(`^/trip/${UUID}$`, 'i'),
  new RegExp(`^/trip-complete/${UUID}$`, 'i'),
  new RegExp(`^/support/${UUID}$`, 'i'),
];

/** Turns any incoming link (`riderdriver://trip/<id>`, `/trip/<id>?x=1`, `https://…/trip/<id>`) into a safe path. */
export function safeAppPath(link: string | null | undefined): string | null {
  if (!link) return null;
  let path = link.trim();
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(path);
  if (scheme) {
    path = path.slice(scheme[0].length);
    path = /^https?:\/\//i.test(link.trim()) ? path.slice(path.indexOf('/') === -1 ? path.length : path.indexOf('/')) : `/${path}`;
  }
  path = path.split(/[?#]/)[0] ?? '';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  if (path.includes('(') || path.includes('..')) return null;
  return ALLOWED.some((pattern) => pattern.test(path)) ? path.toLowerCase() : null;
}

export type PushData = {
  type?: string;
  url?: string;
  offer_id?: string;
  trip_id?: string;
  ticket_id?: string;
  document_id?: string;
  expires_at?: string;
};

/** Where a tapped driver notification should open (docs/spec/04-integration.md §10.2). */
export function pathForPush(data: PushData | null | undefined): string | null {
  if (!data) return null;
  const fromUrl = safeAppPath(data.url);
  if (fromUrl) return fromUrl;
  const type = data.type ?? '';
  if (type === 'offer.created') return '/offer';
  if (type === 'offer.withdrawn') return '/home';
  if (type.startsWith('trip.') && data.trip_id) return safeAppPath(`/trip/${data.trip_id}`);
  if (type.startsWith('document.') || type === 'account.rejected') return '/onboarding';
  if (type.startsWith('account.') || type === 'forced_offline') return '/home';
  if (type.startsWith('payout.')) return '/wallet';
  if (type === 'support.reply' && data.ticket_id) return safeAppPath(`/support/${data.ticket_id}`);
  return null;
}
