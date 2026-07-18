import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "stylesheet", href: "/gpj/styles.css" }],
  }),
  component: Index,
});

// Markup original do index.html do pacote PBA Flow. O app.js manipula o DOM
// diretamente por IDs, então preservamos a estrutura exata.
const SHELL_HTML = `
<aside id="sidebar" class="sidebar" aria-label="Navegação principal">
  <div class="brand-lockup">
    <span class="brand-symbol" aria-hidden="true">P</span>
    <span><strong>PBA Flow</strong><small>Fábrica conectada</small></span>
  </div>
  <button id="sidebar-collapse" class="sidebar-collapse" aria-label="Recolher menu lateral" title="Recolher menu lateral">‹</button>
  <div class="plant-online"><i></i> Sistema operacional</div>
  <nav id="main-nav"></nav>
  <div class="sidebar-foot">
    <span>Área atual</span>
    <strong id="sidebar-sector">Montagem</strong>
    <small id="sidebar-user">Técnico · Operação</small>
  </div>
</aside>

<div class="workspace">
  <header class="topbar">
    <button id="menu-toggle" class="icon-button mobile-only" aria-label="Abrir menu">☰</button>
    <div class="page-context">
      <span id="breadcrumb">PBA / Montagem</span>
      <strong id="page-title">Visão geral</strong>
    </div>
    <div class="sector-switcher" role="group" aria-label="Área operacional">
      <button data-sector="assembly" class="active">Montagem</button>
      <button data-sector="assistance">Assistência</button>
      <button data-sector="rma">RMA</button>
    </div>
    <div class="top-actions">
      <button id="theme-button" class="icon-button" aria-label="Alternar tema" title="Alternar tema">◐</button>
      <button id="fullscreen-button" class="icon-button" aria-label="Tela cheia" title="Tela cheia">⛶</button>
      <button id="notification-button" class="carcara-button" aria-label="Abrir Carcará de Olho">
        <span class="carcara-eye" aria-hidden="true">◉</span>
        <span class="desktop-only">Carcará de Olho</span>
        <b id="notification-count">4</b>
      </button>
      <button id="profile-button" class="profile-chip"><span id="profile-initial">T</span><span class="desktop-only"><strong id="profile-name">Técnico</strong><small id="profile-role">Operação</small></span></button>
    </div>
  </header>

  <main id="content" tabindex="-1"></main>
</div>

<button id="sidebar-scrim" class="sidebar-scrim" aria-label="Fechar menu"></button>

<nav class="mobile-nav" aria-label="Navegação móvel">
  <button data-mobile-view="overview"><span>⌂</span>Início</button>
  <button data-mobile-view="repairs"><span>⚒</span>Reparos</button>
  <button id="mobile-add" class="mobile-add" aria-label="Novo cadastro"><span>＋</span></button>
  <button data-mobile-view="kvm"><span>▦</span>KVM</button>
  <button data-mobile-view="more"><span>•••</span>Mais</button>
</nav>
`;

const EXTRAS_HTML = `
<aside id="notification-drawer" class="drawer drawer--right" aria-hidden="true" aria-labelledby="notification-title">
  <header class="drawer-head">
    <div class="carcara-avatar"><span>◉</span></div>
    <div><span class="eyebrow">Assistente operacional</span><h2 id="notification-title">Carcará de Olho</h2></div>
    <button class="icon-button" data-close-drawer aria-label="Fechar">×</button>
  </header>
  <div id="notification-list" class="notification-list"></div>
</aside>

<aside id="quick-drawer" class="drawer drawer--bottom" aria-hidden="true" aria-labelledby="quick-title">
  <header class="drawer-head"><div><span class="eyebrow">Ação rápida</span><h2 id="quick-title">Novo cadastro</h2></div><button class="icon-button" data-close-drawer aria-label="Fechar">×</button></header>
  <div id="quick-actions" class="quick-grid"></div>
</aside>

<dialog id="modal" class="modal">
  <form method="dialog" class="modal-card">
    <header><div><span id="modal-kicker" class="eyebrow">Cadastro</span><h2 id="modal-title">Nova atividade</h2></div><button value="cancel" class="icon-button" aria-label="Fechar">×</button></header>
    <div id="modal-body"></div>
  </form>
</dialog>

<div id="toast" class="toast" role="status" aria-live="polite"></div>
`;

function GpjApp() {
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const runtimeWindow = window as Window & {
      __GPJ_CONFIG__?: { supabaseUrl: string; supabaseKey: string };
    };
    runtimeWindow.__GPJ_CONFIG__ = {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
      supabaseKey:
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
        import.meta.env.VITE_SUPABASE_ANON_KEY ??
        "",
    };

    const backendScript = document.createElement("script");
    backendScript.src = "/gpj/backend.js";
    backendScript.defer = true;
    const appScript = document.createElement("script");
    appScript.src = "/gpj/app.js";
    appScript.defer = true;
    backendScript.addEventListener("load", () => document.body.appendChild(appScript));
    document.body.appendChild(backendScript);
    return () => {
      backendScript.remove();
      appScript.remove();
    };
  }, []);

  return (
    <>
      <div id="app" className="app-shell" dangerouslySetInnerHTML={{ __html: SHELL_HTML }} />
      <div dangerouslySetInnerHTML={{ __html: EXTRAS_HTML }} />
    </>
  );
}

function Index() {
  return <ClientOnly fallback={<div style={{ minHeight: "100vh", background: "#0b1220" }} />}><GpjApp /></ClientOnly>;
}
