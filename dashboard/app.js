// Minimal dashboard: renders the rows from data.js into a table.
const data = (typeof window !== 'undefined' && window.DATA) ? window.DATA : { rows: [] };
const rows = Array.isArray(data.rows) ? data.rows : [];
const el = document.getElementById('status');
if (el) el.textContent = `${rows.length} rows (diagnostic entry, no ranking).`;
if (rows.length > 0) {
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const h of ['slug', 'name', 'score']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  }
  table.appendChild(head);
  for (const r of rows) {
    const tr = document.createElement('tr');
    for (const k of ['slug', 'name', 'score']) {
      const td = document.createElement('td');
      td.textContent = String(r[k] ?? '');
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  document.body.appendChild(table);
}
