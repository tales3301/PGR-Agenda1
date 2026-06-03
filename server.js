require("dotenv").config();

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
const DEFAULT_DB = {
  users: [],
  calendars: [],
  events: [],
  companies: [],
  passwordResets: [],
  reminderLogs: [],
};
const USE_POSTGRES = Boolean(DATABASE_URL);
const pool = USE_POSTGRES
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    })
  : null;
let memoryDb = JSON.parse(JSON.stringify(DEFAULT_DB));
let persistQueue = Promise.resolve();
const STATUS_COLORS = {
  pendente: "#3b82f6",
  atrasado: "#ef4444",
  concluido: "#22c55e",
  entrega_tecnica_finalizada: "#a855f7",
};
const SUPER_ADMIN_USERNAME = "jidean";

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
  if (!USE_POSTGRES) {
    memoryDb = JSON.parse(JSON.stringify(DEFAULT_DB));
    console.warn("DATABASE_URL nao configurada. Rodando em modo local (memoria).");
    return;
  }
  try {
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
  } catch (error) {
    memoryDb = JSON.parse(JSON.stringify(DEFAULT_DB));
    console.error("Falha ao conectar no PostgreSQL. Subindo em modo memoria.", error.message || error);
    console.warn("Revise DATABASE_URL no Render/Supabase.");
  }
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
  if (!USE_POSTGRES || !pool) return;
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
    companies: Array.isArray(rawDb.companies) ? rawDb.companies : [],
    passwordResets: Array.isArray(rawDb.passwordResets) ? rawDb.passwordResets : [],
    reminderLogs: Array.isArray(rawDb.reminderLogs) ? rawDb.reminderLogs : [],
  };
  db.calendars = db.calendars.map((calendar) => ({
    ...calendar,
    sharedWith: Array.isArray(calendar.sharedWith) ? calendar.sharedWith : [],
    sharedWithEmails: Array.isArray(calendar.sharedWithEmails)
      ? calendar.sharedWithEmails.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [],
  }));
  db.events = db.events.map((event) => {
    const status = normalizeStatusWithColor(event.status, event.color);
    const description = String(event.description || event.reminderMessage || "").trim();
    return {
      ...event,
      status,
      color: STATUS_COLORS[status] || STATUS_COLORS.pendente,
      description,
      reminderMessage: description,
      responsible: String(event.responsible || "").trim(),
      completedAt: event.completedAt || null,
      completedOnTime:
        typeof event.completedOnTime === "boolean" ? event.completedOnTime : event.completedOnTime == null ? null : !!event.completedOnTime,
    };
  });
  db.companies = db.companies.map((company) => ({
    ...company,
    name: String(company.name || "").trim().slice(0, 80),
    cnpj: String(company.cnpj || "").trim().slice(0, 18),
    address: String(company.address || "").trim().slice(0, 120),
    location: String(company.location || "").trim().slice(0, 120),
    contactName: String(company.contactName || "").trim().slice(0, 80),
    contactPhone: String(company.contactPhone || "").trim().slice(0, 20),
    contactEmail: String(company.contactEmail || "")
      .trim()
      .toLowerCase()
      .slice(0, 120),
    responsible: String(company.responsible || "").trim().slice(0, 80),
  }));
  return db;
}

function normalizeCompanyPayload(payload = {}) {
  return {
    name: String(payload.name || "").trim().slice(0, 80),
    cnpj: String(payload.cnpj || "").trim().slice(0, 18),
    address: String(payload.address || "").trim().slice(0, 120),
    location: String(payload.location || "").trim().slice(0, 120),
    contactName: String(payload.contactName || "").trim().slice(0, 80),
    contactPhone: String(payload.contactPhone || "").trim().slice(0, 20),
    contactEmail: String(payload.contactEmail || "")
      .trim()
      .toLowerCase()
      .slice(0, 120),
    responsible: String(payload.responsible || "").trim().slice(0, 80),
  };
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

function normalizePersonName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isSuperAdminUsername(username) {
  return normalizePersonName(username) === normalizePersonName(SUPER_ADMIN_USERNAME);
}

function isSuperAdminUser(db, userId, usernameFromToken = "") {
  const user = db.users.find((item) => item.id === userId);
  const username = String(user?.username || usernameFromToken || "").trim();
  return isSuperAdminUsername(username);
}

function getOwnedAndSharedCalendarIds(db, userId) {
  const user = db.users.find((item) => item.id === userId);
  const userEmail = String(user?.email || "")
    .trim()
    .toLowerCase();
  return db.calendars
    .filter(
      (cal) =>
        cal.ownerId === userId ||
        (cal.sharedWith || []).includes(userId) ||
        (!!userEmail && (cal.sharedWithEmails || []).includes(userEmail)),
    )
    .map((cal) => cal.id);
}

function hasCalendarAccess(db, userId, calendarId) {
  return getOwnedAndSharedCalendarIds(db, userId).includes(calendarId);
}

function isUserResponsibleForEvent(db, userId, event) {
  const user = db.users.find((item) => item.id === userId);
  if (!user) return false;
  const username = normalizePersonName(user.username);
  const responsible = normalizePersonName(event?.responsible);
  if (!username || !responsible) return false;
  if (username === responsible) return true;
  if (username.length >= 3 && responsible.includes(username)) return true;
  if (responsible.length >= 3 && username.includes(responsible)) return true;
  return false;
}

function canFullEditEvent(db, viewerUserId, viewerUsername, event) {
  if (isSuperAdminUser(db, viewerUserId, viewerUsername)) return true;
  return hasCalendarAccess(db, viewerUserId, event.calendarId);
}

function canEditEventStatus(db, viewerUserId, viewerUsername, event) {
  if (canFullEditEvent(db, viewerUserId, viewerUsername, event)) return true;
  return isUserResponsibleForEvent(db, viewerUserId, event);
}

function getAgendaEventsForUser(db, userId) {
  const calendar = db.calendars.find((item) => item.ownerId === userId);
  const calendarIds = calendar ? [calendar.id] : [];
  const merged = new Map();
  db.events.forEach((event) => {
    if (calendarIds.includes(event.calendarId) || isUserResponsibleForEvent(db, userId, event)) {
      merged.set(event.id, event);
    }
  });
  return Array.from(merged.values());
}

function getMergedEventsForViewer(db, viewerUserId) {
  const calendarIds = getOwnedAndSharedCalendarIds(db, viewerUserId);
  const merged = new Map();
  db.events.forEach((event) => {
    if (calendarIds.includes(event.calendarId) || isUserResponsibleForEvent(db, viewerUserId, event)) {
      merged.set(event.id, event);
    }
  });
  return Array.from(merged.values());
}

function findEventIndex(db, eventId) {
  return db.events.findIndex((event) => event.id === eventId);
}

function getCalendarOwnerInfo(db, calendarId) {
  const calendar = db.calendars.find((item) => item.id === calendarId);
  if (!calendar) {
    return { ownerId: null, ownerUsername: null, calendarName: null };
  }
  const owner = db.users.find((item) => item.id === calendar.ownerId);
  return {
    ownerId: calendar.ownerId,
    ownerUsername: String(owner?.username || "").trim() || null,
    calendarName: String(calendar.name || "").trim() || null,
  };
}

function mapEventForResponse(db, event, viewerUserId, viewerUsername) {
  const status = normalizeStatusWithColor(event.status, event.color);
  const description = String(event.description || event.reminderMessage || "").trim();
  const owner = getCalendarOwnerInfo(db, event.calendarId);
  const canFullEdit = canFullEditEvent(db, viewerUserId, viewerUsername, event);
  const canEditStatusOnly = !canFullEdit && canEditEventStatus(db, viewerUserId, viewerUsername, event);
  return {
    ...event,
    status,
    color: STATUS_COLORS[status] || STATUS_COLORS.pendente,
    description,
    reminderMessage: description,
    ownerId: owner.ownerId,
    ownerUsername: owner.ownerUsername,
    calendarName: owner.calendarName,
    isAssignedToMe: isUserResponsibleForEvent(db, viewerUserId, event),
    canFullEdit,
    canEditStatusOnly,
  };
}

function ensureOwnCalendar(db, userId, fallbackUsername = "Usuário") {
  const existing = db.calendars.find((cal) => cal.ownerId === userId);
  if (existing) return existing;
  const user = db.users.find((u) => u.id === userId);
  const username = String(user?.username || fallbackUsername || "Usuário").trim() || "Usuário";
  const calendar = {
    id: uuidv4(),
    name: `Agenda de ${username}`,
    ownerId: userId,
    sharedWith: [],
    sharedWithEmails: [],
  };
  db.calendars.push(calendar);
  return calendar;
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
    sharedWithEmails: [],
  };
  db.calendars.push(calendar);
  writeDb(db);

  return res.json({
    token: makeToken(user),
    user: {
      id: user.id,
      username: user.username,
      calendarId: calendar.id,
      isSuperAdmin: isSuperAdminUsername(user.username),
    },
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
    user: {
      id: user.id,
      username: user.username,
      calendarId: calendar?.id || null,
      isSuperAdmin: isSuperAdminUsername(user.username),
    },
  });
});

app.get("/api/users", authMiddleware, (req, res) => {
  const db = readDb();
  const users = db.users
    .map((user) => ({
      id: user.id,
      username: String(user.username || "").trim(),
    }))
    .filter((user) => user.username)
    .sort((a, b) => a.username.localeCompare(b.username, "pt-BR"));
  res.json({ users });
});

app.get("/api/users/:userId/events", authMiddleware, (req, res) => {
  const db = readDb();
  const targetUser = db.users.find((item) => item.id === req.params.userId);
  if (!targetUser) return res.status(404).json({ message: "Usuario nao encontrado." });

  const viewerIsSuperAdmin = isSuperAdminUser(db, req.user.userId, req.user.username);
  const viewingOwnAgenda = req.user.userId === targetUser.id;
  const rawEvents = getAgendaEventsForUser(db, targetUser.id);
  const events = rawEvents
    .map((event) => mapEventForResponse(db, event, req.user.userId, req.user.username))
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));

  res.json({
    events,
    owner: {
      id: targetUser.id,
      username: String(targetUser.username || "").trim(),
    },
    readOnly: !viewingOwnAgenda && !viewerIsSuperAdmin,
    isSuperAdmin: viewerIsSuperAdmin,
  });
});

app.get("/api/events", authMiddleware, (req, res) => {
  const db = readDb();
  const calendarIds = getOwnedAndSharedCalendarIds(db, req.user.userId);
  const rawEvents = getMergedEventsForViewer(db, req.user.userId);
  let changed = false;
  const events = rawEvents
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
      return mapEventForResponse(db, next, req.user.userId, req.user.username);
    })
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  if (changed) {
    db.events = db.events.map((event) => {
      const inScope =
        calendarIds.includes(event.calendarId) || isUserResponsibleForEvent(db, req.user.userId, event);
      if (!inScope) return event;
      const fixed = events.find((item) => item.id === event.id);
      return fixed || event;
    });
    writeDb(db);
  }
  res.json({
    events,
    isSuperAdmin: isSuperAdminUser(db, req.user.userId, req.user.username),
  });
});

app.post("/api/events", authMiddleware, (req, res) => {
  const db = readDb();
  const ownCalendar = ensureOwnCalendar(db, req.user.userId, req.user.username);
  const normalizedStatus = normalizeStatusWithColor(req.body.status, req.body.color);

  const baseEvent = {
    id: uuidv4(),
    calendarId: ownCalendar.id,
    title: req.body.title || "Sem titulo",
    cnpj: String(req.body.cnpj || "").trim().slice(0, 18),
    address: String(req.body.address || "").trim().slice(0, 120),
    location: String(req.body.location || "").trim().slice(0, 120),
    contactName: String(req.body.contactName || "").trim().slice(0, 80),
    contactPhone: String(req.body.contactPhone || "").trim().slice(0, 20),
    contactEmail: String(req.body.contactEmail || "").trim().toLowerCase().slice(0, 120),
    responsible: String(req.body.responsible || "").trim().slice(0, 80),
    date: req.body.date,
    endDate: req.body.endDate || req.body.date,
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
  const idx = findEventIndex(db, req.params.id);
  if (idx < 0) return res.status(404).json({ message: "Evento nao encontrado." });

  const current = db.events[idx];
  const fullEdit = canFullEditEvent(db, req.user.userId, req.user.username, current);
  const statusOnly = !fullEdit && canEditEventStatus(db, req.user.userId, req.user.username, current);
  if (!fullEdit && !statusOnly) {
    return res.status(403).json({ message: "Sem permissao para alterar este evento." });
  }

  const normalizedStatus = normalizeStatusWithColor(req.body.status, req.body.color);

  if (statusOnly) {
    db.events[idx] = {
      ...current,
      status: normalizedStatus,
      color: STATUS_COLORS[normalizedStatus] || STATUS_COLORS.pendente,
      completedAt: req.body.completedAt !== undefined ? req.body.completedAt : current.completedAt,
      completedOnTime:
        typeof req.body.completedOnTime === "boolean"
          ? req.body.completedOnTime
          : req.body.completedOnTime == null
            ? current.completedOnTime ?? null
            : !!req.body.completedOnTime,
    };
  } else {
    db.events[idx] = {
      ...current,
      title: req.body.title,
      cnpj: String(req.body.cnpj || "").trim().slice(0, 18),
      address: String(req.body.address || "").trim().slice(0, 120),
      location: String(req.body.location || "").trim().slice(0, 120),
      contactName: String(req.body.contactName || "").trim().slice(0, 80),
      contactPhone: String(req.body.contactPhone || "").trim().slice(0, 20),
      contactEmail: String(req.body.contactEmail || "").trim().toLowerCase().slice(0, 120),
      responsible: String(req.body.responsible || "").trim().slice(0, 80),
      date: req.body.date,
      endDate: req.body.endDate || req.body.date,
      start: req.body.start,
      end: req.body.end,
      color: STATUS_COLORS[normalizedStatus] || STATUS_COLORS.pendente,
      repeat: req.body.repeat || "none",
      status: normalizedStatus,
      reminderMinutes: Number(req.body.reminderMinutes || 0),
      description: String(req.body.description || req.body.reminderMessage || "").trim().slice(0, 180),
      reminderMessage: String(req.body.description || req.body.reminderMessage || "").trim().slice(0, 180),
      reminderSentAt: current.reminderSentAt,
      completedAt: req.body.completedAt || null,
      completedOnTime:
        typeof req.body.completedOnTime === "boolean"
          ? req.body.completedOnTime
          : req.body.completedOnTime == null
            ? null
            : !!req.body.completedOnTime,
      recurrenceGroupId: current.recurrenceGroupId || uuidv4(),
    };
  }

  writeDb(db);
  res.json({
    event: mapEventForResponse(db, db.events[idx], req.user.userId, req.user.username),
  });
});

app.delete("/api/events/:id", authMiddleware, (req, res) => {
  const db = readDb();
  const event = db.events.find((item) => item.id === req.params.id);
  if (!event) return res.status(404).json({ message: "Evento nao encontrado." });
  if (!canFullEditEvent(db, req.user.userId, req.user.username, event)) {
    return res.status(403).json({ message: "Sem permissao para excluir este evento." });
  }
  db.events = db.events.filter((item) => item.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/companies", authMiddleware, (req, res) => {
  const db = readDb();
  const calendarIds = getOwnedAndSharedCalendarIds(db, req.user.userId);
  const companies = db.companies
    .filter((company) => calendarIds.includes(company.calendarId))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  res.json({ companies });
});

app.post("/api/companies", authMiddleware, (req, res) => {
  const db = readDb();
  const ownCalendar = ensureOwnCalendar(db, req.user.userId, req.user.username);
  const payload = normalizeCompanyPayload(req.body || {});
  if (!payload.name) return res.status(400).json({ message: "Informe o nome da empresa." });
  const company = {
    id: uuidv4(),
    calendarId: ownCalendar.id,
    ...payload,
    createdBy: req.user.userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.companies.push(company);
  writeDb(db);
  res.status(201).json({ company });
});

app.put("/api/companies/:id", authMiddleware, (req, res) => {
  const db = readDb();
  const calendarIds = getOwnedAndSharedCalendarIds(db, req.user.userId);
  const idx = db.companies.findIndex(
    (company) => company.id === req.params.id && calendarIds.includes(company.calendarId),
  );
  if (idx < 0) return res.status(404).json({ message: "Empresa nao encontrada." });
  const payload = normalizeCompanyPayload(req.body || {});
  if (!payload.name) return res.status(400).json({ message: "Informe o nome da empresa." });
  db.companies[idx] = {
    ...db.companies[idx],
    ...payload,
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  res.json({ company: db.companies[idx] });
});

app.delete("/api/companies/:id", authMiddleware, (req, res) => {
  const db = readDb();
  const calendarIds = getOwnedAndSharedCalendarIds(db, req.user.userId);
  const before = db.companies.length;
  db.companies = db.companies.filter(
    (company) => !(company.id === req.params.id && calendarIds.includes(company.calendarId)),
  );
  if (db.companies.length === before) return res.status(404).json({ message: "Empresa nao encontrada." });
  writeDb(db);
  res.json({ ok: true });
});

app.post("/api/share", authMiddleware, async (req, res) => {
  const targetEmail = String(req.body?.targetEmail || "")
    .trim()
    .toLowerCase();
  if (!targetEmail) return res.status(400).json({ message: "E-mail alvo invalido." });
  const db = readDb();

  const ownerCalendar = db.calendars.find((cal) => cal.ownerId === req.user.userId);
  if (!ownerCalendar) return res.status(404).json({ message: "Agenda nao encontrada." });
  const targetUser = db.users.find((u) => typeof u.email === "string" && u.email.toLowerCase() === targetEmail);
  if (targetUser?.id === req.user.userId) return res.status(400).json({ message: "Nao pode compartilhar com voce mesmo." });

  ownerCalendar.sharedWith = ownerCalendar.sharedWith || [];
  ownerCalendar.sharedWithEmails = ownerCalendar.sharedWithEmails || [];
  if (targetUser && !ownerCalendar.sharedWith.includes(targetUser.id)) {
    ownerCalendar.sharedWith.push(targetUser.id);
  }
  if (!ownerCalendar.sharedWithEmails.includes(targetEmail)) {
    ownerCalendar.sharedWithEmails.push(targetEmail);
  }
  writeDb(db);

  const ownerUser = db.users.find((u) => u.id === req.user.userId);
  const ownerName = ownerUser?.username || req.user.username || "Usuário";
  const ownerEmail = ownerUser?.email || "";
  const sent = await sendShareInviteEmail({
    to: targetEmail,
    ownerName,
    ownerEmail,
    calendarName: ownerCalendar.name || `Agenda de ${ownerName}`,
  });
  res.json({
    ok: true,
    emailSent: sent,
    message: sent
      ? targetUser
        ? "Compartilhamento realizado e convite enviado por e-mail."
        : "Convite enviado por e-mail. Quando essa pessoa criar conta com esse e-mail, ja tera acesso."
      : targetUser
        ? "Compartilhamento realizado, mas SMTP nao esta configurado para envio de e-mails."
        : "Compartilhamento registrado. Quando essa pessoa criar conta com esse e-mail, ja tera acesso. SMTP nao configurado para envio.",
  });
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
    const endDay = String(event.endDate || event.date);
    lines.push(`DTEND:${toIcsDateTime(new Date(`${endDay}T${event.end}:00`))}`);
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
  const ownCalendar = ensureOwnCalendar(db, req.user.userId, req.user.username);
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
      const endDay = String(event.endDate || event.date);
      const endAt = new Date(`${endDay}T${event.end}:00`);

      // IA simples: se passou do horario final, marca como atrasado automaticamente.
      if (now > endAt && event.status === "pendente" && !event.completedAt) {
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

  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from,
      to: email,
      subject: "Codigo de recuperacao - Agenda Fluxo",
      text: `Seu codigo de recuperacao e: ${code}\n\nEle expira em 15 minutos.`,
      html: `<p>Seu codigo de recuperacao e: <strong>${code}</strong></p><p>Ele expira em 15 minutos.</p>`,
    });
    if (Array.isArray(info?.rejected) && info.rejected.length) {
      console.warn("SMTP rejeitou envio de reset:", { email, rejected: info.rejected });
      return false;
    }
    return Array.isArray(info?.accepted) ? info.accepted.length > 0 : true;
  } catch (error) {
    console.error("Falha ao enviar e-mail de reset:", error);
    return false;
  }
}

async function sendShareInviteEmail({ to, ownerName, ownerEmail, calendarName }) {
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

  const ownerLine = ownerEmail ? `${ownerName} (${ownerEmail})` : ownerName;
  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from,
      to,
      subject: "Convite para agenda compartilhada - Agenda Fluxo",
      text:
        `Voce recebeu um convite para acessar a agenda "${calendarName}".\n` +
        `Compartilhado por: ${ownerLine}\n\n` +
        "Acesse o sistema e entre com seu e-mail para visualizar os eventos compartilhados.",
      html:
        `<p>Voce recebeu um convite para acessar a agenda <strong>${calendarName}</strong>.</p>` +
        `<p>Compartilhado por: <strong>${ownerLine}</strong></p>` +
        "<p>Acesse o sistema e entre com seu e-mail para visualizar os eventos compartilhados.</p>",
    });
    if (Array.isArray(info?.rejected) && info.rejected.length) {
      console.warn("SMTP rejeitou convite de compartilhamento:", { to, rejected: info.rejected });
      return false;
    }
    return Array.isArray(info?.accepted) ? info.accepted.length > 0 : true;
  } catch (error) {
    console.error("Falha ao enviar convite de compartilhamento:", error);
    return false;
  }
}

module.exports = app;
