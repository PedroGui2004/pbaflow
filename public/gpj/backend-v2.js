(function () {
  "use strict";

  var config = window.__GPJ_CONFIG__ || {};
  var baseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  var anonKey = String(config.supabaseKey || "");
  var sessionKey = "gpj-auth-session-v2";
  var legacySessionKey = "gpj-auth-session-v1";
  var anonymousSession = { anonymous: true };
  var session = readSession();
  var profile = null;
  var syncTimer = null;
  var syncRunning = false;
  var pendingSnapshot = null;
  var baseline = {};
  var baselineSnapshot = null;
  var realtimeSocket = null;
  var heartbeatTimer = null;
  var suppressAuxSync = false;

  function configured() {
    return Boolean(baseUrl && anonKey);
  }

  function readJsonStorage(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function readSession() {
    var value = readJsonStorage(sessionKey, null) || readJsonStorage(legacySessionKey, null);
    if (value && value.access_token) {
      localStorage.setItem(sessionKey, JSON.stringify(value));
      localStorage.removeItem(legacySessionKey);
      return value;
    }
    return null;
  }

  function saveSession(nextSession) {
    session = nextSession && nextSession.access_token ? nextSession : null;
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
    localStorage.removeItem(legacySessionKey);
  }

  function headers(extra) {
    var result = { apikey: anonKey, "Content-Type": "application/json" };
    if (session && session.access_token) result.Authorization = "Bearer " + session.access_token;
    Object.keys(extra || {}).forEach(function (key) { result[key] = extra[key]; });
    return result;
  }

  async function request(path, options) {
    if (!configured()) throw new Error("Backend não configurado.");
    options = options || {};
    options.headers = headers(options.headers);
    var response = await fetch(baseUrl + path, options);
    if (response.status === 401 && session && session.refresh_token && path.indexOf("/auth/v1/token") !== 0) {
      var refreshed = await refreshSession();
      if (refreshed) {
        options.headers = headers(options.headers);
        response = await fetch(baseUrl + path, options);
      }
    }
    if (!response.ok) {
      var message = "Falha na comunicação com o servidor.";
      try {
        var payload = await response.json();
        message = payload.message || payload.msg || payload.error_description || payload.error || message;
      } catch (error) {
        // Mantém mensagem segura para a interface.
      }
      var failure = new Error(message);
      failure.status = response.status;
      throw failure;
    }
    if (response.status === 204) return null;
    var text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function refreshSession() {
    if (!session || !session.refresh_token) return null;
    try {
      var response = await fetch(baseUrl + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!response.ok) throw new Error("Sessão expirada.");
      var nextSession = await response.json();
      saveSession(nextSession);
      return nextSession;
    } catch (error) {
      saveSession(null);
      profile = null;
      return null;
    }
  }

  async function signIn(email, password) {
    var result = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password })
    });
    saveSession(result);
    profile = await fetchProfile();
    if (!profile) {
      try {
        await request("/rest/v1/rpc/ensure_current_profile", { method: "POST", body: "{}" });
        profile = await fetchProfile();
      } catch (error) {
        // A mensagem específica abaixo é mais útil que a falha intermediária.
      }
    }
    if (!profile || profile.active === false) {
      await signOut();
      throw new Error("Conta autenticada, mas sem perfil ativo. Peça ao administrador para liberar o acesso.");
    }
    return { session: session, profile: profile };
  }

  async function signOut() {
    if (session) {
      try { await request("/auth/v1/logout", { method: "POST" }); } catch (error) { /* encerra localmente */ }
    }
    disconnectRealtime();
    saveSession(null);
    profile = null;
  }

  async function fetchProfile() {
    if (!session || !session.user) return null;
    var rows = await request("/rest/v1/profiles?id=eq." + encodeURIComponent(session.user.id) + "&select=id,email,display_name,role,active");
    profile = rows && rows[0] ? rows[0] : null;
    return profile;
  }

  function getProfile() {
    return profile;
  }

  function getSession() {
    return session || (configured() ? anonymousSession : null);
  }

  function isAuthenticated() {
    return Boolean(session && session.access_token);
  }

  function canManage() {
    return Boolean(profile && (profile.role === "manager" || profile.role === "developer"));
  }

  function restTable(table, query) {
    return request("/rest/v1/" + table + "?" + (query || "select=*"));
  }

  function toIso(value) {
    if (!value) return null;
    if (typeof value === "number") return new Date(value).toISOString();
    return value;
  }

  function fromIso(value) {
    return value ? new Date(value).getTime() : null;
  }

  function priorityToDb(value) {
    if (value === true || value === "high") return "high";
    if (value === "low") return "low";
    return "normal";
  }

  function machineToDb(item) {
    return {
      op: String(item.op || ""),
      serial: String(item.serial || ""),
      equipment_code: item.code || null,
      sector: ({ Montagem: "assembly", Assistencia: "assistance", "Assistência": "assistance", RMA: "rma" })[item.sector] || item.sector || "assembly",
      expected_os: item.expectedSystem || null,
      actual_os: item.actualSystem || null,
      stage: item.stage || "Vinculacao",
      result: item.result || null,
      certificate_status: item.certificate || "Nao iniciado",
      priority: priorityToDb(item.priorityLevel || item.priority),
      technician_name: item.technician || null,
      metadata: { updated_label: item.updated || null, kvm_failures: Number(item.kvmFailures || 0) }
    };
  }

  function machineFromDb(item) {
    return {
      op: item.op,
      serial: item.serial,
      code: item.equipment_code || "",
      expectedSystem: item.expected_os || "",
      actualSystem: item.actual_os || "",
      stage: item.stage,
      sector: ({ assembly: "Montagem", assistance: "Assistencia", rma: "RMA" })[item.sector] || item.sector,
      result: item.result || "",
      certificate: item.certificate_status,
      technician: item.technician_name || "Sem tecnico",
      priority: item.priority === "high",
      priorityLevel: item.priority,
      updated: (item.metadata && item.metadata.updated_label) || new Date(item.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      kvmFailures: Number(item.metadata && item.metadata.kvm_failures || 0)
    };
  }

  function repairToDb(item) {
    return {
      legacy_key: "repair:" + item.id,
      op: String(item.op || ""),
      serial: String(item.serial || ""),
      problem: item.issue || "Nao informado",
      notes: item.notes || null,
      technician_name: item.tech || null,
      priority: priorityToDb(item.priority),
      status: item.status || "planned",
      current_stage: Number(item.stage || 0),
      elapsed_seconds: Number(item.elapsedSeconds || 0),
      started_at: toIso(item.startedAt),
      completed_at: item.status === "history" ? toIso(item.completedAt || Date.now()) : null,
      part_code: item.partCode || null,
      solution: item.solution || null,
      timer_paused: Boolean(item.timerPaused),
      pause_reason: item.pauseReason || null,
      waiting_reason: item.waitingReason || null,
      waiting_notes: item.waitingNotes || null,
      time_corrections: item.timeCorrections || []
    };
  }

  function repairFromDb(item) {
    var legacyId = Number(String(item.legacy_key || "").replace("repair:", ""));
    return {
      id: Number.isFinite(legacyId) && legacyId > 0 ? legacyId : Date.parse(item.created_at),
      op: item.op,
      serial: item.serial,
      issue: item.problem,
      notes: item.notes || "",
      tech: item.technician_name || "Sem tecnico",
      priority: item.priority,
      stage: Number(item.current_stage || 0),
      status: item.status,
      elapsedSeconds: Number(item.elapsed_seconds || 0),
      startedAt: fromIso(item.started_at),
      completedAt: fromIso(item.completed_at),
      partCode: item.part_code || "",
      solution: item.solution || "",
      timerPaused: Boolean(item.timer_paused),
      pauseReason: item.pause_reason || "",
      waitingReason: item.waiting_reason || "",
      waitingNotes: item.waiting_notes || "",
      timeCorrections: Array.isArray(item.time_corrections) ? item.time_corrections : []
    };
  }

  function sessionToDb(item) {
    return {
      legacy_key: "kvm:" + item.key,
      channel_id: item.key,
      op: String(item.op || ""),
      serial: String(item.serial || ""),
      operating_system: item.system || null,
      technician_name: item.tech || null,
      status: item.status || "testing",
      elapsed_seconds: Number(item.elapsedSeconds || 0),
      started_at: toIso(item.startedAt),
      failures: Number(item.failures || 0),
      paused_by_global: Boolean(item.pausedByGlobal),
      connection_type: item.connection || null,
      metadata: { last_failure_at: item.lastFailureAt || null }
    };
  }

  function sessionFromDb(item) {
    return {
      key: item.channel_id,
      op: item.op,
      serial: item.serial,
      tech: item.technician_name || "Sem tecnico",
      system: item.operating_system || "Nao informado",
      status: item.status,
      elapsedSeconds: Number(item.elapsed_seconds || 0),
      startedAt: fromIso(item.started_at),
      failures: Number(item.failures || 0),
      pausedByGlobal: Boolean(item.paused_by_global),
      connection: item.connection_type || "",
      lastFailureAt: item.metadata && item.metadata.last_failure_at
    };
  }

  function queueToDb(item) {
    return {
      legacy_key: "queue:" + item.serial,
      op: String(item.op || ""),
      serial: String(item.serial || ""),
      origin: item.origin || "BIOS",
      priority: priorityToDb(item.priorityLevel || item.priority),
      attempts: Number(item.attempts || 0),
      operating_system: item.system || null
    };
  }

  function queueFromDb(item) {
    return {
      op: item.op,
      serial: item.serial,
      origin: item.origin,
      priority: item.priority === "high",
      priorityLevel: item.priority,
      attempts: Number(item.attempts || 0),
      system: item.operating_system || ""
    };
  }

  function batchToDb(item, index) {
    return {
      legacy_key: "batch:" + (item.firstSerial || index),
      op: String(item.op || ""),
      equipment_code: item.code || null,
      operating_system: item.system || null,
      first_serial: item.firstSerial,
      last_serial: item.lastSerial,
      quantity: Number(item.quantity || 1),
      serials: item.serials || []
    };
  }

  function batchFromDb(item) {
    return {
      createdAt: new Date(item.created_at).toLocaleString("pt-BR"),
      op: item.op,
      code: item.equipment_code || "",
      system: item.operating_system || "",
      firstSerial: item.first_serial,
      lastSerial: item.last_serial,
      quantity: Number(item.quantity),
      serials: item.serials || []
    };
  }

  function catalogToDb(type, item, index) {
    if (type === "part") return { legacy_key: "part:" + (item.code || index), item_type: type, code: item.code || null, name: item.description || item.name, active: true };
    return { legacy_key: type + ":" + String(item), item_type: type, code: null, name: String(item), active: true };
  }

  function alertToDb(item, index) {
    return {
      legacy_key: item.legacyKey || "alert:" + item.module + ":" + item.title + ":" + index,
      alert_type: item.type || "operational",
      severity: item.level || "info",
      module: item.module || "Operacao",
      title: item.title,
      message: item.text || item.message || "",
      resolved: Boolean(item.resolved)
    };
  }

  function alertFromDb(item) {
    return {
      legacyKey: item.legacy_key,
      level: item.severity,
      module: item.module,
      time: new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      title: item.title,
      text: item.message,
      resolved: item.resolved
    };
  }

  function hashText(value) {
    var text = String(value || "");
    var hash = 2166136261;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function collectAuxFromLocal() {
    return {
      technicians: readJsonStorage("gpj-technicians", []),
      waitReasons: readJsonStorage("gpj-wait-reasons", []),
      biosHistory: readJsonStorage("gpj-bios-history", []),
      opPriorities: readJsonStorage("gpj-op-priorities", {}),
      repairAlertMinutes: Number(localStorage.getItem("gpj-repair-alert-minutes") || 60),
      repairCriticalMinutes: Number(localStorage.getItem("gpj-repair-critical-minutes") || 100)
    };
  }

  function technicianToDb(item, index) {
    return {
      legacy_key: "technician:" + String(item.registration || item.name || index),
      name: String(item.name || ""),
      registration: String(item.registration || ""),
      shift: item.shift || "T1",
      active: item.active !== false
    };
  }

  function waitReasonToDb(item) {
    return { legacy_key: "wait:" + hashText(item), name: String(item), active: true };
  }

  function biosToDb(item) {
    var signature = [item.time, item.op, item.serial, item.destination, item.issue].join("|");
    return {
      legacy_key: "bios:" + hashText(signature),
      op: String(item.op || ""),
      serial: String(item.serial || ""),
      destination: item.destination === "repair" ? "repair" : "kvm",
      issue: item.issue || null,
      metadata: { display_time: item.time || null }
    };
  }

  function auxFromRemote(technicianRows, waitRows, biosRows, priorityRows, settingRows) {
    var priorities = {};
    (priorityRows || []).forEach(function (item) { priorities[item.op] = item.priority; });
    var settings = {};
    (settingRows || []).forEach(function (item) { settings[item.key] = item.value; });
    return {
      technicians: (technicianRows || []).map(function (item) { return { name: item.name, registration: item.registration, shift: item.shift, active: item.active }; }),
      waitReasons: (waitRows || []).filter(function (item) { return item.active; }).map(function (item) { return item.name; }),
      biosHistory: (biosRows || []).map(function (item) {
        return {
          time: (item.metadata && item.metadata.display_time) || new Date(item.recorded_at).toLocaleString("pt-BR"),
          op: item.op,
          serial: item.serial,
          destination: item.destination,
          issue: item.issue || ""
        };
      }),
      opPriorities: priorities,
      repairAlertMinutes: Number(settings.repair_alert_minutes || 60),
      repairCriticalMinutes: Number(settings.repair_critical_minutes || 100)
    };
  }

  function stable(value) {
    return JSON.stringify(value == null ? null : value);
  }

  function applyRemoteAux(aux) {
    var local = collectAuxFromLocal();
    var changed = false;
    function replaceArray(key, storageKey) {
      if (!aux[key] || !aux[key].length) return;
      if (stable(local[key]) !== stable(aux[key])) {
        localStorage.setItem(storageKey, JSON.stringify(aux[key]));
        changed = true;
      }
    }
    replaceArray("technicians", "gpj-technicians");
    replaceArray("waitReasons", "gpj-wait-reasons");
    replaceArray("biosHistory", "gpj-bios-history");
    if (aux.opPriorities && Object.keys(aux.opPriorities).length && stable(local.opPriorities) !== stable(aux.opPriorities)) {
      localStorage.setItem("gpj-op-priorities", JSON.stringify(aux.opPriorities));
      changed = true;
    }
    if (Number(local.repairAlertMinutes) !== Number(aux.repairAlertMinutes)) {
      localStorage.setItem("gpj-repair-alert-minutes", String(aux.repairAlertMinutes));
      changed = true;
    }
    if (Number(local.repairCriticalMinutes) !== Number(aux.repairCriticalMinutes)) {
      localStorage.setItem("gpj-repair-critical-minutes", String(aux.repairCriticalMinutes));
      changed = true;
    }
    suppressAuxSync = changed;
    if (changed) {
      var hash = hashText(stable(aux));
      window.setTimeout(function () {
        window.dispatchEvent(new CustomEvent("gpj:aux-sync", { detail: { hash: hash } }));
      }, 0);
    }
  }

  function snapshotHashes(snapshot, aux) {
    return {
      machines: stable(snapshot.machines || []),
      repairs: stable(snapshot.repairs || []),
      kvmSessions: stable(snapshot.kvmSessions || []),
      kvmQueue: stable(snapshot.kvmQueue || []),
      serialBatches: stable(snapshot.serialBatches || []),
      problems: stable(snapshot.problems || []),
      solutions: stable(snapshot.solutions || []),
      parts: stable(snapshot.parts || []),
      channelConfig: stable(snapshot.channelConfig || {}),
      notifications: stable(snapshot.notifications || []),
      technicians: stable(aux.technicians || []),
      waitReasons: stable(aux.waitReasons || []),
      biosHistory: stable(aux.biosHistory || []),
      opPriorities: stable(aux.opPriorities || {}),
      repairAlertMinutes: stable(aux.repairAlertMinutes),
      repairCriticalMinutes: stable(aux.repairCriticalMinutes)
    };
  }

  async function fetchSnapshot() {
    if (session && !profile) await fetchProfile();
    var values = await Promise.all([
      restTable("machines", "select=*&order=created_at.asc"),
      restTable("repairs", "select=*&order=created_at.asc"),
      restTable("kvm_sessions", "select=*&status=in.(testing,paused)&order=created_at.asc"),
      restTable("kvm_queue", "select=*&order=created_at.asc"),
      restTable("serial_batches", "select=*&order=created_at.desc"),
      restTable("catalog_items", "select=*&active=eq.true&order=created_at.asc"),
      restTable("kvm_channels", "select=*&order=bay.asc,channel.asc"),
      restTable("alerts", "select=*&resolved=eq.false&order=created_at.desc"),
      restTable("technicians", "select=*&order=name.asc"),
      restTable("wait_reasons", "select=*&active=eq.true&order=name.asc"),
      restTable("bios_entries", "select=*&order=recorded_at.desc&limit=100"),
      restTable("op_priorities", "select=*&order=op.asc"),
      restTable("operational_settings", "select=key,value")
    ]);
    var catalogs = values[5] || [];
    var aux = auxFromRemote(values[8], values[9], values[10], values[11], values[12]);
    var snapshot = {
      machines: (values[0] || []).map(machineFromDb),
      repairs: (values[1] || []).map(repairFromDb),
      kvmSessions: (values[2] || []).map(sessionFromDb),
      kvmQueue: (values[3] || []).map(queueFromDb),
      serialBatches: (values[4] || []).map(batchFromDb),
      problems: catalogs.filter(function (item) { return item.item_type === "problem"; }).map(function (item) { return item.name; }),
      solutions: catalogs.filter(function (item) { return item.item_type === "solution"; }).map(function (item) { return item.name; }),
      parts: catalogs.filter(function (item) { return item.item_type === "part"; }).map(function (item) { return { code: item.code || "", description: item.name }; }),
      channelConfig: (values[6] || []).reduce(function (result, item) { result[item.id] = item.active ? item.connection_type : "Inoperante"; return result; }, {}),
      notifications: (values[7] || []).map(alertFromDb),
      profile: profile
    };
    baseline = snapshotHashes(snapshot, aux);
    baselineSnapshot = JSON.parse(JSON.stringify(Object.assign({}, snapshot, { aux: aux })));
    applyRemoteAux(aux);
    return snapshot;
  }

  async function upsert(table, rows, conflict) {
    if (!rows.length) return;
    await request("/rest/v1/" + table + "?on_conflict=" + encodeURIComponent(conflict), {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows)
    });
  }

  async function removeBy(table, column, value) {
    await request("/rest/v1/" + table + "?" + column + "=eq." + encodeURIComponent(value), { method: "DELETE" });
  }

  function deleteRemoved(current, previous, keyFor, table, column, dbValueFor) {
    var currentKeys = {};
    (current || []).forEach(function (item) { currentKeys[String(keyFor(item))] = true; });
    return (previous || []).filter(function (item) { return !currentKeys[String(keyFor(item))]; }).map(function (item) {
      return removeBy(table, column, dbValueFor ? dbValueFor(item) : keyFor(item));
    });
  }

  async function performSync(snapshot) {
    var aux = collectAuxFromLocal();
    var hashes = snapshotHashes(snapshot, aux);
    var tasks = [];
    var previousAux = baselineSnapshot && baselineSnapshot.aux ? baselineSnapshot.aux : {};
    if (baselineSnapshot) {
      tasks = tasks.concat(deleteRemoved(snapshot.machines, baselineSnapshot.machines, function (item) { return item.serial; }, "machines", "serial"));
      tasks = tasks.concat(deleteRemoved(snapshot.repairs, baselineSnapshot.repairs, function (item) { return item.id; }, "repairs", "legacy_key", function (item) { return "repair:" + item.id; }));
      tasks = tasks.concat(deleteRemoved(snapshot.kvmSessions, baselineSnapshot.kvmSessions, function (item) { return item.key; }, "kvm_sessions", "legacy_key", function (item) { return "kvm:" + item.key; }));
      tasks = tasks.concat(deleteRemoved(snapshot.kvmQueue, baselineSnapshot.kvmQueue, function (item) { return item.serial; }, "kvm_queue", "legacy_key", function (item) { return "queue:" + item.serial; }));
      tasks = tasks.concat(deleteRemoved(snapshot.serialBatches, baselineSnapshot.serialBatches, function (item) { return item.firstSerial; }, "serial_batches", "legacy_key", function (item) { return "batch:" + item.firstSerial; }));
      tasks = tasks.concat(deleteRemoved(snapshot.parts, baselineSnapshot.parts, function (item) { return item.code; }, "catalog_items", "legacy_key", function (item) { return "part:" + item.code; }));
      tasks = tasks.concat(deleteRemoved(snapshot.problems, baselineSnapshot.problems, function (item) { return item; }, "catalog_items", "legacy_key", function (item) { return "problem:" + item; }));
      tasks = tasks.concat(deleteRemoved(snapshot.solutions, baselineSnapshot.solutions, function (item) { return item; }, "catalog_items", "legacy_key", function (item) { return "solution:" + item; }));
      if (canManage() && !suppressAuxSync) {
        tasks = tasks.concat(deleteRemoved(aux.technicians, previousAux.technicians, function (item) { return item.registration || item.name; }, "technicians", "legacy_key", function (item) { return "technician:" + (item.registration || item.name); }));
        tasks = tasks.concat(deleteRemoved(aux.waitReasons, previousAux.waitReasons, function (item) { return item; }, "wait_reasons", "legacy_key", function (item) { return "wait:" + hashText(item); }));
      }
    }
    if (hashes.machines !== baseline.machines) tasks.push(upsert("machines", (snapshot.machines || []).map(machineToDb), "serial"));
    if (hashes.repairs !== baseline.repairs) tasks.push(upsert("repairs", (snapshot.repairs || []).map(repairToDb), "legacy_key"));
    if (hashes.kvmSessions !== baseline.kvmSessions) tasks.push(upsert("kvm_sessions", (snapshot.kvmSessions || []).map(sessionToDb), "legacy_key"));
    if (hashes.kvmQueue !== baseline.kvmQueue) tasks.push(upsert("kvm_queue", (snapshot.kvmQueue || []).map(queueToDb), "legacy_key"));
    if (hashes.serialBatches !== baseline.serialBatches) tasks.push(upsert("serial_batches", (snapshot.serialBatches || []).map(batchToDb), "legacy_key"));
    if (hashes.problems !== baseline.problems) tasks.push(upsert("catalog_items", (snapshot.problems || []).map(function (item, index) { return catalogToDb("problem", item, index); }), "legacy_key"));
    if (hashes.solutions !== baseline.solutions) tasks.push(upsert("catalog_items", (snapshot.solutions || []).map(function (item, index) { return catalogToDb("solution", item, index); }), "legacy_key"));
    if (hashes.parts !== baseline.parts) tasks.push(upsert("catalog_items", (snapshot.parts || []).map(function (item, index) { return catalogToDb("part", item, index); }), "legacy_key"));
    if (hashes.notifications !== baseline.notifications) tasks.push(upsert("alerts", (snapshot.notifications || []).map(alertToDb), "legacy_key"));
    if (hashes.channelConfig !== baseline.channelConfig) {
      var channelRows = Object.keys(snapshot.channelConfig || {}).map(function (id) {
        var match = /^B(\d+)C(\d+)$/.exec(id);
        return { id: id, bay: Number(match && match[1]), channel: Number(match && match[2]), connection_type: snapshot.channelConfig[id] === "Inoperante" ? "HDMI" : snapshot.channelConfig[id], active: snapshot.channelConfig[id] !== "Inoperante" };
      });
      tasks.push(upsert("kvm_channels", channelRows, "id"));
    }
    if (hashes.biosHistory !== baseline.biosHistory && !suppressAuxSync) tasks.push(upsert("bios_entries", (aux.biosHistory || []).map(biosToDb), "legacy_key"));
    if (canManage() && !suppressAuxSync) {
      if (hashes.technicians !== baseline.technicians) tasks.push(upsert("technicians", (aux.technicians || []).map(technicianToDb), "legacy_key"));
      if (hashes.waitReasons !== baseline.waitReasons) tasks.push(upsert("wait_reasons", (aux.waitReasons || []).map(waitReasonToDb), "legacy_key"));
      if (hashes.opPriorities !== baseline.opPriorities) {
        tasks.push(upsert("op_priorities", Object.keys(aux.opPriorities || {}).map(function (op) { return { op: op, priority: priorityToDb(aux.opPriorities[op]) }; }), "op"));
      }
      if (hashes.repairAlertMinutes !== baseline.repairAlertMinutes || hashes.repairCriticalMinutes !== baseline.repairCriticalMinutes) {
        tasks.push(upsert("operational_settings", [
          { key: "repair_alert_minutes", value: Number(aux.repairAlertMinutes || 60) },
          { key: "repair_critical_minutes", value: Number(aux.repairCriticalMinutes || 100) }
        ], "key"));
      }
    }
    await Promise.all(tasks);
    baseline = hashes;
    baselineSnapshot = JSON.parse(JSON.stringify(Object.assign({}, snapshot, { aux: aux })));
  }

  function syncSnapshot(snapshot) {
    if (!configured()) return;
    pendingSnapshot = snapshot;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(async function drain() {
      if (syncRunning || !pendingSnapshot) return;
      syncRunning = true;
      var next = pendingSnapshot;
      pendingSnapshot = null;
      try {
        await performSync(next);
        window.dispatchEvent(new CustomEvent("gpj:sync", { detail: { status: "online" } }));
      } catch (error) {
        window.dispatchEvent(new CustomEvent("gpj:sync", { detail: { status: "error", message: error.message } }));
      } finally {
        syncRunning = false;
        if (pendingSnapshot) syncTimer = window.setTimeout(drain, 250);
      }
    }, 350);
  }

  async function remove(kind, legacyKey) {
    var configByKind = {
      machine: ["machines", "serial", legacyKey],
      repair: ["repairs", "legacy_key", "repair:" + legacyKey],
      part: ["catalog_items", "legacy_key", "part:" + legacyKey],
      problem: ["catalog_items", "legacy_key", "problem:" + legacyKey],
      solution: ["catalog_items", "legacy_key", "solution:" + legacyKey],
      batch: ["serial_batches", "legacy_key", "batch:" + legacyKey],
      kvmSession: ["kvm_sessions", "legacy_key", "kvm:" + legacyKey],
      queue: ["kvm_queue", "legacy_key", "queue:" + legacyKey]
    };
    var target = configByKind[kind];
    if (!target) return;
    await removeBy(target[0], target[1], target[2]);
  }

  function disconnectRealtime() {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if (realtimeSocket) realtimeSocket.close();
    realtimeSocket = null;
  }

  function subscribe(onChange) {
    disconnectRealtime();
    if (!configured() || !window.WebSocket) return function () {};
    var wsUrl = baseUrl.replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(anonKey) + "&vsn=1.0.0";
    var socket = new WebSocket(wsUrl);
    realtimeSocket = socket;
    var tables = ["machines", "repairs", "repair_events", "kvm_channels", "kvm_sessions", "kvm_queue", "alerts", "serial_batches", "catalog_items", "technicians", "wait_reasons", "bios_entries", "op_priorities", "operational_settings"];
    socket.addEventListener("open", function () {
      tables.forEach(function (table, index) {
        socket.send(JSON.stringify({
          topic: "realtime:public:" + table,
          event: "phx_join",
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { enabled: false },
              postgres_changes: [{ event: "*", schema: "public", table: table }]
            },
            access_token: (session && session.access_token) || anonKey
          },
          ref: String(index + 1),
          join_ref: String(index + 1)
        }));
      });
      heartbeatTimer = window.setInterval(function () {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(Date.now()) }));
      }, 25000);
    });
    socket.addEventListener("message", function (event) {
      try {
        var message = JSON.parse(event.data);
        if (message.event === "postgres_changes" || message.event === "system") onChange(message);
      } catch (error) {
        // Ignora mensagens de protocolo que não sejam JSON.
      }
    });
    return disconnectRealtime;
  }

  window.gpjBackend = {
    configured: configured(),
    getSession: getSession,
    isAuthenticated: isAuthenticated,
    getProfile: getProfile,
    signIn: signIn,
    signOut: signOut,
    fetchProfile: fetchProfile,
    fetchSnapshot: fetchSnapshot,
    syncSnapshot: syncSnapshot,
    remove: remove,
    subscribe: subscribe,
    disconnectRealtime: disconnectRealtime
  };
})();
