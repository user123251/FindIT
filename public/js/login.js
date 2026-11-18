let up = false; const $ = s => document.querySelector(s), f = $('#f');
const next = (() => { const n = new URLSearchParams(location.search).get('next'); return n && /^\/(?!\/)/.test(n) ? n : '/dashboard.html' })();
FI.ready.then(() => { if (FI.me) location.href = next });
function mode(u) { up = u; $('#nm').hidden = !u; f.name.required = u; $('#ttl').textContent = $('#go').textContent = u ? 'Create account' : 'Sign in';
  f.password.autocomplete = u ? 'new-password' : 'current-password'; $('#tin').className = 'btn' + (u ? ' ghost' : ''); $('#tup').className = 'btn' + (u ? '' : ' ghost'); $('#err').textContent = '' }
$('#tin').onclick = () => mode(false); $('#tup').onclick = () => mode(true);
f.onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); $('#go').disabled = true;
  try { await FI.api(up ? '/register' : '/login', { method: 'POST', body: d }); location.href = next } catch (x) { $('#err').textContent = x.message } finally { $('#go').disabled = false } };
