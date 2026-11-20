// Installable app (PWA): register the service worker, offer "Install app" where the browser supports it,
// and on iPhone/iPad (which has no install prompt) show a one-time hint: Share → Add to Home Screen.
const $ = id => document.getElementById(id);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; const b = $('installBtn'); if (b) b.hidden = false; });
window.addEventListener('appinstalled', () => { deferred = null; const b = $('installBtn'); if (b) b.hidden = true; });
$('installBtn')?.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; $('installBtn').hidden = true; });

export function installHint() {
  if (standalone() || !isIOS() || document.querySelector('.iosbar')) return;
  try { if (localStorage.getItem('triven.iosHint')) return; } catch { /* storage blocked */ }
  const bar = document.createElement('div'); bar.className = 'iosbar';
  const img = Object.assign(document.createElement('img'), { src: 'img/icons/apple-touch-icon.png', alt: '' });
  const txt = document.createElement('span'); txt.innerHTML = '<b>Install Triven on your phone:</b> tap the Share button, then <b>Add to Home Screen</b>.';
  const x = Object.assign(document.createElement('button'), { className: 'linkbtn', type: 'button', textContent: 'Got it' });
  x.onclick = () => { bar.remove(); try { localStorage.setItem('triven.iosHint', '1'); } catch { /* storage blocked */ } };
  bar.append(img, txt, x); $('tabs').after(bar);
}
