(() => {
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, o = {}) {
  let r; try { r = await fetch('/api' + path, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: o.body ? JSON.stringify(o.body) : undefined }) }
  catch { throw new Error('Cannot reach the server. Check your connection.') }
  let d = {}; try { d = await r.json() } catch {}
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.'); return d }
window.FI = { api, esc, me: null };
FI.logout = async () => { await api('/logout', { method: 'POST' }); location.href = '/' };
FI.ready = api('/me').then(d => FI.me = d.user).catch(() => {});
document.addEventListener('DOMContentLoaded', async () => {
  if (!document.querySelector('.top')) {
    document.body.insertAdjacentHTML('afterbegin', '<header class="top"><a class="logo" href="/"><span class="hole"></span>FindIt</a><nav><a href="/#browse">Browse items</a><a href="/about.html">Safety &amp; FAQ</a></nav></header>');
    document.body.insertAdjacentHTML('beforeend', '<footer>© ' + new Date().getFullYear() + ' FindIt · <a href="/about.html">Safety &amp; FAQ</a></footer>') }
  await FI.ready;
  document.querySelector('.top nav').insertAdjacentHTML('afterbegin', FI.me ? '<a href="/dashboard.html">My dashboard</a>' : '<a href="/login.html">Sign in</a>');
});
})();
