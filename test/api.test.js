const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.PG_MEM = '1';

const { app } = require('../netlify/functions/api');

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function request(server, method, path, body, token) {
  const addr = server.address();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Auth', () => {
  let server;
  before(async () => { server = await listen(app); });
  after(() => server.close());

  it('registers a user and returns a token', async () => {
    const res = await request(server, 'POST', '/auth/register', {
      name: 'Alice',
      email: 'alice@example.com',
      password: 'secret12',
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.equal(data.user.email, 'alice@example.com');
    assert.equal(data.user.name, 'Alice');
    assert.ok(!data.user.password_hash);
  });

  it('rejects invalid registration', async () => {
    const badEmail = await request(server, 'POST', '/auth/register', {
      email: 'nope',
      password: 'secret12',
    });
    assert.equal(badEmail.status, 400);
    const shortPw = await request(server, 'POST', '/auth/register', {
      email: 'x@y.com',
      password: '123',
    });
    assert.equal(shortPw.status, 400);
    const body = await shortPw.json();
    assert.ok(body.details.password);
  });

  it('rejects duplicate email with 409', async () => {
    const res = await request(server, 'POST', '/auth/register', {
      email: 'alice@example.com',
      password: 'secret12',
    });
    assert.equal(res.status, 409);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(server, 'POST', '/auth/login', {
      email: 'alice@example.com',
      password: 'secret12',
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
  });

  it('rejects wrong password', async () => {
    const res = await request(server, 'POST', '/auth/login', {
      email: 'alice@example.com',
      password: 'wrong1',
    });
    assert.equal(res.status, 401);
  });

  it('fetches /auth/me with token, 401 without', async () => {
    const unauth = await request(server, 'GET', '/auth/me');
    assert.equal(unauth.status, 401);

    const login = await (await request(server, 'POST', '/auth/login', {
      email: 'alice@example.com',
      password: 'secret12',
    })).json();

    const me = await request(server, 'GET', '/auth/me', undefined, login.token);
    assert.equal(me.status, 200);
    const user = await me.json();
    assert.equal(user.email, 'alice@example.com');
  });
});

describe('Contacts API (authenticated, per-user)', () => {
  let server;
  let token;
  let otherToken;
  before(async () => {
    server = await listen(app);

    const r1 = await (await request(server, 'POST', '/auth/register', {
      name: 'Alice', email: 'alice.contacts@example.com', password: 'secret12',
    })).json();
    const r2 = await (await request(server, 'POST', '/auth/register', {
      name: 'Bob', email: 'bob.contacts@example.com', password: 'secret12',
    })).json();
    token = r1.token;
    otherToken = r2.token;
  });
  after(() => server.close());

  it('returns 401 for unauthenticated contact calls', async () => {
    assert.equal((await request(server, 'GET', '/contacts')).status, 401);
    assert.equal((await request(server, 'POST', '/contacts', { name: 'x', phone: '123456' })).status, 401);
    assert.equal((await request(server, 'DELETE', '/contacts/1')).status, 401);
  });

  it('returns empty list on start', async () => {
    const res = await request(server, 'GET', '/contacts', undefined, token);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  it('creates a contact', async () => {
    const res = await request(server, 'POST', '/contacts', {
      name: 'Alice Smith', phone: '+1 555 010 2233', note: 'Work colleague',
    }, token);
    assert.equal(res.status, 201);
    const contact = await res.json();
    assert.ok(contact.id > 0);
    assert.equal(contact.name, 'Alice Smith');
    assert.ok(contact.created_at);
  });

  it('rejects missing name/phone with 400 + details', async () => {
    const res = await request(server, 'POST', '/contacts', { name: '', phone: '' }, token);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Validation failed');
    assert.ok(body.details.name);
    assert.ok(body.details.phone);
  });

  it('rejects invalid phone format', async () => {
    const res = await request(server, 'POST', '/contacts', { name: 'X', phone: '?????' }, token);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.details.phone);
  });

  it('isolates contacts between users', async () => {
    const aliceList = await (await request(server, 'GET', '/contacts', undefined, token)).json();
    assert.equal(aliceList.length, 1);

    const bobList = await (await request(server, 'GET', '/contacts', undefined, otherToken)).json();
    assert.equal(bobList.length, 0);
  });

  it('search filters by name, phone and note', async () => {
    const byName = await (await request(server, 'GET', '/contacts?q=alice', undefined, token)).json();
    assert.equal(byName.length, 1);
    assert.equal(byName[0].name, 'Alice Smith');

    const byPhone = await (await request(server, 'GET', '/contacts?q=2233', undefined, token)).json();
    assert.equal(byPhone.length, 1);

    const byNote = await (await request(server, 'GET', '/contacts?q=colleague', undefined, token)).json();
    assert.equal(byNote.length, 1);
  });

  it('cannot read another user contact -> 404', async () => {
    const aliceList = await (await request(server, 'GET', '/contacts', undefined, token)).json();
    const res = await request(server, 'GET', `/contacts/${aliceList[0].id}`, undefined, otherToken);
    assert.equal(res.status, 404);
  });

  it('gets a single contact', async () => {
    const all = await (await request(server, 'GET', '/contacts', undefined, token)).json();
    const res = await request(server, 'GET', `/contacts/${all[0].id}`, undefined, token);
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.equal(c.id, all[0].id);
  });

  it('returns 404 for missing contact', async () => {
    const res = await request(server, 'GET', '/contacts/99999', undefined, token);
    assert.equal(res.status, 404);
  });

  it('rejects invalid id with 400', async () => {
    const res = await request(server, 'GET', '/contacts/abc', undefined, token);
    assert.equal(res.status, 400);
  });

  it('updates a contact (PUT)', async () => {
    const all = await (await request(server, 'GET', '/contacts', undefined, token)).json();
    const res = await request(server, 'PUT', `/contacts/${all[0].id}`, {
      name: 'Alice', phone: '+1 555 000 111', note: 'Project lead',
    }, token);
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.equal(c.name, 'Alice');
    assert.equal(c.phone, '+1 555 000 111');
    assert.equal(c.note, 'Project lead');
  });

  it('partially updates a contact (PATCH)', async () => {
    const all = await (await request(server, 'GET', '/contacts', undefined, token)).json();
    const res = await request(server, 'PATCH', `/contacts/${all[0].id}`, { note: 'Only note changed' }, token);
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.equal(c.note, 'Only note changed');
    assert.equal(c.name, 'Alice');
  });

  it('rejects empty PATCH with 400', async () => {
    const all = await (await request(server, 'GET', '/contacts', undefined, token)).json();
    const res = await request(server, 'PATCH', `/contacts/${all[0].id}`, {}, token);
    assert.equal(res.status, 400);
  });

  it('deletes a contact (DELETE -> 204)', async () => {
    const all = await (await request(server, 'GET', '/contacts', undefined, token)).json();
    const res = await request(server, 'DELETE', `/contacts/${all[0].id}`, undefined, token);
    assert.equal(res.status, 204);

    const after = await (await request(server, 'GET', '/contacts', undefined, token)).json();
    assert.equal(after.length, all.length - 1);
  });

  it('delete missing contact -> 404', async () => {
    const res = await request(server, 'DELETE', '/contacts/99999', undefined, token);
    assert.equal(res.status, 404);
  });
});