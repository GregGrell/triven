// Clean addresses. The app routes on the #hash internally; the address bar shows a clean path instead:
//   #log/bests → /log/bests   #feed → /feed   #u/carlg/412 → /carlg/412   #a/<id> → /carlg/412 when known, else /a/<id>
// Opening or reloading a clean path goes through 404.html, which turns it back into the #hash (keep the two in step).
export const APP = new Set(['feed', 'log', 'upload', 'gear', 'people', 'club', 'a', 'c', 'r', 'join', 'reset', 'me', 'admin', 'feedback']);
const links = new Map();   // activity id → 'handle/num', filled from your activities and feed cards
export const rememberLink = (id, path) => { if (id && path) links.set(id, path); };

export function prettyOf(hash) {
  let h = (hash || '#feed').replace(/^#/, '');
  let [path, q] = h.split('?');
  if (q && /^\d+$/.test(q)) q = '';                       // '?1795…' only forces a re-render
  if (path.startsWith('u/')) path = path.slice(2);
  else if (path.startsWith('a/') && links.has(path.slice(2))) path = links.get(path.slice(2));
  return '/' + path + (q ? '?' + q : '');
}
// a clean path (with any ?query) → the #hash route
export function hashOf(pathAndQuery) {
  const [path, q] = pathAndQuery.split('?'), segs = path.replace(/^\/+|\/+$/g, '').split('/');
  if (!segs[0] || /\.html$/.test(path)) return '';   // the page itself (/index.html)
  if (APP.has(segs[0])) return '#' + segs.join('/') + (q ? '?' + q : '');
  return '#u/' + segs.join('/').toLowerCase();
}
// the current route, whether the address shows the #hash or the clean path
export const curRoute = () => location.hash || hashOf(location.pathname + location.search) || '#feed';
