// Optional add-on: makes the app installable and faster on weak networks. Load with:
// <script type="module" src="pwa.js"></script>
const head = document.head;
if (!document.querySelector('link[rel=manifest]')) { const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; head.append(l); }
if (!document.querySelector('meta[name=theme-color]')) { const m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#1d4ed8'; head.append(m); }
const secure = location.protocol === 'https:' || location.hostname === 'localhost';
if ('serviceWorker' in navigator && secure) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker not registered', e)));
