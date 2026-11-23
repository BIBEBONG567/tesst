let TOKEN = null;

async function login() {
  const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: document.getElementById('user').value, password: document.getElementById('pass').value }) });
  if (!r.ok) return alert('Sai tài khoản hoặc mật khẩu');
  TOKEN = (await r.json()).token;
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('panel').style.display = 'block';
  refreshKeys(); refreshPayloads();
}

function authHeaders() { return { 'Authorization': 'Bearer ' + TOKEN }; }

async function genKeys() {
  const r = await fetch('/api/admin/keys', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ days: parseInt(document.getElementById('days').value), count: parseInt(document.getElementById('count').value) }) });
  document.getElementById('out-keys').innerHTML = `<div class="out">${(await r.json()).keys.join('\n')}</div>`;
  refreshKeys();
}

async function refreshKeys() {
  const rows = await (await fetch('/api/admin/keys', { headers: authHeaders() })).json();
  const tbody = document.querySelector('#keys-table tbody'); tbody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    const expired = row.expires_at < Date.now();
    
    let status = '<span class="badge ok">Hoạt động</span>';
    if (!row.active) status = '<span class="badge off">Đã thu hồi</span>';
    else if (expired) status = '<span class="badge off">Hết hạn</span>';

    const btnRevoke = row.active ? `<button class="danger" onclick="revokeKey(${row.id})">Thu hồi</button>` : '';
    
    tr.innerHTML = `
      <td><code>${row.key}</code></td>
      <td>${row.hwid ? '<code>' + row.hwid.slice(0,12) + '…</code>' : '<span style="color:var(--muted)">Chưa liên kết</span>'}</td>
      <td>${new Date(row.expires_at).toLocaleString()}</td>
      <td>${status}</td>
      <td>
        <button class="quiet" onclick="assignPayload(${row.id})">Gán File EXE</button>
        <button class="quiet" onclick="resetHwid(${row.id})">Reset HWID</button>
        ${btnRevoke}
        <button class="danger" onclick="deleteKey(${row.id})" title="Xóa vĩnh viễn">Xóa</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

async function resetHwid(id) { await fetch(`/api/admin/keys/${id}/reset-hwid`, { method: 'POST', headers: authHeaders() }); refreshKeys(); }
async function revokeKey(id) { if (confirm('Thu hồi key này?')) { await fetch(`/api/admin/keys/${id}`, { method: 'DELETE', headers: authHeaders() }); refreshKeys(); } }
async function deleteKey(id) { if (confirm('XÓA VĨNH VIỄN key này khỏi Database?')) { await fetch(`/api/admin/keys/${id}/delete`, { method: 'DELETE', headers: authHeaders() }); refreshKeys(); } }

async function purgeRevokedKeys() {
    if (!confirm('Xóa vĩnh viễn TẤT CẢ các key đã bị thu hồi?')) return;
    await fetch('/api/admin/keys/purge', { method: 'DELETE', headers: authHeaders() });
    refreshKeys();
}

async function assignPayload(keyId) {
    const payloads = await (await fetch('/api/admin/payloads', { headers: authHeaders() })).json();
    if (payloads.length === 0) return alert('Chưa có file EXE nào trên Server. Hãy tải lên trước.');

    const assigned = await (await fetch(`/api/admin/keys/${keyId}/payloads`, { headers: authHeaders() })).json();

    let msg = "Nhập ID của File EXE muốn cấp cho Key này (cách nhau bởi dấu phẩy):\n\n";
    payloads.forEach(p => { msg += `[${p.id}] - ${p.name}\n`; });
    msg += `\nĐã cấp trước đó: ${assigned.join(', ')}`;

    const input = prompt(msg, assigned.join(', '));
    if (input === null) return; 
    
    const ids = input.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    
    await fetch(`/api/admin/keys/${keyId}/clear`, { method: 'DELETE', headers: authHeaders() });
    
    for (let pid of ids) {
        await fetch(`/api/admin/keys/${keyId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ payload_id: pid })
        });
    }
    alert('Đã cập nhật quyền chạy File cho Key thành công!');
}

async function uploadPayload() {
  const fd = new FormData(); fd.append('name', document.getElementById('pname').value || 'payload'); fd.append('file', document.getElementById('pfile').files[0]);
  const r = await fetch('/api/admin/payload', { method: 'POST', headers: authHeaders(), body: fd });
  if (r.ok) { alert('Tải lên thành công'); refreshPayloads(); } else alert('Tải lên thất bại');
}

async function refreshPayloads() {
  const rows = await (await fetch('/api/admin/payloads', { headers: authHeaders() })).json();
  const tbody = document.querySelector('#payloads-table tbody'); tbody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr'); 
    tr.innerHTML = `<td><code>${row.id}</code></td><td>${row.name}</td><td><code>${row.filename}</code></td><td>${new Date(row.uploaded_at).toLocaleString()}</td>
                    <td><button class="danger" onclick="deletePayload(${row.id})">Xóa File</button></td>`;
    tbody.appendChild(tr);
  }
}

async function deletePayload(id) {
    if (!confirm('Xóa vĩnh viễn file EXE này khỏi Server?')) return;
    await fetch(`/api/admin/payload/${id}`, { method: 'DELETE', headers: authHeaders() });
    refreshPayloads();
}
