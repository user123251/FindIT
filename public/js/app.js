(() => {
const EMO = {Electronics:'🎧',Wallets:'👛',Keys:'🔑','IDs & Cards':'🪪',Bags:'🎒',Clothing:'🧥',Books:'📚',Other:'📦'};
const $ = (s, r = document) => r.querySelector(s), { api, esc } = FI;
let items = [], timer;
const fmt = d => new Date(d + 'T00:00').toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'});
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3000) }
const opts = (arr, ph) => (ph ? `<option value="">${ph}</option>` : '') + arr.map(x => `<option>${esc(x)}</option>`).join('');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

async function load() {
  const p = new URLSearchParams({q: $('#q').value.trim(), type: $('#ftype').value, category: $('#fcat').value, location: $('#floc').value, sort: $('#fsort').value});
  try { const [d, s] = await Promise.all([api('/items?' + p), api('/stats')]); items = d.items; render();
    $('#stats').innerHTML = `<div><b>${s.lost}</b>items still lost</div><div><b>${s.found}</b>items waiting for owners</div><div><b>${s.reunited}</b>reunited</div>`;
  } catch (e) { $('#grid').innerHTML = `<div class="empty">${esc(e.message)}</div>` } }
function render() {
  $('#count').textContent = `${items.length} item${items.length === 1 ? '' : 's'} shown`;
  $('#grid').innerHTML = items.length ? items.map(i => `
    <button class="item ${i.done ? 'done' : ''}" data-id="${i.id}" aria-label="View ${esc(i.title)}">
      <div class="pic" ${i.photo ? `style="background-image:url('${esc(i.photo)}')"` : ''}>${i.photo ? '' : EMO[i.category] || '📦'}</div>
      <div class="info"><span class="badge ${i.done ? 'done' : i.type}">${i.done ? (i.type === 'lost' ? 'Recovered' : 'Returned') : i.type === 'lost' ? 'Lost' : 'Found'}</span>
      <h3>${esc(i.title)}</h3><p>${esc(i.location)} · ${fmt(i.date)}</p></div></button>`).join('')
    : `<div class="empty"><b>Nothing here yet.</b><p>Post what you lost or found so the right person can see it.</p><button class="btn dark" data-open="report" data-type="lost">Report an item</button></div>` }

function showItem(id) {
  const i = items.find(x => x.id == id); if (!i) return;
  const who = i.type === 'found' ? 'finder' : 'owner';
  let action;
  if (i.mine) action = '<p class="muted">This is your post. Messages from other students appear in your dashboard.</p>';
  else if (i.done) action = '<p class="muted">This item has been marked as resolved.</p>';
  else if (!FI.me) action = `<div class="contact"><b>Think this is yours?</b><a class="btn dark" href="/login.html?next=/" style="text-align:center;text-decoration:none">Sign in to message the ${who}</a></div>`;
  else action = `<form class="contact" id="msgForm" method="dialog"><b>Message the ${who}</b>
      <p class="muted" style="margin:0">${i.type === 'found' ? 'Describe a detail that proves it is yours.' : 'Tell them where you saw it.'} Your reply contact is only shown to them.</p>
      <input name="reply" placeholder="How should they reach you? Email or phone" required value="${esc(FI.me.email)}"><textarea name="text" rows="3" maxlength="500" placeholder="Write your message…" required></textarea>
      <p class="err" id="merr"></p><button class="btn dark">Send message</button></form>`;
  $('#itemBody').innerHTML = `${i.photo ? `<img src="${esc(i.photo)}" alt="${esc(i.title)}">` : ''}
    <div><span class="badge ${i.done ? 'done' : i.type}">${i.type === 'lost' ? 'Lost' : 'Found'}${i.done ? ' · closed' : ''}</span><h2>${esc(i.title)}</h2></div>
    <p>${esc(i.desc)}</p>
    <dl><dt>Category</dt><dd>${esc(i.category)}</dd><dt>Location</dt><dd>${esc(i.location)}</dd><dt>Date</dt><dd>${fmt(i.date)}</dd><dt>Posted by</dt><dd>${esc(i.poster)}</dd></dl>
    ${action}<div class="actions"><button class="btn ghost" data-close>Close</button>${i.mine && !i.done ? `<button class="btn teal" id="resolve">${i.type === 'lost' ? 'Mark as recovered' : 'Mark as returned'}</button>` : ''}</div>`;
  $('#itemDlg').showModal();
  const f = $('#msgForm');
  if (f) f.onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(f));
    try { await api(`/items/${i.id}/messages`, {method: 'POST', body: d}); $('#itemDlg').close(); toast(`Message sent to ${i.poster}.`) } catch (x) { $('#merr').textContent = x.message } };
  const r = $('#resolve');
  if (r) r.onclick = async () => { try { await api(`/items/${i.id}/resolve`, {method: 'POST'}); $('#itemDlg').close(); load(); toast('Marked as resolved. Glad it found its way home.') } catch (x) { toast(x.message) } };
}

function openReport(type) {
  if (!FI.me) { location.href = '/login.html?next=/'; return }
  const f = $('#reportForm'); if (type) f.type.value = type; $('#rerr').textContent = ''; $('#reportDlg').showModal() }
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) return openReport(o.dataset.type);
  if (e.target.closest('[data-close]')) return e.target.closest('dialog').close();
  const it = e.target.closest('.item'); if (it) showItem(it.dataset.id);
  if (e.target.tagName === 'DIALOG') e.target.close() });
['#ftype', '#fcat', '#floc', '#fsort'].forEach(s => $(s).addEventListener('input', load));
$('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250) });
$('#filters').addEventListener('submit', e => { e.preventDefault(); load() });

function shrink(file) { return new Promise(res => { const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'), k = Math.min(1, 700 / img.width); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .72)) };
  img.onerror = () => res(''); img.src = URL.createObjectURL(file) }) }
$('#reportForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), file = f.photo.files[0], btn = $('#postBtn');
  delete d.photo; if (file) d.photo = await shrink(file);
  btn.disabled = true;
  try { await api('/items', {method: 'POST', body: d}); f.reset(); f.date.value = today(); $('#reportDlg').close(); $('#ftype').value = ''; await load(); toast(`${d.type === 'lost' ? 'Lost' : 'Found'} item posted.`); location.hash = 'browse' }
  catch (x) { $('#rerr').textContent = x.message } finally { btn.disabled = false } });

(async () => {
  $('#yr').textContent = new Date().getFullYear(); $('[name=date]').max = $('[name=date]').value = today();
  try { const m = await api('/meta'); $('#fcat').innerHTML = opts(m.categories, 'All categories'); $('#floc').innerHTML = opts(m.locations, 'All locations');
    $('[name=category]').innerHTML = opts(m.categories); $('[name=location]').innerHTML = opts(m.locations) } catch (e) { toast(e.message) }
  load() })();
})();
