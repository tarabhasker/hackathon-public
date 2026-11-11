// Frontend <-> backend wiring. Bootstrap's JS bundle is already loaded.

// The backend runs separately (./run-backend.sh) on this address
const API_BASE = 'http://127.0.0.1:5001';

const statusBadge = document.getElementById('backend-status');
const form = document.getElementById('item-form');
const nameInput = document.getElementById('item-name');
const list = document.getElementById('item-list');

async function checkBackend() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    statusBadge.textContent = data.status;
    statusBadge.className = 'badge bg-success';
  } catch {
    statusBadge.textContent = 'offline';
    statusBadge.className = 'badge bg-danger';
  }
}

function renderItems(items) {
  list.innerHTML = '';
  if (items.length === 0) {
    list.innerHTML =
      '<li class="list-group-item text-body-secondary">No items yet — add one above.</li>';
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';

    const label = document.createElement('span');
    label.textContent = item.name;

    const del = document.createElement('button');
    del.className = 'btn btn-sm btn-outline-danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteItem(item.id));

    li.append(label, del);
    list.appendChild(li);
  }
}

async function loadItems() {
  const res = await fetch(`${API_BASE}/api/items`);
  renderItems(await res.json());
}

async function addItem(name) {
  await fetch(`${API_BASE}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await loadItems();
}

async function deleteItem(id) {
  await fetch(`${API_BASE}/api/items/${id}`, { method: 'DELETE' });
  await loadItems();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  nameInput.value = '';
  await addItem(name);
  nameInput.focus();
});

checkBackend();
loadItems();
