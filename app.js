const API_BASE = `${window.location.origin}/api`;
const THEME_KEY = "agenda_fluxo_theme_v1";
const SESSION_KEY = "agenda_fluxo_session_v1";
const PDF_LOGO_SRC = "logo-pgr.png";
const STATUS_COLORS = {
  pendente: "#3b82f6",
  atrasado: "#ef4444",
  reagendamento: "#f97316",
  concluido: "#22c55e",
  entrega_tecnica_finalizada: "#a855f7",
};
const MONTH_DAY_EVENT_VISIBLE_LIMIT = 20;
const AGENDA_VIEW_ALL = "__all__";

/** Tamanhos pensados para impressão legível (pt no jsPDF). */
const PDF_LAYOUT = {
  monthEventsPerCell: 2,
  chipFontMin: 9,
  chipFontMax: 11,
  chipLineFactor: 0.52,
  headerTitle: 18,
  headerSub: 12,
  weekday: 12,
  dayNumber: 12,
  dayCountFont: 10,
  weekColumnHead: 11,
  legend: 10,
  hiddenHint: 9,
  listPageTitle: 18,
  listFontDate: 14,
  listFontPrimary: 13,
  listFontSecondary: 11.5,
  listFontNote: 10.5,
  listLineGap: 7.5,
  listBlockGap: 11,
  listMinBlockHeight: 26,
};

const state = {
  currentDate: new Date(),
  currentView: "month",
  events: [],
  companies: [],
  users: [],
  editingId: null,
  editingCompanyId: null,
  reminderTimer: null,
  token: null,
  user: null,
  overdueSyncInProgress: false,
  authIntent: "login",
  viewingUserId: null,
  isSuperAdmin: false,
};
let pdfLogoAssetPromise = null;
let companySuggestBlurTimer = null;
const COMPANY_SUGGEST_MIN_CHARS = 2;
const COMPANY_SUGGEST_MAX_ITEMS = 8;

const refs = {
  currentLabel: document.getElementById("currentLabel"),
  calendarGrid: document.getElementById("calendarGrid"),
  miniCalendar: document.getElementById("miniCalendar"),
  viewSelect: document.getElementById("viewSelect"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  todayBtn: document.getElementById("todayBtn"),
  searchInput: document.getElementById("searchInput"),
  responsibleFilter: document.getElementById("responsibleFilter"),
  responsibleFilterList: document.getElementById("responsibleFilterList"),
  companyFilter: document.getElementById("companyFilter"),
  companyFilterList: document.getElementById("companyFilterList"),
  agendaViewSelect: document.getElementById("agendaViewSelect"),
  agendaViewHint: document.getElementById("agendaViewHint"),
  searchBtn: document.getElementById("searchBtn"),
  newEventBtn: document.getElementById("newEventBtn"),
  showReminders: document.getElementById("showReminders"),
  authStatus: document.getElementById("authStatus"),
  manageCompaniesBtn: document.getElementById("manageCompaniesBtn"),
  openLoginBtn: document.getElementById("openLoginBtn"),
  openRegisterBtn: document.getElementById("openRegisterBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  shareBtn: document.getElementById("shareBtn"),
  darkModeBtn: document.getElementById("darkModeBtn"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  eventDialog: document.getElementById("eventDialog"),
  eventForm: document.getElementById("eventForm"),
  companySelectInput: document.getElementById("companySelectInput"),
  companyNameSuggestBox: document.getElementById("companyNameSuggestBox"),
  companyCnpjSuggestBox: document.getElementById("companyCnpjSuggestBox"),
  dialogTitle: document.getElementById("dialogTitle"),
  titleInput: document.getElementById("titleInput"),
  cnpjInput: document.getElementById("cnpjInput"),
  addressInput: document.getElementById("addressInput"),
  locationInput: document.getElementById("locationInput"),
  contactNameInput: document.getElementById("contactNameInput"),
  contactPhoneInput: document.getElementById("contactPhoneInput"),
  contactEmailInput: document.getElementById("contactEmailInput"),
  responsibleInput: document.getElementById("responsibleInput"),
  startDateInput: document.getElementById("startDateInput"),
  endDateInput: document.getElementById("endDateInput"),
  startInput: document.getElementById("startInput"),
  endInput: document.getElementById("endInput"),
  repeatInput: document.getElementById("repeatInput"),
  statusInput: document.getElementById("statusInput"),
  descriptionInput: document.getElementById("descriptionInput"),
  confirmDoneBtn: document.getElementById("confirmDoneBtn"),
  saveCompanyFromEventBtn: document.getElementById("saveCompanyFromEventBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
  authDialog: document.getElementById("authDialog"),
  authDialogTitle: document.getElementById("authDialogTitle"),
  authForm: document.getElementById("authForm"),
  authEmailLabel: document.getElementById("authEmailLabel"),
  authUsernameLabel: document.getElementById("authUsernameLabel"),
  authConfirmPasswordLabel: document.getElementById("authConfirmPasswordLabel"),
  authEmail: document.getElementById("authEmail"),
  authUsername: document.getElementById("authUsername"),
  authPassword: document.getElementById("authPassword"),
  authConfirmPassword: document.getElementById("authConfirmPassword"),
  toggleAuthPasswordBtn: document.getElementById("toggleAuthPasswordBtn"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),
  cancelAuthBtn: document.getElementById("cancelAuthBtn"),
  toggleResetBtn: document.getElementById("toggleResetBtn"),
  resetSection: document.getElementById("resetSection"),
  resetEmail: document.getElementById("resetEmail"),
  resetCode: document.getElementById("resetCode"),
  resetNewPassword: document.getElementById("resetNewPassword"),
  toggleResetPasswordBtn: document.getElementById("toggleResetPasswordBtn"),
  requestResetBtn: document.getElementById("requestResetBtn"),
  confirmResetBtn: document.getElementById("confirmResetBtn"),
  shareDialog: document.getElementById("shareDialog"),
  shareForm: document.getElementById("shareForm"),
  shareEmail: document.getElementById("shareEmail"),
  shareWhatsappBtn: document.getElementById("shareWhatsappBtn"),
  cancelShareBtn: document.getElementById("cancelShareBtn"),
  reminderDialog: document.getElementById("reminderDialog"),
  reminderText: document.getElementById("reminderText"),
  closeReminderBtn: document.getElementById("closeReminderBtn"),
  companiesDialog: document.getElementById("companiesDialog"),
  companiesForm: document.getElementById("companiesForm"),
  companiesList: document.getElementById("companiesList"),
  companyNameInput: document.getElementById("companyNameInput"),
  companyCnpjInput: document.getElementById("companyCnpjInput"),
  companyAddressInput: document.getElementById("companyAddressInput"),
  companyLocationInput: document.getElementById("companyLocationInput"),
  companyContactNameInput: document.getElementById("companyContactNameInput"),
  companyContactPhoneInput: document.getElementById("companyContactPhoneInput"),
  companyContactEmailInput: document.getElementById("companyContactEmailInput"),
  companyResponsibleInput: document.getElementById("companyResponsibleInput"),
  deleteCompanyBtn: document.getElementById("deleteCompanyBtn"),
  cancelCompanyBtn: document.getElementById("cancelCompanyBtn"),
};

init();

async function init() {
  hydrateTheme();
  hydrateSession();
  bindUI();
  requestNotifyPermission();
  updateAuthStatus();
  if (state.token) {
    await loadEventsFromApi();
    await loadCompaniesFromApi();
    await loadUsersFromApi();
    updateAgendaViewUI();
  }
  renderAll();
  startReminderLoop();
}

function bindUI() {
  refs.viewSelect.addEventListener("change", (event) => {
    state.currentView = event.target.value;
    renderAll();
  });

  refs.prevBtn.addEventListener("click", () => {
    shiftDate(-1);
  });

  refs.nextBtn.addEventListener("click", () => {
    shiftDate(1);
  });

  refs.todayBtn.addEventListener("click", () => {
    state.currentDate = new Date();
    renderAll();
  });

  refs.searchInput.addEventListener("input", () => {
    renderCalendar();
  });
  refs.responsibleFilter.addEventListener("input", renderCalendar);
  refs.responsibleFilter.addEventListener("change", renderCalendar);
  refs.companyFilter.addEventListener("input", renderCalendar);
  refs.companyFilter.addEventListener("change", renderCalendar);
  refs.agendaViewSelect.addEventListener("change", onAgendaViewChange);
  refs.searchBtn.addEventListener("click", () => {
    renderCalendar();
  });
  refs.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      renderCalendar();
    }
  });

  refs.newEventBtn.addEventListener("click", () => {
    if (!requireAuth()) return;
    if (isViewingOtherAgenda() && !canManageOtherAgenda()) {
      alert("Volte para sua agenda para criar eventos. Apenas jidean pode criar na agenda de outros.");
      return;
    }
    openEventDialog();
  });
  refs.manageCompaniesBtn.addEventListener("click", onOpenCompaniesDialog);

  refs.cancelBtn.addEventListener("click", () => {
    hideCompanySuggestBoxes();
    refs.eventDialog.close();
  });

  refs.eventForm.addEventListener("submit", onSubmitEvent);
  refs.companySelectInput.addEventListener("change", onCompanySelectInEvent);
  refs.titleInput.addEventListener("input", onOrganizationSearchInput);
  refs.titleInput.addEventListener("blur", () => scheduleCompanySuggestBlur("name"));
  refs.titleInput.addEventListener("focus", onOrganizationSearchInput);
  refs.cnpjInput.addEventListener("input", onCnpjSearchInput);
  refs.cnpjInput.addEventListener("blur", () => scheduleCompanySuggestBlur("cnpj"));
  refs.cnpjInput.addEventListener("focus", onCnpjSearchInput);
  refs.confirmDoneBtn.addEventListener("click", onConfirmDone);
  refs.saveCompanyFromEventBtn.addEventListener("click", onSaveCompanyFromEvent);
  refs.deleteBtn.addEventListener("click", onDeleteEvent);
  refs.showReminders.addEventListener("change", startReminderLoop);
  refs.openLoginBtn.addEventListener("click", () => openAuthDialog("login"));
  refs.openRegisterBtn.addEventListener("click", () => openAuthDialog("register"));
  refs.cancelAuthBtn.addEventListener("click", () => refs.authDialog.close());
  refs.authForm.addEventListener("submit", onAuthSubmit);
  refs.toggleAuthPasswordBtn.addEventListener("click", () =>
    togglePasswordVisibility(refs.authPassword, refs.toggleAuthPasswordBtn),
  );
  refs.toggleResetBtn.addEventListener("click", () => {
    const isHidden = refs.resetSection.classList.toggle("hidden");
    refs.toggleResetBtn.textContent = isHidden ? "Recuperar senha" : "Fechar recuperação";
  });
  refs.toggleResetPasswordBtn.addEventListener("click", () =>
    togglePasswordVisibility(refs.resetNewPassword, refs.toggleResetPasswordBtn),
  );
  refs.requestResetBtn.addEventListener("click", onRequestPasswordReset);
  refs.confirmResetBtn.addEventListener("click", onConfirmPasswordReset);
  refs.logoutBtn.addEventListener("click", logout);
  refs.shareBtn.addEventListener("click", onOpenShare);
  refs.shareForm.addEventListener("submit", onShareSubmit);
  refs.cancelShareBtn.addEventListener("click", () => refs.shareDialog.close());
  refs.shareWhatsappBtn.addEventListener("click", onShareWhatsapp);
  refs.closeReminderBtn.addEventListener("click", () => refs.reminderDialog.close());
  refs.companiesForm.addEventListener("submit", onSubmitCompany);
  refs.deleteCompanyBtn.addEventListener("click", onDeleteCompany);
  refs.cancelCompanyBtn.addEventListener("click", () => refs.companiesDialog.close());
  refs.darkModeBtn.addEventListener("click", toggleDarkMode);
  refs.exportPdfBtn.addEventListener("click", exportPdf);
}

function shiftDate(direction) {
  const current = new Date(state.currentDate);
  if (state.currentView === "month") {
    current.setMonth(current.getMonth() + direction);
  } else {
    current.setDate(current.getDate() + direction * 7);
  }
  state.currentDate = current;
  renderAll();
}

function renderAll() {
  populateAgendaViewSelect();
  populateResponsibleFilter();
  populateCompanyFilter();
  populateCompanySelect();
  populateCompanySuggestions();
  renderLabel();
  renderMiniCalendar();
  renderCalendar();
}

function renderLabel() {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  });
  refs.currentLabel.textContent = formatter.format(state.currentDate);
}

function renderMiniCalendar() {
  const base = new Date(state.currentDate);
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const weekdays = ["D", "S", "T", "Q", "Q", "S", "S"];
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());

  refs.miniCalendar.innerHTML = "";
  const head = document.createElement("div");
  head.className = "mini-head";

  const title = document.createElement("strong");
  title.textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(base);
  head.appendChild(title);

  const nav = document.createElement("div");
  nav.className = "mini-nav";
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "mini-nav-btn";
  prev.textContent = "‹";
  prev.addEventListener("click", () => {
    const next = new Date(state.currentDate);
    next.setMonth(next.getMonth() - 1);
    state.currentDate = next;
    renderAll();
  });
  const next = document.createElement("button");
  next.type = "button";
  next.className = "mini-nav-btn";
  next.textContent = "›";
  next.addEventListener("click", () => {
    const value = new Date(state.currentDate);
    value.setMonth(value.getMonth() + 1);
    state.currentDate = value;
    renderAll();
  });
  nav.appendChild(prev);
  nav.appendChild(next);
  head.appendChild(nav);
  refs.miniCalendar.appendChild(head);

  const weekRow = document.createElement("div");
  weekRow.className = "mini-weekdays";
  weekdays.forEach((day) => {
    const cell = document.createElement("span");
    cell.textContent = day;
    weekRow.appendChild(cell);
  });
  refs.miniCalendar.appendChild(weekRow);

  const body = document.createElement("div");
  body.className = "mini-days-grid";
  for (let i = 0; i < 35; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mini-day";
    if (date.getMonth() !== month) {
      btn.classList.add("is-muted");
    }
    if (sameDay(date, state.currentDate)) {
      btn.classList.add("active");
    }
    btn.textContent = String(date.getDate());
    btn.addEventListener("click", () => {
      state.currentDate = date;
      renderAll();
    });
    body.appendChild(btn);
  }
  refs.miniCalendar.appendChild(body);
}

function renderCalendar() {
  refs.calendarGrid.innerHTML = "";
  if (state.currentView === "month") {
    renderMonthView();
  } else {
    renderWeekView();
  }
}

function renderMonthView() {
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const grid = document.createElement("div");
  grid.className = "month-grid";

  weekdays.forEach((day) => {
    const header = document.createElement("div");
    header.className = "weekday-head";
    header.textContent = day;
    grid.appendChild(header);
  });

  const monthStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
  const monthEnd = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);
  const renderStart = new Date(monthStart);
  renderStart.setDate(renderStart.getDate() - renderStart.getDay());
  const renderEnd = new Date(monthEnd);
  renderEnd.setDate(renderEnd.getDate() + (6 - renderEnd.getDay()));

  const cursor = new Date(renderStart);
  while (cursor <= renderEnd) {
    const dayCell = document.createElement("div");
    dayCell.className = "day-cell";
    if (cursor.getMonth() !== state.currentDate.getMonth()) {
      dayCell.classList.add("is-muted");
    }
    dayCell.addEventListener("dblclick", () => {
      if (!requireAuth()) return;
      if (isViewingOtherAgenda() && !canManageOtherAgenda()) return;
      openEventDialog(null, cursor);
    });

    const dayNumber = document.createElement("div");
    dayNumber.className = "day-number";
    if (sameDay(cursor, new Date())) {
      dayNumber.classList.add("is-today");
    }
    dayNumber.textContent = String(cursor.getDate());
    dayCell.appendChild(dayNumber);

    const dayEvents = getEventsForDate(cursor).filter(matchesSearch);
    const limit = isSearching() ? dayEvents.length : MONTH_DAY_EVENT_VISIBLE_LIMIT;
    dayEvents.slice(0, limit).forEach((event) => {
      dayCell.appendChild(createEventPill(event));
    });

    if (!isSearching() && dayEvents.length > MONTH_DAY_EVENT_VISIBLE_LIMIT) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "day-more-btn";
      more.textContent = `+${dayEvents.length - MONTH_DAY_EVENT_VISIBLE_LIMIT} mais`;
      more.addEventListener("click", (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        showHiddenDayEvents(cursor, dayEvents.slice(MONTH_DAY_EVENT_VISIBLE_LIMIT));
      });
      dayCell.appendChild(more);
    }

    grid.appendChild(dayCell);
    cursor.setDate(cursor.getDate() + 1);
  }

  refs.calendarGrid.appendChild(grid);
}

function renderWeekView() {
  const weekLayout = document.createElement("div");
  weekLayout.className = "week-layout";
  const weekStart = startOfWeek(state.currentDate);

  const timeHeader = document.createElement("div");
  timeHeader.className = "week-time-head";
  timeHeader.textContent = "Hora";
  weekLayout.appendChild(timeHeader);

  for (let i = 0; i < 7; i += 1) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const head = document.createElement("div");
    head.className = "week-day-head";
    head.textContent = new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      day: "2-digit",
    }).format(date);
    weekLayout.appendChild(head);
  }

  for (let hour = 5; hour <= 20; hour += 1) {
    const timeCell = document.createElement("div");
    timeCell.className = "week-time";
    timeCell.textContent = `${String(hour).padStart(2, "0")}:00`;
    weekLayout.appendChild(timeCell);

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const slotDate = new Date(weekStart);
      slotDate.setDate(weekStart.getDate() + dayOffset);
      const slot = document.createElement("div");
      slot.className = "week-slot";
      slot.addEventListener("dblclick", () => {
        if (!requireAuth()) return;
        if (isViewingOtherAgenda() && !canManageOtherAgenda()) return;
        const defaultDate = toISODate(slotDate);
        openEventDialog(null, slotDate, `${String(hour).padStart(2, "0")}:00`, defaultDate);
      });
      const events = getEventsForDate(slotDate)
        .filter(matchesSearch)
        .filter((event) => eventOverlapsSlot(event, slotDate, hour));
      events.forEach((event) => {
        slot.appendChild(createEventPill(event));
      });
      weekLayout.appendChild(slot);
    }
  }

  refs.calendarGrid.appendChild(weekLayout);
}

function createEventPill(event) {
  const btn = document.createElement("button");
  btn.type = "button";
  const normalizedStatus = normalizeStatus(event.status, event.color);
  btn.className = `event-pill status-${normalizedStatus}`;
  if (isEventExternallyAssigned(event)) {
    btn.classList.add("is-assigned-external");
    btn.title = `Seu agendamento (agenda de ${event.ownerUsername || "outro usuario"})`;
  }
  const title = document.createElement("span");
  title.className = "event-title";
  const showOwner =
    (isGeneralAgendaView() || isEventExternallyAssigned(event)) && event.ownerUsername;
  const ownerHint = showOwner ? ` · ${event.ownerUsername}` : "";
  title.textContent = `${event.title}${ownerHint}`;
  const time = document.createElement("span");
  time.className = "event-time";
  time.textContent = formatEventTimeRange(event);
  btn.appendChild(title);
  btn.appendChild(time);
  const descriptionText = getDescriptionText(event);
  const hasDescription = descriptionText.length > 0;
  if (hasDescription) {
    const dot = document.createElement("span");
    dot.className = "reminder-dot";
    dot.title = "Tem descricao";
    dot.addEventListener("click", (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      showReminderMessage(event);
    });
    btn.appendChild(dot);
  }
  btn.addEventListener("click", () => {
    if (!requireAuth()) return;
    if (hasDescription) showReminderMessage(event);
    openEventDialog(event);
  });
  return btn;
}

function showHiddenDayEvents(dateObj, events) {
  if (!events.length) return;
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(dateObj);
  const lines = events.map((event) => {
    const time = formatEventTimeRange(event);
    const responsible = String(event.responsible || "").trim();
    return `- ${time} | ${event.title}${responsible ? ` | ${responsible}` : ""}`;
  });
  alert(`Atividades de ${dateLabel}:\n\n${lines.join("\n")}`);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCompanySelectLabel(company) {
  const name = String(company.name || "").trim() || "Empresa";
  const cnpj = String(company.cnpj || "").trim();
  return cnpj ? `${name} — ${cnpj}` : name;
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scoreCompanyMatch(company, query, mode = "any") {
  const q = normalizeSearchText(query);
  if (!q || q.length < COMPANY_SUGGEST_MIN_CHARS) return 0;

  const name = normalizeSearchText(company.name);
  const cnpjDigits = onlyDigits(company.cnpj);
  const qDigits = onlyDigits(query);

  let score = 0;

  if (mode === "name" || mode === "any") {
    if (name === q) score = Math.max(score, 100);
    else if (name.startsWith(q)) score = Math.max(score, 85);
    else if (name.includes(q)) score = Math.max(score, 65);
    else if (q.length >= 3 && name.split(/\s+/).some((word) => word.startsWith(q))) score = Math.max(score, 72);
  }

  if ((mode === "cnpj" || mode === "any") && qDigits.length >= COMPANY_SUGGEST_MIN_CHARS) {
    if (cnpjDigits === qDigits) score = Math.max(score, 100);
    else if (cnpjDigits.startsWith(qDigits)) score = Math.max(score, 88);
    else if (cnpjDigits.includes(qDigits)) score = Math.max(score, 70);
  }

  return score;
}

function searchCompanies(query, mode = "any", limit = COMPANY_SUGGEST_MAX_ITEMS) {
  return state.companies
    .map((company) => ({ company, score: scoreCompanyMatch(company, query, mode) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.company.name || "").localeCompare(String(b.company.name || ""), "pt-BR"))
    .slice(0, limit);
}

function findBestCompanyMatch(query, mode = "any") {
  const results = searchCompanies(query, mode, 2);
  if (!results.length) return null;
  const best = results[0];
  if (best.score >= 95) return best.company;
  if (best.score >= 80 && (!results[1] || best.score - results[1].score >= 15)) return best.company;
  return null;
}

function hideCompanySuggestBoxes() {
  refs.companyNameSuggestBox?.classList.add("hidden");
  refs.companyCnpjSuggestBox?.classList.add("hidden");
}

function pickCompanyFromSearch(company) {
  if (!company) return;
  applyCompanyToEventForm(company.id);
  populateCompanySelect(company.id);
  hideCompanySuggestBoxes();
}

function renderCompanySuggestBox(boxEl, results) {
  if (!boxEl) return;
  boxEl.innerHTML = "";
  if (!results.length) {
    boxEl.classList.add("hidden");
    return;
  }
  results.forEach(({ company }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "company-suggest-item";
    btn.setAttribute("role", "option");
    const name = String(company.name || "").trim() || "Empresa";
    const cnpj = String(company.cnpj || "").trim();
    btn.innerHTML = `<strong>${name}</strong>${cnpj ? `<span class="company-suggest-meta">CNPJ: ${cnpj}</span>` : ""}`;
    btn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      pickCompanyFromSearch(company);
    });
    boxEl.appendChild(btn);
  });
  boxEl.classList.remove("hidden");
}

function onOrganizationSearchInput() {
  const query = refs.titleInput.value.trim();
  if (query.length < COMPANY_SUGGEST_MIN_CHARS) {
    refs.companyNameSuggestBox?.classList.add("hidden");
    return;
  }
  const results = searchCompanies(query, "name");
  renderCompanySuggestBox(refs.companyNameSuggestBox, results);
  refs.companyCnpjSuggestBox?.classList.add("hidden");
}

function onCnpjSearchInput() {
  const query = refs.cnpjInput.value.trim();
  if (onlyDigits(query).length < COMPANY_SUGGEST_MIN_CHARS && query.length < COMPANY_SUGGEST_MIN_CHARS) {
    refs.companyCnpjSuggestBox?.classList.add("hidden");
    return;
  }
  const results = searchCompanies(query, "cnpj");
  renderCompanySuggestBox(refs.companyCnpjSuggestBox, results);
  refs.companyNameSuggestBox?.classList.add("hidden");
}

function scheduleCompanySuggestBlur(mode) {
  if (companySuggestBlurTimer) clearTimeout(companySuggestBlurTimer);
  companySuggestBlurTimer = setTimeout(() => {
    const query = mode === "cnpj" ? refs.cnpjInput.value : refs.titleInput.value;
    const company = findBestCompanyMatch(query, mode === "cnpj" ? "cnpj" : "name");
    if (company) pickCompanyFromSearch(company);
    else hideCompanySuggestBoxes();
  }, 180);
}

function populateCompanySelect(selectedId = "") {
  const sel = refs.companySelectInput;
  if (!sel) return;
  const previous = selectedId || sel.value || "";
  sel.innerHTML = "";
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "Selecionar empresa (opcional)";
  sel.appendChild(defaultOpt);
  state.companies
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"))
    .forEach((company) => {
      const opt = document.createElement("option");
      opt.value = company.id;
      opt.textContent = formatCompanySelectLabel(company);
      sel.appendChild(opt);
    });
  if (previous && state.companies.some((company) => company.id === previous)) {
    sel.value = previous;
  }
}

function populateCompanySuggestions() {
  hideCompanySuggestBoxes();
}

function applyCompanyToEventForm(companyId) {
  const company = state.companies.find((item) => item.id === companyId);
  if (!company) return;
  refs.titleInput.value = company.name || refs.titleInput.value;
  refs.cnpjInput.value = company.cnpj || refs.cnpjInput.value;
  refs.addressInput.value = company.address || refs.addressInput.value;
  refs.locationInput.value = company.location || refs.locationInput.value;
  refs.contactNameInput.value = company.contactName || refs.contactNameInput.value;
  refs.contactPhoneInput.value = company.contactPhone || refs.contactPhoneInput.value;
  refs.contactEmailInput.value = company.contactEmail || refs.contactEmailInput.value;
  refs.responsibleInput.value = company.responsible || refs.responsibleInput.value;
}

function onCompanySelectInEvent() {
  const companyId = refs.companySelectInput.value;
  if (!companyId) return;
  applyCompanyToEventForm(companyId);
}

async function onSaveCompanyFromEvent() {
  if (!requireAuth()) return;
  const name = refs.titleInput.value.trim();
  if (!name) {
    alert("Preencha ao menos Organização para salvar como empresa.");
    return;
  }
  const cnpj = refs.cnpjInput.value.trim();
  const duplicate = state.companies.find(
    (c) => String(c.name || "").trim() === name && String(c.cnpj || "").trim() === cnpj,
  );
  if (duplicate) {
    populateCompanySelect(duplicate.id);
    alert("Já existe cadastro com esse nome e CNPJ. Empresa selecionada acima.");
    return;
  }
  const payload = {
    name,
    cnpj,
    address: refs.addressInput.value.trim(),
    location: refs.locationInput.value.trim(),
    contactName: refs.contactNameInput.value.trim(),
    contactPhone: refs.contactPhoneInput.value.trim(),
    contactEmail: refs.contactEmailInput.value.trim(),
    responsible: refs.responsibleInput.value.trim(),
  };
  try {
    const data = await api("/companies", { method: "POST", body: payload });
    await loadCompaniesFromApi();
    const newId = data?.company?.id;
    populateCompanySelect(newId || "");
    populateCompanySuggestions();
    renderAll();
    alert("Empresa salva no banco. Nas próximas vezes, digite o nome ou CNPJ para preencher automaticamente.");
  } catch (error) {
    alert(error.message);
  }
}

function isGeneralAgendaView() {
  return state.viewingUserId === AGENDA_VIEW_ALL;
}

function isViewingOtherAgenda() {
  return Boolean(
    state.viewingUserId &&
      state.user &&
      state.viewingUserId !== state.user.id &&
      !isGeneralAgendaView(),
  );
}

function canManageOtherAgenda() {
  return state.isSuperAdmin;
}

function getEventEditMode(event) {
  if (!event) return "full";
  if (event.canFullEdit) return "full";
  if (event.canEditStatusOnly) return "statusOnly";
  return "readonly";
}

function setEventFormEditMode(mode) {
  const readOnly = mode === "readonly";
  const statusOnly = mode === "statusOnly";
  const assignedFields = new Set(["statusInput", "descriptionInput"]);
  refs.eventForm.querySelectorAll("input, select, textarea").forEach((field) => {
    if (assignedFields.has(field.id)) {
      field.disabled = readOnly;
      return;
    }
    field.disabled = readOnly || statusOnly;
  });
  const submitBtn = refs.eventForm.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.classList.toggle("hidden", readOnly);
    submitBtn.textContent = statusOnly ? "Salvar status e lembrete" : "Salvar";
  }
  refs.saveCompanyFromEventBtn.classList.toggle("hidden", readOnly || statusOnly);
  refs.statusInput.disabled = readOnly;
  refs.descriptionInput.disabled = readOnly;
}

function isEventExternallyAssigned(event) {
  if (isGeneralAgendaView()) {
    return Boolean(event?.ownerId && event.ownerId !== state.user?.id);
  }
  return Boolean(event?.isAssignedToMe && !event?.canFullEdit);
}

function openEventDialog(event = null, seedDate = null, seedStart = "09:00", seedDateOverride = null) {
  const editMode = event ? getEventEditMode(event) : isViewingOtherAgenda() && !canManageOtherAgenda() ? "readonly" : "full";
  const readOnly = editMode === "readonly";
  const statusOnly = editMode === "statusOnly";
  state.editingId = event ? event.id : null;
  refs.dialogTitle.textContent = readOnly
    ? "Visualizar evento"
    : statusOnly
      ? "Atualizar status, lembrete ou excluir"
      : event
        ? "Editar evento"
        : "Novo evento";
  const canDeleteEvent =
    event && (event.canFullEdit || event.canDelete || (statusOnly && event.canEditStatusOnly));
  refs.deleteBtn.classList.toggle("hidden", readOnly || !event || !canDeleteEvent);
  refs.confirmDoneBtn.classList.toggle(
    "hidden",
    readOnly ||
      !event ||
      ["concluido", "entrega_tecnica_finalizada"].includes(normalizeStatus(event?.status, event?.color)),
  );
  if (statusOnly || (event && (event.canFullEdit || event.canEditStatusOnly))) {
    refs.confirmDoneBtn.classList.remove("hidden");
    if (
      event &&
      ["concluido", "entrega_tecnica_finalizada"].includes(normalizeStatus(event.status, event.color))
    ) {
      refs.confirmDoneBtn.classList.add("hidden");
    }
  }

  const dateSeed = seedDateOverride || (seedDate ? toISODate(seedDate) : toISODate(state.currentDate));
  refs.titleInput.value = event ? event.title : "";
  refs.cnpjInput.value = event ? String(event.cnpj || "") : "";
  refs.addressInput.value = event ? String(event.address || "") : "";
  refs.locationInput.value = event ? String(event.location || "") : "";
  refs.contactNameInput.value = event ? String(event.contactName || "") : "";
  refs.contactPhoneInput.value = event ? String(event.contactPhone || "") : "";
  refs.contactEmailInput.value = event ? String(event.contactEmail || "") : "";
  refs.responsibleInput.value = event ? String(event.responsible || "") : "";
  const matchedCompany = event
    ? state.companies.find(
        (company) =>
          String(company.name || "").trim() === String(event.title || "").trim() &&
          String(company.cnpj || "").trim() === String(event.cnpj || "").trim(),
      )
    : null;
  populateCompanySelect(matchedCompany?.id || "");
  refs.startDateInput.value = event ? event.date : dateSeed;
  refs.endDateInput.value = event ? String(event.endDate || event.date || dateSeed) : dateSeed;
  refs.startInput.value = event ? event.start : seedStart;
  refs.endInput.value = event ? event.end : "10:00";
  refs.repeatInput.value = event ? event.repeat : "none";
  refs.statusInput.value = event ? normalizeStatus(event.status, event.color) : "pendente";
  refs.descriptionInput.value = event ? getDescriptionText(event) : "";

  hideCompanySuggestBoxes();
  setEventFormEditMode(editMode);
  refs.eventDialog.showModal();
}

function getEventEndDateTime(payload) {
  const endDay = String(payload.endDate || payload.date || "").slice(0, 10);
  const endTime = String(payload.end || "00:00");
  return new Date(`${endDay}T${endTime}:00`);
}

async function onConfirmDone() {
  if (!state.editingId) return;
  const current = state.events.find((item) => item.id === state.editingId);
  if (!current) return;

  const now = new Date();
  const endAt = getEventEndDateTime(current);
  const onTime = !Number.isNaN(endAt.getTime()) ? now <= endAt : true;

  try {
    await api(`/events/${current.id}`, {
      method: "PUT",
      body: {
        ...current,
        status: "concluido",
        color: STATUS_COLORS.concluido,
        completedAt: now.toISOString(),
        completedOnTime: onTime,
      },
    });
    refs.eventDialog.close();
    await loadEventsFromApi();
    renderAll();
    alert(onTime ? "Tarefa confirmada como realizada dentro do prazo." : "Tarefa confirmada, mas fora do prazo.");
  } catch (error) {
    alert(error.message);
  }
}

async function onSubmitEvent(event) {
  event.preventDefault();
  if (isViewingOtherAgenda() && !canManageOtherAgenda()) {
    const current = state.events.find((item) => item.id === state.editingId);
    if (!current || getEventEditMode(current) === "readonly") return;
  }
  const current = state.events.find((item) => item.id === state.editingId);
  const editMode = current ? getEventEditMode(current) : "full";
  if (editMode === "readonly") return;

  const descriptionText = refs.descriptionInput.value.trim();
  const selectedStatus = normalizeStatus(refs.statusInput.value);
  const payload =
    editMode === "statusOnly" && current
      ? {
          ...current,
          status: selectedStatus,
          color: STATUS_COLORS[selectedStatus] || STATUS_COLORS.pendente,
          description: descriptionText,
          reminderMessage: descriptionText,
        }
      : {
          id: state.editingId || crypto.randomUUID(),
          title: refs.titleInput.value.trim(),
          cnpj: refs.cnpjInput.value.trim(),
          address: refs.addressInput.value.trim(),
          location: refs.locationInput.value.trim(),
          contactName: refs.contactNameInput.value.trim(),
          contactPhone: refs.contactPhoneInput.value.trim(),
          contactEmail: refs.contactEmailInput.value.trim(),
          responsible: refs.responsibleInput.value.trim(),
          date: refs.startDateInput.value,
          endDate: refs.endDateInput.value,
          start: refs.startInput.value,
          end: refs.endInput.value,
          color: STATUS_COLORS[selectedStatus] || STATUS_COLORS.pendente,
          repeat: refs.repeatInput.value,
          status: selectedStatus,
          reminderMinutes: 10,
          description: descriptionText,
          reminderMessage: descriptionText,
          reminderSentAt: null,
        };

  if (editMode !== "statusOnly" && !payload.title) {
    alert("Preencha o campo Organização para salvar o evento.");
    return;
  }
  if (payload.endDate < payload.date) {
    alert("A data de fim precisa ser maior ou igual a data de início.");
    return;
  }
  if (payload.endDate === payload.date && payload.end <= payload.start) {
    alert("O horário de fim precisa ser maior que o de início.");
    return;
  }

  try {
    if (state.editingId) {
      await api(`/events/${payload.id}`, {
        method: "PUT",
        body: payload,
      });
    } else {
      await api("/events", {
        method: "POST",
        body: payload,
      });
    }
    refs.eventDialog.close();
    await loadEventsFromApi();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

async function onDeleteEvent() {
  if (!state.editingId) return;
  const current = state.events.find((item) => item.id === state.editingId);
  if (current && !current.canFullEdit && !current.canDelete) {
    alert("Sem permissao para excluir este agendamento.");
    return;
  }
  if (!confirm("Excluir este agendamento?")) return;
  try {
    await api(`/events/${state.editingId}`, { method: "DELETE" });
    refs.eventDialog.close();
    await loadEventsFromApi();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function populateResponsibleFilter() {
  const input = refs.responsibleFilter;
  const list = refs.responsibleFilterList;
  if (!input || !list) return;
  const previous = input.value;
  const names = [
    ...new Set(state.users.map((user) => String(user.username || "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  list.innerHTML = "";
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    list.appendChild(opt);
  });
  if (previous && names.includes(previous)) {
    input.value = previous;
  }
}

function populateCompanyFilter() {
  const input = refs.companyFilter;
  const list = refs.companyFilterList;
  if (!input || !list) return;
  const previous = input.value;
  const names = [
    ...new Set(
      state.companies.map((company) => String(company.name || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  list.innerHTML = "";
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    list.appendChild(opt);
  });
  if (previous && names.includes(previous)) {
    input.value = previous;
  }
}

function formatEventTimeRange(event) {
  const startD = String(event.date || "").slice(0, 10);
  const endD = String(event.endDate || event.date || startD).slice(0, 10);
  const startT = String(event.start || "09:00");
  const endT = String(event.end || "10:00");
  if (startD === endD) return `${startT} - ${endT}`;
  const fmtDay = (iso) => {
    const [y, mo, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(
      new Date(y, mo - 1, d),
    );
  };
  return `${fmtDay(startD)} ${startT} — ${fmtDay(endD)} ${endT}`;
}

/** Whether the calendar hour row [hour, hour+1) overlaps the event on this local date. */
function eventOverlapsSlot(event, slotDate, hour) {
  const slotIso = toISODate(slotDate);
  const startIso = String(event.date || "").slice(0, 10);
  const endIso = String(event.endDate || event.date || startIso).slice(0, 10);
  if (slotIso < startIso || slotIso > endIso) return false;
  const startParts = String(event.start || "00:00").split(":");
  const endParts = String(event.end || "00:00").split(":");
  const sh = Number(startParts[0]) || 0;
  const sm = Number(startParts[1]) || 0;
  const eh = Number(endParts[0]) || 0;
  const em = Number(endParts[1]) || 0;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const slotStart = hour * 60;
  const slotEnd = (hour + 1) * 60;
  if (startIso === endIso) {
    if (endMin <= startMin) return false;
    return endMin > slotStart && startMin < slotEnd;
  }
  if (slotIso === startIso) {
    return 24 * 60 > slotStart && startMin < slotEnd;
  }
  if (slotIso === endIso) {
    return endMin > slotStart && 0 < slotEnd;
  }
  return 24 * 60 > slotStart && 0 < slotEnd;
}

function getEventsForDate(dateObj) {
  return state.events.filter((event) => occursOnDate(event, dateObj)).sort(byStartTime);
}

function occursOnDate(event, dateObj) {
  const targetIso = toISODate(dateObj);
  const startIso = String(event.date || "").slice(0, 10);
  const endIso = String(event.endDate || event.date || startIso).slice(0, 10);
  const baseDate = fromISODate(event.date);
  const target = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  if (event.instance) {
    return sameDay(baseDate, target);
  }
  if (event.repeat === "none" || !event.repeat) {
    return targetIso >= startIso && targetIso <= endIso;
  }
  if (target < baseDate) return false;
  if (event.repeat === "daily") return true;
  if (event.repeat === "weekly") return baseDate.getDay() === target.getDay();
  if (event.repeat === "monthly") return baseDate.getDate() === target.getDate();
  return sameDay(baseDate, target);
}

function byStartTime(a, b) {
  return a.start.localeCompare(b.start);
}

function matchesSearch(event) {
  const filterResp = String(refs.responsibleFilter?.value || "")
    .trim()
    .toLowerCase();
  if (filterResp && !String(event.responsible || "").trim().toLowerCase().includes(filterResp)) {
    return false;
  }
  const filterCompany = String(refs.companyFilter?.value || "")
    .trim()
    .toLowerCase();
  if (filterCompany && !String(event.title || "").trim().toLowerCase().includes(filterCompany)) {
    return false;
  }
  const query = refs.searchInput.value.trim().toLowerCase();
  if (!query) return true;
  return (
    event.title.toLowerCase().includes(query) ||
    String(event.location || "")
      .toLowerCase()
      .includes(query) ||
    String(event.description || event.reminderMessage || "")
      .toLowerCase()
      .includes(query) ||
    String(event.status || "")
      .toLowerCase()
      .includes(query) ||
    String(event.responsible || "")
      .toLowerCase()
      .includes(query)
  );
}

function isSearching() {
  return (
    refs.searchInput.value.trim().length > 0 ||
    String(refs.responsibleFilter?.value || "").trim().length > 0 ||
    String(refs.companyFilter?.value || "").trim().length > 0
  );
}

function startReminderLoop() {
  if (state.reminderTimer) {
    clearInterval(state.reminderTimer);
  }
  if (!refs.showReminders.checked) return;
  checkReminders();
  state.reminderTimer = setInterval(checkReminders, 60_000);
}

function checkReminders() {
  void updateOverdueEvents();
  const now = new Date();
  const todayEvents = getEventsForDate(now);

  todayEvents.forEach((event) => {
    const targetDateTime = new Date(`${toISODate(now)}T${event.start}:00`);
    const reminderTime = new Date(
      targetDateTime.getTime() - Number(event.reminderMinutes || 0) * 60 * 1000,
    );
    const reminderTag = `${toISODate(now)}-${event.id}`;
    if (event.reminderSentAt === reminderTag) return;

    if (now >= reminderTime && now < targetDateTime) {
      event.reminderSentAt = reminderTag;
      notify(event, targetDateTime);
    }
  });
}

async function updateOverdueEvents() {
  if (!state.token || state.overdueSyncInProgress) return;
  const now = new Date();
  const todayIso = toISODate(now);
  const overdueEvents = state.events.filter((event) => {
    const normalizedStatus = normalizeStatus(event.status, event.color);
    if (normalizedStatus !== "pendente") return false;
    if (!event.date || !event.end) return false;
    const repeatType = String(event.repeat || "none");
    let endDate = String(event.endDate || event.date);
    if (repeatType !== "none") {
      if (!occursOnDate(event, now)) return false;
      endDate = todayIso;
    }
    const endDateTime = new Date(`${endDate}T${event.end}:00`);
    return !Number.isNaN(endDateTime.getTime()) && endDateTime < now;
  });
  if (!overdueEvents.length) return;

  state.overdueSyncInProgress = true;
  try {
    await Promise.all(
      overdueEvents.map((event) =>
        api(`/events/${event.id}`, {
          method: "PUT",
          body: {
            ...event,
            status: "atrasado",
            color: STATUS_COLORS.atrasado,
          },
        }),
      ),
    );
    await loadEventsFromApi();
    renderAll();
  } catch (error) {
    console.error("Falha ao atualizar eventos atrasados automaticamente:", error);
  } finally {
    state.overdueSyncInProgress = false;
  }
}

function notify(event, when) {
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(when);
  const extraText = event.description || event.reminderMessage || "";
  const extra = extraText ? `\n${extraText}` : "";
  const text = `${event.title} com inicio as ${time}.${extra}`;

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Lembrete da Agenda Fluxo", { body: text });
  } else {
    alert(text);
  }
}

function requestNotifyPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function toISODate(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(
    dateObj.getDate(),
  ).padStart(2, "0")}`;
}

function fromISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfWeek(dateObj) {
  const date = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function hydrateTheme() {
  const mode = localStorage.getItem(THEME_KEY);
  if (mode === "dark") {
    document.body.classList.add("dark");
  }
  updateThemeToggleIcon();
}

function toggleDarkMode() {
  document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
  updateThemeToggleIcon();
}

function updateThemeToggleIcon() {
  const isDark = document.body.classList.contains("dark");
  refs.darkModeBtn.innerHTML = isDark
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.8 3.2a8.8 8.8 0 1 0 5.9 14.9 8 8 0 0 1-8.6-12 8.6 8.6 0 0 1 2.7-2.9Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  refs.darkModeBtn.setAttribute("aria-label", isDark ? "Ativar modo claro" : "Ativar modo escuro");
  refs.darkModeBtn.setAttribute("title", isDark ? "Ativar modo claro" : "Ativar modo escuro");
}

function hydrateSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.token = parsed.token;
    state.user = parsed.user;
    state.isSuperAdmin = Boolean(parsed.user?.isSuperAdmin);
  } catch {
    state.token = null;
    state.user = null;
  }
}

function persistSession() {
  if (!state.token || !state.user) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      token: state.token,
      user: state.user,
    }),
  );
}

function updateAuthStatus() {
  if (state.user) {
    refs.authStatus.textContent = `Conectado como: ${state.user.username}`;
    refs.logoutBtn.classList.remove("hidden");
    refs.openLoginBtn.classList.add("hidden");
    refs.openRegisterBtn.classList.add("hidden");
  } else {
    refs.authStatus.textContent = "Não Conectado";
    refs.logoutBtn.classList.add("hidden");
    refs.openLoginBtn.classList.remove("hidden");
    refs.openRegisterBtn.classList.remove("hidden");
  }
  updateAgendaViewUI();
}

function populateAgendaViewSelect() {
  const sel = refs.agendaViewSelect;
  if (!sel) return;
  if (!state.token) {
    sel.disabled = true;
    sel.innerHTML = '<option value="">Minha agenda</option>';
    return;
  }
  sel.disabled = false;
  const previous = state.viewingUserId || "";
  sel.innerHTML = "";
  const ownOpt = document.createElement("option");
  ownOpt.value = "";
  ownOpt.textContent = "Minha agenda";
  sel.appendChild(ownOpt);
  const allOpt = document.createElement("option");
  allOpt.value = AGENDA_VIEW_ALL;
  allOpt.textContent = "Agenda geral (todos os usuarios)";
  sel.appendChild(allOpt);
  state.users
    .filter((user) => user.id !== state.user?.id)
    .forEach((user) => {
      const opt = document.createElement("option");
      opt.value = user.id;
      opt.textContent = `Agenda de ${user.username}`;
      sel.appendChild(opt);
    });
  const hasPrevious =
    previous === AGENDA_VIEW_ALL || state.users.some((user) => user.id === previous);
  sel.value = hasPrevious ? previous : "";
  if (!hasPrevious && previous !== AGENDA_VIEW_ALL) state.viewingUserId = null;
}

function updateAgendaViewUI() {
  const viewingOther = isViewingOtherAgenda();
  const general = isGeneralAgendaView();
  const readOnly = viewingOther && !canManageOtherAgenda();
  document.body.classList.toggle("is-readonly-agenda", readOnly);
  if (!refs.agendaViewHint) return;
  if (general) {
    refs.agendaViewHint.textContent =
      "Agenda geral: todos os agendamentos de todos os usuarios. Novos eventos vao para sua agenda.";
    refs.agendaViewHint.classList.remove("hidden");
    return;
  }
  if (!viewingOther) {
    refs.agendaViewHint.classList.add("hidden");
    refs.agendaViewHint.textContent = "";
    return;
  }
  const owner = state.users.find((user) => user.id === state.viewingUserId);
  const ownerName = owner?.username || "outro usuário";
  if (state.isSuperAdmin) {
    refs.agendaViewHint.textContent = `Visualizando a agenda de ${ownerName}. Voce (jidean) pode editar tudo.`;
  } else {
    refs.agendaViewHint.textContent = `Visualizando a agenda de ${ownerName}. Voce pode alterar o status dos seus agendamentos.`;
  }
  refs.agendaViewHint.classList.remove("hidden");
}

async function onAgendaViewChange() {
  const selected = refs.agendaViewSelect.value || null;
  state.viewingUserId = selected;
  try {
    await loadEventsFromApi();
    updateAgendaViewUI();
    renderAll();
  } catch (error) {
    alert(error.message);
    state.viewingUserId = null;
    refs.agendaViewSelect.value = "";
    updateAgendaViewUI();
  }
}

function requireAuth() {
  if (state.token) return true;
  openAuthDialog("login");
  return false;
}

async function onAuthSubmit(event) {
  event.preventDefault();
  const action = event.submitter?.dataset.authAction || state.authIntent || "login";
  const endpoint = action === "register" ? "/auth/register" : "/auth/login";
  const email = refs.authEmail.value.trim();
  const username = refs.authUsername.value.trim();
  const password = refs.authPassword.value;
  const confirmPassword = refs.authConfirmPassword.value;

  if (action === "register" && !email) {
    alert("Informe o e-mail para cadastro.");
    return;
  }
  if (action === "register" && !username) {
    alert("Informe o nome de cadastro.");
    return;
  }
  if (action === "register" && password !== confirmPassword) {
    alert("A confirmacao de senha nao confere.");
    return;
  }

  try {
    const data = await api(endpoint, {
      method: "POST",
      body: {
        email,
        username: action === "register" ? username : undefined,
        password,
      },
      noAuth: true,
    });
    state.token = data.token;
    state.user = data.user;
    state.isSuperAdmin = Boolean(data.user?.isSuperAdmin);
    state.viewingUserId = null;
    persistSession();
    updateAuthStatus();
    refs.authDialog.close();
    await loadEventsFromApi();
    await loadCompaniesFromApi();
    await loadUsersFromApi();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function openAuthDialog(intent = "login") {
  const isRegister = intent === "register";
  state.authIntent = isRegister ? "register" : "login";
  refs.authDialogTitle.textContent = isRegister ? "Cadastrar" : "Entrar";
  refs.loginBtn.classList.toggle("hidden", isRegister);
  refs.registerBtn.classList.toggle("hidden", !isRegister);
  refs.authUsernameLabel.classList.toggle("hidden", !isRegister);
  refs.authConfirmPasswordLabel.classList.toggle("hidden", !isRegister);
  refs.authEmailLabel.classList.remove("hidden");
  refs.authEmail.required = true;
  refs.authUsername.required = isRegister;
  refs.authConfirmPassword.required = isRegister;
  if (!isRegister) refs.authConfirmPassword.value = "";
  refs.resetSection.classList.add("hidden");
  refs.toggleResetBtn.textContent = "Recuperar senha";
  refs.authDialog.showModal();
}

async function onRequestPasswordReset() {
  const email = refs.resetEmail.value.trim();
  if (!email) {
    alert("Informe o e-mail para receber o codigo.");
    return;
  }
  try {
    const data = await api("/auth/request-reset", {
      method: "POST",
      body: { email },
      noAuth: true,
    });
    let message = "Se o e-mail existir, o codigo de recuperacao foi enviado.";
    if (data.devCode) {
      message += `\n\nCodigo de desenvolvimento: ${data.devCode}`;
    }
    alert(message);
  } catch (error) {
    alert(error.message);
  }
}

async function onConfirmPasswordReset() {
  const email = refs.resetEmail.value.trim();
  const code = refs.resetCode.value.trim();
  const newPassword = refs.resetNewPassword.value;
  if (!email || !code || !newPassword) {
    alert("Preencha e-mail, codigo e nova senha.");
    return;
  }
  try {
    await api("/auth/reset-password", {
      method: "POST",
      body: { email, code, newPassword },
      noAuth: true,
    });
    refs.resetCode.value = "";
    refs.resetNewPassword.value = "";
    alert("Senha redefinida com sucesso. Agora voce pode entrar.");
  } catch (error) {
    alert(error.message);
  }
}

function logout() {
  state.token = null;
  state.user = null;
  state.isSuperAdmin = false;
  state.viewingUserId = null;
  state.events = [];
  state.companies = [];
  state.users = [];
  persistSession();
  updateAuthStatus();
  renderAll();
}

function onOpenShare() {
  if (!requireAuth()) return;
  if (isViewingOtherAgenda() && !canManageOtherAgenda()) {
    alert("Volte para sua agenda para compartilhar.");
    return;
  }
  refs.shareDialog.showModal();
}

function resetCompanyForm() {
  state.editingCompanyId = null;
  refs.companyNameInput.value = "";
  refs.companyCnpjInput.value = "";
  refs.companyAddressInput.value = "";
  refs.companyLocationInput.value = "";
  refs.companyContactNameInput.value = "";
  refs.companyContactPhoneInput.value = "";
  refs.companyContactEmailInput.value = "";
  refs.companyResponsibleInput.value = "";
  refs.deleteCompanyBtn.classList.add("hidden");
}

function fillCompanyForm(company) {
  state.editingCompanyId = company.id;
  refs.companyNameInput.value = String(company.name || "");
  refs.companyCnpjInput.value = String(company.cnpj || "");
  refs.companyAddressInput.value = String(company.address || "");
  refs.companyLocationInput.value = String(company.location || "");
  refs.companyContactNameInput.value = String(company.contactName || "");
  refs.companyContactPhoneInput.value = String(company.contactPhone || "");
  refs.companyContactEmailInput.value = String(company.contactEmail || "");
  refs.companyResponsibleInput.value = String(company.responsible || "");
  refs.deleteCompanyBtn.classList.remove("hidden");
}

function renderCompaniesList() {
  refs.companiesList.innerHTML = "";
  if (!state.companies.length) {
    const empty = document.createElement("small");
    empty.textContent = "Nenhuma empresa cadastrada.";
    refs.companiesList.appendChild(empty);
    return;
  }
  state.companies
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"))
    .forEach((company) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "company-item-btn";
      if (state.editingCompanyId === company.id) btn.classList.add("active");
      btn.textContent = `${company.name}${company.cnpj ? ` (${company.cnpj})` : ""}`;
      btn.addEventListener("click", () => {
        fillCompanyForm(company);
        renderCompaniesList();
      });
      refs.companiesList.appendChild(btn);
    });
}

function onOpenCompaniesDialog() {
  if (!requireAuth()) return;
  if (isViewingOtherAgenda() && !canManageOtherAgenda()) {
    alert("Volte para sua agenda para gerenciar empresas.");
    return;
  }
  resetCompanyForm();
  renderCompaniesList();
  refs.companiesDialog.showModal();
}

async function onSubmitCompany(event) {
  event.preventDefault();
  const payload = {
    name: refs.companyNameInput.value.trim(),
    cnpj: refs.companyCnpjInput.value.trim(),
    address: refs.companyAddressInput.value.trim(),
    location: refs.companyLocationInput.value.trim(),
    contactName: refs.companyContactNameInput.value.trim(),
    contactPhone: refs.companyContactPhoneInput.value.trim(),
    contactEmail: refs.companyContactEmailInput.value.trim(),
    responsible: refs.companyResponsibleInput.value.trim(),
  };
  if (!payload.name) return;
  try {
    if (state.editingCompanyId) {
      await api(`/companies/${state.editingCompanyId}`, {
        method: "PUT",
        body: payload,
      });
    } else {
      await api("/companies", {
        method: "POST",
        body: payload,
      });
    }
    await loadCompaniesFromApi();
    resetCompanyForm();
    renderCompaniesList();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

async function onDeleteCompany() {
  if (!state.editingCompanyId) return;
  try {
    await api(`/companies/${state.editingCompanyId}`, { method: "DELETE" });
    await loadCompaniesFromApi();
    resetCompanyForm();
    renderCompaniesList();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
}

function onShareWhatsapp() {
  if (!requireAuth()) return;
  const targetEmail = refs.shareEmail.value.trim();
  const appUrl = window.location.origin;
  const owner = state.user?.username ? ` (${state.user.username})` : "";
  const msg =
    `Convite para compartilhar a agenda${owner}.\n` +
    `Abra: ${appUrl}\n` +
    (targetEmail ? `Use o e-mail: ${targetEmail}\n` : "") +
    "Depois, acesse com esse e-mail para ver os eventos compartilhados.";

  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function onShareSubmit(event) {
  event.preventDefault();
  try {
    const data = await api("/share", {
      method: "POST",
      body: { targetEmail: refs.shareEmail.value.trim() },
    });
    refs.shareDialog.close();
    alert(data?.message || "Convite enviado/registrado com sucesso.");
  } catch (error) {
    alert(error.message);
  }
}

async function loadEventsFromApi() {
  if (!state.token) return;
  let endpoint = "/events";
  if (state.viewingUserId === AGENDA_VIEW_ALL) {
    endpoint = "/events/all";
  } else if (state.viewingUserId) {
    endpoint = `/users/${state.viewingUserId}/events`;
  }
  const data = await api(endpoint);
  if (typeof data.isSuperAdmin === "boolean") {
    state.isSuperAdmin = data.isSuperAdmin;
    if (state.user) state.user.isSuperAdmin = data.isSuperAdmin;
  }
  state.events = (data.events || []).map((event) => ({
    ...event,
    status: normalizeStatus(event.status, event.color),
    color:
      STATUS_COLORS[normalizeStatus(event.status, event.color)] ||
      event.color ||
      STATUS_COLORS.pendente,
    description: getDescriptionText(event),
    reminderMessage: getDescriptionText(event),
    canFullEdit: Boolean(event.canFullEdit),
    canEditStatusOnly: Boolean(event.canEditStatusOnly),
    canDelete: Boolean(event.canDelete),
    isAssignedToMe: Boolean(event.isAssignedToMe),
  }));
}

async function loadCompaniesFromApi() {
  if (!state.token) return;
  const data = await api("/companies");
  state.companies = (data.companies || []).map((company) => ({
    ...company,
    name: String(company.name || "").trim(),
    cnpj: String(company.cnpj || "").trim(),
    address: String(company.address || "").trim(),
    location: String(company.location || "").trim(),
    contactName: String(company.contactName || "").trim(),
    contactPhone: String(company.contactPhone || "").trim(),
    contactEmail: String(company.contactEmail || "").trim(),
    responsible: String(company.responsible || "").trim(),
  }));
}

async function loadUsersFromApi() {
  if (!state.token) return;
  const data = await api("/users");
  state.users = (data.users || []).map((user) => ({
    id: user.id,
    username: String(user.username || "").trim(),
  }));
}

function statusFromColor(color) {
  const normalizedColor = String(color || "").trim().toLowerCase();
  const pair = Object.entries(STATUS_COLORS).find(([, hex]) => hex.toLowerCase() === normalizedColor);
  return pair ? pair[0] : "pendente";
}

function normalizeStatus(status, color = "") {
  const value = String(status || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
  const aliases = {
    em_atraso: "atrasado",
    reagendado: "reagendamento",
    reagendamento: "reagendamento",
    concluído: "concluido",
    entrega_técnica_finalizada: "entrega_tecnica_finalizada",
  };
  const normalized = aliases[value] || value;
  if (STATUS_COLORS[normalized]) return normalized;
  return statusFromColor(color);
}

async function onImportIcs(event) {
  if (!requireAuth()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    await api("/ics/import", {
      method: "POST",
      body: { icsText: text },
    });
    await loadEventsFromApi();
    renderAll();
    alert("Arquivo .ics importado.");
  } catch (error) {
    alert(error.message);
  } finally {
    refs.importIcsInput.value = "";
  }
}

async function exportIcs() {
  if (!requireAuth()) return;
  try {
    const data = await api("/ics/export");
    downloadFile(`agenda-fluxo-${toISODate(new Date())}.ics`, data.icsText, "text/calendar");
  } catch (error) {
    alert(error.message);
  }
}

async function exportPdf() {
  if (!window.jspdf) {
    alert("Biblioteca de PDF nao foi carregada.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const query = refs.searchInput.value.trim();
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    state.currentDate,
  );
  const viewLabel = state.currentView === "month" ? "Mensal" : "Semanal";
  const ownerLabel = isGeneralAgendaView()
    ? " | Agenda geral (todos)"
    : isViewingOtherAgenda()
      ? ` | Agenda de ${state.users.find((u) => u.id === state.viewingUserId)?.username || "usuario"}`
      : "";
  const subtitle = `Visualizacao: ${viewLabel} | Periodo: ${label}${ownerLabel}`;

  let rangeStart;
  let rangeEnd;
  if (state.currentView === "month") {
    rangeStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
    rangeEnd = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + 1, 0);
  } else {
    rangeStart = startOfWeek(state.currentDate);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 6);
  }

  const occurrences = collectPdfOccurrencesInRange(rangeStart, rangeEnd);
  const hasList = occurrences.length > 0;
  const doc = new jsPDF({
    orientation: hasList ? "portrait" : "landscape",
    unit: "mm",
    format: "a4",
  });

  if (hasList) {
    appendPdfFullEventList(doc, occurrences, { isFirstSection: true, subtitle, query });
  }

  const logoAsset = await getPdfLogoAsset();

  if (state.currentView === "month") {
    const monthRowChunks = [
      [0, 2],
      [3, 5],
    ];
    monthRowChunks.forEach(([rowStart, rowEnd], index) => {
      doc.addPage("a4", "landscape");
      const partLabel = `Calendario ${index + 1}/2`;
      const contentStartY = drawPdfCalendarPageHeader(doc, {
        logoAsset,
        subtitle: `${subtitle} | ${partLabel}`,
        query,
      });
      exportMonthPdf(doc, contentStartY, rowStart, rowEnd);
    });
  } else if (hasList) {
    appendPdfWeekDetailPages(doc, occurrences, { subtitle, query });
    doc.addPage("a4", "landscape");
    const contentStartY = drawPdfCalendarPageHeader(doc, { logoAsset, subtitle, query });
    exportWeekPdf(doc, contentStartY);
  } else {
    doc.addPage("a4", "landscape");
    const contentStartY = drawPdfCalendarPageHeader(doc, { logoAsset, subtitle, query });
    exportWeekPdf(doc, contentStartY);
  }

  doc.save(`agenda-fluxo-${toISODate(new Date())}.pdf`);
}

function drawPdfCalendarPageHeader(doc, { logoAsset, subtitle, query }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerH = 20;
  doc.setFillColor(17, 35, 72);
  doc.rect(0, 0, pageWidth, headerH, "F");
  let titleX = 37;
  if (logoAsset?.dataUrl) {
    const maxLogoWidth = 24;
    const maxLogoHeight = 14;
    const logoRatio = logoAsset.width / logoAsset.height;
    let drawWidth = maxLogoWidth;
    let drawHeight = drawWidth / logoRatio;
    if (drawHeight > maxLogoHeight) {
      drawHeight = maxLogoHeight;
      drawWidth = drawHeight * logoRatio;
    }
    const logoX = 8;
    const logoY = 3 + (maxLogoHeight - drawHeight) / 2;
    doc.addImage(logoAsset.dataUrl, "PNG", logoX, logoY, drawWidth, drawHeight);
    titleX = logoX + drawWidth + 5;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(PDF_LAYOUT.headerTitle);
  doc.text("Agenda Fluxo PGR — Visão geral", titleX, 9);
  doc.setFontSize(PDF_LAYOUT.headerSub);
  doc.text(subtitle, titleX, 15.5);

  let filterY = headerH + 4;
  if (query) {
    doc.setTextColor(22, 35, 65);
    doc.setFillColor(233, 240, 255);
    doc.roundedRect(10, filterY, Math.min(120, pageWidth - 20), 9, 1.8, 1.8, "F");
    doc.setFontSize(PDF_LAYOUT.headerSub);
    doc.text(`Filtro: ${query}`, 12, filterY + 6);
    filterY += 12;
  }

  const legendBottomY = drawStatusLegend(doc, 10, filterY + 2);
  return Math.max(headerH + 14, legendBottomY + 6);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token && !options.noAuth) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function togglePasswordVisibility(inputElement, buttonElement) {
  const isPassword = inputElement.type === "password";
  inputElement.type = isPassword ? "text" : "password";
  updateEyeIcon(buttonElement, !isPassword);
  buttonElement.setAttribute("aria-label", isPassword ? "Ocultar senha" : "Mostrar senha");
}

function updateEyeIcon(buttonElement, isVisible) {
  if (isVisible) {
    buttonElement.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.3 4.7a1 1 0 1 1 1.4-1.4l15.9 15.9a1 1 0 1 1-1.4 1.4l-2.3-2.3A11.7 11.7 0 0 1 12 19c-4.8 0-8.6-2.9-10-7a11.6 11.6 0 0 1 4-5.3L3.3 4.7Zm4.2 4.2A4.6 4.6 0 0 0 7.3 12a4.7 4.7 0 0 0 6.6 4.2l-1.5-1.5A2.7 2.7 0 0 1 9.3 11l-1.8-1.8Zm9.3 5.1A9.1 9.1 0 0 0 20 12c-1.4-3-4.4-5-8-5-1 0-2 .2-3 .5l-1.6-1.6A12 12 0 0 1 12 5c4.8 0 8.6 2.9 10 7-.5 1.5-1.4 2.8-2.5 3.9L16.8 14Z"></path>
      </svg>
    `;
    return;
  }
  buttonElement.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5c4.8 0 8.6 2.9 10 7-1.4 4.1-5.2 7-10 7s-8.6-2.9-10-7c1.4-4.1 5.2-7 10-7Zm0 2c-3.6 0-6.6 2-8 5 1.4 3 4.4 5 8 5s6.6-2 8-5c-1.4-3-4.4-5-8-5Zm0 2.3a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Z"></path>
    </svg>
  `;
}

function showReminderMessage(event) {
  const latestEvent = state.events.find((item) => item.id === event.id) || event;
  const text = getDescriptionText(latestEvent);
  if (text) {
    refs.reminderText.textContent = text;
    refs.reminderDialog.showModal();
    return;
  }
  const minutes = Number(latestEvent.reminderMinutes || 0);
  if (minutes > 0) {
    alert(`Este evento possui lembrete configurado para ${minutes} minuto(s) antes.`);
  }
}

function getDescriptionText(event) {
  return String(event.description || event.reminderMessage || "").trim();
}

function pdfStatusLabel(event) {
  const key = normalizeStatus(event.status, event.color);
  const labels = {
    pendente: "Pendente",
    atrasado: "Atrasado",
    reagendamento: "Reagendado",
    concluido: "Concluido",
    entrega_tecnica_finalizada: "Entrega tecnica finalizada",
  };
  return labels[key] || "Pendente";
}

/** Todas as ocorrencias visiveis no intervalo (respeita busca / filtros da tela). */
function collectPdfOccurrencesInRange(rangeStart, rangeEnd) {
  const items = [];
  const cursor = new Date(
    rangeStart.getFullYear(),
    rangeStart.getMonth(),
    rangeStart.getDate(),
  );
  const end = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
  while (cursor <= end) {
    const dayCopy = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    getEventsForDate(dayCopy)
      .filter(matchesSearch)
      .forEach((event) => {
        items.push({ date: dayCopy, event });
      });
    cursor.setDate(cursor.getDate() + 1);
  }
  items.sort((a, b) => {
    const da = toISODate(a.date).localeCompare(toISODate(b.date));
    if (da !== 0) return da;
    return byStartTime(a.event, b.event);
  });
  return items;
}

function appendPdfListPageHeader(doc, margin, subtitle = "", query = "") {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerH = 18;
  doc.setFillColor(17, 35, 72);
  doc.rect(0, 0, pageWidth, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(PDF_LAYOUT.listPageTitle);
  doc.text("Lista completa dos agendamentos (impressao legivel)", margin, 9.5);
  doc.setFontSize(PDF_LAYOUT.headerSub);
  let nextY = headerH + 4;
  if (subtitle) {
    doc.text(subtitle, margin, 14.5);
    doc.setFontSize(10);
    doc.text("Todos os agendamentos do periodo estao nesta secao (fonte grande).", margin, 19);
    nextY = 24;
  } else {
    doc.text("Secao principal para leitura e impressao.", margin, 14.5);
    nextY = 20;
  }
  if (query) {
    doc.setTextColor(22, 35, 65);
    doc.setFillColor(233, 240, 255);
    doc.roundedRect(margin, nextY, pageWidth - margin * 2, 9, 1.8, 1.8, "F");
    doc.setFontSize(PDF_LAYOUT.headerSub);
    doc.text(`Filtro: ${query}`, margin + 2, nextY + 6);
    nextY += 12;
  }
  return nextY + 4;
}

function appendPdfFullEventList(doc, occurrences, options = {}) {
  if (!occurrences.length) return;

  const { isFirstSection = false, subtitle = "", query = "" } = options;
  if (!isFirstSection) {
    doc.addPage("a4", "portrait");
  }
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = appendPdfListPageHeader(doc, margin, subtitle, query);

  const dateFmt = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const maxW = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 14;

  const ensureSpace = (neededMm) => {
    if (y + neededMm <= bottomLimit) return;
    doc.addPage("a4", "portrait");
    y = appendPdfListPageHeader(doc, margin, subtitle, query);
  };

  let lastDateKey = "";
  occurrences.forEach(({ date, event }, index) => {
    const dateKey = toISODate(date);
    const head = dateFmt.format(date);
    const timeRange = formatEventTimeRange(event).replace(/\s+/g, " ");
    const title = String(event.title || "Sem titulo").trim();
    const status = pdfStatusLabel(event);
    const resp = String(event.responsible || "").trim();
    const location = String(event.location || "").trim();
    const reminder = getDescriptionText(event);
    const owner = String(event.ownerUsername || "").trim();
    const line1 = `${timeRange}  —  ${title}`;
    const line2Parts = [status];
    if (resp) line2Parts.unshift(`Resp.: ${resp}`);
    if (location) line2Parts.push(`Local: ${location}`);
    if (owner && event.isAssignedToMe) line2Parts.push(`Agenda: ${owner}`);
    const line2 = line2Parts.join("  |  ");

    const wrapped1 = doc.splitTextToSize(line1, maxW);
    const wrapped2 = doc.splitTextToSize(line2, maxW);
    const wrapped3 = reminder ? doc.splitTextToSize(`Lembrete: ${reminder}`, maxW) : [];
    const dateHeaderH = dateKey !== lastDateKey ? PDF_LAYOUT.listLineGap + 2 : 0;
    const blockH =
      dateHeaderH +
      wrapped1.length * PDF_LAYOUT.listLineGap +
      wrapped2.length * (PDF_LAYOUT.listLineGap - 0.5) +
      wrapped3.length * (PDF_LAYOUT.listLineGap - 0.5) +
      PDF_LAYOUT.listBlockGap;

    ensureSpace(Math.max(PDF_LAYOUT.listMinBlockHeight, blockH));

    if (dateKey !== lastDateKey) {
      if (lastDateKey) y += 3;
      doc.setFontSize(PDF_LAYOUT.listFontDate);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(17, 35, 72);
      doc.text(head, margin, y);
      y += PDF_LAYOUT.listLineGap + 1;
      lastDateKey = dateKey;
    }

    doc.setFontSize(PDF_LAYOUT.listFontPrimary);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(31, 47, 86);
    wrapped1.forEach((ln) => {
      doc.text(ln, margin + 2, y);
      y += PDF_LAYOUT.listLineGap;
    });

    doc.setFontSize(PDF_LAYOUT.listFontSecondary);
    doc.setTextColor(70, 82, 110);
    wrapped2.forEach((ln) => {
      doc.text(ln, margin + 2, y);
      y += PDF_LAYOUT.listLineGap - 0.5;
    });

    if (wrapped3.length) {
      doc.setFontSize(PDF_LAYOUT.listFontNote);
      wrapped3.forEach((ln) => {
        doc.text(ln, margin + 2, y);
        y += PDF_LAYOUT.listLineGap - 0.5;
      });
    }

    y += PDF_LAYOUT.listBlockGap - 2;

    if ((index + 1) % 12 === 0 && index + 1 < occurrences.length) {
      doc.setFontSize(9);
      doc.setTextColor(120, 132, 160);
      ensureSpace(8);
      doc.text("— continua na proxima pagina —", margin, y);
      y += 6;
    }
  });
}

function appendPdfWeekDetailPages(doc, occurrences, options = {}) {
  const { subtitle = "", query = "" } = options;
  if (!occurrences.length) return;

  const byDay = new Map();
  occurrences.forEach((item) => {
    const key = toISODate(item.date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(item);
  });

  const dateFmt = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  byDay.forEach((dayItems, isoDate) => {
    doc.addPage("a4", "portrait");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = appendPdfListPageHeader(
      doc,
      margin,
      `${subtitle} | Semana — ${dateFmt.format(dayItems[0].date)}`,
      query,
    );

    dayItems.forEach(({ event }) => {
      const timeRange = formatEventTimeRange(event).replace(/\s+/g, " ");
      const title = String(event.title || "Sem titulo").trim();
      const status = pdfStatusLabel(event);
      const resp = String(event.responsible || "").trim();
      const line = `${timeRange} — ${title}`;
      const meta = [status, resp ? `Resp.: ${resp}` : ""].filter(Boolean).join("  |  ");

      doc.setFontSize(PDF_LAYOUT.listFontPrimary);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(31, 47, 86);
      doc.text(line, margin, y);
      y += PDF_LAYOUT.listLineGap;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(PDF_LAYOUT.listFontSecondary);
      doc.setTextColor(70, 82, 110);
      doc.text(meta, margin, y);
      y += PDF_LAYOUT.listBlockGap;
    });
  });
}

function exportMonthPdf(doc, startY = 42, rowStart = 0, rowEnd = 5) {
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const startX = 8;
  const contentWidth = pageWidth - startX * 2;
  const contentHeight = pageHeight - startY - 6;
  const colWidth = contentWidth / 7;
  const rowCount = rowEnd - rowStart + 1;
  const rowHeight = contentHeight / rowCount;
  const monthStart = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth(), 1);
  const renderStart = new Date(monthStart);
  renderStart.setDate(renderStart.getDate() - renderStart.getDay());
  const today = new Date();

  weekdays.forEach((day, idx) => {
    doc.setFillColor(226, 236, 255);
    doc.roundedRect(startX + idx * colWidth, startY - 10, colWidth - 0.3, 9, 1.5, 1.5, "F");
    doc.setFontSize(PDF_LAYOUT.weekday);
    doc.setTextColor(31, 47, 86);
    doc.text(day, startX + idx * colWidth + 2, startY - 4.5);
  });

  for (let row = rowStart; row <= rowEnd; row += 1) {
    const displayRow = row - rowStart;
    for (let col = 0; col < 7; col += 1) {
      const cellX = startX + col * colWidth;
      const cellY = startY + displayRow * rowHeight;
      const date = new Date(renderStart);
      date.setDate(renderStart.getDate() + row * 7 + col);
      const isMuted = date.getMonth() !== state.currentDate.getMonth();
      const isToday = sameDay(date, today);

      doc.setFillColor(isMuted ? 246 : 255, isMuted ? 248 : 255, isMuted ? 252 : 255);
      doc.setDrawColor(215, 223, 240);
      doc.roundedRect(cellX, cellY, colWidth - 0.3, rowHeight - 0.4, 1.2, 1.2, "FD");

      if (isToday) {
        doc.setFillColor(26, 115, 232);
        doc.roundedRect(cellX + 1.4, cellY + 1.2, 9.6, 5.6, 1.3, 1.3, "F");
      }

      const dateText = String(date.getDate());
      doc.setFontSize(PDF_LAYOUT.dayNumber);
      doc.setTextColor(isToday ? 255 : isMuted ? 149 : 52, isToday ? 255 : isMuted ? 158 : 69, isToday ? 255 : isMuted ? 175 : 102);
      doc.text(dateText, cellX + 2.4, cellY + 6);

      const allDayEvents = getEventsForDate(date).filter(matchesSearch);
      const eventsToShow = allDayEvents.slice(0, PDF_LAYOUT.monthEventsPerCell);
      const maxLineY = cellY + rowHeight - 4;
      let lineY = cellY + 10;

      if (allDayEvents.length > PDF_LAYOUT.monthEventsPerCell) {
        doc.setFontSize(PDF_LAYOUT.dayCountFont);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(31, 47, 86);
        doc.text(`${allDayEvents.length} agend.`, cellX + 2, cellY + rowHeight - 4);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(PDF_LAYOUT.hiddenHint);
        doc.setTextColor(120, 132, 160);
        doc.text("ver lista", cellX + 2, cellY + rowHeight - 1.5);
      }

      let drawn = 0;
      eventsToShow.forEach((event) => {
        if (lineY >= maxLineY - 1) return;
        if (allDayEvents.length > PDF_LAYOUT.monthEventsPerCell) return;
        const remaining = eventsToShow.length - drawn;
        const slotH = Math.max(5, (maxLineY - lineY) / remaining);
        lineY += drawEventChip(doc, cellX + 1.2, lineY, colWidth - 2.8, event, slotH);
        drawn += 1;
      });

      const hiddenCount = Math.max(0, allDayEvents.length - drawn);
      if (hiddenCount > 0 && allDayEvents.length <= PDF_LAYOUT.monthEventsPerCell) {
        doc.setFontSize(PDF_LAYOUT.hiddenHint);
        doc.setTextColor(120, 132, 160);
        doc.text(`+${hiddenCount} na lista`, cellX + 2, cellY + rowHeight - 2.5);
      }
    }
  }
}

function exportWeekPdf(doc, startY = 42) {
  const weekStart = startOfWeek(state.currentDate);
  const startX = 8;
  const colWidth = 40;
  const colHeight = doc.internal.pageSize.getHeight() - startY - 8;

  for (let i = 0; i < 7; i += 1) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const x = startX + i * colWidth;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(215, 223, 240);
    doc.roundedRect(x, startY, colWidth - 0.3, colHeight, 1.3, 1.3, "FD");
    doc.setFillColor(226, 236, 255);
    doc.roundedRect(x + 0.2, startY + 0.2, colWidth - 0.7, 8, 1.2, 1.2, "F");
    doc.setFontSize(PDF_LAYOUT.weekColumnHead);
    doc.setTextColor(31, 47, 86);
    const head = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit" }).format(date);
    doc.text(head, x + 2, startY + 6.2);

    const events = getEventsForDate(date).filter(matchesSearch);
    const eventsToShow = events.slice(0, PDF_LAYOUT.monthEventsPerCell);
    const maxLineY = startY + colHeight - 3;
    let lineY = startY + 11.5;
    let drawn = 0;
    eventsToShow.forEach((event) => {
      if (lineY >= maxLineY - 0.4) return;
      const remaining = eventsToShow.length - drawn;
      const slotH = Math.max(1.8, (maxLineY - lineY) / remaining);
      lineY += drawEventChip(doc, x + 1.2, lineY, colWidth - 2.8, event, slotH);
      drawn += 1;
    });
    const hiddenCount = Math.max(0, events.length - drawn);
    if (hiddenCount > 0) {
      doc.setFontSize(PDF_LAYOUT.hiddenHint);
      doc.setTextColor(120, 132, 160);
      doc.text(`+${hiddenCount} na lista`, x + 2, startY + colHeight - 2.8);
    }
  }
}

function pdfEventChipLayout(doc, text, maxWidthMm, maxHeightMm) {
  const minFont = PDF_LAYOUT.chipFontMin;
  const maxFont = PDF_LAYOUT.chipFontMax;
  const lineFactor = PDF_LAYOUT.chipLineFactor;
  for (let fontSize = maxFont; fontSize >= minFont; fontSize -= 0.35) {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidthMm);
    const lineH = fontSize * lineFactor;
    const height = lines.length * lineH + 1.6;
    if (height <= maxHeightMm) {
      return { fontSize, lines: lines.slice(0, 2), lineH, height };
    }
  }
  doc.setFontSize(minFont);
  const lines = doc.splitTextToSize(text, maxWidthMm).slice(0, 2);
  const lineH = minFont * lineFactor;
  const height = Math.min(maxHeightMm, lines.length * lineH + 1.6);
  return {
    fontSize: minFont,
    lines,
    lineH,
    height,
  };
}

function drawEventChip(doc, x, y, w, event, maxHeight = 8) {
  const statusColor = STATUS_COLORS[normalizeStatus(event.status, event.color)] || "#3b82f6";
  const { r, g, b } = hexToRgb(statusColor);
  const timeBit = formatEventTimeRange(event).replace(/\s+/g, " ");
  const title = String(event.title || "Sem titulo").trim();
  const label = `${timeBit} — ${title}`.replace(/\s+/g, " ");
  const layout = pdfEventChipLayout(doc, label, w - 2.4, Math.max(maxHeight, 7));

  doc.setFillColor(r, g, b);
  doc.roundedRect(x, y, w, layout.height, 1.2, 1.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(layout.fontSize);
  layout.lines.forEach((line, index) => {
    doc.text(line, x + 1.2, y + 1.1 + (index + 1) * layout.lineH);
  });
  return layout.height + 0.25;
}

function drawStatusLegend(doc, startX, y) {
  const items = [
    { label: "Pendente", color: STATUS_COLORS.pendente },
    { label: "Atrasado", color: STATUS_COLORS.atrasado },
    { label: "Reagendado", color: STATUS_COLORS.reagendamento },
    { label: "Concluido", color: STATUS_COLORS.concluido },
    { label: "Entrega tecnica finalizada", color: STATUS_COLORS.entrega_tecnica_finalizada },
  ];
  let x = startX;
  let currentY = y;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxX = pageWidth - 12;
  const lineGap = 7;
  doc.setFontSize(PDF_LAYOUT.legend);
  items.forEach((item) => {
    const itemWidth = item.label.length * 1.65 + 14;
    if (x + itemWidth > maxX) {
      x = startX;
      currentY += lineGap;
    }
    const { r, g, b } = hexToRgb(item.color);
    doc.setFillColor(r, g, b);
    doc.circle(x, currentY, 1.5, "F");
    doc.setTextColor(47, 63, 96);
    doc.text(item.label, x + 3, currentY + 0.8);
    x += itemWidth;
  });
  return currentY;
}

function hexToRgb(hex) {
  const clean = String(hex || "")
    .replace("#", "")
    .padEnd(6, "0")
    .slice(0, 6);
  const n = Number.parseInt(clean, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function getPdfLogoAsset() {
  if (pdfLogoAssetPromise) return pdfLogoAssetPromise;
  pdfLogoAssetPromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 0) {
          pixels[i] = 255;
          pixels[i + 1] = 255;
          pixels[i + 2] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => resolve(null);
    img.src = PDF_LOGO_SRC;
  });
  return pdfLogoAssetPromise;
}
