const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.PG_MEM = '1';

const { app } = require('../netlify/functions/api');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function request(server, method, path, body) {
  const addr = server.address();
  const url = `http://127.0.0.1:${addr.port}${path}`;
  return fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Contacts API', () => {
  let server;

  before(async () => {
    server = await listen(app);
  });

  after(() => server.close());

  it('returns empty list on start', async () => {
    const res = await request(server, 'GET', '/contacts');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  it('creates a contact', async () => {
    const res = await request(server, 'POST', '/contacts', {
      name: 'Alice Smith',
      phone: '+1 555 010 2233',
      note: 'Work colleague',
    });
    assert.equal(res.status, 201);
    const contact = await res.json();
    assert.ok(contact.id > 0);
    assert.equal(contact.name, 'Alice Smith');
    assert.equal(contact.phone, '+1 555 010 2233');
    assert.equal(contact.note, 'Work colleague');
    assert.ok(contact.created_at);
  });

  it('trims whitespace and defaults note to empty', async () => {
    const res = await request(server, 'POST', '/contacts', {
      name: '  Bob  ',
      phone: '778-555-0100',
      note: '   ',
    });
    assert.equal(res.status, 201);
    const contact = await res.json();
    assert.equal(contact.name, 'Bob');
    assert.equal(contact.note, '');
  });

  it('rejects missing name/phone with 400 + details', async () => {
    const res = await request(server, 'POST', '/contacts', { name: '', phone: '' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Validation failed');
    assert.ok(body.details.name);
    assert.ok(body.details.phone);
  });

  it('rejects invalid phone format', async () => {
    const res = await request(server, 'POST', '/contacts', { name: 'X', phone: '?????' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.details.phone);
  });

  it('lists contacts newest first', async () => {
    const res = await request(server, 'GET', '/contacts');
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.equal(list.length, 2);
    assert.equal(list[0].name, 'Bob');
    assert.equal(list[1].name, 'Alice Smith');
  });

  it('search filters by name, phone and note', async () => {
    const byName = await (await request(server, 'GET', '/contacts?q=bob')).json();
    assert.equal(byName.length, 1);
    assert.equal(byName[0].name, 'Bob');

    const byPhone = await (await request(server, 'GET', '/contacts?q=2233')).json();
    assert.equal(byPhone.length, 1);
    assert.equal(byPhone[0].name, 'Alice Smith');

    const byNote = await (await request(server, 'GET', '/contacts?q=colleague')).json();
    assert.equal(byNote.length, 1);
  });

  it('gets a single contact', async () => {
    const all = await (await request(server, 'GET', '/contacts')).json();
    const res = await request(server, 'GET', `/contacts/${all[0].id}`);
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.equal(c.id, all[0].id);
  });

  it('returns 404 for missing contact', async () => {
    const res = await request(server, 'GET', '/contacts/99999');
    assert.equal(res.status, 404);
  });

  it('rejects invalid id with 400', async () => {
    const res = await request(server, 'GET', '/contacts/abc');
    assert.equal(res.status, 400);
  });

  it('updates a contact (PUT)', async () => {
    const all = await (await request(server, 'GET', '/contacts')).json();
    const res = await request(server, 'PUT', `/contacts/${all[1].id}`, {
      name: 'Alice',
      phone: '+1 555 000 111',
      note: 'Project lead',
    });
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.equal(c.name, 'Alice');
    assert.equal(c.phone, '+1 555 000 111');
    assert.equal(c.note, 'Project lead');
  });

  it('partially updates a contact (PATCH)', async () => {
    const all = await (await request(server, 'GET', '/contacts')).json();
    const res = await request(server, 'PATCH', `/contacts/${all[1].id}`, { note: 'Only note changed' });
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.equal(c.note, 'Only note changed');
    assert.equal(c.name, 'Alice');
  });

  it('deletes a contact (DELETE -> 204)', async () => {
    const all = await (await request(server, 'GET', '/contacts')).json();
    const res = await request(server, 'DELETE', `/contacts/${all[0].id}`);
    assert.equal(res.status, 204);

    const after = await (await request(server, 'GET', '/contacts')).json();
    assert.equal(after.length, all.length - 1);
  });

  it('delete missing contact -> 404', async () => {
    const res = await request(server, 'DELETE', '/contacts/99999');
    assert.equal(res.status, 404);
  });
});