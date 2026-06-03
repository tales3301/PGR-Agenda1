require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { Pool } = require("pg");

const TARGETS = ["naruto", "kaua", "kauã"];

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchUser(user) {
  const name = normalizeName(user.username);
  return TARGETS.some((target) => name === normalizeName(target));
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const result = await pool.query("SELECT data FROM app_state WHERE id = 1");
  const db = result.rows[0].data;
  const toRemove = db.users.filter(matchUser);

  if (!toRemove.length) {
    console.log("Nenhum usuario encontrado.");
    await pool.end();
    return;
  }

  const removeIds = new Set(toRemove.map((user) => user.id));
  const removeEmails = new Set(
    toRemove.map((user) => String(user.email || "").trim().toLowerCase()).filter(Boolean),
  );

  console.log("Removendo:", toRemove.map((user) => `${user.username} (${user.id})`).join(", "));

  const calendarIdsToRemove = new Set(
    db.calendars.filter((calendar) => removeIds.has(calendar.ownerId)).map((calendar) => calendar.id),
  );

  const eventsBefore = db.events.length;
  const companiesBefore = db.companies.length;

  db.events = db.events.filter((event) => !calendarIdsToRemove.has(event.calendarId));
  db.companies = db.companies.filter((company) => !calendarIdsToRemove.has(company.calendarId));
  db.calendars = db.calendars.filter((calendar) => !removeIds.has(calendar.ownerId));
  db.calendars.forEach((calendar) => {
    calendar.sharedWith = (calendar.sharedWith || []).filter((id) => !removeIds.has(id));
    calendar.sharedWithEmails = (calendar.sharedWithEmails || []).filter(
      (email) => !removeEmails.has(String(email || "").toLowerCase()),
    );
  });
  db.users = db.users.filter((user) => !removeIds.has(user.id));
  db.passwordResets = (db.passwordResets || []).filter(
    (reset) => !removeEmails.has(String(reset.email || "").toLowerCase()),
  );

  await pool.query("UPDATE app_state SET data = $1::jsonb WHERE id = 1", [JSON.stringify(db)]);

  console.log("Calendarios removidos:", calendarIdsToRemove.size);
  console.log("Eventos removidos:", eventsBefore - db.events.length);
  console.log("Empresas removidas:", companiesBefore - db.companies.length);
  console.log("Usuarios restantes:", db.users.map((user) => user.username).join(", "));

  await pool.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
