import { env } from 'cloudflare:workers';
import { hasValidSession } from '../../lib/password-auth';

type LabUser = {
  id: string;
  email: string;
  name: string;
};

const labUsers = ['Stamatis Argyroudis', 'Marc Parrilla', 'Antonio Dominguez-Alfaro'];
const equipmentOptions = ['3D Printer - Asiga MAX X27', '3D Printer - Elegoo Mars 5 Ultra', 'Optical Microscope - Zeiss Primotech', 'Potentiostat'];
let schemaPromise: Promise<void> | null = null;
let seedPromise: Promise<void> | null = null;

function getUser(request: Request): LabUser {
  const id = request.headers.get('oai-authenticated-user-id') || 'public-guest';
  const email = request.headers.get('oai-authenticated-user-email') || 'guest@printedbioelectronics.lab';
  const encodedName = request.headers.get('oai-authenticated-user-full-name');
  const name = encodedName && request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8'
    ? decodeURIComponent(encodedName)
    : email === 'guest@printedbioelectronics.lab' ? 'Guest' : email.split('@')[0].replace(/[._-]+/g, ' ');

  return { id, email, name };
}

function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        tag TEXT NOT NULL DEFAULT '#lab-notes',
        author_id TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        title TEXT NOT NULL,
        equipment TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_bookings_equipment_date ON bookings(equipment, booking_date)'),
    ]);
  })();
  schemaPromise.catch(() => { schemaPromise = null; });
  return schemaPromise;
}

async function seedExamples(user: LabUser) {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM bookings WHERE booking_date >= '2026-01-01' AND booking_date <= '2036-12-31'").first<{ count: number }>();
  if (Number(count?.count || 0) > 0) return;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO bookings (booking_date, start_time, end_time, title, equipment, owner_id, owner_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind('2026-01-14', '09:00', '11:00', '3D Printer - Asiga MAX X27', '3D Printer - Asiga MAX X27', user.id, labUsers[0], now),
    env.DB.prepare('INSERT INTO bookings (booking_date, start_time, end_time, title, equipment, owner_id, owner_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind('2026-01-14', '10:30', '12:00', 'Optical Microscope - Zeiss Primotech', 'Optical Microscope - Zeiss Primotech', 'team-marc', labUsers[1], now),
    env.DB.prepare('INSERT INTO notes (title, body, tag, author_id, author_email, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind('Lab log · Today', 'The 14:00 read looks cleaner than yesterday. Need to repeat the dilution series before committing the next batch.', '#crisper-screen', user.id, user.email, user.name, now, now),
  ]);
  })();
  seedPromise.catch(() => { seedPromise = null; });
  return seedPromise;
}

export async function GET(request: Request) {
  if (!(await hasValidSession(request))) return Response.json({ error: 'Password required.' }, { status: 401 });
  const user = getUser(request);
  try {
    await ensureSchema();
    await seedExamples(user);
    const query = new URL(request.url).searchParams;
    const requestedMonth = query.get('month');
    const requestedDate = query.get('date') || '2026-01-14';
    const year = Number((requestedMonth || requestedDate).slice(0, 4));
    if (requestedMonth && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) || year < 2026 || year > 2036)) {
      return Response.json({ error: 'Bookings are available from 2026 through 2036.' }, { status: 400 });
    }
    if (!requestedMonth && (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || year < 2026 || year > 2036)) {
      return Response.json({ error: 'Bookings are available from 2026 through 2036.' }, { status: 400 });
    }
    const bookingRows = requestedMonth
      ? await env.DB.prepare('SELECT id, booking_date as bookingDate, start_time as time, end_time as end, title, equipment, owner_name as owner FROM bookings WHERE booking_date LIKE ? ORDER BY booking_date, start_time').bind(`${requestedMonth}-%`).all()
      : await env.DB.prepare('SELECT id, booking_date as bookingDate, start_time as time, end_time as end, title, equipment, owner_name as owner FROM bookings WHERE booking_date = ? ORDER BY start_time').bind(requestedDate).all();
    return Response.json({ user, bookings: bookingRows.results, notes: [] });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'The shared lab database is unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await hasValidSession(request))) return Response.json({ error: 'Password required.' }, { status: 401 });
  const user = getUser(request);
  try {
    const body = await request.json() as { type?: string; title?: string; body?: string; tag?: string; date?: string; time?: string; end?: string; equipment?: string; ownerName?: string };
    await ensureSchema();
    const now = new Date().toISOString();
    if (body.type === 'note') {
      if (!body.body?.trim()) return Response.json({ error: 'Note text is required.' }, { status: 400 });
      await env.DB.prepare('INSERT INTO notes (title, body, tag, author_id, author_email, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(body.title || 'Lab note', body.body.trim(), body.tag || '#lab-notes', user.id, user.email, user.name, now, now).run();
      return Response.json({ ok: true });
    }
    if (body.type === 'booking') {
      const date = body.date || '2026-01-14';
      const year = Number(date.slice(0, 4));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || year < 2026 || year > 2036) {
        return Response.json({ error: 'Bookings are available from 2026 through 2036.' }, { status: 400 });
      }
      const start = body.time || '16:00';
      const end = body.end || '17:00';
      const ownerName = body.ownerName?.trim() || user.name;
      const equipment = body.equipment?.trim() || '';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start < '09:00' || end > '21:00' || end <= start) return Response.json({ error: 'Choose a time window between 09:00 and 21:00.' }, { status: 400 });
      if (!ownerName || !equipment) return Response.json({ error: 'Choose a user and equipment before confirming the booking.' }, { status: 400 });
      const title = equipment;
      const result = await env.DB.prepare(`INSERT INTO bookings (booking_date, start_time, end_time, title, equipment, owner_id, owner_name, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM bookings WHERE booking_date = ? AND equipment = ? AND start_time < ? AND end_time > ?
        )`).bind(date, start, end, title, equipment, user.id, ownerName, now, date, equipment, end, start).run();
      if (!result.meta.changes) return Response.json({ error: `That equipment is already booked during ${start}–${end}.` }, { status: 409 });
      return Response.json({ ok: true, id: result.meta.last_row_id });
    }
    return Response.json({ error: 'Unsupported request.' }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Could not save the shared lab record.' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!(await hasValidSession(request))) return Response.json({ error: 'Password required.' }, { status: 401 });
  try {
    await ensureSchema();
    const body = await request.json() as { id?: number; date?: string; time?: string; end?: string; equipment?: string; ownerName?: string };
    const id = Number(body.id);
    const date = body.date || '';
    const start = body.time || '';
    const end = body.end || '';
    const ownerName = body.ownerName?.trim() || '';
    const equipment = body.equipment?.trim() || '';
    const year = Number(date.slice(0, 4));
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || year < 2026 || year > 2036 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start < '09:00' || end > '21:00' || end <= start) return Response.json({ error: 'Choose a time window between 09:00 and 21:00.' }, { status: 400 });
    if (!ownerName || !equipment) return Response.json({ error: 'Choose a user and equipment before saving the booking.' }, { status: 400 });
    const conflict = await env.DB.prepare('SELECT id FROM bookings WHERE booking_date = ? AND equipment = ? AND id != ? AND start_time < ? AND end_time > ? LIMIT 1').bind(date, equipment, id, end, start).first();
    if (conflict) return Response.json({ error: `That equipment is already booked during ${start}–${end}.` }, { status: 409 });
    const result = await env.DB.prepare('UPDATE bookings SET booking_date = ?, start_time = ?, end_time = ?, title = ?, equipment = ?, owner_name = ? WHERE id = ?').bind(date, start, end, equipment, equipment, ownerName, id).run();
    if (!result.meta.changes) return Response.json({ error: 'That booking could not be found.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Could not update the shared booking.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!(await hasValidSession(request))) return Response.json({ error: 'Password required.' }, { status: 401 });
  try {
    await ensureSchema();
    const body = await request.json() as { id?: number };
    const id = Number(body.id);
    if (!id) return Response.json({ error: 'Booking not found.' }, { status: 400 });
    const result = await env.DB.prepare('DELETE FROM bookings WHERE id = ?').bind(id).run();
    return Response.json({ ok: true, alreadyDeleted: !result.meta.changes });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Could not delete the shared booking.' }, { status: 503 });
  }
}
