const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "agenda-fluxo-secret";
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const IS_SERVERLESS =
  process.env.VERCEL === "1" ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY === "true";
const DEFAULT_DB = { users: [], calendars: [], events: [], passwordResets: [], reminderLogs: [] };
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});
let memoryDb = JSON.parse(JSON.stringify(DEFAULT_DB));
let persistQueue = Promise.resolve();
const STATUS_COLORS = {
  pendente: "#3b82f6",
  atrasado: "#ef4444",
  concluido: "#22c55e",
  entrega_tecnica_finalizada: "#a855f7",
};

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
const appReady = ensureDb().then(() => {
  startReminderScheduler(!IS_SERVERLESS);
});
app.use(async (_req, _res, next) => {
  try {
    await appReady;
    next();
  } catch (error) {
    next(error);
  }
});

async function ensureDb() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL nao configurada. Configure PostgreSQL para iniciar a aplicacao.");
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);
  const result = await pool.query("SELECT data FROM app_state WHERE id = 1");
  if (!result.rows.length) {
    await pool.query("INSERT INTO app_state (id, data) VALUES (1, $1::jsonb)", [JSON.stringify(DEFAULT_DB)]);
    memoryDb = JSON.parse(JSON.stringify(DEFAULT_DB));
  } else {
    memoryDb = normalizeDb(result.rows[0].data || {});
    await persistState();
  }
  console.log("Banco: PostgreSQL");
}

function readDb() {
  return JSON.parse(JSON.stringify(memoryDb));
}

function writeDb(db) {
  memoryDb = normalizeDb(db);
  persistQueue = persistQueue
    .then(() => persistState())
    .catch((error) => console.error("Erro ao persistir no PostgreSQL:", error));
}

async function persistState() {
  await pool.query(
    `
      INSERT INTO app_state (id, data)
      VALUES (1, $1::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
    `,
    [JSON.stringify(memoryDb)],
  );
}

function normalizeDb(rawDb) {
  const db = {
    users: Array.isArray(rawDb.users) ? rawDb.users : [],
    calendars: Array.isArray(rawDb.calendars) ? rawDb.calendars : [],
    events: Array.isArray(rawDb.events) ? rawDb.events : [],
    passwordResets: Array.isArray(rawDb.passwordResets) ? rawDb.passwordResets : [],
    reminderLogs: Array.isArray(rawDb.reminderLogs) ? rawDb.reminderLogs : [],
  };
  db.events = db.events.map((event) => {
    const status = normalizeStatusWithColor(event.status, event.color);
    const description = String(event.description || event.reminderMessage || "").trim();
    return {
      ...event,
      status,
      color: STATUS_COLORS[status] || STATUS_COLORS.pendente,
      description,
      reminderMessage: description,
    };
  });
  return db;
}

function makeToken(user) {
  return jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Token ausente." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Token invalido." });
  }
}

function getOwnedAndSharedCalendarIds(db, userId) {
  return db.calendars
    .filter((cal) => cal.ownerId === userId || (cal.sharedWith || []).includes(userId))
    .map((cal) => cal.id);
}

app.post("/api/auth/register", async (req, res) => {
  const { email, username, password } = req.body || {};
  if (!email || !username || !password) return res.status(400).json({ message: "Dados invalidos." });
  const db = readDb();
  const exists = db.users.some((u) => u.username.toLowerCase() === username.toLowerCase());
  if (exists) return res.status(409).json({ message: "Usuario ja existe." });
  const emailExists = db.users.some(
    (u) => typeof u.email === "string" && u.email.toLowerCase() === email.toLowerCase(),
  );
  if (emailExists) return res.status(409).json({ message: "E-mail ja cadastrado." });

  const user = {
    id: uuidv4(),
    email: email.trim().toLowerCase(),
    username: username.trim(),
    passwordHash: await bcrypt.hash(password, 10),
  };
  db.users.push(user);

  const calendar = {
    id: uuidv4(),
    name: `Agenda de ${user.username}`,
    ownerId: user.id,
    sharedWith: [],
  };
  db.calendars.push(calendar);
  writeDb(db);

  return res.json({
    token: makeToken(user),
    user: { id: user.id, username: user.username, calendarId: calendar.id },
  });
});

app.post("/api/auth/request-reset", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ message: "Informe um e-mail valido." });
  const db = readDb();
  const user = db.users.find((u) => typeof u.email === "string" && u.email.toLowerCase() === email);
  if (!user) {
    return res.json({ ok: true });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 15 * 60 * 1000;
  db.passwordResets = db.passwordResets.filter((item) => item.email !== email);
  db.passwordResets.push({ id: uuidv4(), email, code, expiresAt, used: false });
  writeDb(db);

  const sent = await sendResetCodeEmail(email, code);
  if (!sent) {
    console.log(`[DEV] Codigo de recuperacao para ${email}: ${code}`);
    return res.json({
      ok: true,
      devCode: code,
      message: "SMTP nao configurado. Codigo exibido apenas para desenvolvimento.",
    });
  }
  return res.json({ ok: true });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  const newPassword = String(req.body?.newPassword || "");

  if (!email || !code || !newPassword) {
    return res.status(400).json({ message: "Dados invalidos para redefinir senha." });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ message: "A nova senha precisa ter ao menos 4 caracteres." });
  }

  const db = readDb();
  const user = db.users.find((u) => typeof u.email === "string" && u.email.toLowerCase() === email);
  if (!user) return res.status(404).json({ message: "Conta nao encontrada." });

  const reset = db.passwordResets.find(
    (item) => item.email === email && item.code === code && !item.used,
  );
  if (!reset) return res.status(400).json({ message: "Codigo invalido." });
  if (Date.now() > reset.expiresAt) {
    return res.status(400).json({ message: "Codigo expirado. Solicite outro." });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  reset.used = true;
  db.passwordResets = db.passwordResets.filter((item) => item.id === reset.id || item.email !== email);
  writeDb(db);
  return res.json({ ok: true });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ message: "Dados invalidos." });
  const db = readDb();
  const user = db.users.find((u) => typeof u.email === "string" && u.email.toLowerCase() === email);
  if (!user) return res.status(401).json({ message: "Credenciais invalidas." });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ message: "Credenciais invalidas." });

  const calendar = db.calendars.find((c) => c.ownerId === user.id);
  return res.json({
    token: makeToken(user),
    user: { id: user.id, username: user.username, calendarId: calendar?.id || null },
  });
});

app.get("/api/events", authMiddleware, (req, res) => {
  const db = readDb();
  const calendarIds = getOwnedAndSharedCalendarIds(db, req.user.userId);
  let changed = false;
  const events = db.events
    .filter((event) => calendarIds.includes(event.calendarId))
    .map((event) => {
      const status = normalizeStatusWithColor(event.status, event.color);
      const description = String(event.description || event.reminderMessage || "").trim();
      const next = {
        ...event,
        status,
        color: STATUS_COLORS[status] || STATUS_COLORS.pendente,
        description,
        reminderMessage: description,
      };
      if (
        event.status !== next.status ||
        event.color !== next.color ||
        String(event.description || "") !== description ||
        String(event.reminderMessage || "") !== description
      ) {
        changed = true;
      }
      return next;
    })
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  if (changed) {
    db.events = db.events.map((event) => {
      if (!calendarIds.includes(event.calendarId)) return event;
      const fixed = events.find((item) => item.id === event.id);
      return fixed || event;
    });
    writeDb(db);
  }
  res.json({ events });
});

app.post("/api/events", authMiddleware, (req, res) => {
  const db = readDb();
  const ownCalendar = db.calendars.find((cal) => cal.ownerId === req.user.userId);
  if (!ownCalendar) return res.status(404).json({ message: "Agenda principal nao encontrada." });
  const normalizedStatus = normalizeStatusWithColor(req.body.status, req.body.color);

  const baseEvent = {
    id: uuidv4(),
    calendarId: ownCalendar.id,
    title: req.body.title || "Sem titulo",
    date: req.body.date,
    start: req.body.start,
    end: req.body.end,
    color: STATUS_COLORS[normalizedStatus] || STATUS_COLORS.pendente,
    repeat: req.body.repeat || "none",
    status: normalizedStatus,
    reminderMinutes: Number(req.body.reminderMinutes || 0),
    description: String(req.body.description || req.body.reminderMessage || "").trim().slice(0, 180),
    reminderMessage: String(req.body.description || req.body.reminderMessage || "").trim().slice(0, 180),
    reminderSentAt: null,
    createdBy: req.user.userId,
    recurrenceGroupId: uuidv4(),
  };
  const events = expandRecurringEvents(baseEvent);
  db.events.push(...events);
  writeDb(db);
  res.status(201).json({ event: events[0], createdInstances: events.length });
});

app.put("/api/events/:id", authMiddleware, (req, res) => {
  const db = readDb();
  const calendarIds = getOwnedAndSharedCalendarIds(db, req.user.userId);
  const idx = db.events.findIndex((event) => event.id === req.params.id && calendarIds.includes(event.calendarId));
  if (idx < 0) return res.status(404).json({ message: "Evento nao encontrado." });

  const current = db.events[idx];
  const normalizedStatus = normalizeStatusWithColor(req.body.status, req.body.color);
  db.events[idx] = {
    ...db.events[idx],
    title: req.body.title,
    date: req.body.date,
    start: req.body.start,
    end: req.body.end,
    color: STATUS_COLORS[normalizedStatus] || STATUS_COLORS.pendente,
    repeat: req.body.repeat || "none",
    status: normalizedStatus,
    reminderMinutes: Number(req.body.reminderMinutes || 0),
    description: String(req.body.description || req.body.reminderMessage || "").trim().slice(0, 180),
    reminderMessage: String(req.body.description || req.body.reminderMessage || "").trim().slice(0, 180),
    reminderSentAt: null,
    recurrenceGroupId: current.recurrenceGroupId || uuidv4(),
  };
  writeDb(db);
  res.json({ event: db.events[idx] });
});

app.delete("/api/events/:id", authMiddleware, (req, res) => {
  const db = readDb();
  const calendarIds = getOwnedAndSharedCalendarIds(db, req.user.userId);
  const before = db.events.length;
  db.events = db.events.filter((event) => !(event.id === req.params.id && calendarIds.includes(event.calendarId)));
  if (db.events.length === before) return res.status(404).json({ message: "Evento nao encontrado." });
  writeDb(db);
  res.json({ ok: true });
});

app.post("/api/share", authMiddleware, (req, res) => {
  const targetEmail = String(req.body?.targetEmail || "")
    .trim()
    .toLowerCase();
  if (!targetEmail) return res.status(400).json({ message: "E-mail alvo invalido." });
  const db = readDb();

  const ownerCalendar = db.calendars.find((cal) => cal.ownerId === req.user.userId);
  if (!ownerCalendar) return res.status(404).json({ message: "Agenda nao encontrada." });
  const targetUser = db.users.find((u) => typeof u.email === "string" && u.email.toLowerCase() === targetEmail);
  if (!targetUser) return res.status(404).json({ message: "E-mail nao encontrado." });
  if (targetUser.id === req.user.userId) return res.status(400).json({ message: "Nao pode compartilhar com voce mesmo." });

  ownerCalendar.sharedWith = ownerCalendar.sharedWith || [];
  if (!ownerCalendar.sharedWith.includes(targetUser.id)) {
    ownerCalendar.sharedWith.push(targetUser.id);
  }
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/ics/export", authMiddleware, (req, res) => {
  const db = readDb();
  const calendarIds = getOwnedAndSharedCalendarIds(db, req.user.userId);
  const events = db.events.filter((event) => calendarIds.includes(event.calendarId));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Agenda Fluxo//PT-BR//"];

  events.forEach((event) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.id}`);
    lines.push(`DTSTAMP:${toIcsDateTime(new Date())}`);
    lines.push(`DTSTART:${toIcsDateTime(new Date(`${event.date}T${event.start}:00`))}`);
    lines.push(`DTEND:${toIcsDateTime(new Date(`${event.date}T${event.end}:00`))}`);
    lines.push(`SUMMARY:${escapeIcs(event.title || "Sem titulo")}`);
    if (event.repeat === "daily") lines.push("RRULE:FREQ=DAILY");
    if (event.repeat === "weekly") lines.push("RRULE:FREQ=WEEKLY");
    if (event.repeat === "monthly") lines.push("RRULE:FREQ=MONTHLY");
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  res.json({ icsText: lines.join("\r\n") });
});

app.post("/api/ics/import", authMiddleware, (req, res) => {
  const text = req.body?.icsText || "";
  const db = readDb();
  const ownCalendar = db.calendars.find((cal) => cal.ownerId === req.user.userId);
  if (!ownCalendar) return res.status(404).json({ message: "Agenda principal nao encontrada." });
  const imported = parseIcs(text);
  imported.forEach((item) => {
    db.events.push({
      id: uuidv4(),
      calendarId: ownCalendar.id,
      title: item.title,
      date: item.date,
      start: item.start,
      end: item.end,
      color: "#1a73e8",
      repeat: item.repeat,
      reminderMinutes: 10,
      reminderSentAt: null,
      createdBy: req.user.userId,
    });
  });
  writeDb(db);
  res.json({ imported: imported.length });
});

if (require.main === module) {
  appReady
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Agenda Fluxo rodando em http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Falha ao iniciar aplicacao:", error);
      process.exit(1);
    });
}

function normalizeStatus(value) {
  const status = String(value || "pendente")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
  const aliases = {
    em_atraso: "atrasado",
    concluído: "concluido",
    entrega_técnica_finalizada: "entrega_tecnica_finalizada",
  };
  const normalized = aliases[status] || status;
  const allowed = [
    "pendente",
    "atrasado",
    "concluido",
    "entrega_tecnica_finalizada",
  ];
  return allowed.includes(normalized) ? normalized : "pendente";
}

function normalizeStatusWithColor(statusValue, colorValue) {
  const fromStatus = normalizeStatus(statusValue);
  if (String(statusValue || "").trim()) return fromStatus;

  const color = String(colorValue || "").trim().toLowerCase();
  const pair = Object.entries(STATUS_COLORS).find(([, hex]) => hex.toLowerCase() === color);
  if (pair) return pair[0];
  return "pendente";
}

function expandRecurringEvents(baseEvent) {
  const repeat = baseEvent.repeat || "none";
  if (repeat === "none") {
    return [{ ...baseEvent, instance: false }];
  }

  const limits = { daily: 30, weekly: 16, monthly: 12 };
  const count = limits[repeat] || 1;
  const items = [];
  const origin = parseDateParts(baseEvent.date);

  for (let i = 0; i < count; i += 1) {
    const nextDate = new Date(origin.year, origin.month - 1, origin.day);
    if (repeat === "daily") nextDate.setDate(nextDate.getDate() + i);
    if (repeat === "weekly") nextDate.setDate(nextDate.getDate() + i * 7);
    if (repeat === "monthly") nextDate.setMonth(nextDate.getMonth() + i);

    items.push({
      ...baseEvent,
      id: i === 0 ? baseEvent.id : uuidv4(),
      date: toDateOnly(nextDate),
      instance: true,
    });
  }
  return items;
}

function toDateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function parseDateParts(dateText) {
  const [year, month, day] = String(dateText)
    .split("-")
    .map(Number);
  return { year, month, day };
}

function startReminderScheduler(enableInterval = true) {
  const run = () => {
    const db = readDb();
    const now = new Date();
    let changed = false;
    for (const event of db.events) {
      if (event.status === "concluido" || event.status === "entrega_tecnica_finalizada") continue;
      const startAt = new Date(`${event.date}T${event.start}:00`);
      const endAt = new Date(`${event.date}T${event.end}:00`);

      // IA simples: se passou do horario final, marca como atrasado automaticamente.
      if (now > endAt && event.status === "pendente") {
        event.status = "atrasado";
        event.color = STATUS_COLORS.atrasado;
        changed = true;
      }

      const remindAt = new Date(startAt.getTime() - Number(event.reminderMinutes || 0) * 60 * 1000);
      if (now >= remindAt && now < startAt && !event.reminderSentAt) {
        event.reminderSentAt = now.toISOString();
        db.reminderLogs = db.reminderLogs || [];
        db.reminderLogs.push({
          id: uuidv4(),
          eventId: event.id,
          firedAt: now.toISOString(),
          title: event.title,
          reminderMessage: event.description || event.reminderMessage || "",
        });
        console.log(`Lembrete disparado: ${event.title} - ${event.reminderMessage || "sem mensagem"}`);
        changed = true;
      }
    }
    if (changed) writeDb(db);
  };

  run();
  if (enableInterval) {
    setInterval(run, 60 * 1000);
  }
}

function escapeIcs(text) {
  return String(text).replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function toIcsDateTime(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function parseIcs(text) {
  const lines = String(text).split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT" && current?.start && current?.end) {
      events.push(current);
      current = null;
    } else if (current && line.startsWith("SUMMARY:")) {
      current.title = line.slice(8).trim() || "Sem titulo";
    } else if (current && line.startsWith("DTSTART:")) {
      const value = line.slice(8).trim();
      const parsed = parseIcsDate(value);
      current.date = parsed.date;
      current.start = parsed.time;
    } else if (current && line.startsWith("DTEND:")) {
      const value = line.slice(6).trim();
      const parsed = parseIcsDate(value);
      current.end = parsed.time;
    } else if (current && line.startsWith("RRULE:")) {
      const rule = line.slice(6).toUpperCase();
      if (rule.includes("FREQ=DAILY")) current.repeat = "daily";
      else if (rule.includes("FREQ=WEEKLY")) current.repeat = "weekly";
      else if (rule.includes("FREQ=MONTHLY")) current.repeat = "monthly";
      else current.repeat = "none";
    }
  }

  return events.map((event) => ({
    title: event.title || "Sem titulo",
    date: event.date,
    start: event.start || "09:00",
    end: event.end || "10:00",
    repeat: event.repeat || "none",
  }));
}

function parseIcsDate(raw) {
  const clean = raw.replace("Z", "");
  const year = Number(clean.slice(0, 4));
  const month = Number(clean.slice(4, 6)) - 1;
  const day = Number(clean.slice(6, 8));
  const hour = Number(clean.slice(9, 11));
  const minute = Number(clean.slice(11, 13));
  const date = new Date(Date.UTC(year, month, day, hour, minute));
  const local = new Date(date);
  return {
    date: `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(
      local.getDate(),
    ).padStart(2, "0")}`,
    time: `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`,
  };
}

async function sendResetCodeEmail(email, code) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.FROM_EMAIL || user;

  if (!host || !user || !pass || !from) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: email,
    subject: "Codigo de recuperacao - Agenda Fluxo",
    text: `Seu codigo de recuperacao e: ${code}\n\nEle expira em 15 minutos.`,
    html: `<p>Seu codigo de recuperacao e: <strong>${code}</strong></p><p>Ele expira em 15 minutos.</p>`,
  });
  return true;
}

module.exports = app;
