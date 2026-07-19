(function () {
  "use strict";

  var roleLabels = {
    technician: { name: "Técnico", label: "Operação" },
    manager: { name: "Gestor", label: "Administração" },
    developer: { name: "Desenvolvedor", label: "DEV · Integração" }
  };
  var backend = window.gpjBackend || null;
  var backendState = {
    configured: Boolean(backend && backend.configured),
    remoteReady: false,
    status: backend && backend.configured ? "connecting" : "local",
    profile: null,
    realtimeStop: null,
    reloadTimer: null
  };
  var sectorLabels = { assembly: "Montagem", assistance: "Assistência", rma: "RMA" };
  var state = {
    view: "overview",
    sector: "assembly",
    role: localStorage.getItem("gpj-role") || "technician",
    user: localStorage.getItem("gpj-user") || "Técnico",
    repairTab: "active",
    theme: localStorage.getItem("gpj-theme") || "light",
    lastSerial: Number(localStorage.getItem("gpj-last-serial") || 184),
    api: JSON.parse(localStorage.getItem("gpj-api") || "{}"),
    selectedChannel: localStorage.getItem("gpj-selected-channel") || "B1C1",
    traceQuery: "73471",
    traceSelected: "GPJX3520",
    sidebarCollapsed: localStorage.getItem("gpj-sidebar-collapsed") !== "false",
    repairAlertMinutes: Number(localStorage.getItem("gpj-repair-alert-minutes") || 60),
    repairCriticalMinutes: Number(localStorage.getItem("gpj-repair-critical-minutes") || 100),
    biosFixedOp: localStorage.getItem("gpj-bios-fixed-op") || "",
    notifications: [
      { level: "critical", module: "Montagem", time: "Agora", title: "O.P. 73471 é prioridade", text: "O gestor marcou esta ordem como prioridade. Três máquinas aguardam início no KVM." },
      { level: "warning", module: "Reparo", time: "há 8 min", title: "Máquina aguardando peça", text: "GPJX3520 está em espera e já ultrapassou o tempo de atenção configurado." },
      { level: "info", module: "Vinculação", time: "há 14 min", title: "Conferência de seriais", text: "A O.P. 73664 possui 12 seriais reservados e 12 vinculados. Lote consistente." },
      { level: "warning", module: "BurnIn", time: "há 37 min", title: "Sincronização pendente", text: "O agente do servidor ainda não confirmou o último ciclo de leitura do controle.csv." }
    ]
  };

  var defaultProblems = ["Não liga","Não reconhece HD","Gabinete danificado","Falha de vídeo","Falha de áudio","Falha LAN","Falha de memória","Falha no cooler","Sistema corrompido","SSD com defeito","Superaquecimento","Travando","USB com defeito"];
  var defaultSolutions = [
    "Limpeza interna e reaplicação de pasta térmica",
    "Reencaixe de memórias RAM",
    "Reencaixe de cabos SATA / alimentação",
    "Atualização/Reset da BIOS",
    "Reinstalação do sistema operacional",
    "Atualização de drivers",
    "Reaperto do dissipador / cooler",
    "Reencaixe da placa de vídeo",
    "Reset da CMOS",
    "Ajuste de configuração no setup",
    "Reencaixe do painel frontal",
    "Sem defeito constatado"
  ];
  var defaultParts = [
    { code:"11773", description:"MEMÓRIA DDR3" },
    { code:"26322", description:"Memória" },
    { code:"26324", description:"Processador i7 4790" },
    { code:"32512", description:"Processador i5 660" },
    { code:"38011", description:"Processador" }
  ];
  var defaultRepairs = [
    { id:1, op:"73471", serial:"GPJX3520", issue:"Não reconhece HD", notes:"Verificar SSD e cabo SATA.", tech:"Pedro", elapsed:"00:41:28", priority:"high", stage:0, status:"active" },
    { id:2, op:"73462", serial:"GPJX3571", issue:"Gabinete danificado", notes:"Aguardando gabinete compatível.", tech:"Fabio", elapsed:"00:24:47", priority:"normal", stage:1, status:"waiting" },
    { id:3, op:"73464", serial:"GPJX3519", issue:"Não liga", notes:"", tech:"Washington", elapsed:"00:29:13", priority:"low", stage:3, status:"active" },
    { id:4, op:"73602", serial:"GPJX3602", issue:"Falha de vídeo", notes:"Entrada registrada pela BIOS.", tech:"Sem técnico", elapsed:"00:00:00", priority:"normal", stage:0, status:"planned" },
    { id:5, op:"73598", serial:"GPJX3598", issue:"Superaquecimento", notes:"Limpeza concluída, sem troca de peça.", tech:"Pedro", elapsed:"00:36:11", priority:"normal", stage:4, status:"history" }
  ];
  function loadLocal(key, fallback) { try { var value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch (error) { return fallback; } }
  function loadObject(key, fallback) { try { var value = JSON.parse(localStorage.getItem(key)); return value && typeof value === "object" && !Array.isArray(value) ? value : fallback; } catch (error) { return fallback; } }
  var problems = loadLocal("gpj-problems", defaultProblems);
  var solutions = loadLocal("gpj-solutions", defaultSolutions);
  var parts = loadLocal("gpj-parts", defaultParts);
  var technicians = loadLocal("gpj-technicians", [
    { name:"Pedro", registration:"4", shift:"T1", active:true },
    { name:"Fabio", registration:"1", shift:"T1", active:true },
    { name:"Washington", registration:"3", shift:"T1", active:true },
    { name:"Fransmiler", registration:"5", shift:"T1", active:true }
  ]);
  var waitReasons = loadLocal("gpj-wait-reasons", ["Aguardando gabinete","Aguardando comercial","Aguardando estoque","Aguardando aprovação do gestor","Aguardando outro setor"]);
  var biosHistory = loadLocal("gpj-bios-history", []);
  var opPriorities = loadObject("gpj-op-priorities", {});
  var repairRows = loadLocal("gpj-repairs", defaultRepairs);
  var defaultMachines = [
    { op:"73471", serial:"GPJX3520", code:"41007", expectedSystem:"Windows 10 Pro", actualSystem:"Windows 11 Pro", stage:"BurnIn", sector:"Montagem", result:"Aprovada", certificate:"Recebido", technician:"Pedro", priority:true, updated:"15:42" },
    { op:"73471", serial:"GPJX3521", code:"41007", expectedSystem:"Windows 10 Pro", actualSystem:"", stage:"BurnIn", sector:"Montagem", result:"", certificate:"Pendente", technician:"Fransmiler", priority:true, updated:"15:36" },
    { op:"73471", serial:"GPJX3522", code:"41007", expectedSystem:"Windows 10 Pro", actualSystem:"Windows 10 Pro", stage:"Liberada", sector:"Montagem", result:"Aprovada", certificate:"Recebido", technician:"Washington", priority:true, updated:"15:18" },
    { op:"73471", serial:"GPJX3523", code:"41007", expectedSystem:"Windows 10 Pro", actualSystem:"", stage:"KVM", sector:"Montagem", result:"", certificate:"Não iniciado", technician:"Pedro", priority:true, updated:"15:09" },
    { op:"73471", serial:"GPJX3524", code:"41007", expectedSystem:"Windows 10 Pro", actualSystem:"", stage:"Reparo", sector:"Montagem", result:"", certificate:"Não iniciado", technician:"Fabio", priority:true, updated:"14:54" },
    { op:"73471", serial:"GPJX3525", code:"41007", expectedSystem:"Windows 10 Pro", actualSystem:"", stage:"Fila KVM", sector:"Montagem", result:"", certificate:"Não iniciado", technician:"Sem técnico", priority:true, updated:"14:42" },
    { op:"73464", serial:"GPJX3519", code:"40822", expectedSystem:"Linux", actualSystem:"Linux", stage:"Liberada", sector:"Montagem", result:"Aprovada", certificate:"Recebido", technician:"Washington", priority:false, updated:"15:31" },
    { op:"73462", serial:"GPJX3571", code:"40518", expectedSystem:"Windows 10 Pro", actualSystem:"Windows 10 Pro", stage:"BurnIn", sector:"Montagem", result:"Aprovada", certificate:"Recebido", technician:"Fabio", priority:false, updated:"15:18" }
  ];
  var machines = loadLocal("gpj-machines", defaultMachines);
  var defaultKvmSessions = [
    { key:"B1C1", op:"73471", serial:"GPJX3523", tech:"Pedro", system:"Windows 10 Pro", status:"testing", elapsedSeconds:728, startedAt:Date.now(), failures:0, connection:"HDMI + VGA" },
    { key:"B2C4", op:"73465", serial:"GPJX3512", tech:"Fransmiler", system:"Linux", status:"paused", elapsedSeconds:521, startedAt:null, failures:1, connection:"HDMI" }
  ];
  var kvmSessions = loadLocal("gpj-kvm-sessions", defaultKvmSessions);
  var kvmPaused = localStorage.getItem("gpj-kvm-global-paused") === "true";
  function saveOperations() {
    localStorage.setItem("gpj-problems", JSON.stringify(problems));
    localStorage.setItem("gpj-solutions", JSON.stringify(solutions));
    localStorage.setItem("gpj-parts", JSON.stringify(parts));
    localStorage.setItem("gpj-technicians", JSON.stringify(technicians));
    localStorage.setItem("gpj-wait-reasons", JSON.stringify(waitReasons));
    localStorage.setItem("gpj-bios-history", JSON.stringify(biosHistory));
    localStorage.setItem("gpj-op-priorities", JSON.stringify(opPriorities));
    localStorage.setItem("gpj-repairs", JSON.stringify(repairRows));
    localStorage.setItem("gpj-machines", JSON.stringify(machines));
    localStorage.setItem("gpj-kvm-sessions", JSON.stringify(kvmSessions));
    localStorage.setItem("gpj-kvm-queue", JSON.stringify(kvmQueue));
    localStorage.setItem("gpj-serial-batches", JSON.stringify(serialBatches));
    if (backendState.remoteReady && backend) backend.syncSnapshot(currentSnapshot());
  }
  var channelConfig = JSON.parse(localStorage.getItem("gpj-channels") || "{}");
  function channelKey(bay, channel) { return "B" + bay + "C" + channel; }
  function channelType(bay, channel) {
    var saved = channelConfig[channelKey(bay, channel)];
    if (saved) return saved;
    if (bay === 1 && (channel === 12 || channel === 13)) return "Inoperante";
    return channel <= 3 ? "HDMI + VGA" : channel <= 7 ? "HDMI" : "VGA";
  }
  var defaultKvmQueue = [
    { op:"73471", serial:"GPJX3525", origin:"Reparo", priority:true, attempts:1, system:"Windows 10 Pro" },
    { op:"73471", serial:"GPJX3526", origin:"BIOS", priority:true, attempts:0, system:"Windows 10 Pro" },
    { op:"73471", serial:"GPJX3527", origin:"BIOS", priority:true, attempts:0, system:"Windows 10 Pro" },
    { op:"73471", serial:"GPJX3528", origin:"BIOS", priority:true, attempts:0, system:"Windows 10 Pro" },
    { op:"73501", serial:"GPJX3601", origin:"BIOS", priority:false, attempts:0, system:"Linux" },
    { op:"73502", serial:"GPJX3602", origin:"Reparo", priority:false, attempts:1, system:"Windows 11 Home" },
    { op:"73502", serial:"GPJX3603", origin:"BIOS", priority:false, attempts:0, system:"Windows 11 Home" },
    { op:"73510", serial:"GPJX3610", origin:"BIOS", priority:false, attempts:0, system:"Windows 10 Home" },
    { op:"73510", serial:"GPJX3611", origin:"BIOS", priority:false, attempts:0, system:"Windows 10 Home" },
    { op:"73518", serial:"GPJX3618", origin:"Reparo", priority:false, attempts:1, system:"Windows 11 Pro" },
    { op:"73518", serial:"GPJX3619", origin:"BIOS", priority:false, attempts:0, system:"Windows 11 Pro" },
    { op:"73521", serial:"GPJX3621", origin:"BIOS", priority:false, attempts:0, system:"Linux" }
  ];
  var kvmQueue = loadLocal("gpj-kvm-queue",defaultKvmQueue);
  var serialBatches = loadLocal("gpj-serial-batches", []);
  var burninTemperatures = { GPJX3520:"66,9 °C", GPJX3519:"74,7 °C", GPJX3571:"63,2 °C", GPJX3522:"61,8 °C" };
  var osOptions = ["Linux","Windows 10 Home","Windows 10 Pro","Windows 11 Home","Windows 11 Pro"];

  function currentSnapshot() {
    return {
      machines: machines,
      repairs: repairRows,
      kvmSessions: kvmSessions,
      kvmQueue: kvmQueue,
      serialBatches: serialBatches,
      problems: problems,
      solutions: solutions,
      parts: parts,
      channelConfig: channelConfig,
      notifications: state.notifications
    };
  }

  function applyRemoteSnapshot(snapshot) {
    machines = snapshot.machines || [];
    repairRows = snapshot.repairs || [];
    kvmSessions = snapshot.kvmSessions || [];
    kvmQueue = snapshot.kvmQueue || [];
    serialBatches = snapshot.serialBatches || [];
    problems = snapshot.problems && snapshot.problems.length ? snapshot.problems : defaultProblems.slice();
    solutions = snapshot.solutions && snapshot.solutions.length ? snapshot.solutions : defaultSolutions.slice();
    parts = snapshot.parts && snapshot.parts.length ? snapshot.parts : defaultParts.slice();
    channelConfig = snapshot.channelConfig || {};
    state.notifications = snapshot.notifications || [];
    backendState.profile = snapshot.profile || null;
    if (backendState.profile) {
      state.role = backendState.profile.role || "technician";
      state.user = backendState.profile.display_name || backendState.profile.email || roleLabels[state.role].name;
    }
    var serialNumbers = machines.map(function (machine) {
      var match = /(\d+)$/.exec(machine.serial || "");
      return match ? Number(match[1]) : 0;
    });
    state.lastSerial = Math.max.apply(Math, [0].concat(serialNumbers));
    backendState.remoteReady = true;
    backendState.status = "online";
    normalizeKvmSessions();
    normalizeRepairTimers();
    saveOperations();
    render();
  }

  async function reloadRemoteSnapshot(silent) {
    if (!backend || !backend.getSession()) return;
    try {
      var snapshot = await backend.fetchSnapshot();
      applyRemoteSnapshot(snapshot);
      if (!silent) showToast("Operacao sincronizada com o servidor.");
    } catch (error) {
      backendState.status = error && error.status === 401 ? "signed-out" : "error";
      updateChrome();
      if (!silent) showToast(error.message || "Nao foi possivel sincronizar os dados.");
    }
  }

  function startRealtime() {
    if (!backend || !backend.getSession()) return;
    if (backendState.realtimeStop) backendState.realtimeStop();
    backendState.realtimeStop = backend.subscribe(function () {
      window.clearTimeout(backendState.reloadTimer);
      backendState.reloadTimer = window.setTimeout(function () { reloadRemoteSnapshot(true); }, 450);
    });
  }

  async function initializeBackend() {
    if (!backendState.configured) return;
    backendState.status = "connecting";
    updateChrome();
    await reloadRemoteSnapshot(true);
    if (backendState.remoteReady) startRealtime();
  }

  function machineSystem(serial) {
    var machine = machines.find(function (item) { return item.serial === serial; });
    return machine ? machine.expectedSystem : "Não informado";
  }

  function sessionSystem(session) {
    return session.system || machineSystem(session.serial);
  }

  function osClass(system) {
    return ({ "Linux":"os-linux", "Windows 10 Home":"os-win10-home", "Windows 10 Pro":"os-win10-pro", "Windows 11 Home":"os-win11-home", "Windows 11 Pro":"os-win11-pro" })[system] || "os-unknown";
  }

  function osShortLabel(system) {
    return ({ "Linux":"Linux", "Windows 10 Home":"Win 10 Home", "Windows 10 Pro":"Win 10 Pro", "Windows 11 Home":"Win 11 Home", "Windows 11 Pro":"Win 11 Pro" })[system] || "S.O. não informado";
  }

  function legacyElapsedSeconds(value) {
    var textValue = String(value || "");
    var clockMatch = /^(\d+):(\d{2}):(\d{2})$/.exec(textValue);
    if (clockMatch) return Number(clockMatch[1]) * 3600 + Number(clockMatch[2]) * 60 + Number(clockMatch[3]);
    var hours = Number((textValue.match(/(\d+)h/) || [0,0])[1]);
    var minutes = Number((textValue.match(/(\d+)m/) || [0,0])[1]);
    var seconds = Number((textValue.match(/(\d+)s/) || [0,0])[1]);
    return hours * 3600 + minutes * 60 + seconds;
  }

  function normalizeKvmSessions() {
    kvmSessions.forEach(function (session) {
      if (!Number.isFinite(session.elapsedSeconds)) session.elapsedSeconds = legacyElapsedSeconds(session.elapsed);
      if (session.status === "testing" && !session.startedAt) session.startedAt = Date.now();
      if (session.status === "paused") session.startedAt = null;
      if (!Number.isFinite(session.failures)) session.failures = 0;
      if (!session.system || session.system === "Não informado") session.system = machineSystem(session.serial);
      delete session.elapsed;
    });
    localStorage.setItem("gpj-kvm-sessions",JSON.stringify(kvmSessions));
  }

  function kvmElapsedSeconds(session) {
    var seconds = Number(session.elapsedSeconds || 0);
    if (session.status === "testing" && session.startedAt) seconds += Math.max(0,Math.floor((Date.now() - session.startedAt) / 1000));
    return seconds;
  }

  function setGlobalKvmPaused(paused) {
    if (paused === kvmPaused) return;
    if (paused) {
      kvmSessions.forEach(function (session) {
        if (session.status !== "testing") return;
        session.elapsedSeconds = kvmElapsedSeconds(session);
        session.startedAt = null;
        session.status = "paused";
        session.pausedByGlobal = true;
      });
    } else {
      kvmSessions.forEach(function (session) {
        if (!session.pausedByGlobal) return;
        session.status = "testing";
        session.startedAt = Date.now();
        session.pausedByGlobal = false;
      });
    }
    kvmPaused = paused;
    localStorage.setItem("gpj-kvm-global-paused",String(kvmPaused));
    saveOperations();
  }

  function normalizeRepairTimers() {
    repairRows.forEach(function (repair) {
      if (!Number.isFinite(repair.elapsedSeconds)) repair.elapsedSeconds = legacyElapsedSeconds(repair.elapsed);
      if (repair.status === "active" && repair.timerPaused == null) repair.timerPaused = false;
      if (repair.status === "active" && !repair.timerPaused && !repair.startedAt) repair.startedAt = Date.now();
      if (repair.timerPaused) repair.startedAt = null;
      if (repair.status !== "active") repair.startedAt = null;
      delete repair.elapsed;
    });
    localStorage.setItem("gpj-repairs",JSON.stringify(repairRows));
  }

  function repairElapsedSeconds(repair) {
    var seconds = Number(repair.elapsedSeconds || 0);
    if (repair.status === "active" && !repair.timerPaused && repair.startedAt) seconds += Math.max(0,Math.floor((Date.now() - repair.startedAt) / 1000));
    return seconds;
  }

  function autoPauseRepairShift() {
    var now = new Date();
    var dayKey = now.toISOString().slice(0,10);
    if (now.getHours() < 18 || (now.getHours() === 18 && now.getMinutes() < 5)) return;
    if (localStorage.getItem("gpj-repair-autopause-day") === dayKey) return;
    var changed = false;
    repairRows.forEach(function (repair) {
      if (repair.status !== "active" || repair.timerPaused) return;
      repair.elapsedSeconds = repairElapsedSeconds(repair);
      repair.startedAt = null;
      repair.timerPaused = true;
      repair.pauseReason = "Pausa automática do turno · 18:05";
      changed = true;
    });
    localStorage.setItem("gpj-repair-autopause-day",dayKey);
    if (changed) { saveOperations(); render(); showToast("18:05 · Todos os cronômetros do Reparo foram pausados automaticamente."); }
  }

  function formatClock(totalSeconds) {
    var seconds = Math.max(0,Math.floor(totalSeconds || 0));
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remainder = seconds % 60;
    return String(hours).padStart(2,"0") + ":" + String(minutes).padStart(2,"0") + ":" + String(remainder).padStart(2,"0");
  }

  function updateKvmTimers() {
    $$('[data-kvm-timer]').forEach(function (timer) {
      var session = kvmSessions.find(function (item) { return item.key === timer.dataset.kvmTimer; });
      if (session) timer.textContent = formatClock(kvmElapsedSeconds(session));
    });
    $$('[data-repair-timer]').forEach(function (timer) {
      var repair = repairRows.find(function (item) { return String(item.id) === timer.dataset.repairTimer; });
      if (repair) {
        var elapsed = repairElapsedSeconds(repair);
        timer.textContent = formatClock(elapsed);
        var card = timer.closest(".repair-card");
        if (card) {
          card.classList.toggle("time-alert",elapsed >= state.repairAlertMinutes * 60 && elapsed < state.repairCriticalMinutes * 60);
          card.classList.toggle("time-critical",elapsed >= state.repairCriticalMinutes * 60);
        }
      }
    });
  }

  normalizeKvmSessions();
  if (kvmPaused) {
    kvmSessions.forEach(function (session) {
      if (session.status !== "testing") return;
      session.elapsedSeconds = kvmElapsedSeconds(session);
      session.startedAt = null;
      session.status = "paused";
      session.pausedByGlobal = true;
    });
    localStorage.setItem("gpj-kvm-sessions",JSON.stringify(kvmSessions));
  }
  normalizeRepairTimers();

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var escapeHtml = function (value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character];
    });
  };
  var toastTimer;

  function showToast(message) {
    var toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 3200);
  }

  function metric(label, value, helper, trend, tone) {
    return "<article class=\"metric\"><div class=\"metric-top\"><span>" + label + "</span><b class=\"trend " + (tone || "green") + "\">" + trend + "</b></div><strong>" + value + "</strong><small>" + helper + "</small></article>";
  }

  function pill(text, tone) {
    return "<span class=\"pill " + (tone || "green") + "\">" + text + "</span>";
  }

  function machineValidation(machine) {
    if (!machine.actualSystem || machine.certificate === "Pendente") return { label:"Certificado pendente", tone:"amber", key:"pending" };
    if (machine.actualSystem !== machine.expectedSystem) return { label:"Sistema divergente", tone:"red", key:"mismatch" };
    if (machine.result && machine.result !== "Aprovada") return { label:"Teste reprovado", tone:"red", key:"failed" };
    return { label:"Sistema validado", tone:"green", key:"validated" };
  }

  function getNotifications() {
    var automatic = [];
    machines.forEach(function (machine) {
      var validation = machineValidation(machine);
      if (machine.stage !== "BurnIn" && machine.stage !== "Liberação") return;
      if (validation.key === "mismatch") automatic.push({ level:"critical", module:"Carcará · BurnIn", time:"Agora", title:machine.serial + " com sistema divergente", text:"Esperado: " + machine.expectedSystem + ". Certificado recebido: " + machine.actualSystem + ". Liberação bloqueada." });
      if (validation.key === "pending") automatic.push({ level:"warning", module:"Carcará · BurnIn", time:"Agora", title:"Certificado não recebido", text:machine.serial + " da O.P. " + machine.op + " chegou ao BurnIn, mas o certificado ainda não foi sincronizado." });
    });
    return automatic.concat(state.notifications);
  }

  function osSelectOptions(selected) {
    return osOptions.map(function (system) { return "<option" + (system === selected ? " selected" : "") + ">" + system + "</option>"; }).join("");
  }

  function technicianOptions(selected, includeUnassigned) {
    var names = technicians.filter(function (item) { return item.active !== false; }).map(function (item) { return item.name; });
    if (includeUnassigned) names.unshift("Sem técnico");
    return names.map(function (name) { return "<option" + (name === selected ? " selected" : "") + ">" + escapeHtml(name) + "</option>"; }).join("");
  }

  function opPriority(op, fallback) {
    return opPriorities[String(op || "")] || fallback || "normal";
  }

  function applyOpPriority(op, priority) {
    op = String(op || "").trim();
    if (!op) return;
    opPriorities[op] = priority;
    machines.forEach(function (machine) {
      if (machine.op !== op) return;
      machine.priorityLevel = priority;
      machine.priority = priority === "high";
    });
    repairRows.forEach(function (repair) { if (repair.op === op) repair.priority = priority; });
    kvmQueue.forEach(function (row) { if (row.op === op) row.priority = priority === "high"; });
  }

  function pageHead(kicker, title, description, actions) {
    return "<section class=\"page-head\"><div><span class=\"eyebrow\">" + kicker + "</span><h1>" + title + "</h1><p>" + description + "</p></div><div class=\"head-actions\">" + (actions || "") + "</div></section>";
  }

  function getNavItems() {
    var items = [
      ["overview", "01", "Visão geral"]
    ];
    if (state.sector === "assembly") {
      items.push(["linkage", "02", "Vinculação"]);
      items.push(["bios", "03", "BIOS"]);
      items.push(["kvm", "04", "KVM · Run-in"]);
    }
    items.push(["repairs", "05", "Reparos"]);
    if (state.sector === "assembly") items.push(["burnin", "06", "BurnIn"]);
    items.push(["trace", "07", "Rastreabilidade"]);
    items.push(["registry", "08", "Cadastros"]);
    if (state.role === "manager") {
      items.push(["manager-settings", "09", "Gestão de O.P."]);
      items.push(["indicators", "10", "Indicadores"]);
    }
    if (state.role === "developer") items.push(["integration", "DEV", "Integração API"]);
    return items;
  }

  function renderNav() {
    var nav = $("#main-nav");
    var items = getNavItems();
    var signature = items.map(function (item) { return item.join(":"); }).join("|");
    if (nav.dataset.signature !== signature) {
      nav.innerHTML = items.map(function (item) { return "<button data-view=\"" + item[0] + "\" title=\"" + escapeHtml(item[2]) + "\" aria-label=\"" + escapeHtml(item[2]) + "\"><i>" + item[1] + "</i>" + item[2] + "</button>"; }).join("");
      nav.dataset.signature = signature;
    }
    if (!items.some(function (item) { return item[0] === state.view; })) state.view = "overview";
    $$('[data-view]',nav).forEach(function (button) { button.classList.toggle("active",button.dataset.view === state.view); });
  }

  function updateChrome() {
    var profile = roleLabels[state.role] || roleLabels.technician;
    $("#app").classList.toggle("sidebar-collapsed",state.sidebarCollapsed);
    var collapseButton = $("#sidebar-collapse");
    collapseButton.textContent = state.sidebarCollapsed ? "›" : "‹";
    collapseButton.setAttribute("aria-label",state.sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral");
    collapseButton.title = state.sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral";
    $("#profile-name").textContent = state.user || profile.name;
    $("#profile-role").textContent = profile.label;
    $("#profile-initial").textContent = (state.user || profile.name).charAt(0).toUpperCase();
    $("#sidebar-user").textContent = profile.name + " · " + profile.label;
    $("#sidebar-sector").textContent = sectorLabels[state.sector];
    $("#breadcrumb").textContent = "PBA / " + sectorLabels[state.sector];
    $("#notification-count").textContent = String(getNotifications().length);
    var onlineIndicator = $(".plant-online");
    if (onlineIndicator) {
      var syncLabels = {
        online: "Base compartilhada online",
        connecting: "Conectando a base",
        "signed-out": "Login necessario",
        error: "Sincronizacao pendente",
        local: "Base ainda nao configurada"
      };
      onlineIndicator.dataset.status = backendState.status;
      onlineIndicator.innerHTML = "<i></i> " + syncLabels[backendState.status];
    }
    $$("[data-sector]").forEach(function (button) { button.classList.toggle("active", button.dataset.sector === state.sector); });
    document.documentElement.dataset.theme = state.theme;
    renderNav();
  }

  function renderOverview() {
    var sector = sectorLabels[state.sector];
    var assemblyFlow = "<div class=\"hero-flow\"><article><strong>18</strong><small>BIOS</small></article><article class=\"alert\"><strong>06</strong><small>Reparo</small></article><article><strong>08</strong><small>KVM</small></article><article><strong>04</strong><small>BurnIn</small></article><article><strong>31</strong><small>Liberadas</small></article></div>";
    var serviceFlow = "<div class=\"hero-flow\"><article><strong>05</strong><small>Fila</small></article><article class=\"alert\"><strong>03</strong><small>Diagnóstico</small></article><article><strong>02</strong><small>Peças</small></article><article><strong>01</strong><small>Testes</small></article><article><strong>09</strong><small>Finalizadas</small></article></div>";
    var managerExtra = state.role === "technician" ? "" : metric("Capacidade", "92", "máquinas previstas", "85%", "amber");
    var liveRows = machines.slice(0,5).map(function (machine) {
      var validation = machineValidation(machine);
      var status = machine.priority && machine.stage !== "Liberada" ? "Prioridade" : validation.key === "mismatch" ? "Bloqueada" : machine.stage === "Liberada" ? "Liberada" : "Em processo";
      var tone = status === "Bloqueada" || status === "Prioridade" ? "red" : status === "Liberada" ? "green" : "blue";
      return "<tr class=\"" + (tone === "red" ? "priority-row" : "") + "\"><td class=\"mono\">" + machine.op + "</td><td><button class=\"table-link\" data-action=\"open-machine-detail\" data-serial=\"" + machine.serial + "\">" + machine.serial + "</button></td><td>" + machine.stage + "</td><td>" + machine.technician + "</td><td>" + machine.updated + "</td><td>" + pill(status,tone) + "</td></tr>";
    }).join("");
    var overviewAlerts = getNotifications().slice(0,3).map(function (item) { return "<div class=\"attention-item " + (item.level === "critical" ? "critical" : "") + "\"><i class=\"attention-icon\">" + (item.level === "critical" ? "!" : "⌁") + "</i><span><strong>" + item.title + "</strong><small>" + item.text + "</small></span><b>" + item.time + "</b></div>"; }).join("");
    return "<div class=\"page-stack\">" +
      "<section class=\"command-hero\"><div class=\"hero-copy\"><span class=\"eyebrow\">" + sector + " conectada</span><h1>Da entrada à liberação,<br>uma única operação.</h1><p>Filas, prioridades e rastreabilidade compartilhadas sem misturar Montagem, Assistência e RMA.</p><button class=\"button button--primary\" data-view=\"trace\">Rastrear máquina →</button></div>" + (state.sector === "assembly" ? assemblyFlow : serviceFlow) + "</section>" +
      "<section class=\"metrics\">" +
        metric("Produção do dia", "67", "Meta operacional", "+12%", "green") +
        metric("Em processo", "36", "Todas as etapas", "+4", "amber") +
        metric("Aprovação", "94,2%", "Testes concluídos", "+2,1%", "green") +
        metric("Atenções", "03", "Ação necessária", "-2", "red") + managerExtra +
      "</section>" +
      "<section class=\"panel operation-table-panel\"><div class=\"panel-head\"><div><span>Fluxo ao vivo</span><h2>Máquinas em movimento</h2></div><button class=\"button\" data-view=\"trace\">Ver rastreabilidade</button></div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>O.P.</th><th>Serial</th><th>Etapa</th><th>Responsável</th><th>Atualização</th><th>Status</th></tr></thead><tbody>" + liveRows + "</tbody></table></div></section>" +
      "<section class=\"panel overview-attention-panel\"><div class=\"panel-head\"><div><span>Carcará de Olho</span><h2>Precisa de atenção</h2></div>" + pill(getNotifications().length + " alertas","red") + "</div><div class=\"attention-list attention-list--horizontal\">" + overviewAlerts + "</div></section></div>";
  }

  function renderRepairs() {
    var stages = ["Diagnóstico", "Aquisição de peça", "Montagem", "Testes"];
    var counts = { active:0, planned:0, waiting:0, history:0 };
    repairRows.forEach(function (row) { counts[row.status] = (counts[row.status] || 0) + 1; });
    var visibleRows = repairRows.filter(function (row) { return row.status === state.repairTab; });
    if (state.repairTab === "active") visibleRows.sort(function (a,b) { return Number(a.timerPaused) - Number(b.timerPaused) || (a.tech || "").localeCompare(b.tech || ""); });
    function repairCard(row) {
      var stageHtml = stages.map(function (name, index) {
        var status = index < row.stage ? "done" : index === row.stage ? "active" : "";
        var stageLabel = index < row.stage ? "Concluído" : index === row.stage ? (row.timerPaused ? "Pausado" : "Em andamento") : "Aguardando";
        return "<div class=\"stage " + status + "\"><strong>" + name + "</strong><small>" + stageLabel + "</small></div>";
      }).join("");
      var priorityLabel = row.priority === "high" ? "Alta" : row.priority === "low" ? "Baixa" : "Normal";
      var priorityTone = row.priority === "high" ? "red" : row.priority === "low" ? "blue" : "green";
      var elapsed = repairElapsedSeconds(row);
      var timeLevel = elapsed >= state.repairCriticalMinutes * 60 ? "critical" : elapsed >= state.repairAlertMinutes * 60 ? "alert" : "normal";
      var detailAction = "<button class=\"button button--ghost\" data-action=\"repair-details\" data-id=\"" + row.id + "\">Ver detalhes</button>";
      var actions = detailAction + "<button class=\"button\" data-action=\"edit-repair\" data-id=\"" + row.id + "\">Editar</button>";
      if (row.status === "active") actions = (row.timerPaused ? "<button class=\"button button--primary\" data-action=\"resume-repair\" data-id=\"" + row.id + "\">▶ Retomar</button>" : "<button class=\"button\" data-action=\"pause-repair\" data-id=\"" + row.id + "\">Ⅱ Pausar cronômetro</button>") + "<button class=\"button button--warning\" data-action=\"wait-repair\" data-id=\"" + row.id + "\">Adicionar em espera</button><button class=\"button\" data-action=\"correct-repair-time\" data-id=\"" + row.id + "\">Corrigir cronômetro</button><button class=\"button button--primary\" data-action=\"advance-repair\" data-id=\"" + row.id + "\" data-serial=\"" + row.serial + "\">Concluir etapa</button>" + actions;
      if (row.status === "planned") actions = "<button class=\"button button--primary\" data-action=\"start-repair\" data-id=\"" + row.id + "\">Iniciar reparo</button>" + actions;
      if (row.status === "waiting") actions = "<button class=\"button button--primary\" data-action=\"resume-repair\" data-id=\"" + row.id + "\">Retomar serviço</button><button class=\"button\" data-action=\"correct-repair-time\" data-id=\"" + row.id + "\">Corrigir cronômetro</button>" + actions;
      if (row.status === "history") actions = detailAction + "<button class=\"button\" data-action=\"edit-repair\" data-id=\"" + row.id + "\">Corrigir registro</button><button class=\"button button--danger\" data-action=\"delete-repair\" data-id=\"" + row.id + "\">Excluir</button>";
      var stateLabel = row.status === "waiting" ? (row.waitingReason || "Em espera") : row.timerPaused ? (row.pauseReason || "Cronômetro pausado") : "Cronômetro em andamento";
      return "<article class=\"repair-card priority-" + row.priority + " timer-" + (row.timerPaused ? "paused" : "running") + " time-" + timeLevel + "\"><div class=\"repair-top\"><div class=\"repair-identity\"><div class=\"repair-title\"><span>OP " + escapeHtml(row.op) + "</span><strong>" + escapeHtml(row.serial) + "</strong></div><div class=\"repair-meta\"><span class=\"repair-meta-item\"><b>Problema</b>" + escapeHtml(row.issue) + "</span><span class=\"repair-meta-item\"><b>Técnico</b>" + escapeHtml(row.tech) + "</span>" + pill(priorityLabel,priorityTone) + pill(stateLabel,row.status === "waiting" || row.timerPaused ? "amber" : "green") + "</div></div><div class=\"repair-clock-block\"><span>Tempo total</span><time class=\"mono live-repair-clock\" data-repair-timer=\"" + row.id + "\">" + formatClock(elapsed) + "</time><small>" + (timeLevel === "critical" ? "Crítico" : timeLevel === "alert" ? "Em alerta" : "Dentro do tempo") + "</small></div></div>" + (row.waitingReason ? "<p class=\"repair-wait-reason\"><strong>Dependência externa:</strong> " + escapeHtml(row.waitingReason) + (row.waitingNotes ? " · " + escapeHtml(row.waitingNotes) : "") + "</p>" : "") + (row.notes ? "<p class=\"repair-note\">" + escapeHtml(row.notes) + "</p>" : "") + (row.status === "history" ? "" : "<div class=\"stage-track\">" + stageHtml + "</div>") + "<div class=\"repair-actions\">" + actions + "</div></article>";
    }
    var cards = "";
    if (state.repairTab === "active") {
      var grouped = {};
      visibleRows.forEach(function (row) { (grouped[row.tech] = grouped[row.tech] || []).push(row); });
      cards = Object.keys(grouped).sort().map(function (tech) { var running = grouped[tech].filter(function (row) { return !row.timerPaused; }).length; return "<section class=\"technician-repair-group\"><div class=\"technician-group-head\"><span><strong>" + escapeHtml(tech) + "</strong><small>" + running + " rodando · " + (grouped[tech].length - running) + " pausado(s)</small></span>" + pill(running ? "Em atividade" : "Sem cronômetro ativo",running ? "green" : "amber") + "</div>" + grouped[tech].map(repairCard).join("") + "</section>"; }).join("");
    } else cards = visibleRows.map(repairCard).join("");
    if (!cards) cards = "<section class=\"panel empty-state\"><strong>Nenhum reparo nesta aba.</strong><small>Use “Planejar reparo” para incluir uma máquina.</small></section>";
    var plannedPreview = repairRows.filter(function (row) { return row.status === "planned" || row.status === "waiting"; }).map(function (row) {
      return "<button class=\"planning-row priority-" + row.priority + "\" data-action=\"repair-details\" data-id=\"" + row.id + "\"><span><strong>OP " + escapeHtml(row.op) + " · " + escapeHtml(row.serial) + "</strong><small>" + escapeHtml(row.issue) + " · " + escapeHtml(row.tech) + "</small></span>" + pill(row.status === "waiting" ? "Em espera" : "Planejada", row.status === "waiting" ? "amber" : "blue") + "</button>";
    }).join("") || "<div class=\"empty-inline\">Nenhuma máquina aguardando planejamento.</div>";
    var stageCounts = [0,0,0,0];
    repairRows.filter(function (row) { return row.status === "active"; }).forEach(function (row) { stageCounts[Math.min(row.stage,3)] += 1; });
    var loadRows = stages.map(function (stage, index) {
      var value = stageCounts[index];
      var width = Math.min(100, value * 34 + (value ? 18 : 4));
      return "<div class=\"workload-row\"><span><strong>" + stage + "</strong><small>" + value + " máquina" + (value === 1 ? "" : "s") + "</small></span><i><b style=\"width:" + width + "%\"></b></i></div>";
    }).join("");
    return "<div class=\"page-stack\">" + pageHead("Operação técnica", "Reparos · " + sectorLabels[state.sector], "Diagnóstico, peças, montagem, testes e finalização com histórico por tentativa.", "<button class=\"button button--primary\" data-action=\"new-repair\">+ Planejar reparo</button>") +
      "<section class=\"metrics\">" + metric("Fila atual",String(counts.planned),"Aguardando início","fila","amber") + metric("Ativos",String(counts.active),"Rodando ou pausados no técnico","agora","green") + metric("Em espera",String(counts.waiting),"Dependência de outro serviço","atenção","amber") + metric("Finalizados",String(counts.history),"Histórico local","total","blue") + "</section>" +
      "<section class=\"repair-command-grid\"><div class=\"panel panel-pad\"><div class=\"panel-head compact\"><div><span>Planejamento de reparos</span><h2>Fila que o técnico pode assumir</h2></div><button class=\"button\" data-action=\"new-repair\">+ Nova O.P.</button></div><div class=\"planning-list\">" + plannedPreview + "</div></div><div class=\"panel panel-pad\"><div class=\"panel-head compact\"><div><span>Carga atual</span><h2>Distribuição por etapa</h2></div></div><div class=\"workload-list\">" + loadRows + "</div></div></section>" +
      "<div class=\"tabs\"><button data-repair-tab=\"active\" class=\"" + (state.repairTab === "active" ? "active" : "") + "\">Ativos (" + counts.active + ")</button><button data-repair-tab=\"planned\" class=\"" + (state.repairTab === "planned" ? "active" : "") + "\">Planejados (" + counts.planned + ")</button><button data-repair-tab=\"waiting\" class=\"" + (state.repairTab === "waiting" ? "active" : "") + "\">Em espera (" + counts.waiting + ")</button><button data-repair-tab=\"history\" class=\"" + (state.repairTab === "history" ? "active" : "") + "\">Histórico (" + counts.history + ")</button></div><section class=\"repair-cards\">" + cards + "</section></div>";
  }

  function generateChannels() {
    var html = "";
    [14,14,14,7].forEach(function (count, bayIndex) {
      var channels = "";
      for (var number = 1; number <= count; number += 1) {
        var key = channelKey(bayIndex + 1, number);
        var session = kvmSessions.find(function (item) { return item.key === key; });
        var className = key === state.selectedChannel ? "selected" : "";
        var detail = channelType(bayIndex + 1, number);
        var system = session ? sessionSystem(session) : "";
        if (session) className += " has-session " + session.status;
        if (detail === "Inoperante") { className += " offline"; detail = "Bloqueado"; }
        var channelNumber = "<span class=\"channel-number\">C" + String(number).padStart(2,"0") + "</span>";
        var channelInfo = session
          ? channelNumber + "<span class=\"channel-system\">" + escapeHtml(system || "S.O. não informado") + "</span><b class=\"channel-serial\">" + escapeHtml(session.serial) + "</b><span class=\"channel-timer\"><i></i><time data-kvm-timer=\"" + key + "\">" + formatClock(kvmElapsedSeconds(session)) + "</time></span>"
          : channelNumber + "<span class=\"channel-system\">" + (detail === "Bloqueado" ? "Inoperante" : "Livre") + "</span><b class=\"channel-serial\">" + escapeHtml(detail) + "</b>";
        channels += "<button class=\"channel " + className + "\" data-action=\"channel\" data-bay=\"" + (bayIndex + 1) + "\" data-channel=\"" + number + "\">" + channelInfo + "</button>";
      }
      html += "<section class=\"bay panel\"><div class=\"bay-head\"><strong>Baia " + (bayIndex + 1) + "</strong><small>" + count + " canais</small></div><div class=\"channels\">" + channels + "</div></section>";
    });
    return html;
  }

  function channelDetailModal() {
    var match = /^B(\d+)C(\d+)$/.exec(state.selectedChannel) || ["",1,1];
    var bay = Number(match[1]);
    var channel = Number(match[2]);
    var session = kvmSessions.find(function (item) { return item.key === state.selectedChannel; });
    var connection = channelType(bay,channel);
    var channelLabel = "Baia " + bay + " · Canal " + String(channel).padStart(2,"0");
    var body = "";
    if (connection === "Inoperante") {
      body = "<section class=\"channel-popup-empty\">" + pill("Inoperante","red") + "<strong>Canal bloqueado</strong><p>Altere o tipo de conexão em Configuração de canais para voltar a operar.</p><button type=\"button\" class=\"button\" data-action=\"open-kvm-config\">Configurar canal</button></section>";
      openModal("Canal selecionado",channelLabel,body);
      $("#modal").classList.add("modal--wide");
      return;
    }
    if (session) {
      body = "<section class=\"channel-popup\"><div class=\"channel-popup-summary\"><article class=\"channel-popup-machine\"><span>Número de série</span><strong class=\"mono\">" + escapeHtml(session.serial) + "</strong><small>" + channelLabel + "</small></article><article><span>O.P.</span><strong>" + escapeHtml(session.op) + "</strong></article><article><span>Sistema operacional</span><strong>" + escapeHtml(osShortLabel(sessionSystem(session))) + "</strong></article><article><span>Técnico responsável</span><strong>" + escapeHtml(session.tech) + "</strong></article><article class=\"channel-popup-clock\"><span>Tempo efetivo</span><time data-kvm-timer=\"" + session.key + "\">" + formatClock(kvmElapsedSeconds(session)) + "</time><small>" + (session.status === "paused" ? "Cronômetro pausado" : "Cronômetro em andamento") + "</small></article><article><span>Reinícios / falhas</span><strong>" + Number(session.failures || 0) + "</strong></article><article><span>Conexão da baia</span><strong>" + escapeHtml(session.connection) + "</strong></article><article><span>Estado atual</span>" + pill(session.status === "paused" ? "Pausado" : "Em andamento",session.status === "paused" ? "amber" : "green") + "</article></div><div class=\"channel-popup-note\"><strong>Falha do equipamento</strong><span>Registra a ocorrência, zera o cronômetro e mantém esta mesma máquina no canal para um novo teste.</span></div><div class=\"channel-popup-actions\"><button type=\"button\" class=\"button\" data-action=\"toggle-channel\">" + (session.status === "paused" ? "▶ Retomar canal" : "Ⅱ Pausar canal") + "</button><button type=\"button\" class=\"button button--warning\" data-action=\"fail-channel\">Reiniciar após falha</button><button type=\"button\" class=\"button button--danger\" data-action=\"reject-channel\">Reprovado · enviar ao Reparo</button><button type=\"button\" class=\"button button--primary\" data-action=\"approve-channel\">Aprovado</button></div></section>";
      openModal("Sessão KVM",channelLabel,body);
      $("#modal").classList.add("modal--wide");
      return;
    }
    body = "<section class=\"channel-popup-free\"><div class=\"channel-popup-free-head\">" + pill("Livre","green") + "<span>Conexão disponível: <strong>" + escapeHtml(connection) + "</strong></span></div><div class=\"channel-popup-start\"><label class=\"field\">O.P.<input id=\"channel-op\" placeholder=\"Bipe a O.P.\"></label><label class=\"field\">Número de série<input id=\"channel-serial\" placeholder=\"Bipe o serial\"></label><label class=\"field\">Técnico<select id=\"channel-tech\"><option>Pedro</option><option>Fransmiler</option><option>Fabio</option><option>Washington</option></select></label><button type=\"button\" class=\"button button--primary\" data-action=\"start-channel\">Iniciar neste canal</button></div></section>";
    openModal("Canal livre",channelLabel,body);
    $("#modal").classList.add("modal--wide");
  }

  function renderKvm() {
    function queueItem(row) {
      var rowSystem = row.system || machineSystem(row.serial);
      return "<div class=\"queue-item " + (row.priority ? "queue-item--priority" : "queue-item--normal") + "\"><span><strong><i>OP " + escapeHtml(row.op) + "</i><b>" + escapeHtml(row.serial) + "</b></strong><small>" + escapeHtml(row.origin) + " · " + escapeHtml(osShortLabel(rowSystem)) + " · tentativa " + (row.attempts + 1) + "</small></span>" + (row.priority ? pill("Alta","red") : pill("Normal","blue")) + "</div>";
    }
    var priorityQueue = kvmQueue.filter(function (row) { return row.priority; });
    var normalQueue = kvmQueue.filter(function (row) { return !row.priority; });
    var queue = "<section class=\"queue-group\"><header><strong>Prioridades</strong><span>" + priorityQueue.length + "</span></header>" + (priorityQueue.map(queueItem).join("") || "<small class=\"queue-empty\">Nenhuma prioridade aguardando.</small>") + "</section><section class=\"queue-group\"><header><strong>Fila normal</strong><span>" + normalQueue.length + "</span></header>" + (normalQueue.map(queueItem).join("") || "<small class=\"queue-empty\">Nenhuma máquina na fila normal.</small>") + "</section>";
    var activeTechnicians = kvmSessions.map(function (session) { return session.tech; }).filter(function (tech,index,list) { return list.indexOf(tech) === index; });
    var failureCount = kvmSessions.reduce(function (total,session) { return total + Number(session.failures || 0); },0);
    var globalControl = "<section class=\"kvm-global-control " + (kvmPaused ? "is-paused" : "is-running") + "\"><span><i></i><span><strong>" + (kvmPaused ? "KVM pausado" : "KVM em operação") + "</strong><small>" + (kvmPaused ? "Todos os cronômetros estão congelados." : "Os cronômetros dos canais ativos estão contando.") + "</small></span></span><button class=\"button " + (kvmPaused ? "button--primary" : "button--warning") + "\" data-action=\"toggle-kvm-global\">" + (kvmPaused ? "▶ Retomar KVM" : "Ⅱ Pausar KVM inteiro") + "</button></section>";
    return "<div class=\"page-stack kvm-page " + (kvmPaused ? "kvm-is-paused" : "") + "\">" + pageHead("KVM · Run-in","Bipagem e canais","Clique em qualquer canal para ver o estado e abrir a sessão. A sequência continua disponível para carrinhos completos.","<button class=\"button\" data-view=\"kvm-config\">⚙ Configurar canais</button><button class=\"button button--primary\" data-action=\"start-scan\">▶ Bipagem sequencial</button>") +
      "<section class=\"metrics\">" + metric("Canais livres",String(Math.max(0,43 - kvmSessions.length)),"6 inoperantes","agora","green") + metric("Ocupados",String(kvmSessions.length),activeTechnicians.length ? activeTechnicians.join(" · ") : "Nenhum técnico ativo","ao vivo","blue") + metric("Fila planejada",String(kvmQueue.length),kvmQueue.filter(function (row) { return row.priority; }).length + " prioritárias","fila","amber") + metric("Falhas reiniciadas",String(failureCount),"Máquinas continuam no teste","registro",failureCount ? "amber" : "green") + "</section>" +
      globalControl + "<section class=\"kvm-tools kvm-tools--compact\"><div class=\"panel sequential-panel sequential-panel--open " + (kvmPaused ? "is-paused" : "") + "\"><div class=\"sequential-head\"><span><small>Bipagem sequencial</small><strong id=\"scan-target\">Baia 1 · Canal 01</strong></span>" + pill("Carrinho","green") + "</div><div class=\"scanner-card\"><div class=\"scanner-selectors\"><label class=\"field\">Baia<select id=\"scan-bay\"><option value=\"1\">Baia 1</option><option value=\"2\">Baia 2</option><option value=\"3\">Baia 3</option><option value=\"4\">Baia 4</option></select></label><label class=\"field\">Canal inicial<select id=\"scan-channel\">" + Array.from({length:14},function (_,i) { return "<option value=\"" + (i + 1) + "\">Canal " + String(i + 1).padStart(2,"0") + "</option>"; }).join("") + "</select></label><label class=\"field\">Técnico responsável<select id=\"scan-tech\"><option>Pedro</option><option>Fransmiler</option><option>Fabio</option><option>Washington</option></select></label></div><div class=\"scanner-line\"><label class=\"field\">Ordem de produção<input id=\"scan-op\" placeholder=\"Bipe a O.P.\"></label><label class=\"field\">Número de série<input id=\"scan-serial\" placeholder=\"Bipe o serial\"></label><button class=\"button button--primary scanner-start\" data-action=\"confirm-scan\">Iniciar teste</button></div></div></div><div class=\"panel panel-pad planning-compact\"><div class=\"panel-head compact\"><div><span>Planejamento</span><h2>Próximas máquinas</h2></div><b class=\"queue-total\">" + kvmQueue.length + " na fila</b></div><div class=\"queue-list\">" + queue + "</div></div></section><section class=\"kvm-command-layout\"><div class=\"bays channel-board\">" + generateChannels() + "</div></section></div>";
  }

  function renderKvmConfig() {
    var sections = [14,14,14,7].map(function (count, bayIndex) {
      var cards = "";
      for (var number = 1; number <= count; number += 1) {
        var selected = channelType(bayIndex + 1, number);
        var options = ["HDMI + VGA","HDMI","VGA","Inoperante"].map(function (type) { return "<option" + (type === selected ? " selected" : "") + ">" + type + "</option>"; }).join("");
        cards += "<label class=\"channel-config-card\"><span>Baia " + (bayIndex + 1) + "</span><strong>Canal " + String(number).padStart(2,"0") + "</strong><select data-channel-config data-bay=\"" + (bayIndex + 1) + "\" data-channel=\"" + number + "\">" + options + "</select></label>";
      }
      return "<section class=\"panel panel-pad\"><div class=\"bay-head\"><strong>Baia " + (bayIndex + 1) + "</strong><small>" + count + " canais</small></div><div class=\"channel-config-grid\">" + cards + "</div></section>";
    }).join("");
    return "<div class=\"page-stack\">" + pageHead("KVM · Configuração","Configuração de canais","Defina HDMI, VGA, conexão dupla ou canal inoperante. As alterações ficam salvas neste navegador.","<button class=\"button\" data-view=\"kvm\">← Voltar ao KVM</button><button class=\"button button--primary\" data-action=\"save-channels\">Salvar canais</button>") + sections + "</div>";
  }

  function currentPrefix() {
    var now = new Date();
    return String(now.getMonth() + 1).padStart(2,"0") + String(now.getFullYear()).slice(-2);
  }

  function serialValue(sequence) {
    return currentPrefix() + String(sequence).padStart(4,"0");
  }

  function renderLinkage() {
    var batchRows = serialBatches.length ? serialBatches.map(function (batch, index) {
      var priority = opPriority(batch.op,batch.priority);
      return "<tr><td class=\"mono\">" + escapeHtml(batch.createdAt || "—") + "</td><td class=\"mono\">" + escapeHtml(batch.op) + "</td><td>" + pill(priority === "high" ? "Alta" : priority === "low" ? "Baixa" : "Normal",priority === "high" ? "red" : priority === "low" ? "blue" : "green") + "</td><td class=\"mono\">" + escapeHtml(batch.code) + "</td><td>" + escapeHtml(batch.system) + "</td><td class=\"mono\">" + escapeHtml(batch.firstSerial) + " → " + escapeHtml(batch.lastSerial) + "</td><td>" + batch.quantity + "</td><td><button class=\"button button--danger\" data-action=\"delete-serial-batch\" data-index=\"" + index + "\">Excluir</button></td></tr>";
    }).join("") : "<tr><td colspan=\"8\" class=\"empty-table\">Nenhum lote criado ainda. Use o formulário ao lado para gerar a primeira faixa.</td></tr>";
    var totalMachines = serialBatches.reduce(function (acc, b) { return acc + Number(b.quantity || 0); }, 0);
    return "<div class=\"page-stack\">" + pageHead("Montagem","Vinculação e seriais","Crie lotes seguros por mês e ano. Impressão Zebra ficará preparada como próxima etapa.","") +
      "<section class=\"serial-layout\"><div class=\"panel panel-pad\"><div class=\"last-serial\"><span>Último serial criado</span><strong>" + serialValue(state.lastSerial) + "</strong><small>Competência " + currentPrefix() + " · sequência protegida contra duplicidade</small></div><form id=\"serial-form\" class=\"serial-form\" style=\"margin-top:16px\"><label class=\"field\">Quantidade<input id=\"serial-quantity\" type=\"number\" min=\"1\" max=\"9999\" value=\"10\"></label><label class=\"field\">O.P.<input id=\"serial-op\" required placeholder=\"Ex.: 73471\"></label><label class=\"field\">Prioridade da O.P.<select id=\"serial-priority\"><option value=\"normal\">Normal</option><option value=\"high\">Alta</option><option value=\"low\">Baixa</option></select></label><label class=\"field\">Código da máquina<input id=\"serial-code\" required placeholder=\"Código do produto\"></label><label class=\"field\">Sistema operacional esperado<select id=\"serial-os\">" + osSelectOptions("Windows 10 Pro") + "</select></label><label class=\"field\">Layout<select id=\"serial-layout\"><option>Máquina comum</option><option>Backboy</option><option>Etiqueta da caixa</option></select></label><label class=\"field field--wide\">Configuração e componentes<textarea id=\"serial-components\" placeholder=\"Fonte, SSD, placa-mãe, memória...\"></textarea></label><div class=\"validation-note field--wide\"><strong>Validação automática</strong><span>O sistema e a prioridade ficarão presos à O.P., ao código e a cada serial criado.</span></div><button class=\"button button--primary field--wide\" type=\"submit\">Criar faixa de números de série</button></form></div><div class=\"panel coming-soon\"><span class=\"eyebrow\">Zebra · Em breve</span><strong>Etiqueta 70 × 30 mm</strong><p>A geração de serial já funciona localmente. A saída ZPL será conectada depois do modelo e resolução da impressora serem confirmados.</p><div class=\"label-preview\"><div><small>OP 73471 · CÓD. 41007</small><br><strong>GPJ OFFICE · SSD 480 GB</strong><div class=\"barcode\"></div><small>" + serialValue(state.lastSerial) + " · OP 73471</small></div><div class=\"fake-qr\" aria-label=\"Exemplo de QR Code\"></div></div></div></section>" +
      "<section class=\"panel\"><div class=\"panel-head\"><div><span>Histórico de vinculações</span><h2>" + serialBatches.length + " lote(s) · " + totalMachines + " máquina(s) reservada(s)</h2></div>" + (serialBatches.length ? "<button class=\"button button--danger\" data-action=\"clear-serial-batches\">Limpar histórico</button>" : "") + "</div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>Criado em</th><th>O.P.</th><th>Prioridade</th><th>Código</th><th>Sistema</th><th>Faixa de seriais</th><th>Qtd.</th><th>Ações</th></tr></thead><tbody>" + batchRows + "</tbody></table></div></section></div>";
  }

  function renderBurnin() {
    var burninMachines = machines.filter(function (machine) { return machine.certificate === "Recebido" || machine.stage === "BurnIn"; });
    var rows = burninMachines.map(function (machine) {
      var validation = machineValidation(machine);
      return "<tr class=\"" + (validation.key === "mismatch" ? "validation-error" : "") + "\"><td class=\"mono\">" + machine.updated + "</td><td class=\"mono\">" + machine.op + "</td><td><button class=\"table-link\" data-action=\"open-machine-detail\" data-serial=\"" + machine.serial + "\">" + machine.serial + "</button></td><td>" + pill(machine.result || "Aguardando", machine.result === "Aprovada" ? "green" : machine.result ? "red" : "amber") + "</td><td>" + (burninTemperatures[machine.serial] || "—") + "</td><td>" + machine.expectedSystem + "</td><td>" + (machine.actualSystem || "—") + "</td><td>" + pill(validation.label,validation.tone) + "</td></tr>";
    }).join("");
    var validated = burninMachines.filter(function (machine) { return machineValidation(machine).key === "validated"; }).length;
    var mismatches = burninMachines.filter(function (machine) { return machineValidation(machine).key === "mismatch"; }).length;
    var pending = burninMachines.filter(function (machine) { return machineValidation(machine).key === "pending"; }).length;
    return "<div class=\"page-stack\">" + pageHead("Qualidade automatizada","BurnInTest","Resultados do controle.csv com importação idempotente e rastreabilidade por execução.",(state.role === "developer" ? "<button class=\"button\" data-action=\"import-csv\">↑ Importar CSV</button><button class=\"button button--primary\" data-view=\"integration\">Configurar agente</button>" : "")) +
      "<section class=\"metrics\">" + metric("Testados hoje",String(burninMachines.length),validated + " validados","ao vivo","green") + metric("Sistema correto",String(validated),mismatches + " divergência(s)",mismatches ? "bloqueio" : "ok",mismatches ? "red" : "green") + metric("CPU máxima média","66,9 °C","Limite 90 °C","-2,3°","green") + metric("Certificados pendentes",String(pending),"Aguardando agente",pending ? "atenção" : "ok",pending ? "amber" : "green") + "</section><section class=\"certificate-strip\"><div><span>Regra de liberação</span><strong>Esperado na Vinculação = Instalado no certificado</strong></div><p>Se o certificado não chegar ou o sistema for diferente, o Carcará alerta e a máquina não aparece como liberada.</p></section><section class=\"panel\"><div class=\"panel-head\"><div><span>Últimas execuções</span><h2>Banco BurnInTest e certificados</h2></div>" + pill("Conferência automática","green") + "</div><div class=\"table-scroll\"><table class=\"data-table burnin-table\"><thead><tr><th>Hora</th><th>O.P.</th><th>Serial</th><th>Resultado</th><th>CPU máx.</th><th>Sistema esperado</th><th>Sistema instalado</th><th>Certificação</th></tr></thead><tbody>" + rows + "</tbody></table></div></section></div>";
  }

  function renderTrace() {
    var query = String(state.traceQuery || "").trim().toLowerCase();
    var results = machines.filter(function (machine) { return !query || machine.op.toLowerCase() === query || machine.serial.toLowerCase().indexOf(query) >= 0; });
    var selected = machines.find(function (machine) { return machine.serial === state.traceSelected; });
    if (!selected || !results.some(function (machine) { return machine.serial === selected.serial; })) selected = results[0] || null;
    if (selected) state.traceSelected = selected.serial;
    var resultRows = results.map(function (machine) {
      var validation = machineValidation(machine);
      return "<tr class=\"" + (machine.serial === state.traceSelected ? "selected-trace" : "") + "\"><td class=\"mono\">" + machine.op + "</td><td><button class=\"table-link\" data-action=\"select-machine\" data-serial=\"" + machine.serial + "\">" + machine.serial + "</button></td><td>" + machine.stage + "</td><td>" + machine.expectedSystem + "</td><td>" + (machine.actualSystem || "—") + "</td><td>" + pill(validation.label,validation.tone) + "</td><td class=\"mono\">" + machine.updated + "</td></tr>";
    }).join("");
    if (!resultRows) resultRows = "<tr><td colspan=\"7\" class=\"empty-table\">Nenhuma máquina encontrada para esta O.P. ou serial.</td></tr>";
    return "<div class=\"page-stack\">" + pageHead("Histórico completo","Rastreabilidade por máquina e O.P.","Pesquise um serial para ver a linha individual ou uma O.P. para localizar todas as máquinas do lote.","") +
      "<section class=\"panel panel-pad trace-search-panel\"><div class=\"filter-bar\"><label class=\"field\" style=\"flex:1\">O.P. ou número de série<input id=\"trace-query\" value=\"" + escapeHtml(state.traceQuery) + "\" placeholder=\"Ex.: 73471 ou GPJX3520\"></label><button class=\"button button--primary\" data-action=\"trace-search\">Rastrear</button></div><div class=\"search-hint\"><strong>" + results.length + " máquina(s) encontrada(s)</strong><span>Montagem, Assistência e RMA permanecem identificadas separadamente.</span></div></section>" +
      "<section class=\"panel\"><div class=\"panel-head\"><div><span>Resultado do lote</span><h2>Posição atual e conferência do sistema</h2></div>" + pill(query && results.length > 1 ? "O.P. completa" : "Rastreamento","blue") + "</div><div class=\"table-scroll\"><table class=\"data-table trace-table\"><thead><tr><th>O.P.</th><th>Serial</th><th>Etapa atual</th><th>Sistema esperado</th><th>Sistema instalado</th><th>Certificação</th><th>Atualização</th></tr></thead><tbody>" + resultRows + "</tbody></table></div></section>" +
      "<section class=\"trace-instruction\"><span><strong>Detalhes sem ocupar a tela</strong><small>Clique em qualquer número de série para abrir identificação, sistemas e linha do tempo completa.</small></span>" + (selected ? "<button class=\"button button--primary\" data-action=\"open-machine-detail\" data-serial=\"" + selected.serial + "\">Ver " + selected.serial + "</button>" : "") + "</section></div>";
  }

  function renderIndicators() {
    if (state.role === "technician") {
      return "<div class=\"page-stack\">" + pageHead("Resumo operacional","Seus indicadores","Informações simples para organizar o trabalho, sem comparação entre funcionários.","") +
        "<section class=\"metrics\">" + metric("Ativos no seu nome","02","Reparo e KVM","agora","green") + metric("Planejados","04","Próximas atividades","+1","blue") + metric("Em espera","01","Aguardando peça","atenção","amber") + metric("Equipe hoje","67","Resultado geral","85%","green") + "</section><section class=\"panel role-lock\"><h2>Comparativos individuais protegidos</h2><p>Tempos, produtividade por pessoa e análises detalhadas são visíveis somente para o gestor.</p></section></div>";
    }

    // ---- Cálculo real a partir dos dados do sistema ----
    var repActive = repairRows.filter(function (r) { return r.status === "active"; });
    var repPlanned = repairRows.filter(function (r) { return r.status === "planned"; });
    var repWaiting = repairRows.filter(function (r) { return r.status === "waiting"; });
    var repHistory = repairRows.filter(function (r) { return r.status === "history"; });
    var totalRep = repairRows.length;
    var avgRepairSec = repHistory.length ? Math.round(repHistory.reduce(function (a,r) { return a + repairElapsedSeconds(r); },0) / repHistory.length) : 0;
    var totalRepairTimeSec = repairRows.reduce(function (a,r) { return a + repairElapsedSeconds(r); }, 0);

    // Reparos por prioridade
    var priHigh = repairRows.filter(function (r) { return r.priority === "high"; }).length;
    var priNormal = repairRows.filter(function (r) { return r.priority === "normal"; }).length;
    var priLow = repairRows.filter(function (r) { return r.priority === "low"; }).length;

    // Top problemas
    var problemCount = {};
    repairRows.forEach(function (r) { problemCount[r.issue] = (problemCount[r.issue] || 0) + 1; });
    var topProblems = Object.keys(problemCount).map(function (k) { return [k, problemCount[k]]; }).sort(function (a,b) { return b[1] - a[1]; }).slice(0,6);

    // Top soluções aplicadas (histórico)
    var solutionCount = {};
    repHistory.forEach(function (r) { if (r.solution) solutionCount[r.solution] = (solutionCount[r.solution] || 0) + 1; });
    var topSolutions = Object.keys(solutionCount).map(function (k) { return [k, solutionCount[k]]; }).sort(function (a,b) { return b[1] - a[1]; }).slice(0,6);

    // Produtividade por técnico
    var techStats = {};
    repairRows.forEach(function (r) {
      var t = r.tech || "Sem técnico";
      if (!techStats[t]) techStats[t] = { total:0, active:0, history:0, waiting:0, planned:0, timeSec:0 };
      techStats[t].total += 1;
      techStats[t][r.status] = (techStats[t][r.status] || 0) + 1;
      techStats[t].timeSec += repairElapsedSeconds(r);
    });
    var techRows = Object.keys(techStats).sort(function (a,b) { return techStats[b].total - techStats[a].total; });

    // Máquinas
    var totalMachines = machines.length;
    var machValidated = machines.filter(function (m) { return machineValidation(m).key === "validated"; }).length;
    var machPending = machines.filter(function (m) { return machineValidation(m).key === "pending"; }).length;
    var machMismatch = machines.filter(function (m) { return machineValidation(m).key === "mismatch"; }).length;
    var machReleased = machines.filter(function (m) { return m.stage === "Liberada"; }).length;
    var machPriority = machines.filter(function (m) { return m.priority; }).length;

    // Por sistema operacional
    var osCount = {};
    machines.forEach(function (m) { osCount[m.expectedSystem] = (osCount[m.expectedSystem] || 0) + 1; });
    var osRows = Object.keys(osCount).sort(function (a,b) { return osCount[b] - osCount[a]; });

    // Por O.P.
    var opCount = {};
    machines.forEach(function (m) { if (!opCount[m.op]) opCount[m.op] = { total:0, released:0 }; opCount[m.op].total += 1; if (m.stage === "Liberada") opCount[m.op].released += 1; });
    var opRows = Object.keys(opCount).sort(function (a,b) { return opCount[b].total - opCount[a].total; }).slice(0,10);

    // KVM
    var kvmActive = kvmSessions.filter(function (k) { return k.status === "testing"; }).length;
    var kvmPausedCount = kvmSessions.filter(function (k) { return k.status === "paused"; }).length;
    var kvmFailures = kvmSessions.reduce(function (a,k) { return a + Number(k.failures || 0); }, 0);
    var kvmAvgSec = kvmSessions.length ? Math.round(kvmSessions.reduce(function (a,k) { return a + kvmElapsedSeconds(k); },0) / kvmSessions.length) : 0;
    var totalChannels = 14 + 14 + 14 + 7;
    var operantChannels = 0;
    for (var b = 1; b <= 4; b += 1) { var maxC = b === 4 ? 7 : 14; for (var c = 1; c <= maxC; c += 1) { if (channelType(b,c) !== "Inoperante") operantChannels += 1; } }
    var kvmOccupation = operantChannels ? Math.round((kvmSessions.length / operantChannels) * 100) : 0;

    // Fila KVM
    var queueTotal = kvmQueue.length;
    var queuePriority = kvmQueue.filter(function (q) { return q.priority; }).length;
    var queueRetry = kvmQueue.filter(function (q) { return q.attempts > 0; }).length;

    // Cadastros
    var totalParts = parts.length, totalProblems = problems.length, totalSolutions = solutions.length, totalBatches = serialBatches.length;
    var totalReserved = serialBatches.reduce(function (a,b) { return a + Number(b.quantity || 0); }, 0);

    // Alertas Carcará
    var alerts = getNotifications();
    var alertsCritical = alerts.filter(function (n) { return n.level === "critical"; }).length;
    var alertsWarning = alerts.filter(function (n) { return n.level === "warning"; }).length;

    // Blocos HTML
    var privateNote = state.role === "developer" ? "Inclui saúde da API e qualidade das sincronizações." : "Painel completo com dados reais do sistema.";

    var kpi = "<section class=\"metrics\">"
      + metric("Máquinas rastreadas", String(totalMachines), machReleased + " liberadas · " + machPriority + " prioridade", "linha", "blue")
      + metric("Reparos totais", String(totalRep), repActive.length + " ativos · " + repWaiting.length + " em espera", "fluxo", repWaiting.length ? "amber" : "green")
      + metric("Sistemas validados", String(machValidated) + "/" + totalMachines, machMismatch + " divergência(s) · " + machPending + " pendente(s)", "qualidade", machMismatch ? "red" : "green")
      + metric("Alertas Carcará", String(alerts.length), alertsCritical + " crítico(s) · " + alertsWarning + " atenção", "hoje", alertsCritical ? "red" : alertsWarning ? "amber" : "green")
      + "</section>";

    var kpi2 = "<section class=\"metrics\">"
      + metric("Tempo médio de reparo", formatClock(avgRepairSec), "Base: " + repHistory.length + " concluído(s)", "histórico", "blue")
      + metric("Tempo total investido", formatClock(totalRepairTimeSec), "Soma de todos os reparos", "acumulado", "blue")
      + metric("Ocupação do KVM", kvmOccupation + "%", kvmSessions.length + " de " + operantChannels + " canais operantes", "agora", kvmOccupation > 80 ? "amber" : "green")
      + metric("Falhas registradas no KVM", String(kvmFailures), "Somatório de reinícios", "qualidade", kvmFailures ? "amber" : "green")
      + "</section>";

    var priorityPanel = "<div class=\"panel panel-pad\"><div class=\"panel-head\"><div><span>Distribuição</span><h2>Reparos por prioridade</h2></div></div><div class=\"attention-list\">"
      + "<div class=\"attention-item critical\"><i class=\"attention-icon\">!</i><span><strong>Alta</strong><small>Prioridade máxima do gestor</small></span><b>" + priHigh + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">•</i><span><strong>Normal</strong><small>Fluxo padrão</small></span><b>" + priNormal + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">↓</i><span><strong>Baixa</strong><small>Sem urgência</small></span><b>" + priLow + "</b></div>"
      + "</div></div>";

    var statusPanel = "<div class=\"panel panel-pad\"><div class=\"panel-head\"><div><span>Reparos</span><h2>Situação atual</h2></div></div><div class=\"attention-list\">"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">▶</i><span><strong>Em andamento</strong><small>Cronômetro correndo</small></span><b>" + repActive.length + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">◷</i><span><strong>Planejados</strong><small>Aguardando início</small></span><b>" + repPlanned.length + "</b></div>"
      + "<div class=\"attention-item " + (repWaiting.length ? "critical" : "") + "\"><i class=\"attention-icon\">⏸</i><span><strong>Em espera</strong><small>Aguardando peça / decisão</small></span><b>" + repWaiting.length + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">✓</i><span><strong>Finalizados</strong><small>Histórico local</small></span><b>" + repHistory.length + "</b></div>"
      + "</div></div>";

    var topProblemsHtml = topProblems.length ? topProblems.map(function (p) {
      var pct = Math.round((p[1] / totalRep) * 100);
      return "<div class=\"attention-item\"><i class=\"attention-icon\">#</i><span><strong>" + escapeHtml(p[0]) + "</strong><small>" + pct + "% dos reparos</small></span><b>" + p[1] + "</b></div>";
    }).join("") : "<div class=\"attention-item\"><span><strong>Sem dados</strong><small>Cadastre reparos para gerar o ranking</small></span></div>";

    var topSolutionsHtml = topSolutions.length ? topSolutions.map(function (p) {
      return "<div class=\"attention-item\"><i class=\"attention-icon\">✓</i><span><strong>" + escapeHtml(p[0]) + "</strong><small>Aplicada em reparos finalizados</small></span><b>" + p[1] + "</b></div>";
    }).join("") : "<div class=\"attention-item\"><span><strong>Nenhuma solução aplicada ainda</strong><small>Finalize um reparo sem troca de peça para popular</small></span></div>";

    var techRowsHtml = techRows.length ? techRows.map(function (t) {
      var st = techStats[t];
      var avg = st.total ? formatClock(Math.round(st.timeSec / st.total)) : "—";
      return "<tr><td><strong>" + escapeHtml(t) + "</strong></td><td>" + st.total + "</td><td>" + (st.active || 0) + "</td><td>" + (st.planned || 0) + "</td><td>" + (st.waiting || 0) + "</td><td>" + (st.history || 0) + "</td><td class=\"mono\">" + formatClock(st.timeSec) + "</td><td class=\"mono\">" + avg + "</td></tr>";
    }).join("") : "<tr><td colspan=\"8\" class=\"empty-table\">Nenhum técnico com reparos.</td></tr>";

    var osRowsHtml = osRows.length ? osRows.map(function (k) {
      var pct = Math.round((osCount[k] / totalMachines) * 100);
      return "<tr><td>" + escapeHtml(k) + "</td><td>" + osCount[k] + "</td><td>" + pct + "%</td></tr>";
    }).join("") : "<tr><td colspan=\"3\" class=\"empty-table\">Sem máquinas cadastradas.</td></tr>";

    var opRowsHtml = opRows.length ? opRows.map(function (op) {
      var d = opCount[op];
      var pct = d.total ? Math.round((d.released / d.total) * 100) : 0;
      return "<tr><td class=\"mono\">" + escapeHtml(op) + "</td><td>" + d.total + "</td><td>" + d.released + "</td><td>" + pct + "%</td></tr>";
    }).join("") : "<tr><td colspan=\"4\" class=\"empty-table\">Nenhuma O.P. no sistema.</td></tr>";

    var kvmPanel = "<div class=\"panel panel-pad\"><div class=\"panel-head\"><div><span>KVM · Run-in</span><h2>Estado da estação</h2></div>" + pill(kvmPaused ? "Pausado" : "Operando", kvmPaused ? "red" : "green") + "</div><div class=\"attention-list\">"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">▶</i><span><strong>Sessões testando</strong><small>Cronômetros ativos</small></span><b>" + kvmActive + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">⏸</i><span><strong>Sessões pausadas</strong><small>Aguardando decisão</small></span><b>" + kvmPausedCount + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">◷</i><span><strong>Tempo médio ativo</strong><small>Sessões em andamento</small></span><b>" + formatClock(kvmAvgSec) + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">▦</i><span><strong>Canais operantes</strong><small>" + totalChannels + " canais totais</small></span><b>" + operantChannels + "</b></div>"
      + "</div></div>";

    var queuePanel = "<div class=\"panel panel-pad\"><div class=\"panel-head\"><div><span>KVM</span><h2>Fila de espera</h2></div></div><div class=\"attention-list\">"
      + "<div class=\"attention-item " + (queueTotal ? "" : "") + "\"><i class=\"attention-icon\">☰</i><span><strong>Máquinas em fila</strong><small>Aguardando canal livre</small></span><b>" + queueTotal + "</b></div>"
      + "<div class=\"attention-item " + (queuePriority ? "critical" : "") + "\"><i class=\"attention-icon\">!</i><span><strong>Com prioridade</strong><small>Serão puxadas primeiro</small></span><b>" + queuePriority + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">↻</i><span><strong>Retentativas</strong><small>Voltaram do reparo</small></span><b>" + queueRetry + "</b></div>"
      + "</div></div>";

    var registryPanel = "<div class=\"panel panel-pad\"><div class=\"panel-head\"><div><span>Cadastros</span><h2>Base operacional</h2></div></div><div class=\"attention-list\">"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">PÇ</i><span><strong>Peças</strong><small>Códigos disponíveis no reparo</small></span><b>" + totalParts + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">?</i><span><strong>Problemas</strong><small>Categorias cadastradas</small></span><b>" + totalProblems + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">✓</i><span><strong>Soluções</strong><small>Sem troca de peça</small></span><b>" + totalSolutions + "</b></div>"
      + "<div class=\"attention-item\"><i class=\"attention-icon\">#</i><span><strong>Lotes de vinculação</strong><small>" + totalReserved + " seriais reservados</small></span><b>" + totalBatches + "</b></div>"
      + "</div></div>";

    var alertList = alerts.length ? alerts.slice(0,6).map(function (n) {
      return "<div class=\"attention-item " + (n.level === "critical" ? "critical" : "") + "\"><i class=\"attention-icon\">" + (n.level === "critical" ? "!" : n.level === "warning" ? "▲" : "•") + "</i><span><strong>" + escapeHtml(n.title) + "</strong><small>" + escapeHtml(n.module) + " · " + escapeHtml(n.time) + "</small></span><b>" + escapeHtml(n.level) + "</b></div>";
    }).join("") : "<div class=\"attention-item\"><span><strong>Sem alertas</strong><small>Tudo operando conforme esperado</small></span></div>";

    return "<div class=\"page-stack\">" + pageHead("Gestão","Painel de chão de fábrica", privateNote, "<button class=\"button\">Hoje</button><button class=\"button\">30 dias</button><button class=\"button button--primary\">Personalizado</button>")
      + kpi
      + kpi2
      + "<section class=\"balanced-grid\">" + statusPanel + priorityPanel + "</section>"
      + "<section class=\"balanced-grid\">"
        + "<div class=\"panel panel-pad\"><div class=\"panel-head\"><div><span>Reparo</span><h2>Problemas mais frequentes</h2></div></div><div class=\"attention-list\">" + topProblemsHtml + "</div></div>"
        + "<div class=\"panel panel-pad\"><div class=\"panel-head\"><div><span>Reparo</span><h2>Soluções mais aplicadas</h2></div></div><div class=\"attention-list\">" + topSolutionsHtml + "</div></div>"
      + "</section>"
      + "<section class=\"panel\"><div class=\"panel-head\"><div><span>Produtividade</span><h2>Desempenho por técnico</h2></div>" + pill("Dados locais", "blue") + "</div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>Técnico</th><th>Total</th><th>Ativos</th><th>Planejados</th><th>Em espera</th><th>Finalizados</th><th>Tempo total</th><th>Tempo médio</th></tr></thead><tbody>" + techRowsHtml + "</tbody></table></div></section>"
      + "<section class=\"balanced-grid\">" + kvmPanel + queuePanel + "</section>"
      + "<section class=\"balanced-grid\">"
        + "<div class=\"panel\"><div class=\"panel-head\"><div><span>Máquinas</span><h2>Distribuição por sistema</h2></div></div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>Sistema esperado</th><th>Máquinas</th><th>%</th></tr></thead><tbody>" + osRowsHtml + "</tbody></table></div></div>"
        + "<div class=\"panel\"><div class=\"panel-head\"><div><span>O.P.</span><h2>Top 10 ordens de produção</h2></div></div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>O.P.</th><th>Total</th><th>Liberadas</th><th>%</th></tr></thead><tbody>" + opRowsHtml + "</tbody></table></div></div>"
      + "</section>"
      + "<section class=\"balanced-grid\">" + registryPanel + "<div class=\"panel panel-pad\"><div class=\"panel-head\"><div><span>Carcará de Olho</span><h2>Últimos alertas</h2></div>" + pill(alertsCritical ? "Crítico" : alertsWarning ? "Atenção" : "OK", alertsCritical ? "red" : alertsWarning ? "amber" : "green") + "</div><div class=\"attention-list\">" + alertList + "</div></div></section>"
      + "<div class=\"panel panel-pad\"><div class=\"panel-head\"><div><span>Últimos 14 dias</span><h2>Capacidade e produção</h2></div></div><div class=\"chart\"><div class=\"bar-chart\">" + [70,85,63,92,78,100,88,72,95,81,90,67,86,93].map(function (value,index) { return "<span style=\"height:" + value + "%\" data-label=\"" + (index + 1) + "/07\"></span>"; }).join("") + "</div></div></div>"
      + "</div>";
  }

  function renderParts() {
    var rows = parts.map(function (part, index) {
      return "<tr><td class=\"mono\"><strong>" + escapeHtml(part.code) + "</strong></td><td>" + escapeHtml(part.description) + "</td><td><button class=\"button\" data-action=\"edit-part\" data-index=\"" + index + "\">Editar</button> <button class=\"button button--danger\" data-action=\"delete-part\" data-index=\"" + index + "\">Excluir</button></td></tr>";
    }).join("");
    return "<div class=\"page-stack\">" + pageHead("Cadastro operacional","Peças","Cadastre códigos usados na aquisição do reparo. A lista fica disponível imediatamente no fluxo técnico.","") +
      "<section class=\"panel panel-pad\"><form id=\"part-form\" class=\"part-form\"><label class=\"field\">Código<input id=\"part-code\" required placeholder=\"Ex.: 41007\"></label><label class=\"field\">Descrição<input id=\"part-description\" required placeholder=\"Ex.: Placa-mãe\"></label><button class=\"button button--primary\" type=\"submit\">+ Cadastrar peça</button></form></section>" +
      "<section class=\"panel\"><div class=\"panel-head\"><div><span>Base de peças</span><h2>" + parts.length + " itens cadastrados</h2></div></div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>Código</th><th>Descrição</th><th>Ações</th></tr></thead><tbody>" + rows + "</tbody></table></div></section></div>";
  }

  function renderRegistry() {
    var partRows = parts.map(function (part,index) { return "<tr><td class=\"mono\"><strong>" + escapeHtml(part.code) + "</strong></td><td>" + escapeHtml(part.description) + "</td><td><button class=\"button\" data-action=\"edit-part\" data-index=\"" + index + "\">Editar</button> <button class=\"button button--danger\" data-action=\"delete-part\" data-index=\"" + index + "\">Excluir</button></td></tr>"; }).join("");
    var problemRows = problems.map(function (problem,index) { return "<li><span>" + escapeHtml(problem) + "</span><button class=\"button button--danger\" data-action=\"delete-problem\" data-index=\"" + index + "\">Excluir</button></li>"; }).join("");
    var technicianRows = technicians.map(function (tech,index) { return "<tr><td><strong>" + escapeHtml(tech.name) + "</strong></td><td>" + escapeHtml(tech.registration) + "</td><td>" + escapeHtml(tech.shift) + "</td><td>" + pill(tech.active === false ? "Inativo" : "Ativo",tech.active === false ? "amber" : "green") + "</td><td><button class=\"button button--danger\" data-action=\"delete-technician\" data-index=\"" + index + "\">Excluir</button></td></tr>"; }).join("");
    return "<div class=\"page-stack\">" + pageHead("Cadastros","Base operacional unificada","Peças, técnicos e problemas usados no Reparo e no KVM, todos no mesmo lugar.","") +
      "<section class=\"metrics\">" + metric("Técnicos",String(technicians.length),"Equipe cadastrada","ativos","green") + metric("Problemas",String(problems.length),"Categorias do reparo","lista","blue") + metric("Peças",String(parts.length),"Códigos disponíveis","base","amber") + metric("Canais KVM","49","43 operantes","87,8%","green") + "</section>" +
      "<section class=\"registry-grid\"><div class=\"panel panel-pad\"><div class=\"panel-head compact\"><div><span>Novo cadastro</span><h2>Técnico</h2></div></div><form id=\"technician-form\" class=\"form-stack\"><label>Nome<input id=\"technician-name\" required placeholder=\"Nome do técnico\"></label><label>Matrícula<input id=\"technician-registration\" required placeholder=\"Matrícula\"></label><label>Turno<input id=\"technician-shift\" value=\"T1\"></label><button class=\"button button--primary\" type=\"submit\">Cadastrar técnico</button></form></div><div class=\"panel panel-pad\"><div class=\"panel-head compact\"><div><span>Novo cadastro</span><h2>Problema</h2></div></div><form id=\"problem-form\" class=\"form-stack\"><label>Descrição<input id=\"registry-problem-name\" required placeholder=\"Ex.: BIOS não salva\"></label><button class=\"button button--primary\" type=\"submit\">Cadastrar problema</button></form><ul class=\"registry-list\">" + problemRows + "</ul></div></section>" +
      "<section class=\"panel panel-pad\"><div class=\"panel-head compact\"><div><span>Novo cadastro</span><h2>Peça</h2></div></div><form id=\"part-form\" class=\"part-form\"><label class=\"field\">Código<input id=\"part-code\" required placeholder=\"Ex.: 41007\"></label><label class=\"field\">Descrição<input id=\"part-description\" required placeholder=\"Ex.: Placa-mãe\"></label><button class=\"button button--primary\" type=\"submit\">Cadastrar peça</button></form></section>" +
      "<section class=\"panel\"><div class=\"panel-head\"><div><span>Equipe</span><h2>Técnicos cadastrados</h2></div></div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>Nome</th><th>Matrícula</th><th>Turno</th><th>Situação</th><th>Ações</th></tr></thead><tbody>" + technicianRows + "</tbody></table></div></section>" +
      "<section class=\"panel\"><div class=\"panel-head\"><div><span>Estoque técnico</span><h2>Peças cadastradas</h2></div></div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>Código</th><th>Descrição</th><th>Ações</th></tr></thead><tbody>" + partRows + "</tbody></table></div></section></div>";
  }

  function renderIntegration() {
    if (state.role !== "developer") return "<div class=\"page-stack\"><section class=\"panel role-lock\"><h1>Área restrita</h1><p>Somente o perfil Desenvolvedor pode configurar a API e consultar logs técnicos.</p></section></div>";
    var endpoint = state.api.url || "https://seu-servidor.example/api/v1/ingestion/burnin/csv";
    var interval = state.api.interval || "60";
    return "<div class=\"page-stack\">" + pageHead("DEV · Restrito","Integração BurnIn","Configure o agente Windows, acompanhe lotes e valide a comunicação sem expor a chave no HTML.","<button class=\"button\" data-action=\"download-config\">Baixar configuração exemplo</button>") +
      "<section class=\"api-grid\"><div class=\"panel panel-pad\"><span class=\"eyebrow\">Configuração do agente</span><div class=\"form-stack\" style=\"margin-top:15px\"><label>URL da API<input id=\"api-url\" value=\"" + escapeHtml(endpoint) + "\"></label><label>Intervalo em minutos<input id=\"api-interval\" type=\"number\" min=\"1\" value=\"" + escapeHtml(interval) + "\"></label><label>Caminho do CSV<input id=\"api-csv\" value=\"" + escapeHtml(state.api.csv || "\\\\SRV-PRODUCAO\\f\\logs-BurnInTest\\CONTROLE\\controle.csv") + "\"></label><label>Identificador da origem<input id=\"api-source\" value=\"" + escapeHtml(state.api.source || "SRV-PRODUCAO") + "\"></label><label>Chave da API<input id=\"api-key\" type=\"password\" placeholder=\"Configurada somente no servidor Windows\"></label><button class=\"button button--primary\" data-action=\"save-api\">Salvar parâmetros locais</button></div></div><div class=\"panel panel-pad\"><span class=\"eyebrow\">Saúde da sincronização</span><div class=\"status-board\" style=\"margin-top:15px\"><div class=\"status-box\"><span>Última leitura</span><strong>15:42</strong></div><div class=\"status-box\"><span>Próxima tentativa</span><strong>16:42</strong></div><div class=\"status-box\"><span>Aceitos</span><strong>21</strong></div><div class=\"status-box\"><span>Duplicados</span><strong>0</strong></div><div class=\"status-box\"><span>Pendentes locais</span><strong>1</strong></div><div class=\"status-box\"><span>Estado</span><strong style=\"color:var(--amber)\">Atenção</strong></div></div><p style=\"color:var(--muted);font-size:10px;line-height:1.6\">A chave digitada não é persistida no navegador. O instalador pede o segredo diretamente no Windows.</p></div></section><section class=\"panel panel-pad\"><span class=\"eyebrow\">Fluxo seguro</span><h2>Original → cópia estável → fila local → API</h2><div class=\"code-block\">1. O agente tenta abrir o controle.csv somente para leitura.<br>2. Cria uma cópia temporária com nome único.<br>3. Compara as linhas com o estado local e monta um lote apenas com novidades.<br>4. Envia com chave de idempotência e token externo.<br>5. Exclui somente a cópia confirmada; nunca o controle.csv.<br>6. Em caso de falha, mantém o lote na fila para nova tentativa.</div></section><section class=\"panel panel-pad\"><span class=\"eyebrow\">Auditoria</span><div class=\"audit-list\" style=\"margin-top:12px\"><div class=\"audit-item\"><strong>15:42:18</strong><span>Lote processado · 21 aceitos</span><small>SRV-PRODUCAO</small></div><div class=\"audit-item\"><strong>14:42:05</strong><span>Leitura sem novos registros</span><small>SRV-PRODUCAO</small></div><div class=\"audit-item\"><strong>13:42:09</strong><span>Falha de rede · mantido na fila</span><small>nova tentativa</small></div></div></section></div>";
  }

  function render() {
    updateChrome();
    var renderers = { overview: renderOverview, linkage: renderLinkage, bios: renderBios, kvm: renderKvm, "kvm-config": renderKvmConfig, repairs: renderRepairs, burnin: renderBurnin, trace: renderTrace, indicators: renderIndicators, registry: renderRegistry, "manager-settings": renderManagerSettings, integration: renderIntegration };
    var pageNames = { overview:"Visão geral",linkage:"Vinculação",bios:"BIOS",kvm:"KVM · Run-in","kvm-config":"Configuração de canais",repairs:"Reparos",burnin:"BurnIn",trace:"Rastreabilidade",indicators:"Indicadores",registry:"Cadastros","manager-settings":"Gestão de O.P.",integration:"Integração API" };
    $("#page-title").textContent = pageNames[state.view] || "PBA Flow";
    $("#content").innerHTML = (renderers[state.view] || renderOverview)();
    updateKvmTimers();
  }

  function setView(view) {
    if (view === "more") { openDrawer("quick-drawer"); return; }
    if (view === "integration" && state.role !== "developer") {
      showToast("A configuração da API é exclusiva do perfil DEV.");
      return;
    }
    if ((view === "indicators" || view === "manager-settings") && state.role !== "manager") {
      showToast("Esta área é exclusiva do gestor.");
      return;
    }
    if (view === "parts") view = "registry";
    if (state.view === view) return;
    state.view = view;
    $("#sidebar").classList.remove("open");
    $("#sidebar-scrim").classList.remove("show");
    render();
  }

  function renderNotifications() {
    $("#notification-list").innerHTML = getNotifications().map(function (item) {
      return "<article class=\"notification " + item.level + "\"><span><b>" + item.module + "</b><time>" + item.time + "</time></span><strong>" + item.title + "</strong><p>" + item.text + "</p><button class=\"button\" data-close-drawer>Abrir registro</button></article>";
    }).join("");
  }

  function renderQuickActions() {
    var actions = [
      ["new-repair","Planejar reparo","O.P., serial, problema e prioridade"],
      ["start-scan","Iniciar teste KVM","Bipagem sequencial por canal"],
      ["new-registry","Cadastrar peça","Código e descrição sem sair do fluxo"]
    ];
    if (state.sector === "assembly") actions.push(["new-serial","Criar números de série","Lote da Vinculação"]);
    if (state.role === "developer") actions.push(["open-integration","Configurar API","Agente Windows e sincronização"]);
    $("#quick-actions").innerHTML = actions.map(function (item) {
      return "<button data-action=\"" + item[0] + "\"><strong>" + item[1] + "</strong><small>" + item[2] + "</small></button>";
    }).join("");
  }

  function openDrawer(id) {
    if (id === "notification-drawer") renderNotifications();
    if (id === "quick-drawer") renderQuickActions();
    $("#" + id).setAttribute("aria-hidden","false");
  }

  function closeDrawers() {
    $$(".drawer").forEach(function (drawer) { drawer.setAttribute("aria-hidden","true"); });
  }

  function openModal(kicker, title, body) {
    $("#modal").classList.remove("modal--wide");
    $("#modal-kicker").textContent = kicker;
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = body;
    if (!$("#modal").open) $("#modal").showModal();
  }

  function machineDetailModal(serial) {
    var machine = machines.find(function (item) { return item.serial === serial; });
    if (!machine) { showToast("A máquina selecionada não foi encontrada."); return; }
    var validation = machineValidation(machine);
    var repair = repairRows.find(function (item) { return item.serial === serial && item.status !== "history"; });
    var session = kvmSessions.find(function (item) { return item.serial === serial; });
    var priorityLabel = machine.priorityLevel === "low" ? "Baixa" : machine.priority ? "Alta" : "Normal";
    var priorityTone = machine.priorityLevel === "low" ? "blue" : machine.priority ? "red" : "green";
    var burninTitle = validation.key === "mismatch" ? "Sistema divergente: liberação bloqueada" : validation.key === "pending" ? "BurnIn aguardando certificado" : "BurnIn validou o sistema correto";
    var burninDetail = validation.key === "mismatch" ? "Esperado " + machine.expectedSystem + " · recebido " + machine.actualSystem : validation.key === "pending" ? "O agente ainda não enviou o certificado" : (machine.actualSystem || machine.expectedSystem) + " confirmado pelo certificado";
    var body = "<section class=\"record-popup\"><div class=\"record-popup-summary\"><article class=\"record-primary\"><span>Número de série</span><strong class=\"mono\">" + escapeHtml(machine.serial) + "</strong><small>O.P. " + escapeHtml(machine.op) + " · " + escapeHtml(machine.sector) + "</small></article><article><span>Etapa atual</span><strong>" + escapeHtml(machine.stage) + "</strong><small>Atualizado às " + escapeHtml(machine.updated) + "</small></article><article><span>Responsável</span><strong>" + escapeHtml(machine.technician) + "</strong><small>" + (session ? escapeHtml(session.key) + " em operação" : repair ? "Fluxo do reparo" : "Registro da linha") + "</small></article><article><span>Prioridade</span>" + pill(priorityLabel,priorityTone) + "<small>Código " + escapeHtml(machine.code) + "</small></article><article><span>Certificado</span><strong>" + escapeHtml(machine.certificate) + "</strong><small>" + escapeHtml(validation.label) + "</small></article></div><div class=\"record-popup-grid\"><div class=\"record-timeline\"><div class=\"record-section-head\"><span>Linha do tempo</span><strong>Histórico operacional</strong></div><div class=\"attention-list\"><div class=\"attention-item\"><i class=\"attention-icon\">✓</i><span><strong>Vinculação criada</strong><small>Sistema esperado " + escapeHtml(machine.expectedSystem) + "</small></span><b>08:12</b></div><div class=\"attention-item\"><i class=\"attention-icon\">✓</i><span><strong>BIOS conferida</strong><small>Encaminhamento registrado no fluxo</small></span><b>08:44</b></div><div class=\"attention-item\"><i class=\"attention-icon\">✓</i><span><strong>KVM / Run-in</strong><small>Operação vinculada a " + escapeHtml(machine.technician) + "</small></span><b>10:06</b></div><div class=\"attention-item " + (validation.tone === "red" ? "critical" : "") + "\"><i class=\"attention-icon\">" + (validation.key === "validated" ? "✓" : "!") + "</i><span><strong>" + burninTitle + "</strong><small>" + burninDetail + "</small></span><b>" + escapeHtml(machine.updated) + "</b></div></div></div><div class=\"record-validation\"><div class=\"record-section-head\"><span>Conferência final</span><strong>Sistema operacional</strong></div><div class=\"os-check-card " + validation.key + "\"><span>Sistema esperado</span><strong>" + escapeHtml(machine.expectedSystem) + "</strong><i>↓ conferência BurnIn</i><span>Sistema instalado</span><strong>" + escapeHtml(machine.actualSystem || "Ainda não informado") + "</strong></div>" + (repair ? "<div class=\"record-note\"><span>Reparo vinculado</span><strong>" + escapeHtml(repair.issue) + "</strong><small>" + escapeHtml(repair.notes || "Sem observações adicionais") + "</small></div>" : "") + "</div></div><div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Fechar</button><button class=\"button button--primary\" type=\"button\" data-action=\"go-machine-trace\" data-serial=\"" + escapeHtml(machine.serial) + "\">Abrir na rastreabilidade</button></div></section>";
    openModal("Registro completo","Máquina " + machine.serial,body);
    $("#modal").classList.add("modal--wide");
  }

  function repairDetailModal(id) {
    var row = repairRows.find(function (item) { return item.id === Number(id); });
    if (!row) { showToast("O reparo selecionado não foi encontrado."); return; }
    var stages = ["Diagnóstico","Aquisição de peça","Montagem","Testes"];
    var statusLabels = {active:"Em andamento",planned:"Planejado",waiting:"Em espera",history:"Finalizado"};
    var priorityLabel = row.priority === "high" ? "Alta" : row.priority === "low" ? "Baixa" : "Normal";
    var priorityTone = row.priority === "high" ? "red" : row.priority === "low" ? "blue" : "green";
    var stageHtml = stages.map(function (name,index) { var status = index < row.stage ? "done" : index === row.stage && row.status !== "history" ? "active" : ""; return "<div class=\"stage " + status + "\"><strong>" + name + "</strong><small>" + (index < row.stage || row.status === "history" ? "Concluído" : index === row.stage ? "Em andamento" : "Aguardando") + "</small></div>"; }).join("");
    var body = "<section class=\"record-popup repair-record-popup\"><div class=\"record-popup-summary\"><article class=\"record-primary\"><span>Número de série</span><strong class=\"mono\">" + escapeHtml(row.serial) + "</strong><small>O.P. " + escapeHtml(row.op) + "</small></article><article><span>Problema</span><strong>" + escapeHtml(row.issue) + "</strong><small>Categoria cadastrada</small></article><article><span>Técnico</span><strong>" + escapeHtml(row.tech) + "</strong><small>Responsável planejado</small></article><article><span>Prioridade</span>" + pill(priorityLabel,priorityTone) + "<small>Planejamento do reparo</small></article><article><span>Tempo total</span><time class=\"record-clock mono\" data-repair-timer=\"" + row.id + "\">" + formatClock(repairElapsedSeconds(row)) + "</time><small>" + statusLabels[row.status] + "</small></article></div><div class=\"record-repair-flow\"><div class=\"record-section-head\"><span>Fluxo técnico</span><strong>Etapas desta máquina</strong></div><div class=\"stage-track\">" + stageHtml + "</div></div><div class=\"record-note\"><span>Observações</span><strong>" + escapeHtml(row.notes || "Nenhuma observação registrada") + "</strong>" + (row.partCode ? "<small>Peça vinculada: " + escapeHtml(row.partCode) + "</small>" : "") + "</div><div class=\"modal-actions modal-actions--split\"><button class=\"button button--danger\" type=\"button\" data-action=\"delete-repair\" data-id=\"" + row.id + "\">Excluir registro</button><span></span><button class=\"button\" value=\"cancel\">Fechar</button><button class=\"button button--primary\" type=\"button\" data-action=\"edit-repair\" data-id=\"" + row.id + "\">Editar registro</button></div></section>";
    openModal("Reparo · " + statusLabels[row.status],"OP " + row.op + " · " + row.serial,body);
    $("#modal").classList.add("modal--wide");
  }

  function repairModal(row) {
    row = row || { op:"", serial:"", issue:problems[0] || "", tech:"Sem técnico", priority:"normal", notes:"" };
    var problemOptions = problems.map(function (problem) { return "<option" + (problem === row.issue ? " selected" : "") + ">" + escapeHtml(problem) + "</option>"; }).join("");
    var techOptions = technicianOptions(row.tech,true);
    openModal("Planejamento", row.id ? "Editar reparo" : "Novo reparo", "<div class=\"repair-form-grid\"><label class=\"field\">O.P.<input id=\"new-op\" value=\"" + escapeHtml(row.op) + "\" placeholder=\"Número da O.P.\"></label><label class=\"field\">Número de série<input id=\"new-serial\" value=\"" + escapeHtml(row.serial) + "\" placeholder=\"Número de série\"></label><label class=\"field problem-field\">Problema cadastrado<select id=\"new-problem\">" + problemOptions + "</select><button class=\"inline-link\" type=\"button\" data-action=\"add-problem\">+ Cadastrar outro problema</button></label><label class=\"field\">Técnico planejado<select id=\"new-tech\">" + techOptions + "</select></label><label class=\"field\">Prioridade<select id=\"new-priority\"><option value=\"normal\"" + (row.priority === "normal" ? " selected" : "") + ">Normal</option><option value=\"high\"" + (row.priority === "high" ? " selected" : "") + ">Alta</option><option value=\"low\"" + (row.priority === "low" ? " selected" : "") + ">Baixa</option></select></label><label class=\"field notes-field\">Observações<textarea id=\"new-notes\" placeholder=\"Detalhes úteis para o diagnóstico\">" + escapeHtml(row.notes || "") + "</textarea></label></div><div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Cancelar</button><button class=\"button button--primary\" type=\"button\" data-action=\"save-repair\" data-id=\"" + (row.id || "") + "\">" + (row.id ? "Salvar alterações" : "Adicionar à fila") + "</button></div>");
  }

  function newRepairModal() { repairModal(null); }

  function addProblemModal() {
    openModal("Cadastro rápido","Novo problema","<div class=\"form-stack\"><label>Nome do problema<input id=\"problem-name\" placeholder=\"Ex.: BIOS não salva\"></label></div><div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Cancelar</button><button class=\"button button--primary\" type=\"button\" data-action=\"save-problem\">Cadastrar problema</button></div>");
  }

  function partModal(index) {
    var part = index == null ? {code:"",description:""} : parts[index];
    openModal("Cadastro de peças", index == null ? "Nova peça" : "Editar peça", "<div class=\"form-stack\"><label>Código<input id=\"modal-part-code\" value=\"" + escapeHtml(part.code) + "\"></label><label>Descrição<input id=\"modal-part-description\" value=\"" + escapeHtml(part.description) + "\"></label></div><div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Cancelar</button><button class=\"button button--primary\" type=\"button\" data-action=\"save-part-modal\" data-index=\"" + (index == null ? "" : index) + "\">Salvar peça</button></div>");
  }

  function waitRepairModal(id) {
    var options = waitReasons.map(function (reason) { return "<option>" + escapeHtml(reason) + "</option>"; }).join("");
    openModal("Reparo · dependência externa","Adicionar em espera","<p class=\"modal-copy\">Use Em espera somente quando o serviço depender de outra pessoa, setor ou material.</p><div class=\"form-stack\"><label>Motivo da espera<select id=\"wait-reason\">" + options + "</select></label><label>Observação<textarea id=\"wait-notes\" placeholder=\"Detalhe quem ou o que está sendo aguardado\"></textarea></label></div><div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Cancelar</button><button class=\"button button--warning\" type=\"button\" data-action=\"confirm-wait-repair\" data-id=\"" + id + "\">Mover para Em espera</button></div>");
  }

  function correctRepairTimeModal(id) {
    var row = repairRows.find(function (item) { return item.id === Number(id); });
    if (!row) return;
    var seconds = repairElapsedSeconds(row);
    openModal("Correção auditada","Corrigir cronômetro","<p class=\"modal-copy\">Informe o tempo correto e justifique a alteração. A justificativa ficará no registro da máquina.</p><div class=\"repair-time-grid\"><label>Horas<input id=\"correct-hours\" type=\"number\" min=\"0\" value=\"" + Math.floor(seconds / 3600) + "\"></label><label>Minutos<input id=\"correct-minutes\" type=\"number\" min=\"0\" max=\"59\" value=\"" + Math.floor((seconds % 3600) / 60) + "\"></label><label>Segundos<input id=\"correct-seconds\" type=\"number\" min=\"0\" max=\"59\" value=\"" + (seconds % 60) + "\"></label></div><div class=\"form-stack\"><label>Justificativa obrigatória<textarea id=\"correct-justification\" placeholder=\"Ex.: fui realizar outra atividade e esqueci o cronômetro rodando\"></textarea></label></div><div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Cancelar</button><button class=\"button button--primary\" type=\"button\" data-action=\"save-repair-time\" data-id=\"" + id + "\">Salvar correção</button></div>");
  }

  function profileModal() {
    if (backendState.configured && !backend.getSession()) {
      openModal("Acesso seguro","Entrar no PBA Flow","<p class=\"modal-copy\">Use o e-mail e a senha cadastrados pelo administrador. O perfil e as permissoes serao carregados automaticamente.</p><div class=\"form-stack\"><label>E-mail<input id=\"auth-email\" type=\"email\" autocomplete=\"username\" placeholder=\"nome@empresa.com.br\"></label><label>Senha<input id=\"auth-password\" type=\"password\" autocomplete=\"current-password\" placeholder=\"Sua senha\"></label></div><div class=\"modal-actions\"><button class=\"button button--primary\" type=\"button\" data-action=\"sign-in\">Entrar</button></div>");
      window.setTimeout(function () { var input = $("#auth-email"); if (input) input.focus(); }, 0);
      return;
    }
    if (backendState.configured) {
      var activeProfile = backendState.profile || backend.getProfile() || {};
      var activeRole = roleLabels[activeProfile.role] || roleLabels.technician;
      openModal("Sessao autenticada",activeProfile.display_name || state.user,"<div class=\"profile-session\"><span class=\"profile-session-avatar\">" + escapeHtml((activeProfile.display_name || state.user || "U").charAt(0).toUpperCase()) + "</span><div><strong>" + escapeHtml(activeProfile.email || "Usuario autenticado") + "</strong><small>" + escapeHtml(activeRole.name + " · " + activeRole.label) + "</small></div></div><p class=\"modal-copy\">Alteracoes sao identificadas por usuario e registradas na auditoria da operacao.</p><div class=\"modal-actions\"><button class=\"button button--danger\" type=\"button\" data-action=\"sign-out\">Sair desta conta</button><button class=\"button\" value=\"cancel\">Fechar</button></div>");
      return;
    }
    openModal("Acesso operacional","Modo técnico","<p class=\"modal-copy\">O técnico usa o sistema sem senha. Para entrar como Gestor ou DEV, configure o backend seguro e cadastre as contas administrativas; as senhas não ficam expostas no HTML.</p><div class=\"modal-actions\"><button class=\"button button--primary\" type=\"button\" data-action=\"technician-mode\">Continuar como técnico</button></div>");
  }

  function channelModal(bay, channel) {
    openModal("KVM · Run-in", "Baia " + bay + " · Canal " + String(channel).padStart(2,"0"), "<div class=\"form-stack\"><label>Ordem de produção<input id=\"channel-op\" placeholder=\"Bipe a O.P.\"></label><label>Número de série<input id=\"channel-serial\" placeholder=\"Bipe o serial\"></label><label>Técnico<select><option>Pedro</option><option>Fabio</option><option>Washington</option></select></label></div><div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Cancelar</button><button class=\"button button--primary\" type=\"button\" data-action=\"start-channel\">Iniciar teste</button></div>");
  }

  function finishRepairModal(serial) {
    openModal("Conclusão de etapa", serial || "Reparo", "<p style=\"color:var(--muted);font-size:11px\">O diagnóstico precisa de troca de peça?</p><div class=\"quick-grid\" style=\"padding:0\"><button data-action=\"needs-part\"><strong>Sim, adquirir peça</strong><small>Abre um novo ciclo de aquisição, montagem e testes.</small></button><button data-action=\"no-part\"><strong>Não, finalizar</strong><small>Registra a solução e segue direto à finalização.</small></button></div>");
  }

  function solutionModal() {
    var options = solutions.map(function (solution) {
      return "<option>" + escapeHtml(solution) + "</option>";
    }).join("");
    openModal(
      "Finalização sem troca de peça",
      "Selecionar solução aplicada",
      "<p class=\"modal-copy\">Escolha a solução que resolveu o problema. Ela ficará registrada no histórico do reparo.</p>" +
      "<div class=\"form-stack\">" +
        "<label class=\"field problem-field\">Solução aplicada" +
          "<select id=\"repair-solution\">" + options + "</select>" +
          "<button class=\"inline-link\" type=\"button\" data-action=\"add-solution\">+ Cadastrar outra solução</button>" +
        "</label>" +
        "<label class=\"field\">Observação (opcional)<textarea id=\"repair-solution-notes\" placeholder=\"Detalhes úteis do procedimento\"></textarea></label>" +
      "</div>" +
      "<div class=\"modal-actions\">" +
        "<button class=\"button\" value=\"cancel\">Cancelar</button>" +
        "<button class=\"button button--primary\" type=\"button\" data-action=\"confirm-solution\">Finalizar reparo</button>" +
      "</div>"
    );
  }

  function addSolutionModal() {
    openModal(
      "Cadastro rápido",
      "Nova solução",
      "<div class=\"form-stack\"><label>Nome da solução<input id=\"solution-name\" placeholder=\"Ex.: Reencaixe do conector 24 pinos\"></label></div>" +
      "<div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Cancelar</button><button class=\"button button--primary\" type=\"button\" data-action=\"save-solution\">Cadastrar solução</button></div>"
    );
  }

  function acquisitionModal() {
    var options = parts.map(function (part) { return "<option value=\"" + escapeHtml(part.code) + "\">" + escapeHtml(part.code + " — " + part.description) + "</option>"; }).join("");
    openModal("Aquisição de peça","Selecionar peça","<div class=\"form-stack\"><label>Peça cadastrada<select id=\"repair-part\">" + options + "</select></label><label>Observação<textarea id=\"repair-part-notes\" placeholder=\"Motivo da troca ou detalhe da aquisição\"></textarea></label><button class=\"inline-link\" type=\"button\" data-action=\"open-parts\">+ A peça não existe? Cadastrar agora</button></div><div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Cancelar</button><button class=\"button button--primary\" type=\"button\" data-action=\"confirm-part\">Iniciar aquisição</button></div>");
  }

  function kvmRejectionModal(session) {
    var machine = machines.find(function (item) { return item.serial === session.serial; });
    var priority = machine && machine.priorityLevel ? machine.priorityLevel : machine && machine.priority ? "high" : "normal";
    var problemOptions = problems.map(function (problem) { return "<option>" + escapeHtml(problem) + "</option>"; }).join("");
    var techOptions = ["Sem técnico","Pedro","Fabio","Washington","Fransmiler"].map(function (tech) { return "<option" + (tech === "Sem técnico" ? " selected" : "") + ">" + tech + "</option>"; }).join("");
    openModal("KVM → Planejamento do Reparo","Máquina reprovada","<p class=\"modal-copy\">A O.P. e o serial vieram da sessão do KVM. Complete o problema para enviar a máquina diretamente à fila planejada do Reparo.</p><div class=\"repair-form-grid\"><label class=\"field\">O.P.<input id=\"reject-op\" value=\"" + escapeHtml(session.op) + "\" readonly></label><label class=\"field\">Número de série<input id=\"reject-serial\" value=\"" + escapeHtml(session.serial) + "\" readonly></label><label class=\"field problem-field\">Problema encontrado<select id=\"reject-problem\">" + problemOptions + "</select></label><label class=\"field\">Técnico planejado<select id=\"reject-tech\">" + techOptions + "</select></label><label class=\"field\">Prioridade<select id=\"reject-priority\"><option value=\"normal\"" + (priority === "normal" ? " selected" : "") + ">Normal</option><option value=\"high\"" + (priority === "high" ? " selected" : "") + ">Alta</option><option value=\"low\"" + (priority === "low" ? " selected" : "") + ">Baixa</option></select></label><label class=\"field notes-field\">Observações<textarea id=\"reject-notes\" placeholder=\"Descreva o que ocorreu no KVM\">Reprovada durante o teste KVM no canal " + escapeHtml(session.key) + ".</textarea></label></div><div class=\"modal-actions\"><button class=\"button\" value=\"cancel\">Cancelar</button><button class=\"button button--danger\" type=\"button\" data-action=\"confirm-kvm-rejection\" data-key=\"" + escapeHtml(session.key) + "\">Enviar para o Reparo</button></div>");
  }

  function handleAction(action, element) {
    if (action === "technician-mode") {
      state.role = "technician"; state.user = "Técnico";
      localStorage.setItem("gpj-role",state.role); localStorage.setItem("gpj-user",state.user);
      if ($("#modal").open) $("#modal").close(); state.view = "overview"; render();
      return;
    }
    if (action === "sign-in") {
      var authEmail = $("#auth-email").value.trim();
      var authPassword = $("#auth-password").value;
      if (!authEmail || !authPassword) { showToast("Informe o e-mail e a senha."); return; }
      element.disabled = true;
      element.textContent = "Entrando...";
      backend.signIn(authEmail, authPassword).then(async function (result) {
        backendState.profile = result.profile;
        backendState.status = "connecting";
        $("#modal").close();
        await reloadRemoteSnapshot(true);
        startRealtime();
        showToast("Acesso liberado. Base compartilhada online.");
      }).catch(function (error) {
        element.disabled = false;
        element.textContent = "Entrar";
        showToast(error.message || "E-mail ou senha invalidos.");
      });
      return;
    }
    if (action === "sign-out") {
      backend.signOut().then(function () {
        backendState.remoteReady = false;
        backendState.profile = null;
        backendState.status = "signed-out";
        machines = [];
        repairRows = [];
        kvmSessions = [];
        kvmQueue = [];
        serialBatches = [];
        $("#modal").close();
        render();
        profileModal();
      });
      return;
    }
    if (action === "switch-role" && backendState.configured) {
      showToast("O perfil e definido pelo administrador.");
      return;
    }
    if (action === "new-repair") newRepairModal();
    if (action === "repair-details") repairDetailModal(element.dataset.id);
    if (action === "delete-repair") { var deleteId = Number(element.dataset.id); var deleteRow = repairRows.find(function (row) { return row.id === deleteId; }); if (deleteRow && window.confirm("Excluir o registro da OP " + deleteRow.op + "?")) { repairRows = repairRows.filter(function (row) { return row.id !== deleteId; }); if (backendState.remoteReady) backend.remove("repair",deleteId).catch(function (error) { showToast(error.message || "Exclusao pendente no servidor."); }); saveOperations(); if ($("#modal").open) $("#modal").close(); render(); showToast("Registro do reparo excluído."); } }
    if (action === "open-machine-detail") machineDetailModal(element.dataset.serial);
    if (action === "go-machine-trace") { state.traceSelected = element.dataset.serial; state.traceQuery = element.dataset.serial; if ($("#modal").open) $("#modal").close(); setView("trace"); }
    if (action === "switch-role") { state.role = element.dataset.role; state.user = state.role === "developer" ? "Pedro" : roleLabels[state.role].name; localStorage.setItem("gpj-role",state.role); localStorage.setItem("gpj-user",state.user); $("#modal").close(); state.view = "overview"; render(); showToast("Perfil alterado para " + roleLabels[state.role].name + "."); }
    if (action === "save-repair") {
      var editId = Number(element.dataset.id || 0);
      var existing = repairRows.find(function (row) { return row.id === editId; });
      var data = { id: editId || Date.now(), op:$("#new-op").value.trim(), serial:$("#new-serial").value.trim(), issue:$("#new-problem").value, tech:$("#new-tech").value, priority:$("#new-priority").value, notes:$("#new-notes").value.trim(), elapsedSeconds:existing ? repairElapsedSeconds(existing) : 0, startedAt:existing && existing.status === "active" && !existing.timerPaused ? Date.now() : null, timerPaused:existing ? Boolean(existing.timerPaused) : true, pauseReason:existing ? existing.pauseReason : "", waitingReason:existing ? existing.waitingReason : "", waitingNotes:existing ? existing.waitingNotes : "", timeCorrections:existing ? existing.timeCorrections : [], stage: existing ? existing.stage : 0, status: existing ? existing.status : "planned" };
      if (!data.op || !data.serial) { showToast("Informe a O.P. e o número de série."); return; }
      if (existing) repairRows[repairRows.indexOf(existing)] = data; else repairRows.unshift(data);
      saveOperations(); $("#modal").close(); state.repairTab = data.status; render(); showToast(existing ? "Reparo atualizado." : "Reparo adicionado aos planejados.");
    }
    if (action === "edit-repair") { var editRow = repairRows.find(function (row) { return row.id === Number(element.dataset.id); }); if (editRow) repairModal(editRow); }
    if (action === "start-repair" || action === "resume-repair") { var startRow = repairRows.find(function (row) { return row.id === Number(element.dataset.id); }); if (startRow) { startRow.status = "active"; startRow.timerPaused = false; startRow.startedAt = Date.now(); startRow.waitingReason = ""; startRow.waitingNotes = ""; startRow.pauseReason = ""; saveOperations(); state.repairTab = "active"; render(); showToast("Reparo em andamento no nome de " + startRow.tech + "."); } }
    if (action === "advance-repair") {
      state.currentRepairId = Number(element.dataset.id);
      var advancing = repairRows.find(function (row) { return row.id === state.currentRepairId; });
      if (advancing && advancing.stage === 0) finishRepairModal(element.dataset.serial);
      else if (advancing && advancing.stage < 3) { advancing.stage += 1; saveOperations(); render(); showToast("Etapa concluída. Próxima etapa iniciada."); }
      else if (advancing) openModal("Resultado do teste",advancing.serial,"<div class=\"quick-grid\" style=\"padding:0\"><button data-action=\"test-approved\"><strong>Aprovado</strong><small>Finaliza o reparo.</small></button><button data-action=\"test-rejected\"><strong>Reprovado</strong><small>Abre novo ciclo de aquisição.</small></button></div>");
    }
    if (action === "needs-part") acquisitionModal();
    if (action === "confirm-part") { var partRow = repairRows.find(function (row) { return row.id === state.currentRepairId; }); if (partRow) { partRow.stage = 1; partRow.partCode = $("#repair-part").value; partRow.notes = [partRow.notes,$("#repair-part-notes").value.trim()].filter(Boolean).join(" · "); saveOperations(); } $("#modal").close(); render(); showToast("Aquisição iniciada com a peça selecionada."); }
    if (action === "open-parts") { $("#modal").close(); setView("parts"); }
    if (action === "no-part") { solutionModal(); }
    if (action === "add-solution") addSolutionModal();
    if (action === "save-solution") { var solutionName = $("#solution-name").value.trim(); if (!solutionName) { showToast("Informe o nome da solução."); return; } if (solutions.indexOf(solutionName) < 0) solutions.push(solutionName); saveOperations(); $("#modal").close(); solutionModal(); var sel = $("#repair-solution"); if (sel) sel.value = solutionName; showToast("Solução cadastrada e disponível na lista."); }
    if (action === "confirm-solution") {
      var solutionValue = $("#repair-solution") ? $("#repair-solution").value : "";
      var solutionNotes = $("#repair-solution-notes") ? $("#repair-solution-notes").value.trim() : "";
      var doneRow = repairRows.find(function (row) { return row.id === state.currentRepairId; });
      if (!solutionValue) { showToast("Selecione uma solução."); return; }
      if (doneRow) {
        doneRow.elapsedSeconds = repairElapsedSeconds(doneRow);
        doneRow.startedAt = null;
        doneRow.status = "history";
        doneRow.stage = 4;
        doneRow.solution = solutionValue;
        doneRow.notes = [doneRow.notes, "Solução: " + solutionValue, solutionNotes].filter(Boolean).join(" · ");
        saveOperations();
      }
      $("#modal").close();
      state.repairTab = "history";
      render();
      showToast("Solução registrada e reparo finalizado.");
    }
    if (action === "test-approved") { var approvedRow = repairRows.find(function (row) { return row.id === state.currentRepairId; }); if (approvedRow) { approvedRow.elapsedSeconds = repairElapsedSeconds(approvedRow); approvedRow.startedAt = null; approvedRow.status = "history"; approvedRow.stage = 4; saveOperations(); } $("#modal").close(); state.repairTab = "history"; render(); showToast("Teste aprovado e reparo finalizado."); }
    if (action === "test-rejected") { var rejectedRow = repairRows.find(function (row) { return row.id === state.currentRepairId; }); if (rejectedRow) { rejectedRow.stage = 1; rejectedRow.notes = [rejectedRow.notes,"Teste reprovado: novo ciclo de peça"].filter(Boolean).join(" · "); saveOperations(); } acquisitionModal(); }
    if (action === "pause-repair") { var pauseRow = repairRows.find(function (row) { return row.id === Number(element.dataset.id); }); if (pauseRow) { pauseRow.elapsedSeconds = repairElapsedSeconds(pauseRow); pauseRow.startedAt = null; pauseRow.timerPaused = true; pauseRow.pauseReason = "Pausado pelo técnico"; saveOperations(); state.repairTab = "active"; render(); showToast("Cronômetro pausado. A máquina continua no técnico responsável."); } }
    if (action === "wait-repair") waitRepairModal(element.dataset.id);
    if (action === "confirm-wait-repair") { var waitingRow = repairRows.find(function (row) { return row.id === Number(element.dataset.id); }); if (waitingRow) { waitingRow.elapsedSeconds = repairElapsedSeconds(waitingRow); waitingRow.startedAt = null; waitingRow.timerPaused = true; waitingRow.status = "waiting"; waitingRow.waitingReason = $("#wait-reason").value; waitingRow.waitingNotes = $("#wait-notes").value.trim(); saveOperations(); $("#modal").close(); state.repairTab = "waiting"; render(); showToast("Máquina movida para Em espera: " + waitingRow.waitingReason + "."); } }
    if (action === "correct-repair-time") correctRepairTimeModal(element.dataset.id);
    if (action === "save-repair-time") { var correctedRow = repairRows.find(function (row) { return row.id === Number(element.dataset.id); }); var correctionReason = $("#correct-justification").value.trim(); if (!correctionReason) { showToast("A justificativa é obrigatória."); return; } if (correctedRow) { var correctedSeconds = Math.max(0,Number($("#correct-hours").value || 0) * 3600 + Number($("#correct-minutes").value || 0) * 60 + Number($("#correct-seconds").value || 0)); correctedRow.elapsedSeconds = correctedSeconds; if (correctedRow.status === "active" && !correctedRow.timerPaused) correctedRow.startedAt = Date.now(); correctedRow.timeCorrections = correctedRow.timeCorrections || []; correctedRow.timeCorrections.push({at:new Date().toISOString(),by:state.user,seconds:correctedSeconds,justification:correctionReason}); correctedRow.notes = [correctedRow.notes,"Correção de tempo por " + state.user + ": " + correctionReason].filter(Boolean).join(" · "); saveOperations(); $("#modal").close(); render(); showToast("Cronômetro corrigido com justificativa registrada."); } }
    if (action === "add-problem") addProblemModal();
    if (action === "save-problem") { var problemName = $("#problem-name").value.trim(); if (!problemName) { showToast("Informe o nome do problema."); return; } if (problems.indexOf(problemName) < 0) problems.push(problemName); saveOperations(); $("#modal").close(); showToast("Problema cadastrado e disponível na lista."); }
    if (action === "delete-problem") { problems.splice(Number(element.dataset.index),1); saveOperations(); render(); showToast("Problema removido do cadastro."); }
    if (action === "delete-technician") { technicians.splice(Number(element.dataset.index),1); saveOperations(); render(); showToast("Técnico removido do cadastro."); }
    if (action === "save-manager-settings") { state.repairAlertMinutes = Math.max(1,Number($("#repair-alert-minutes").value || 60)); state.repairCriticalMinutes = Math.max(state.repairAlertMinutes + 1,Number($("#repair-critical-minutes").value || 100)); $$('[data-op-priority]').forEach(function (select) { applyOpPriority(select.dataset.opPriority,select.value); }); localStorage.setItem("gpj-repair-alert-minutes",String(state.repairAlertMinutes)); localStorage.setItem("gpj-repair-critical-minutes",String(state.repairCriticalMinutes)); saveOperations(); render(); showToast("Prioridades e limites do Reparo salvos."); }
    if (action === "edit-registry") showToast("Edição aberta com auditoria de alterações.");
    if (action === "open-kvm-config") { if ($("#modal").open) $("#modal").close(); setView("kvm-config"); }
    if (action === "channel") { state.selectedChannel = channelKey(element.dataset.bay,element.dataset.channel); localStorage.setItem("gpj-selected-channel",state.selectedChannel); render(); channelDetailModal(); }
    if (action === "toggle-kvm-global") { setGlobalKvmPaused(!kvmPaused); render(); showToast(kvmPaused ? "KVM inteiro pausado. Todos os cronômetros foram congelados." : "KVM retomado. Os cronômetros ativos voltaram a contar."); }
    if (action === "start-channel") {
      if (kvmPaused) { showToast("Retome o KVM inteiro antes de iniciar uma máquina."); return; }
      var startOp = $("#channel-op") ? $("#channel-op").value.trim() : "";
      var startSerial = $("#channel-serial") ? $("#channel-serial").value.trim() : "";
      var startTech = $("#channel-tech") ? $("#channel-tech").value : "Pedro";
      if (!startOp || !startSerial) { showToast("Bipe a O.P. e o número de série."); return; }
      var channelMatch = /^B(\d+)C(\d+)$/.exec(state.selectedChannel);
      var plannedStart = kvmQueue.find(function (row) { return row.serial === startSerial; });
      kvmSessions = kvmSessions.filter(function (item) { return item.key !== state.selectedChannel; });
      kvmSessions.push({ key:state.selectedChannel, op:startOp, serial:startSerial, tech:startTech, system:plannedStart && plannedStart.system ? plannedStart.system : machineSystem(startSerial), status:"testing", elapsedSeconds:0, startedAt:Date.now(), failures:0, connection:channelType(Number(channelMatch[1]),Number(channelMatch[2])) });
      var startedMachine = machines.find(function (machine) { return machine.serial === startSerial; });
      if (startedMachine) { startedMachine.stage = "KVM"; startedMachine.technician = startTech; startedMachine.updated = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
      if (backendState.remoteReady && plannedStart) backend.remove("queue",startSerial).catch(function () {});
      kvmQueue = kvmQueue.filter(function (row) { return row.serial !== startSerial; }); saveOperations(); render(); channelDetailModal(); showToast("Teste KVM iniciado no canal escolhido.");
    }
    if (action === "toggle-channel") { if (kvmPaused) { showToast("O KVM inteiro está pausado. Retome a estação para alterar este canal."); return; } var toggleSession = kvmSessions.find(function (item) { return item.key === state.selectedChannel; }); if (toggleSession) { if (toggleSession.status === "paused") { toggleSession.status = "testing"; toggleSession.startedAt = Date.now(); } else { toggleSession.elapsedSeconds = kvmElapsedSeconds(toggleSession); toggleSession.startedAt = null; toggleSession.status = "paused"; } saveOperations(); render(); channelDetailModal(); showToast(toggleSession.status === "paused" ? "Teste pausado. O cronômetro foi congelado." : "Teste retomado. O cronômetro voltou a contar."); } }
    if (action === "fail-channel") { if (kvmPaused) { showToast("Retome o KVM antes de reiniciar o teste."); return; } var failedSession = kvmSessions.find(function (item) { return item.key === state.selectedChannel; }); if (failedSession) { failedSession.failures += 1; failedSession.elapsedSeconds = 0; failedSession.startedAt = Date.now(); failedSession.status = "testing"; failedSession.lastFailureAt = new Date().toISOString(); var failedMachine = machines.find(function (machine) { return machine.serial === failedSession.serial; }); if (failedMachine) { failedMachine.stage = "KVM"; failedMachine.technician = failedSession.tech; failedMachine.kvmFailures = Number(failedMachine.kvmFailures || 0) + 1; failedMachine.updated = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); } saveOperations(); render(); channelDetailModal(); showToast("Falha registrada. A contagem foi zerada para testar a mesma máquina novamente."); } }
    if (action === "reject-channel") { var rejectedSession = kvmSessions.find(function (item) { return item.key === state.selectedChannel; }); if (rejectedSession) kvmRejectionModal(rejectedSession); }
    if (action === "confirm-kvm-rejection") { var rejectedKey = element.dataset.key; var rejectionSession = kvmSessions.find(function (item) { return item.key === rejectedKey; }); if (!rejectionSession) { showToast("A sessão do KVM não foi encontrada."); return; } var rejectionData = { id:Date.now(), op:$("#reject-op").value.trim(), serial:$("#reject-serial").value.trim(), issue:$("#reject-problem").value, tech:$("#reject-tech").value, priority:$("#reject-priority").value, notes:$("#reject-notes").value.trim(), elapsedSeconds:0, startedAt:null, stage:0, status:"planned" }; repairRows.unshift(rejectionData); var rejectionMachine = machines.find(function (machine) { return machine.serial === rejectionData.serial; }); if (rejectionMachine) { rejectionMachine.stage = "Reparo"; rejectionMachine.technician = rejectionData.tech; rejectionMachine.priority = rejectionData.priority === "high"; rejectionMachine.priorityLevel = rejectionData.priority; rejectionMachine.updated = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); } if (backendState.remoteReady) backend.remove("kvmSession",rejectedKey).catch(function () {}); kvmSessions = kvmSessions.filter(function (item) { return item.key !== rejectedKey; }); saveOperations(); $("#modal").close(); render(); showToast("Máquina reprovada e enviada aos Planejados do Reparo."); }
    if (action === "approve-channel") { var approvedSession = kvmSessions.find(function (item) { return item.key === state.selectedChannel; }); if (approvedSession) { var approvedMachine = machines.find(function (machine) { return machine.serial === approvedSession.serial; }); if (approvedMachine) { approvedMachine.stage = "BurnIn"; approvedMachine.certificate = "Pendente"; approvedMachine.actualSystem = ""; approvedMachine.updated = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); } if (backendState.remoteReady) backend.remove("kvmSession",state.selectedChannel).catch(function () {}); kvmSessions = kvmSessions.filter(function (item) { return item.key !== state.selectedChannel; }); saveOperations(); if ($("#modal").open) $("#modal").close(); render(); showToast("KVM aprovado. Aguardando certificado BurnIn."); } }
    if (action === "confirm-scan") { if (kvmPaused) { showToast("Retome o KVM inteiro antes de iniciar a bipagem."); return; } var bay = Number($("#scan-bay").value), channel = Number($("#scan-channel").value), selectedBay = bay, selectedChannel = channel, op = $("#scan-op").value.trim(), serial = $("#scan-serial").value.trim(), tech = $("#scan-tech").value; if (!op || !serial) { showToast("Bipe a O.P. e o número de série."); return; } var key = channelKey(bay,channel); if (channelType(bay,channel) === "Inoperante" || kvmSessions.some(function (item) { return item.key === key; })) { showToast("O canal escolhido não está livre."); return; } var plannedScan = kvmQueue.find(function (row) { return row.serial === serial; }); kvmSessions.push({key:key,op:op,serial:serial,tech:tech,system:plannedScan && plannedScan.system ? plannedScan.system : machineSystem(serial),status:"testing",elapsedSeconds:0,startedAt:Date.now(),failures:0,connection:channelType(bay,channel)}); var scannedMachine = machines.find(function (machine) { return machine.serial === serial; }); if (scannedMachine) { scannedMachine.stage = "KVM"; scannedMachine.technician = tech; } kvmQueue = kvmQueue.filter(function (row) { return row.serial !== serial; }); saveOperations(); var next = channel + 1; if (next > (bay === 4 ? 7 : 14)) { bay += 1; next = 1; } if (bay > 4) { bay = 1; next = 1; } state.selectedChannel = key; localStorage.setItem("gpj-selected-channel",state.selectedChannel); render(); window.setTimeout(function () { var baySelect = $("#scan-bay"), channelSelect = $("#scan-channel"); if (baySelect) baySelect.value = String(bay); if (channelSelect) channelSelect.value = String(next); var target = $("#scan-target"); if (target) target.textContent = "Baia " + bay + " · Canal " + String(next).padStart(2,"0"); },0); showToast("Teste iniciado na Baia " + selectedBay + " · Canal " + String(selectedChannel).padStart(2,"0") + "."); }
    if (action === "start-scan") { setView("kvm"); window.setTimeout(function () { var input = $("#scan-op"); if (input) input.focus(); }, 50); }
    if (action === "save-channels") { $$('[data-channel-config]').forEach(function (select) { channelConfig[channelKey(select.dataset.bay,select.dataset.channel)] = select.value; }); localStorage.setItem("gpj-channels",JSON.stringify(channelConfig)); saveOperations(); showToast("Configuração dos canais salva."); }
    if (action === "delete-serial-batch") {
      var batchIdx = Number(element.dataset.index);
      var batch = serialBatches[batchIdx];
      if (!batch) return;
      if (!window.confirm("Excluir o lote da OP " + batch.op + " (" + batch.quantity + " serial(is))? As máquinas geradas por este lote também serão removidas.")) return;
      var setSerials = {}; (batch.serials || []).forEach(function (sv) { setSerials[sv] = true; });
      machines = machines.filter(function (m) { return !setSerials[m.serial]; });
      serialBatches.splice(batchIdx, 1);
      saveOperations(); render(); showToast("Lote excluído do histórico.");
    }
    if (action === "clear-serial-batches") {
      if (!window.confirm("Limpar todo o histórico de vinculações? Isso removerá também as máquinas geradas por estes lotes.")) return;
      var allSerials = {}; serialBatches.forEach(function (b) { (b.serials || []).forEach(function (sv) { allSerials[sv] = true; }); });
      machines = machines.filter(function (m) { return !allSerials[m.serial]; });
      serialBatches = [];
      saveOperations(); render(); showToast("Histórico de vinculações limpo.");
    }
    if (action === "new-serial") { closeDrawers(); setView("linkage"); }
    if (action === "serial-history") showToast("Histórico de lotes preparado para integração com o banco.");
    if (action === "new-registry") { closeDrawers(); setView("parts"); }
    if (action === "edit-part") partModal(Number(element.dataset.index));
    if (action === "delete-part") { parts.splice(Number(element.dataset.index),1); saveOperations(); render(); showToast("Peça excluída."); }
    if (action === "save-part-modal") { var partIndex = element.dataset.index === "" ? null : Number(element.dataset.index); var partData = {code:$("#modal-part-code").value.trim(),description:$("#modal-part-description").value.trim()}; if (!partData.code || !partData.description) { showToast("Informe código e descrição."); return; } if (partIndex == null) parts.unshift(partData); else parts[partIndex] = partData; saveOperations(); $("#modal").close(); render(); showToast("Peça salva."); }
    if (action === "import-csv") showToast("Seleção de CSV disponível na integração final.");
    if (action === "trace-search") { state.traceQuery = $("#trace-query").value.trim(); var foundMachine = machines.find(function (machine) { return machine.serial.toLowerCase().indexOf(state.traceQuery.toLowerCase()) >= 0 || machine.op === state.traceQuery; }); if (foundMachine) state.traceSelected = foundMachine.serial; render(); showToast(foundMachine ? "Rastreabilidade atualizada." : "Nenhuma máquina encontrada."); }
    if (action === "select-machine") { state.traceSelected = element.dataset.serial; machineDetailModal(element.dataset.serial); }
    if (action === "open-integration") { closeDrawers(); setView("integration"); }
    if (action === "save-api") {
      state.api = { url: $("#api-url").value.trim(), interval: $("#api-interval").value, csv: $("#api-csv").value.trim(), source: $("#api-source").value.trim() };
      localStorage.setItem("gpj-api",JSON.stringify(state.api));
      $("#api-key").value = "";
      showToast("Parâmetros locais salvos. A chave não foi armazenada.");
    }
    if (action === "download-config") showToast("O arquivo config.example.json está incluído na pasta do agente.");
  }

  $("#sidebar-collapse").addEventListener("click", function () { state.sidebarCollapsed = !state.sidebarCollapsed; localStorage.setItem("gpj-sidebar-collapsed",String(state.sidebarCollapsed)); updateChrome(); });
  $("#menu-toggle").addEventListener("click", function () { $("#sidebar").classList.toggle("open"); $("#sidebar-scrim").classList.toggle("show"); });
  $("#sidebar-scrim").addEventListener("click", function () { $("#sidebar").classList.remove("open"); $("#sidebar-scrim").classList.remove("show"); });
  $("#notification-button").addEventListener("click", function () { openDrawer("notification-drawer"); });
  $("#mobile-add").addEventListener("click", function () { openDrawer("quick-drawer"); });
  $("#profile-button").addEventListener("click", profileModal);
  $("#modal").addEventListener("close", function () {
    if (backendState.configured && !backend.getSession()) window.setTimeout(profileModal, 0);
  });
  window.addEventListener("gpj:sync", function (event) {
    backendState.status = event.detail && event.detail.status === "online" ? "online" : "error";
    updateChrome();
  });
  $("#theme-button").addEventListener("click", function () {
    var themes = ["light","dark","black"];
    state.theme = themes[(themes.indexOf(state.theme) + 1) % themes.length];
    localStorage.setItem("gpj-theme",state.theme);
    document.documentElement.dataset.theme = state.theme;
    showToast("Tema alterado para " + ({light:"Claro",dark:"Escuro",black:"Black / Andon"})[state.theme] + ".");
  });
  $("#fullscreen-button").addEventListener("click", function () {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () { showToast("O navegador bloqueou a tela cheia."); });
    else document.exitFullscreen();
  });
  document.addEventListener("click", function (event) {
    var viewButton = event.target.closest("[data-view],[data-mobile-view]");
    if (viewButton) setView(viewButton.dataset.view || viewButton.dataset.mobileView);
    var sectorButton = event.target.closest("[data-sector]");
    if (sectorButton) { state.sector = sectorButton.dataset.sector; state.view = "overview"; render(); }
    var repairTab = event.target.closest("[data-repair-tab]");
    if (repairTab) { state.repairTab = repairTab.dataset.repairTab; render(); }
    var closeButton = event.target.closest("[data-close-drawer]");
    if (closeButton) closeDrawers();
    var actionButton = event.target.closest("[data-action]");
    if (actionButton) handleAction(actionButton.dataset.action, actionButton);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeDrawers();
    if (event.key === "Enter" && event.target.id === "bios-op" && !$("#bios-serial").value.trim()) { event.preventDefault(); $("#bios-serial").focus(); }
    if (event.key === "Escape" && event.target.id === "bios-serial") { event.target.value = ""; event.target.focus(); }
    if (event.key === "Enter" && $("#modal").open && $("#auth-password") && event.target.closest("#modal")) {
      event.preventDefault();
      var signInButton = $('[data-action="sign-in"]');
      if (signInButton && !signInButton.disabled) signInButton.click();
    }
  });
  document.addEventListener("change", function (event) {
    if (event.target.id === "bios-destination") { var problemField = $(".bios-problem"); if (problemField) problemField.classList.toggle("is-hidden",event.target.value !== "repair"); return; }
    if (event.target.id !== "scan-bay" && event.target.id !== "scan-channel") return;
    var target = $("#scan-target");
    if (target) target.textContent = "Baia " + $("#scan-bay").value + " · Canal " + String($("#scan-channel").value).padStart(2,"0");
  });
  document.addEventListener("submit", function (event) {
    if (event.target.id === "bios-form") {
      event.preventDefault();
      var biosOp = $("#bios-op").value.trim();
      var biosSerial = $("#bios-serial").value.trim();
      var biosDestination = $("#bios-destination").value;
      var biosIssue = biosDestination === "repair" ? $("#bios-problem").value : "";
      if (!biosOp || !biosSerial) { showToast("Bipe a O.P. e o número de série."); return; }
      var biosPriority = opPriority(biosOp,"normal");
      var biosMachine = machines.find(function (machine) { return machine.serial === biosSerial; });
      if (!biosMachine) {
        var opReference = machines.find(function (machine) { return machine.op === biosOp; });
        biosMachine = {op:biosOp,serial:biosSerial,code:opReference ? opReference.code : "",expectedSystem:opReference ? opReference.expectedSystem : "Não informado",actualSystem:"",stage:"BIOS",sector:"Montagem",result:"",certificate:"Não iniciado",technician:"Sem técnico",priority:biosPriority === "high",priorityLevel:biosPriority,updated:""};
        machines.push(biosMachine);
      }
      biosMachine.op = biosOp; biosMachine.priority = biosPriority === "high"; biosMachine.priorityLevel = biosPriority;
      biosMachine.updated = new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
      if (biosDestination === "repair") {
        biosMachine.stage = "Fila Reparo";
        if (!repairRows.some(function (row) { return row.serial === biosSerial && row.status !== "history"; })) repairRows.unshift({id:Date.now(),op:biosOp,serial:biosSerial,issue:biosIssue,notes:"Entrada registrada pela BIOS.",tech:"Sem técnico",priority:biosPriority,elapsedSeconds:0,startedAt:null,timerPaused:true,stage:0,status:"planned"});
      } else {
        biosMachine.stage = "Fila KVM";
        if (!kvmQueue.some(function (row) { return row.serial === biosSerial; })) kvmQueue.push({op:biosOp,serial:biosSerial,origin:"BIOS",priority:biosPriority === "high",attempts:0,system:biosMachine.expectedSystem});
      }
      biosHistory.unshift({time:new Date().toLocaleString("pt-BR"),op:biosOp,serial:biosSerial,destination:biosDestination,issue:biosIssue});
      if (biosHistory.length > 100) biosHistory.length = 100;
      state.biosFixedOp = $("#bios-keep-op").checked ? biosOp : "";
      localStorage.setItem("gpj-bios-fixed-op",state.biosFixedOp);
      saveOperations(); render(); showToast("BIOS registrada. Máquina enviada para " + (biosDestination === "repair" ? "o planejamento do Reparo" : "a fila do KVM") + ".");
      window.setTimeout(function () { var input = state.biosFixedOp ? $("#bios-serial") : $("#bios-op"); if (input) input.focus(); },0);
      return;
    }
    if (event.target.id === "technician-form") {
      event.preventDefault();
      var technicianName = $("#technician-name").value.trim();
      var technicianRegistration = $("#technician-registration").value.trim();
      if (!technicianName || !technicianRegistration) { showToast("Informe nome e matrícula."); return; }
      technicians.push({name:technicianName,registration:technicianRegistration,shift:$("#technician-shift").value.trim() || "T1",active:true});
      saveOperations(); render(); showToast("Técnico cadastrado."); return;
    }
    if (event.target.id === "problem-form") {
      event.preventDefault();
      var registryProblem = $("#registry-problem-name").value.trim();
      if (!registryProblem) return;
      if (problems.indexOf(registryProblem) < 0) problems.push(registryProblem);
      saveOperations(); render(); showToast("Problema cadastrado."); return;
    }
    if (event.target.id === "part-form") {
      event.preventDefault();
      var partData = {code:$("#part-code").value.trim(),description:$("#part-description").value.trim()};
      if (!partData.code || !partData.description) { showToast("Informe código e descrição."); return; }
      parts.unshift(partData); saveOperations(); render(); showToast("Peça cadastrada e disponível no reparo."); return;
    }
    if (event.target.id !== "serial-form") return;
    event.preventDefault();
    var quantity = Math.max(1,Math.min(9999,Number($("#serial-quantity").value) || 1));
    var first = state.lastSerial + 1;
    var serialOp = $("#serial-op").value.trim();
    var serialCode = $("#serial-code").value.trim();
    var serialSystem = $("#serial-os").value;
    var serialPriority = $("#serial-priority").value;
    applyOpPriority(serialOp,serialPriority);
    var batchSerials = [];
    for (var offset = 0; offset < quantity; offset += 1) {
      var sv = serialValue(first + offset);
      batchSerials.push(sv);
      machines.push({ op:serialOp, serial:sv, code:serialCode, expectedSystem:serialSystem, actualSystem:"", stage:"Vinculação", sector:"Montagem", result:"", certificate:"Não iniciado", technician:"Sem técnico", priority:serialPriority === "high", priorityLevel:serialPriority, updated:new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) });
    }
    serialBatches.unshift({ createdAt:new Date().toLocaleString("pt-BR"), op:serialOp, code:serialCode, system:serialSystem, priority:serialPriority, firstSerial:batchSerials[0], lastSerial:batchSerials[batchSerials.length-1], quantity:quantity, serials:batchSerials });
    state.lastSerial += quantity;
    localStorage.setItem("gpj-last-serial",String(state.lastSerial));
    saveOperations();
    showToast("Faixa " + serialValue(first) + " a " + serialValue(state.lastSerial) + " reservada com sucesso.");
    render();
  });
  document.documentElement.dataset.theme = state.theme;
  if (backendState.configured) {
    state.role = "technician";
    state.user = "Operador";
    state.notifications = [];
    machines = [];
    repairRows = [];
    kvmSessions = [];
    kvmQueue = [];
    serialBatches = [];
  } else if (state.role !== "technician") {
    state.role = "technician";
    state.user = "Técnico";
    localStorage.setItem("gpj-role",state.role);
    localStorage.setItem("gpj-user",state.user);
  }

  function renderBios() {
    var recent = biosHistory.slice(0,12).map(function (item) {
      return "<tr><td class=\"mono\">" + escapeHtml(item.time) + "</td><td class=\"mono\">" + escapeHtml(item.op) + "</td><td class=\"mono\">" + escapeHtml(item.serial) + "</td><td>" + pill(item.destination === "repair" ? "Reparo" : "KVM",item.destination === "repair" ? "amber" : "green") + "</td><td>" + escapeHtml(item.issue || "Aprovada na BIOS") + "</td></tr>";
    }).join("") || "<tr><td colspan=\"5\" class=\"empty-table\">Nenhuma máquina registrada na BIOS neste navegador.</td></tr>";
    var problemOptions = problems.map(function (problem) { return "<option>" + escapeHtml(problem) + "</option>"; }).join("");
    return "<div class=\"page-stack bios-page\">" + pageHead("Posto da linha","BIOS · triagem rápida","Bipe ou digite sem usar o mouse. Depois do registro, o foco volta automaticamente para o próximo serial.","") +
      "<section class=\"panel panel-pad bios-console\"><div class=\"bios-console-head\"><div><span class=\"eyebrow\">Leitura contínua</span><h2>Registrar passagem na BIOS</h2><p>Fixe a O.P. quando estiver conferindo várias máquinas do mesmo lote.</p></div>" + pill("Enter confirma","green") + "</div><form id=\"bios-form\" class=\"bios-form\"><label class=\"field\">O.P.<input id=\"bios-op\" value=\"" + escapeHtml(state.biosFixedOp) + "\" placeholder=\"Bipe ou digite a O.P.\" autocomplete=\"off\"></label><label class=\"field bios-serial-field\">Número de série<input id=\"bios-serial\" placeholder=\"Bipe o serial e pressione Enter\" autocomplete=\"off\"></label><label class=\"field\">Destino<select id=\"bios-destination\"><option value=\"kvm\">Aprovada → Fila do KVM</option><option value=\"repair\">Problema → Planejamento do Reparo</option></select></label><label class=\"field bios-problem\">Problema<select id=\"bios-problem\">" + problemOptions + "</select></label><label class=\"check-field\"><input id=\"bios-keep-op\" type=\"checkbox\" " + (state.biosFixedOp ? "checked" : "") + "><span>Manter esta O.P. para as próximas leituras</span></label><button class=\"button button--primary bios-submit\" type=\"submit\">Registrar e preparar próxima</button></form><div class=\"bios-shortcuts\"><span><kbd>Enter</kbd> registra</span><span><kbd>Tab</kbd> muda o campo</span><span><kbd>Esc</kbd> limpa o serial</span></div></section>" +
      "<section class=\"panel\"><div class=\"panel-head\"><div><span>Últimas leituras</span><h2>Passagens registradas na BIOS</h2></div>" + pill(biosHistory.length + " registros","blue") + "</div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>Hora</th><th>O.P.</th><th>Serial</th><th>Destino</th><th>Resultado</th></tr></thead><tbody>" + recent + "</tbody></table></div></section></div>";
  }

  function renderManagerSettings() {
    if (state.role !== "manager") return "<div class=\"page-stack\"><section class=\"panel role-lock\"><h1>Área exclusiva do gestor</h1></section></div>";
    var ops = {};
    machines.forEach(function (machine) { ops[machine.op] = (ops[machine.op] || 0) + 1; });
    repairRows.forEach(function (repair) { if (!ops[repair.op]) ops[repair.op] = 0; });
    var rows = Object.keys(ops).sort().map(function (op) {
      var priority = opPriority(op,"normal");
      return "<tr><td class=\"mono\"><strong>" + escapeHtml(op) + "</strong></td><td>" + ops[op] + "</td><td><select class=\"compact-select\" data-op-priority=\"" + escapeHtml(op) + "\"><option value=\"normal\"" + (priority === "normal" ? " selected" : "") + ">Normal</option><option value=\"high\"" + (priority === "high" ? " selected" : "") + ">Alta</option><option value=\"low\"" + (priority === "low" ? " selected" : "") + ">Baixa</option></select></td><td>" + pill(priority === "high" ? "Prioridade alta" : priority === "low" ? "Prioridade baixa" : "Fluxo normal",priority === "high" ? "red" : priority === "low" ? "blue" : "green") + "</td></tr>";
    }).join("") || "<tr><td colspan=\"4\" class=\"empty-table\">Nenhuma O.P. disponível para configuração.</td></tr>";
    return "<div class=\"page-stack\">" + pageHead("Gestão da produção","O.P.s e comportamento do Reparo","Defina prioridades da linha e os tempos que alimentam os alertas do Carcará.","<button class=\"button button--primary\" data-action=\"save-manager-settings\">Salvar configurações</button>") +
      "<section class=\"balanced-grid\"><div class=\"panel panel-pad\"><div class=\"panel-head compact\"><div><span>Reparo</span><h2>Limites de tempo</h2></div></div><div class=\"form-stack\"><label>Entrar em alerta após (minutos)<input id=\"repair-alert-minutes\" type=\"number\" min=\"1\" value=\"" + state.repairAlertMinutes + "\"></label><label>Entrar em crítico após (minutos)<input id=\"repair-critical-minutes\" type=\"number\" min=\"2\" value=\"" + state.repairCriticalMinutes + "\"></label><div class=\"validation-note\"><strong>Padrão solicitado</strong><span>Alerta em 1 hora e crítico em 1h40. Os cartões mudam de estado automaticamente.</span></div></div></div><div class=\"panel panel-pad\"><div class=\"panel-head compact\"><div><span>Fim de turno</span><h2>Pausa automática · 18:05</h2></div></div><p class=\"modal-copy\">Todos os cronômetros ativos do Reparo são congelados automaticamente às 18:05. O cartão continua no técnico responsável e pode ser retomado no próximo turno.</p>" + pill("Ativo","green") + "</div></section>" +
      "<section class=\"panel\"><div class=\"panel-head\"><div><span>Ordens em circulação</span><h2>Prioridade por O.P.</h2></div><button class=\"button button--primary\" data-action=\"save-manager-settings\">Aplicar prioridades</button></div><div class=\"table-scroll\"><table class=\"data-table\"><thead><tr><th>O.P.</th><th>Máquinas</th><th>Prioridade</th><th>Comportamento</th></tr></thead><tbody>" + rows + "</tbody></table></div></section></div>";
  }
  autoPauseRepairShift();
  render();
  initializeBackend();
  window.setInterval(updateKvmTimers,1000);
  window.setInterval(autoPauseRepairShift,30000);
})();
