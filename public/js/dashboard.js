const $ = s => document.querySelector(s), e = FI.esc;
async function draw() {
  try { const [a, b] = await Promise.all([FI.api('/my/items'), FI.api('/my/messages')]);
    $('#posts').innerHTML = a.items.length ? a.items.map(i => `<div class="row2"><div><span class="badge ${i.done ? 'done' : i.type}">${i.done ? 'Resolved' : i.type === 'lost' ? 'Lost' : 'Found'}</span> <b>${e(i.title)}</b><br><span class="muted small">${e(i.location)} · ${e(i.date)}</span></div>
      <div class="acts">${i.done ? '' : `<button class="btn teal" data-r="${i.id}">Mark resolved</button>`}<button class="btn ghost" data-d="${i.id}">Delete</button></div></div>`).join('')
      : '<div class="empty">You have no posts yet. Report something you lost or found.</div>';
    $('#msgs').innerHTML = b.messages.length ? b.messages.map(m => `<div class="row2"><div><b>${e(m.from_name)}</b> about <i>${e(m.title)}</i><p>${e(m.body)}</p><span class="muted small">Reply to: ${e(m.reply)} · ${new Date(m.created).toLocaleString()}</span></div></div>`).join('')
      : '<div class="empty">No messages yet. When someone contacts you about an item, it shows up here.</div>';
  } catch (x) { if (/sign in/i.test(x.message)) location.href = '/login.html?next=/dashboard.html'; else $('#posts').innerHTML = `<div class="empty">${e(x.message)}</div>` } }
document.addEventListener('click', async ev => { const r = ev.target.dataset.r, d = ev.target.dataset.d; if (!r && !d) return;
  try { if (r) await FI.api(`/items/${r}/resolve`, { method: 'POST' }); else if (confirm('Delete this post?')) await FI.api(`/items/${d}`, { method: 'DELETE' }); draw() } catch (x) { alert(x.message) } });
FI.ready.then(() => { if (!FI.me) return location.href = '/login.html?next=/dashboard.html'; $('#hi').textContent = 'Hi, ' + FI.me.name; $('#out').onclick = FI.logout; draw() });
