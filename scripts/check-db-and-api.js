require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { Pool } = require("pg");

async function checkPostgres() {
  const url = String(process.env.DATABASE_URL || "").trim();
  const result = {
    databaseUrlConfigured: Boolean(url),
    hostHint: "nao configurada",
    connected: false,
    database: null,
    appStateTable: false,
    users: 0,
    calendars: 0,
    events: 0,
    error: null,
  };

  if (!url) {
    result.error = "DATABASE_URL ausente no .env";
    return result;
  }

  try {
    const parsed = new URL(url.replace(/^postgresql:/, "postgres:"));
    result.hostHint = `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.replace(/^\//, "")}`;
  } catch {
    result.hostHint = "formato invalido";
  }

  const pool = new Pool({
    connectionString: url,
    ssl:
      url.includes("localhost") || url.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
  });

  try {
    const ping = await pool.query("SELECT current_database() AS db, NOW() AS now");
    result.connected = true;
    result.database = ping.rows[0].db;
    result.serverTime = ping.rows[0].now;

    const tableCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_state') AS exists",
    );
    result.appStateTable = Boolean(tableCheck.rows[0]?.exists);

    if (result.appStateTable) {
      const stateRow = await pool.query("SELECT data FROM app_state WHERE id = 1");
      if (stateRow.rows.length) {
        const data = stateRow.rows[0].data || {};
        result.users = Array.isArray(data.users) ? data.users.length : 0;
        result.calendars = Array.isArray(data.calendars) ? data.calendars.length : 0;
        result.events = Array.isArray(data.events) ? data.events.length : 0;
      }
    }
  } catch (error) {
    result.error = error.message;
  } finally {
    await pool.end().catch(() => {});
  }

  return result;
}

async function checkOtherAgendasApi() {
  const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const out = {
    serverReachable: false,
    registerUserA: false,
    registerUserB: false,
    listUsers: false,
    viewOtherAgenda: false,
    readOnlyFlag: false,
    error: null,
    userCount: 0,
  };

  const suffix = Date.now();
  const userA = {
    email: `teste.a.${suffix}@test.local`,
    username: `teste_a_${suffix}`,
    password: "senha1234",
  };
  const userB = {
    email: `teste.b.${suffix}@test.local`,
    username: `teste_b_${suffix}`,
    password: "senha1234",
  };

  async function api(path, options = {}) {
    const res = await fetch(`${base}/api${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  try {
    const health = await fetch(`${base}/health`);
    out.serverReachable = health.ok;
    if (!health.ok) {
      out.error = "Servidor nao respondeu em /health";
      return out;
    }

    const regA = await api("/auth/register", { method: "POST", body: userA });
    out.registerUserA = Boolean(regA.token);
    const tokenA = regA.token;
    const userAId = regA.user?.id;

    const regB = await api("/auth/register", {
      method: "POST",
      body: userB,
    });
    out.registerUserB = Boolean(regB.token);
    const userBId = regB.user?.id;

    await api("/events", {
      method: "POST",
      token: tokenA,
      body: {
        title: "Evento teste agenda A",
        date: "2026-06-15",
        endDate: "2026-06-15",
        start: "10:00",
        end: "11:00",
        status: "pendente",
      },
    });

    const usersList = await api("/users", { token: tokenA });
    out.listUsers = Array.isArray(usersList.users);
    out.userCount = usersList.users?.length || 0;

    const otherEvents = await api(`/users/${userBId}/events`, { token: tokenA });
    out.viewOtherAgenda = Array.isArray(otherEvents.events);
    out.readOnlyFlag = otherEvents.readOnly === true;
    out.otherOwnerUsername = otherEvents.owner?.username || null;

    const ownAsA = await api(`/users/${userAId}/events`, { token: tokenA });
    out.ownAgendaReadOnly = ownAsA.readOnly === false;

    out.cleanupNote = `Usuarios de teste criados: ${userA.username}, ${userB.username}`;
  } catch (error) {
    out.error = error.message;
  }

  return out;
}

(async () => {
  console.log("=== PostgreSQL ===");
  const db = await checkPostgres();
  console.log(JSON.stringify(db, null, 2));

  console.log("\n=== API ver outras agendas ===");
  const api = await checkOtherAgendasApi();
  console.log(JSON.stringify(api, null, 2));

  const okDb = db.connected && db.databaseUrlConfigured;
  const okApi =
    api.serverReachable &&
    api.listUsers &&
    api.viewOtherAgenda &&
    api.readOnlyFlag &&
    api.ownAgendaReadOnly === false;

  console.log("\n=== Resumo ===");
  console.log("PostgreSQL:", okDb ? "OK" : "FALHOU");
  console.log("Ver outras agendas:", okApi ? "OK" : api.serverReachable ? "FALHOU" : "SERVIDOR OFFLINE (inicie com npm start)");
  process.exit(okDb && (okApi || !api.serverReachable) ? 0 : 1);
})();
