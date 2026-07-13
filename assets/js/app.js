/* =========================================================================
 * ContaFlow — Panel del despacho (demo funcional)
 * Sin frameworks: render por vista + estado en memoria/localStorage.
 * Usabilidad: paleta Ctrl+K, tour de bienvenida, pendientes palomeables,
 * semáforo editable con deshacer, calculadora precargable por cliente.
 * ========================================================================= */
(function () {
  'use strict';

  const F = window.Fiscal;
  const D = window.DemoData;
  const LS = {
    clientes: 'contaflow.clientes.v1',
    hechos: 'contaflow.hechos.v1',
    calc: 'contaflow.calc.v1',
    vista: 'contaflow.vista.v1',
    tour: 'contaflow.tour.v1',
  };
  // La demo está anclada al 10-jun-2026 para que los datos cuenten una historia coherente.
  const HOY = '2026-06-10';

  const leerLS = (k, def) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (_) { return def; }
  };
  const escribirLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  /* ------------------------------ Estado --------------------------------- */
  const state = {
    view: 'resumen',
    clientes: cargarClientes(),
    filtroSem: 'todos',
    busqueda: '',
    calcTab: 'resico',
    calcClienteId: '',
    robotCorriendo: false,
    cfdiReales: [], // CFDI subidos por el usuario y parseados (solo en memoria).
    diotRfc: '',    // RFC del contribuyente elegido para la DIOT.
    radarTema: 'todos',
    radarFuente: 'todas',
    radarBusqueda: '',
    radarSoloNoLeidas: false,
  };
  const R = window.Radar;
  const hechos = new Set(leerLS(LS.hechos, []));
  const calcStore = leerLS(LS.calc, {});

  function cargarClientes() {
    const base = D.CLIENTES.map((c) => ({ ...c }));
    const extra = leerLS(LS.clientes, []);
    for (const e of extra) {
      const i = base.findIndex((b) => b.id === e.id);
      if (i >= 0) base[i] = { ...base[i], ...e };
      else base.push(e);
    }
    return base;
  }

  function persistirClientes() {
    const propios = state.clientes.filter(
      (c) => c.custom || D.CLIENTES.some((d) => d.id === c.id && JSON.stringify(d) !== JSON.stringify(c))
    );
    escribirLS(LS.clientes, propios);
  }
  const persistirHechos = () => escribirLS(LS.hechos, [...hechos]);

  /* ------------------------------ Utilidades ----------------------------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );
  const norm = (s) =>
    String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /** Descarga un archivo generado en el navegador (Blob), sin servidor. */
  function descargarArchivo(nombre, contenido, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([contenido], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(msg, tipo = 'ok', accion = null) {
    // Máximo 3 avisos apilados: el más viejo cede su lugar.
    const previos = $$('#toasts .toast');
    if (previos.length >= 3) previos[0].remove();
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.innerHTML = `<span>${esc(msg)}</span>`;
    if (accion) {
      const b = document.createElement('button');
      b.className = 'toast-act';
      b.textContent = accion.label;
      b.addEventListener('click', () => { accion.fn(); t.remove(); });
      t.appendChild(b);
    }
    $('#toasts').appendChild(t);
    const vida = accion ? 6500 : 3400;
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, vida);
    setTimeout(() => t.remove(), vida + 400);
  }

  const SEM = {
    ok:            { dot: 'dot-ok',    label: 'Al corriente' },
    proceso:       { dot: 'dot-warn',  label: 'En proceso' },
    pendiente:     { dot: 'dot-bad',   label: 'Pendiente' },
    faltante:      { dot: 'dot-bad',   label: 'Faltan docs' },
    sin_habilitar: { dot: 'dot-bad',   label: 'Sin habilitar' },
    na:            { dot: 'dot-muted', label: 'N/A' },
    positiva:      { dot: 'dot-ok',    label: 'Positiva' },
    negativa:      { dot: 'dot-bad',   label: 'Negativa' },
  };
  const sem = (estado) => {
    const s = SEM[estado] || SEM.na;
    return `<span class="sem-cell"><span class="dot ${s.dot}"></span>${s.label}</span>`;
  };

  // Ciclos de estatus al hacer clic en el expediente.
  const CICLOS = {
    contabilidad: ['ok', 'proceso', 'pendiente'],
    declaracion: ['ok', 'proceso', 'pendiente'],
    diot: ['ok', 'pendiente'],
    buzon: ['ok', 'sin_habilitar'],
    opinion32d: ['positiva', 'negativa'],
    docs: ['ok', 'proceso', 'faltante'],
  };
  const CAMPOS_ESTATUS = [
    ['contabilidad', 'Contabilidad', 'Registro contable del periodo'],
    ['declaracion', 'Declaración', 'Pago provisional / definitivo del mes (vence el día 17)'],
    ['diot', 'DIOT', 'Declaración Informativa de Operaciones con Terceros: mensual, en la nueva plataforma del SAT'],
    ['buzon', 'Buzón', 'Buzón tributario: canal oficial del SAT. Multa de $3,850–$11,540 si no está habilitado (aplica desde 2027)'],
    ['opinion32d', 'Opinión 32-D', 'Opinión de cumplimiento (Art. 32-D CFF): la exigen bancos, clientes grandes y gobierno'],
    ['docs', 'Documentos', 'Estados de cuenta y papeles que el cliente debe entregar cada mes'],
  ];

  const clientePorId = (id) => state.clientes.find((c) => c.id === id);

  function salud(c) {
    // Rojo: riesgo fiscal grave. Amarillo: pendientes operativos. Verde: al día.
    if (c.riesgo69b || c.estatus.opinion32d === 'negativa' || c.estatus.buzon === 'sin_habilitar') return 'rojo';
    const vals = Object.values(c.estatus);
    if (vals.includes('pendiente') || vals.includes('faltante') || vals.includes('proceso')) return 'amarillo';
    return 'verde';
  }

  /* ======================================================================
   * Pendientes de hoy (lista de trabajo palomeable)
   * ==================================================================== */
  function tareasDeHoy() {
    const t = [];
    for (const c of state.clientes) {
      const nom = esc(c.nombre);
      if (c.riesgo69b)
        t.push({ id: `p-${c.id}-69b`, tipo: 'bad', ico: '🚨', txt: `Revisar CFDI del proveedor <strong>69-B</strong> de ${nom} ($84,300 en juego)`, vista: 'cfdi', accion: 'Ver CFDI' });
      if (c.estatus.buzon === 'sin_habilitar')
        t.push({ id: `p-${c.id}-buzon`, tipo: 'bad', ico: '📬', txt: `Habilitar <strong>buzón tributario</strong> de ${nom} (multa desde 1-ene-2027)`, vista: 'clientes', cli: c.id, accion: 'Expediente' });
      if (c.estatus.opinion32d === 'negativa')
        t.push({ id: `p-${c.id}-32d`, tipo: 'bad', ico: '⚠️', txt: `Atender opinión <strong>32-D negativa</strong> de ${nom}`, vista: 'clientes', cli: c.id, accion: 'Expediente' });
      if (c.estatus.declaracion === 'pendiente')
        t.push({ id: `p-${c.id}-decl`, tipo: 'warn', ico: '🧮', txt: `Preparar la <strong>declaración</strong> de ${nom} (vence 17-jun)`, vista: 'impuestos', cli: c.id, accion: 'Calcular' });
      if (c.estatus.docs === 'faltante')
        t.push({ id: `p-${c.id}-docs`, tipo: 'warn', ico: '📁', txt: `Documentos faltantes de ${nom} — el portal ya le recordó 2 veces`, vista: 'portal', accion: 'Ver portal' });
    }
    const vencidas = D.COBRANZA.filter((f) => f.estado === 'vencida');
    if (vencidas.length) {
      const total = vencidas.reduce((s, f) => s + f.monto, 0);
      t.push({ id: 'p-cobranza', tipo: 'warn', ico: '💸', txt: `Cobrar <strong>${F.fmtMXN(total)}</strong> en igualas vencidas (la secuencia automática ya está corriendo)`, vista: 'cobranza', accion: 'Cobranza' });
    }
    const orden = { bad: 0, warn: 1 };
    return t.sort((a, b) => (hechos.has(a.id) - hechos.has(b.id)) || (orden[a.tipo] - orden[b.tipo]));
  }

  /* ======================================================================
   * VISTA: RESUMEN
   * ==================================================================== */
  function vResumen() {
    const cls = state.clientes;
    const rojos = cls.filter((c) => salud(c) === 'rojo');
    const amarillos = cls.filter((c) => salud(c) === 'amarillo');
    const porCobrar = D.COBRANZA.filter((f) => f.estado !== 'pagada').reduce((s, f) => s + f.monto, 0);
    const vencido = D.COBRANZA.filter((f) => f.estado === 'vencida').reduce((s, f) => s + f.monto, 0);
    const xmlMes = cls.reduce((s, c) => s + c.xmlMes.emitidos + c.xmlMes.recibidos, 0);
    const eventos = F.generarCalendario2026().filter((e) => e.fecha >= HOY).slice(0, 4);
    const tareas = tareasDeHoy();
    const listas = tareas.filter((t) => hechos.has(t.id)).length;

    return `
      <h1 class="view-title">Buenos días, Alejandra 👋</h1>
      <p class="view-sub">Esto es lo que ContaFlow resolvió mientras dormías — y tu plan de trabajo para hoy.</p>

      <div class="kpi-grid">
        <div class="card kpi"><div class="kpi-label">Clientes activos</div><div class="kpi-value">${cls.length}</div><div class="kpi-foot">RFCs ilimitados en tu plan</div></div>
        <div class="card kpi ${rojos.length ? 'kpi-bad' : 'kpi-ok'}"><div class="kpi-label">Semáforo en rojo</div><div class="kpi-value">${rojos.length}</div><div class="kpi-foot">${amarillos.length} en amarillo · ${cls.length - rojos.length - amarillos.length} en verde</div></div>
        <div class="card kpi"><div class="kpi-label">XML del mes</div><div class="kpi-value">${xmlMes.toLocaleString('es-MX')}</div><div class="kpi-foot">Descarga nocturna automática 03:14 h</div></div>
        <div class="card kpi ${vencido ? 'kpi-warn' : ''}"><div class="kpi-label">Por cobrar</div><div class="kpi-value">${F.fmtMXN(porCobrar)}</div><div class="kpi-foot">${F.fmtMXN(vencido)} vencido</div></div>
      </div>

      <div class="two-col">
        <div>
          <div class="card card-pad todo-card">
            <div class="flex between wrap">
              <h3 class="mb0">Pendientes de hoy</h3>
              <span class="badge ${listas === tareas.length && tareas.length ? 'badge-ok' : 'badge-blue'}" id="todoBadge">${listas} de ${tareas.length} listos</span>
            </div>
            <div class="todo-progress" role="progressbar" aria-valuenow="${listas}" aria-valuemax="${tareas.length}"><span id="todoBar" style="width:${tareas.length ? (listas / tareas.length) * 100 : 0}%"></span></div>
            ${tareas.map((t) => {
              const done = hechos.has(t.id);
              return `
              <div class="todo-row ${t.tipo} ${done ? 'done' : ''}">
                <input type="checkbox" class="todo-check" data-tarea="${t.id}" ${done ? 'checked' : ''} aria-label="Marcar pendiente como hecho" />
                <span class="todo-txt">${t.ico} ${t.txt}</span>
                <button class="btn btn-ghost btn-sm" data-goto="${t.vista}" ${t.cli ? `data-cli="${t.cli}"` : ''}>${t.accion}</button>
              </div>`;
            }).join('') || '<p class="muted">Nada pendiente. Día perfecto para buscar clientes nuevos. 🎉</p>'}
          </div>

          <div class="card card-pad" style="margin-top:16px">
            <h3>Próximas obligaciones</h3>
            <div class="cal-list">
              ${eventos.map((e) => calItem(e)).join('')}
            </div>
            <div class="right" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-goto="calendario">Ver calendario completo →</button></div>
          </div>
        </div>

        <div>
          <div class="card card-pad radar-mini">
            <div class="flex between">
              <h3 class="mb0">📡 Radar fiscal</h3>
              <span class="badge badge-live"><span class="dot-live"></span> Datos reales</span>
            </div>
            <p class="hint" style="margin:4px 0 10px">Lo que cambió en el SAT y el DOF — cruzado con tu cartera.</p>
            ${(() => {
              const top = R.items.filter((n) => n.impacto === 'alto' && !R.leidas.has(n.id)).slice(0, 3);
              if (!top.length) return '<p class="muted" style="font-size:.88rem">Sin pendientes de alto impacto. El radar sigue vigilando por ti. ✅</p>';
              return top.map((n) => {
                const { total, esToda } = R.clientesAfectados(n, state.clientes);
                const alcance = total ? (esToda ? 'toda tu cartera' : `${total} cliente${total === 1 ? '' : 's'}`) : '';
                return `
                <button class="radar-mini-item" data-goto="radar">
                  <span class="rmi-fecha">${R.fechaRelativa(n.fecha)}</span>
                  <span class="rmi-titulo">${esc(n.titulo)}</span>
                  ${alcance ? `<span class="rmi-alcance">→ afecta a ${alcance}</span>` : ''}
                </button>`;
              }).join('');
            })()}
            <div class="right" style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-goto="radar">Abrir radar →</button></div>
          </div>

          <div class="card card-pad" style="margin-top:16px">
            <h3>Actividad de hoy</h3>
            <ul class="feed">
              ${D.ACTIVIDAD.map((a) => `<li><span class="f-hora">${a.hora}</span><span>${a.icono} ${esc(a.texto)}</span></li>`).join('')}
            </ul>
          </div>
        </div>
      </div>`;
  }

  /* ======================================================================
   * VISTA: CLIENTES
   * ==================================================================== */
  function filtrarClientes() {
    const q = norm(state.busqueda.trim());
    let lista = state.clientes;
    if (q) lista = lista.filter((c) => norm(`${c.nombre} ${c.rfc} ${c.regimen}`).includes(q));
    if (state.filtroSem !== 'todos') lista = lista.filter((c) => salud(c) === state.filtroSem);
    return lista;
  }

  function clientesTbody(lista) {
    return lista.map((c) => `
      <tr class="clickable" data-cliente="${c.id}">
        <td>
          <div class="strong">${c.riesgo69b ? '🚨 ' : ''}${esc(c.nombre)}</div>
          <small class="mono">${esc(c.rfc)}</small>
        </td>
        <td><small>${esc(c.regimen)}</small></td>
        <td>${sem(c.estatus.contabilidad)}</td>
        <td>${sem(c.estatus.declaracion)}</td>
        <td>${sem(c.estatus.diot)}</td>
        <td>${sem(c.estatus.buzon)}</td>
        <td>${sem(c.estatus.opinion32d)}</td>
        <td>${sem(c.estatus.docs)}</td>
        <td class="num">${F.fmtMXN(c.iguala)}</td>
      </tr>`).join('') || '<tr><td colspan="9" class="center muted" style="padding:30px">Sin resultados. Prueba con otro nombre, RFC o filtro — o da de alta a tu primer cliente con el botón azul.</td></tr>';
  }

  function vClientes() {
    const lista = filtrarClientes();
    return `
      <div class="flex between wrap">
        <div>
          <h1 class="view-title">Clientes</h1>
          <p class="view-sub">Semáforo de cumplimiento de toda tu cartera. Clic en un cliente para abrir su expediente y cambiar estatus.</p>
        </div>
        <button class="btn btn-primary" id="btnNuevoCliente">+ Nuevo cliente</button>
      </div>

      <div class="toolbar">
        <input class="input" id="clienteFiltro" type="search" placeholder="Filtrar por nombre o RFC…" value="${esc(state.busqueda)}" style="min-width:220px" aria-label="Filtrar clientes" />
        ${['todos', 'rojo', 'amarillo', 'verde'].map((f) =>
          `<button class="chip-filter ${state.filtroSem === f ? 'active' : ''}" data-filtro="${f}">
            ${f === 'todos' ? `Todos (${state.clientes.length})` : `${f === 'rojo' ? '🔴' : f === 'amarillo' ? '🟡' : '🟢'} ${f[0].toUpperCase() + f.slice(1)} (${state.clientes.filter((c) => salud(c) === f).length})`}
          </button>`).join('')}
      </div>

      <div class="card table-wrap">
        <table class="tbl" id="tablaClientes">
          <thead><tr>
            <th>Cliente</th><th>Régimen</th><th>Contabilidad</th><th>Declaración</th>
            <th><span class="term" tabindex="0" data-tip="Declaración Informativa de Operaciones con Terceros: se presenta cada mes en la plataforma del SAT">DIOT</span></th>
            <th><span class="term" tabindex="0" data-tip="Buzón tributario del SAT. Multa de $3,850–$11,540 por no habilitarlo, aplicable desde el 1-ene-2027">Buzón</span></th>
            <th><span class="term" tabindex="0" data-tip="Opinión de cumplimiento (Art. 32-D CFF): la exigen bancos, clientes grandes y gobierno">32-D</span></th>
            <th>Docs</th><th class="num">Iguala</th>
          </tr></thead>
          <tbody>${clientesTbody(lista)}</tbody>
        </table>
      </div>
      <p class="hint" style="margin-top:10px">Tip: también puedes encontrar a cualquier cliente desde donde estés con <kbd>Ctrl</kbd>+<kbd>K</kbd>.</p>`;
  }

  function drawerCliente(c) {
    const extra = F.diasExtraSextoDigito(c.rfc);
    const cfdis = D.CFDIS.filter((x) => x.clienteId === c.id);
    const facturas = D.COBRANZA.filter((f) => f.clienteId === c.id && f.estado !== 'pagada');
    return `
      <div class="modal-head">
        <div>
          <h3 class="mb0">${esc(c.nombre)}</h3>
          <small class="mono muted">${esc(c.rfc)} · ${esc(c.regimen)}</small>
        </div>
        <button class="x-btn" data-close aria-label="Cerrar expediente">✕</button>
      </div>

      ${c.riesgo69b ? '<div class="alert-row alert-bad"><span class="a-ico">🚨</span><span>Proveedor en listado <strong>69-B presunto</strong>. Hay CFDI marcados en el monitor.</span></div>' : ''}

      <div class="card card-pad" style="margin-bottom:14px">
        <div class="flex between"><h4 class="mt0 mb0">Cumplimiento del periodo</h4><small class="muted">clic para cambiar</small></div>
        <div class="estatus-grid" style="margin-top:12px">
          ${CAMPOS_ESTATUS.map(([campo, etiqueta, tip]) => `
            <button class="estatus-chip" data-toggle="${campo}" data-id="${c.id}" data-tip="${esc(tip)}. Clic para cambiar el estatus.">
              <span>${etiqueta}</span>
              <span class="flex" style="gap:6px">${sem(c.estatus[campo])}<span class="ec-flip" aria-hidden="true">↻</span></span>
            </button>`).join('')}
        </div>
      </div>

      <div class="card card-pad" style="margin-bottom:14px">
        <h4 class="mt0">Vencimiento personalizado</h4>
        <p style="font-size:.88rem" class="mb0">Por el 6º dígito de su RFC, este contribuyente tiene <strong>+${extra} día(s) hábil(es)</strong> adicionales al día 17 para pagos provisionales (Decreto de facilidades, Art. 5.1).</p>
      </div>

      <div class="card card-pad" style="margin-bottom:14px">
        <h4 class="mt0">XML del mes</h4>
        <p style="font-size:.88rem" class="mb0">${c.xmlMes.emitidos} emitidos · ${c.xmlMes.recibidos} recibidos · última descarga automática <span class="mono">${esc(c.xmlMes.ultimaDescarga)}</span></p>
        ${cfdis.length ? `<p style="font-size:.85rem;margin:8px 0 0" class="muted">${cfdis.length} CFDI visibles en el monitor de esta demo.</p>` : ''}
      </div>

      ${facturas.length ? `
      <div class="card card-pad" style="margin-bottom:14px">
        <h4 class="mt0">Cobranza pendiente</h4>
        ${facturas.map((f) => `<div class="papel-row"><span>${esc(f.concepto)} <small class="muted">vence ${f.vence}</small></span><strong>${F.fmtMXN(f.monto)}</strong></div>`).join('')}
      </div>` : ''}

      <div class="card card-pad" style="margin-bottom:14px">
        <h4 class="mt0">Notas del expediente</h4>
        <p style="font-size:.88rem" class="mb0">${esc(c.notas || 'Sin notas.')}</p>
      </div>

      <div class="flex">
        <button class="btn btn-ghost btn-sm" id="btnEditarCliente" data-id="${c.id}">Editar datos</button>
        <button class="btn btn-primary btn-sm" data-goto="impuestos" data-cli="${c.id}">Calcular sus impuestos →</button>
      </div>`;
  }

  function abrirExpediente(id) {
    const c = clientePorId(id);
    if (!c) return;
    if (state.view !== 'clientes') { state.view = 'clientes'; render(); }
    $('#clientDrawer').innerHTML = drawerCliente(c);
    $('#overlay').classList.add('open');
    $('#clientDrawer').classList.add('open');
  }

  /* ======================================================================
   * VISTA: IMPUESTOS (calculadora 2026)
   * ==================================================================== */
  const TAB_POR_REGIMEN = {
    'RESICO PF': 'resico',
    'General de Ley PM': 'pm',
    'RESICO PM': 'pm',
    'Actividad Empresarial y Profesional': 'actividad',
    'Sueldos y salarios': 'sueldos',
  };

  function vImpuestos() {
    const tabs = [
      ['resico', 'RESICO PF'],
      ['actividad', 'Act. empresarial PF'],
      ['pm', 'Persona Moral 30%'],
      ['sueldos', 'Sueldos'],
      ['iva', 'IVA mensual'],
    ];
    const cli = clientePorId(state.calcClienteId);
    return `
      <h1 class="view-title">Impuestos 2026</h1>
      <p class="view-sub">Tarifas del Anexo 8 RMF 2026 (DOF 28-dic-2025) ya cargadas — sin actualizar Excel a mano. Tu captura se guarda sola.</p>

      <div class="card card-pad calc-cliente">
        <label class="field" style="margin:0"><span class="lbl">Calcular para</span>
          <select class="input" id="calcCliente">
            <option value="">— captura manual (sin cliente) —</option>
            ${state.clientes.map((c) => `<option value="${c.id}" ${c.id === state.calcClienteId ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.rfc)}</option>`).join('')}
          </select>
        </label>
        ${cli ? `<p class="hint" style="margin-top:8px">Régimen <strong>${esc(cli.regimen)}</strong>: pestaña y datos precargados automáticamente. El papel de trabajo saldrá a su nombre.</p>` : '<p class="hint" style="margin-top:8px">Elige un cliente y ContaFlow selecciona su régimen y precarga sus datos.</p>'}
      </div>

      <div class="calc-tabs" role="tablist">
        ${tabs.map(([id, label]) => `<button class="calc-tab ${state.calcTab === id ? 'active' : ''}" data-tab="${id}" role="tab" aria-selected="${state.calcTab === id}">${label}</button>`).join('')}
      </div>
      <div class="calc-grid">
        <div class="card card-pad" id="calcForm">${formCalc(state.calcTab)}</div>
        <div id="calcResult"></div>
      </div>`;
  }

  function formCalc(tab) {
    const campos = {
      resico: `
        <h3>RESICO Persona Física <span class="badge badge-blue">Art. 113-E LISR</span></h3>
        <label class="field"><span class="lbl">Ingresos efectivamente cobrados en el mes (sin IVA)</span>
          <input class="input calc-in" type="number" id="inIngresos" value="48000" min="0" step="500" /></label>
        <label class="field"><span class="lbl">Retención 1.25% por personas morales (si aplica)</span>
          <input class="input calc-in" type="number" id="inRetencion" value="0" min="0" step="50" /></label>
        <label class="field"><span class="lbl">Ingresos acumulados del año <small class="muted">(opcional, valida el tope de $3.5M)</small></span>
          <input class="input calc-in" type="number" id="inIngresosAnual" value="0" min="0" step="1000" /></label>
        <p class="hint">El impuesto se calcula por tasa directa sobre lo cobrado, sin deducciones. El tope de permanencia en RESICO es <strong>anual</strong> ($3.5M).</p>`,
      actividad: `
        <h3>Actividad Empresarial y Profesional <span class="badge badge-blue">Art. 106 LISR</span></h3>
        <label class="field"><span class="lbl">Ingresos acumulados del año al periodo</span>
          <input class="input calc-in" type="number" id="inIngresos" value="380000" min="0" step="1000" /></label>
        <label class="field"><span class="lbl">Deducciones autorizadas acumuladas</span>
          <input class="input calc-in" type="number" id="inDeducciones" value="195000" min="0" step="1000" /></label>
        <label class="field"><span class="lbl">Pagos provisionales anteriores</span>
          <input class="input calc-in" type="number" id="inPagos" value="18500" min="0" step="500" /></label>
        <label class="field"><span class="lbl">Retenciones de ISR acumuladas (10% PM)</span>
          <input class="input calc-in" type="number" id="inRetencion" value="6200" min="0" step="100" /></label>`,
      pm: `
        <h3>Persona Moral — Régimen General <span class="badge badge-blue">Art. 14 LISR</span></h3>
        <label class="field"><span class="lbl">Ingresos nominales acumulados</span>
          <input class="input calc-in" type="number" id="inIngresos" value="2450000" min="0" step="10000" /></label>
        <label class="field"><span class="lbl"><span class="term" data-tip="Utilidad fiscal del ejercicio anterior ÷ ingresos nominales. Se aplica a los ingresos del año en curso para estimar la utilidad de los pagos provisionales">Coeficiente de utilidad</span></span>
          <input class="input calc-in" type="number" id="inCoef" value="0.0892" min="0" max="1" step="0.0001" /></label>
        <label class="field"><span class="lbl">Pagos provisionales anteriores</span>
          <input class="input calc-in" type="number" id="inPagos" value="42000" min="0" step="1000" /></label>
        <label class="field"><span class="lbl">Pérdidas fiscales por amortizar</span>
          <input class="input calc-in" type="number" id="inPerdidas" value="0" min="0" step="1000" /></label>`,
      sueldos: `
        <h3>Sueldos y salarios — retención mensual <span class="badge badge-blue">Art. 96 LISR</span></h3>
        <label class="field"><span class="lbl">Ingreso mensual gravado</span>
          <input class="input calc-in" type="number" id="inIngresos" value="9500" min="0" step="500" /></label>
        <p class="hint">Ya incluye el <span class="term" data-tip="Subsidio para el empleo 2026: cuota fija de $536.22/mes cuando el ingreso gravado no excede $11,492.66 (decreto DOF 31-dic-2025). Si el subsidio supera al ISR, la diferencia no se entrega en efectivo.">subsidio para el empleo</span> 2026. La tarifa ya trae la actualización por inflación de 13.21%.</p>`,
      iva: `
        <h3>IVA mensual definitivo <span class="badge badge-blue">Art. 5-D LIVA</span></h3>
        <label class="field"><span class="lbl">IVA trasladado efectivamente cobrado</span>
          <input class="input calc-in" type="number" id="inTrasladado" value="64000" min="0" step="500" /></label>
        <label class="field"><span class="lbl">IVA acreditable efectivamente pagado</span>
          <input class="input calc-in" type="number" id="inAcreditable" value="41200" min="0" step="500" /></label>
        <label class="field"><span class="lbl">IVA retenido al contribuyente</span>
          <input class="input calc-in" type="number" id="inRetenido" value="0" min="0" step="100" /></label>
        <label class="field"><span class="lbl">Saldo a favor de periodos anteriores</span>
          <input class="input calc-in" type="number" id="inSaldoFavor" value="0" min="0" step="100" /></label>`,
    };
    return campos[tab];
  }

  /** Restaura lo último que capturó el usuario en esta pestaña (no se pierde nada). */
  function aplicarCapturaGuardada() {
    const guardado = calcStore[state.calcTab] || {};
    for (const [id, val] of Object.entries(guardado)) {
      const el = document.getElementById(id);
      if (el) el.value = val;
    }
    // Si hay cliente PM seleccionado y no hay captura previa de coeficiente, usar el suyo.
    const cli = clientePorId(state.calcClienteId);
    const coef = $('#inCoef');
    if (cli && coef && guardado.inCoef === undefined && cli.coeficienteUtilidad) {
      coef.value = cli.coeficienteUtilidad;
    }
  }

  function calcular() {
    const num = (id) => parseFloat($(id)?.value) || 0;
    let r;
    switch (state.calcTab) {
      case 'resico':
        r = F.calcularResicoPF({ ingresosMes: num('#inIngresos'), retencionPM: num('#inRetencion'), ingresosAnualAcum: num('#inIngresosAnual') });
        break;
      case 'actividad':
        r = F.calcularActividadEmpresarial({
          ingresosAcum: num('#inIngresos'), deduccionesAcum: num('#inDeducciones'),
          pagosProvPrevios: num('#inPagos'), retencionesAcum: num('#inRetencion'),
        });
        break;
      case 'pm':
        r = F.calcularPersonaMoral({
          ingresosNominalesAcum: num('#inIngresos'), coeficienteUtilidad: num('#inCoef'),
          pagosProvPrevios: num('#inPagos'), perdidasPorAmortizar: num('#inPerdidas'),
        });
        break;
      case 'sueldos':
        r = F.calcularSueldos({ sueldoMensualGravado: num('#inIngresos') });
        break;
      case 'iva':
        r = F.calcularIVA({
          trasladado: num('#inTrasladado'), acreditable: num('#inAcreditable'),
          retenido: num('#inRetenido'), saldoFavorAnterior: num('#inSaldoFavor'),
        });
        break;
    }
    pintarEcosDeMoneda();
    pintarResultado(r);
  }

  /** Muestra el monto formateado en pesos debajo de cada campo mientras capturas. */
  function pintarEcosDeMoneda() {
    $$('.calc-in').forEach((input) => {
      let echo = input.parentElement.querySelector('.money-echo');
      if (!echo) {
        echo = document.createElement('span');
        echo.className = 'hint money-echo';
        echo.setAttribute('aria-hidden', 'true');
        input.insertAdjacentElement('afterend', echo);
      }
      const v = parseFloat(input.value) || 0;
      if (v <= 0) { echo.textContent = ''; return; }
      echo.textContent = input.id === 'inCoef' ? `= ${(v * 100).toFixed(2)}%` : `= ${F.fmtMXN(v)}`;
    });
  }

  function pintarResultado(r) {
    const principal = r.aCargo ?? r.isr ?? 0;
    const esFavor = r.aFavor > 0;
    const usaTarifa = ['actividad', 'sueldos'].includes(state.calcTab);
    const cli = clientePorId(state.calcClienteId);
    $('#calcResult').innerHTML = `
      <div class="resultado-hero">
        <div class="rh-label">${esFavor ? 'Saldo a favor' : 'Impuesto a cargo del periodo'}</div>
        <div class="rh-value">${F.fmtMXN(esFavor ? r.aFavor : principal)}</div>
        <small style="color:#9fb0d8">${esc(r.regimen)}${cli ? ' · ' + esc(cli.nombre) : ''}</small>
      </div>
      ${r.alerta ? `<div class="alert-row alert-warn"><span class="a-ico">⚠️</span><span>${esc(r.alerta)}</span></div>` : ''}
      <div class="card card-pad papel" id="papelTrabajo">
        <div class="flex between"><h3 class="mb0">Papel de trabajo</h3>
          <div class="flex">
            <button class="btn btn-ghost btn-sm" id="btnCopiarPapel">Copiar</button>
            <button class="btn btn-ghost btn-sm" onclick="window.print()">Imprimir / PDF</button>
          </div>
        </div>
        ${cli ? `<p class="hint" style="margin:6px 0 0">Contribuyente: <strong>${esc(cli.nombre)}</strong> (${esc(cli.rfc)})</p>` : ''}
        <div style="margin-top:10px">
          ${r.pasos.map(([k, v], i) => `<div class="papel-row ${i === r.pasos.length - 1 ? 'total' : ''}"><span>${esc(k)}</span><span class="mono">${esc(v)}</span></div>`).join('')}
        </div>
        <p class="hint" style="margin-top:12px">Tarifas Anexo 8 RMF 2026 · DOF 28-dic-2025 · Esta demo es informativa, no constituye asesoría fiscal.</p>
      </div>
      ${usaTarifa ? tarifaMini(r) : ''}`;
    $('#btnCopiarPapel')?.addEventListener('click', () => {
      const enc = cli ? `Contribuyente: ${cli.nombre} (${cli.rfc})\n` : '';
      const texto = `${r.regimen} — ContaFlow (tarifas 2026)\n${enc}` + r.pasos.map(([k, v]) => `${k}: ${v}`).join('\n');
      navigator.clipboard?.writeText(texto).then(
        () => toast('Papel de trabajo copiado al portapapeles ✅'),
        () => toast('No se pudo copiar en este navegador', 'warn')
      );
    });
  }

  function tarifaMini(r) {
    return `
      <div class="card card-pad" style="margin-top:14px">
        <h3>Tarifa mensual 2026 aplicada</h3>
        <div class="table-wrap"><table class="tbl tarifa-mini">
          <thead><tr><th>Límite inferior</th><th>Límite superior</th><th class="num">Cuota fija</th><th class="num">% exced.</th></tr></thead>
          <tbody>
            ${F.TARIFA_ISR_MENSUAL_2026.map((row) => `
              <tr class="${r.renglon === row ? 'hit' : ''}">
                <td class="num">${F.fmtMXN(row.li)}</td>
                <td class="num">${row.ls === Infinity ? 'En adelante' : F.fmtMXN(row.ls)}</td>
                <td class="num">${F.fmtMXN(row.cf)}</td>
                <td class="num">${(row.pct * 100).toFixed(2)}%</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;
  }

  /* ======================================================================
   * VISTA: CFDI / XML
   * ==================================================================== */
  function vCfdi() {
    const riesgos = D.CFDIS.filter((x) => x.riesgo);
    return `
      <h1 class="view-title">CFDI / XML</h1>
      <p class="view-sub">Sube tus XML y ContaFlow los lee al instante en tu navegador; o deja que el robot los descargue solo cada noche. Tú solo revisas los riesgos.</p>

      <div class="card card-pad cfdi-upload" style="margin-bottom:16px">
        <div class="flex between wrap">
          <div>
            <h3 class="mb0">📂 Sube tus XML (CFDI 4.0)</h3>
            <small class="muted">Se procesan aquí, en tu navegador. Ningún archivo sale de tu equipo. 🔒</small>
          </div>
          ${state.cfdiReales.length ? `<button class="btn btn-ghost btn-sm" id="btnLimpiarCfdi">Limpiar (${state.cfdiReales.length})</button>` : ''}
        </div>
        <div class="upload-zone" id="cfdiDrop" style="margin-top:12px" tabindex="0" role="button" aria-label="Subir archivos XML de CFDI">
          📎 Arrastra aquí tus XML o haz clic para elegir (puedes seleccionar varios)
        </div>
        <input type="file" id="cfdiFileInput" accept=".xml,text/xml,application/xml" multiple hidden />
        <div id="cfdiRealResults">${state.cfdiReales.length ? htmlCfdiReales() : ''}</div>
        <p class="hint" style="margin-top:10px">¿No tienes XML a la mano? En el proyecto hay archivos de prueba en <span class="mono">docs/ejemplos/</span>.</p>
      </div>

      <div id="cfdiRepResults">${state.cfdiReales.length ? htmlRep() : ''}</div>

      <div class="robot-panel">
        <div class="flex between wrap">
          <div>
            <h3 class="mb0">🤖 Robot de descarga masiva</h3>
            <small style="color:#9fb0d8">Última corrida automática: hoy 03:14 h · 1,348 XML · 3 reintentos por errores del SAT</small>
          </div>
          <button class="btn btn-light" id="btnRobot" ${state.robotCorriendo ? 'disabled' : ''}>▶ Simular corrida ahora</button>
        </div>
        <div class="progress-track"><div class="progress-bar" id="robotBar"></div></div>
        <div class="flex between"><small id="robotStatus" style="color:#9fb0d8">En espera de la corrida nocturna (03:00 h)…</small><small id="robotPct" style="color:#9fb0d8"></small></div>
        <div class="robot-log" id="robotLog" hidden></div>
      </div>

      <div class="card card-pad" style="margin-bottom:16px">
        <div class="flex between wrap">
          <h3 class="mb0">Riesgos detectados automáticamente</h3>
          <span class="badge badge-bad">${riesgos.length} CFDI con alerta</span>
        </div>
        <p class="hint" style="margin:6px 0 0">Cruce diario contra listados <span class="term" tabindex="0" data-tip="Art. 69-B CFF: contribuyentes que facturan operaciones inexistentes (EFOS). Deducir sus facturas puede costarle a tu cliente la deducción y hasta delito fiscal">69-B (EFOS)</span>, cancelaciones del emisor, facturas duplicadas y pagos <span class="term" tabindex="0" data-tip="Pago en Parcialidades o Diferido: factura que exige un complemento de recepción de pagos (REP). Sin REP, el gasto no es deducible">PPD sin complemento (REP)</span>.</p>
      </div>

      <div class="card table-wrap">
        <table class="tbl">
          <thead><tr><th>UUID</th><th>Fecha</th><th>Emisor</th><th>Receptor</th><th class="num">Total</th><th>Estatus</th><th>Riesgo</th></tr></thead>
          <tbody>
            ${D.CFDIS.map((x) => `
              <tr>
                <td class="mono">${esc(x.uuid)}</td>
                <td><small>${esc(x.fecha)}</small></td>
                <td><small>${esc(x.emisor)}</small></td>
                <td><small>${esc(x.receptor)}</small></td>
                <td class="num">${x.total ? F.fmtMXN(x.total) : '—'}</td>
                <td>${x.estatus === 'vigente' ? '<span class="badge badge-ok">Vigente</span>' : '<span class="badge badge-bad">Cancelado</span>'}</td>
                <td>${badgeRiesgo(x.riesgo)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function badgeRiesgo(r) {
    switch (r) {
      case 'efos': return '<span class="badge badge-bad">🚨 Emisor 69-B</span>';
      case 'duplicado': return '<span class="badge badge-warn">Posible duplicado</span>';
      case 'sin_rep': return '<span class="badge badge-warn">PPD sin REP</span>';
      case 'cancelado_emisor': return '<span class="badge badge-warn">Cancelado por emisor</span>';
      default: return '<span class="badge badge-muted">—</span>';
    }
  }

  /** Construye el resumen + tabla de los CFDI que el usuario subió. */
  function htmlCfdiReales() {
    const lista = state.cfdiReales;
    if (!lista.length) return '';
    const R = window.CFDI.resumir(lista);
    const validos = lista.filter((x) => x.ok);
    const errores = lista.filter((x) => !x.ok);
    return `
      <div class="kpi-grid" style="margin:16px 0">
        <div class="card kpi"><div class="kpi-label">Comprobantes leídos</div><div class="kpi-value">${R.validos}</div><div class="kpi-foot">${R.conError ? `${R.conError} con error` : 'todos válidos'}</div></div>
        <div class="card kpi"><div class="kpi-label">Por tipo</div><div class="kpi-value" style="font-size:1.05rem">${R.ingresos}·I ${R.egresos}·E ${R.pagos}·P ${R.nomina}·N</div><div class="kpi-foot">Ingreso · Egreso · Pago · Nómina</div></div>
        <div class="card kpi"><div class="kpi-label">IVA trasladado</div><div class="kpi-value">${F.fmtMXN(R.ivaTrasladado)}</div><div class="kpi-foot">Retenido: ${F.fmtMXN(R.retenido)}</div></div>
        <div class="card kpi"><div class="kpi-label">Base IVA 16%</div><div class="kpi-value" style="font-size:1.05rem">${F.fmtMXN(R.baseIva16)}</div><div class="kpi-foot">8%: ${F.fmtMXN(R.baseIva8)} · 0%: ${F.fmtMXN(R.baseIva0)} · Ex: ${F.fmtMXN(R.baseExento)}</div></div>
      </div>
      ${errores.length ? `<div class="alert-row alert-warn"><span class="a-ico">⚠️</span><span>${errores.length} archivo(s) no se pudieron leer: ${errores.map((e) => `<strong>${esc(e.archivo)}</strong> (${esc(e.errores[0])})`).join('; ')}</span></div>` : ''}
      <div class="card table-wrap" style="margin-top:12px">
        <table class="tbl">
          <thead><tr><th>UUID</th><th>Tipo</th><th>Emisor</th><th>Receptor</th><th>Método</th><th class="num">Subtotal</th><th class="num">IVA 16%</th><th class="num">Total</th></tr></thead>
          <tbody>
            ${validos.map((x) => `
              <tr>
                <td class="mono"><small>${esc(x.uuid ? x.uuid.slice(0, 8) + '…' : '— sin UUID —')}</small></td>
                <td><span class="badge badge-muted">${esc(x.tipoLabel)}</span></td>
                <td><small>${esc(x.emisor.nombre || x.emisor.rfc || '—')}</small></td>
                <td><small>${esc(x.receptor.nombre || x.receptor.rfc || '—')}</small></td>
                <td>${x.metodoPago ? `<span class="badge ${x.metodoPago === 'PPD' ? 'badge-warn' : 'badge-blue'}">${esc(x.metodoPago)}</span>` : '—'}</td>
                <td class="num">${F.fmtMXN(x.subtotal)}</td>
                <td class="num">${x.impuestos.iva16.importe ? F.fmtMXN(x.impuestos.iva16.importe) : '—'}</td>
                <td class="num">${F.fmtMXN(x.total)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="hint" style="margin-top:10px">Estos datos viven solo en esta sesión (no se guardan en disco). En el siguiente paso, de aquí saldrá la DIOT y el cruce de REP.</p>`;
  }

  /** Lee los XML elegidos (input o drag&drop) y los agrega al estado. */
  async function procesarArchivosCFDI(fileList) {
    const archivos = Array.from(fileList || []).filter(
      (f) => /\.xml$/i.test(f.name) || (f.type || '').includes('xml')
    );
    if (!archivos.length) { toast('Selecciona uno o más archivos .xml', 'warn'); return; }
    toast('Procesando XML en tu navegador…');
    const resultados = await Promise.all(archivos.map((f) => window.CFDI.parseArchivo(f)));
    state.cfdiReales = state.cfdiReales.concat(resultados);
    if (state.view === 'cfdi') render();
    const okN = resultados.filter((r) => r.ok).length;
    const errN = resultados.length - okN;
    toast(`${okN} CFDI leído(s) ✅${errN ? ` · ${errN} con error` : ''}`);
  }

  /** Sección de validación de REP: cruza las facturas PPD con sus complementos. */
  function htmlRep() {
    const v = window.REP.validar(state.cfdiReales);
    const R = v.resumen;
    if (!R.totalPpd && !R.totalReps) return ''; // no hay nada que cruzar
    const filaPpd = (f) => `
      <tr>
        <td class="mono"><small>${esc(f.uuid ? f.uuid.slice(0, 8) + '…' : '—')}</small></td>
        <td><small>${esc((f.fecha || '').slice(0, 10))}</small></td>
        <td><small>${esc(f.emisor.nombre || f.emisor.rfc || '—')}</small></td>
        <td><small>${esc(f.receptor.nombre || f.receptor.rfc || '—')}</small></td>
        <td class="num">${F.fmtMXN(f.total)}</td>
      </tr>`;
    return `
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="flex between wrap">
          <div>
            <h3 class="mb0">🧾 Validación de REP (complementos de pago)</h3>
            <small class="muted">Cruzamos tus facturas <strong>PPD</strong> contra los complementos de pago que subiste.</small>
          </div>
          <span class="badge ${R.sinRep ? 'badge-bad' : 'badge-ok'}">${R.sinRep ? `${R.sinRep} sin REP` : 'Todo con REP'}</span>
        </div>
        <div class="kpi-grid" style="margin:14px 0">
          <div class="card kpi"><div class="kpi-label">Facturas PPD</div><div class="kpi-value">${R.totalPpd}</div><div class="kpi-foot">requieren complemento</div></div>
          <div class="card kpi kpi-ok"><div class="kpi-label">Con REP</div><div class="kpi-value">${R.conRep}</div><div class="kpi-foot">${v.conRep.filter((c) => c.cubierta).length} cubierta(s) 100%</div></div>
          <div class="card kpi ${R.sinRep ? 'kpi-bad' : ''}"><div class="kpi-label">Sin REP</div><div class="kpi-value">${R.sinRep}</div><div class="kpi-foot">${F.fmtMXN(R.montoSinRep)} en riesgo</div></div>
          <div class="card kpi"><div class="kpi-label">Complementos (P)</div><div class="kpi-value">${R.totalReps}</div><div class="kpi-foot">${R.huerfanos ? `${R.huerfanos} huérfano(s)` : '0 huérfanos'}</div></div>
        </div>
        ${v.sinRep.length ? `
          <div class="alert-row alert-bad"><span class="a-ico">🚨</span><span><strong>${v.sinRep.length} factura(s) PPD sin su REP.</strong> Sin el complemento de pago, el gasto no es deducible ni el IVA acreditable, y puede haber multa. Solicítalos al emisor.</span></div>
          <div class="table-wrap" style="margin-top:10px"><table class="tbl">
            <thead><tr><th>UUID</th><th>Fecha</th><th>Emisor</th><th>Receptor</th><th class="num">Total</th></tr></thead>
            <tbody>${v.sinRep.map(filaPpd).join('')}</tbody>
          </table></div>`
          : '<div class="alert-row alert-info"><span class="a-ico">✅</span><span>Todas las facturas PPD cargadas tienen su complemento de pago.</span></div>'}
        ${v.conRep.length ? `
          <h4 style="margin:16px 0 6px">PPD con REP</h4>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>UUID</th><th>Emisor → Receptor</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th><th>Estado</th></tr></thead>
            <tbody>${v.conRep.map((c) => `
              <tr>
                <td class="mono"><small>${esc(c.factura.uuid.slice(0, 8))}…</small></td>
                <td><small>${esc(c.factura.emisor.nombre || c.factura.emisor.rfc)} → ${esc(c.factura.receptor.nombre || c.factura.receptor.rfc)}</small></td>
                <td class="num">${F.fmtMXN(c.factura.total)}</td>
                <td class="num">${F.fmtMXN(c.pagado)}</td>
                <td class="num">${F.fmtMXN(c.saldo)}</td>
                <td>${c.cubierta ? '<span class="badge badge-ok">Cubierta</span>' : `<span class="badge badge-warn">Parcial (${c.parcialidades})</span>`}</td>
              </tr>`).join('')}</tbody>
          </table></div>` : ''}
        ${v.repsHuerfanos.length ? `<p class="hint" style="margin-top:10px">ℹ️ ${v.repsHuerfanos.length} complemento(s) de pago referencian facturas que no están entre los XML cargados (quizá están en otro lote).</p>` : ''}
      </div>`;
  }

  function correrRobot() {
    if (state.robotCorriendo || !$('#robotBar')) return;
    state.robotCorriendo = true;
    const bar = $('#robotBar'), log = $('#robotLog'), st = $('#robotStatus'), pctEl = $('#robotPct');
    const btn = $('#btnRobot');
    btn.disabled = true;
    log.hidden = false;
    log.innerHTML = '';
    let pct = 0;
    const pasos = [
      [6,  'Autenticando con e.firma de 8 contribuyentes…', ''],
      [14, 'Solicitando paquetes al WS de descarga masiva del SAT…', ''],
      [26, '⚠ SAT respondió 500 (saturado) para 2 RFC — reintento automático en 40 s con backoff', 'warn'],
      [38, 'Paquete recibido: DLP190304MN8 (422 XML)', 'ok'],
      [52, 'Paquete recibido: GFB060221HZ4 (798 XML)', 'ok'],
      [60, '⚠ XML “inexistentes” reportados por el SAT para TAC150612QW3 — reintento programado', 'warn'],
      [74, 'Reintento exitoso: TAC150612QW3 (227 XML)', 'ok'],
      [86, 'Validando estructura, duplicados y estatus de cancelación…', ''],
      [94, 'Cruzando emisores contra listado 69-B del SAT…', ''],
      [100, '✔ Corrida completa: 1,348 XML · 3 riesgos detectados · 0 intervención humana', 'ok'],
    ];
    let i = 0;
    const timer = setInterval(() => {
      pct = Math.min(100, pct + 2);
      bar.style.width = pct + '%';
      pctEl.textContent = pct + '%';
      if (i < pasos.length && pct >= pasos[i][0]) {
        const [, msg, cls] = pasos[i];
        log.innerHTML += `<div class="${cls}">[03:${String(14 + i).padStart(2, '0')}] ${msg}</div>`;
        log.scrollTop = log.scrollHeight;
        i++;
      }
      if (pct >= 100) {
        clearInterval(timer);
        st.textContent = 'Corrida completada. Próxima corrida automática: mañana 03:00 h.';
        state.robotCorriendo = false;
        btn.disabled = false;
        toast('Robot: 1,348 XML descargados. Mientras tanto, tú no hiciste nada. 😌');
      }
    }, 90);
    st.textContent = 'Corriendo…';
  }

  /* ======================================================================
   * VISTA: DIOT (cuadre + generación del .txt)
   * ==================================================================== */
  function vDiot() {
    const contribs = window.DIOT.detectarContribuyentes(state.cfdiReales);

    if (!contribs.length) {
      return `
        <h1 class="view-title">DIOT</h1>
        <p class="view-sub">Declaración Informativa de Operaciones con Terceros: el IVA acreditable de tus gastos, agrupado por proveedor y listo para el SAT.</p>
        <div class="card card-pad center" style="padding:42px 20px">
          <div style="font-size:2.4rem">📤</div>
          <h3 class="mb0">Aún no hay CFDI de gastos cargados</h3>
          <p class="muted" style="max-width:460px;margin:8px auto 16px">La DIOT se arma con tus <strong>facturas recibidas</strong> (gastos). Súbelas en la pestaña CFDI y aquí aparece el cuadre automáticamente.</p>
          <button class="btn btn-primary" data-goto="cfdi">Ir a subir XML →</button>
        </div>`;
    }

    // Asegura un contribuyente válido seleccionado.
    if (!state.diotRfc || !contribs.some((c) => c.rfc === state.diotRfc)) {
      state.diotRfc = contribs[0].rfc;
    }
    const r = window.DIOT.agruparPorProveedor(state.cfdiReales, state.diotRfc);
    const T = r.totales;

    return `
      <div class="flex between wrap">
        <div>
          <h1 class="view-title">DIOT</h1>
          <p class="view-sub">Cuadre del IVA acreditable por proveedor — periodo detectado: <strong>${esc(r.periodo.label)}</strong>. Revisa y descarga el .txt de carga batch.</p>
        </div>
        <div class="flex">
          <button class="btn btn-ghost btn-sm" id="btnDiotCopiar">Copiar .txt</button>
          <button class="btn btn-primary btn-sm" id="btnDiotTxt">⬇ Descargar .txt DIOT</button>
        </div>
      </div>

      <div class="card card-pad" style="margin-bottom:14px">
        <label class="field" style="margin:0;max-width:520px"><span class="lbl">Contribuyente (RFC receptor de los gastos)</span>
          <select class="input" id="diotContribuyente">
            ${contribs.map((c) => `<option value="${esc(c.rfc)}" ${c.rfc === state.diotRfc ? 'selected' : ''}>${esc(c.nombre)} · ${esc(c.rfc)} (${c.gastos} gasto${c.gastos === 1 ? '' : 's'})</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="kpi-grid">
        <div class="card kpi"><div class="kpi-label">Proveedores</div><div class="kpi-value">${T.numProveedores}</div><div class="kpi-foot">${T.numCfdi} CFDI de gasto (PUE)</div></div>
        <div class="card kpi"><div class="kpi-label">Base gravable total</div><div class="kpi-value" style="font-size:1.15rem">${F.fmtMXN(T.baseTotal)}</div><div class="kpi-foot">16/8/0/exento</div></div>
        <div class="card kpi kpi-ok"><div class="kpi-label">IVA acreditable</div><div class="kpi-value">${F.fmtMXN(T.ivaAcreditable)}</div><div class="kpi-foot">16%: ${F.fmtMXN(T.iva16)} · 8%: ${F.fmtMXN(T.iva8)}</div></div>
        <div class="card kpi"><div class="kpi-label">IVA retenido</div><div class="kpi-value" style="font-size:1.15rem">${F.fmtMXN(T.retIva)}</div><div class="kpi-foot">ISR ret.: ${F.fmtMXN(T.retIsr)}</div></div>
      </div>

      ${r.alertas.length ? `<div class="card card-pad" style="margin-bottom:14px">
        ${r.alertas.map((a) => `<div class="alert-row alert-warn"><span class="a-ico">⚠️</span><span>${esc(a)}</span></div>`).join('')}
      </div>` : ''}

      <div class="card table-wrap">
        <table class="tbl">
          <thead><tr>
            <th>Proveedor</th><th><span class="term" tabindex="0" data-tip="04 = nacional, 05 = extranjero, 15 = global (público en general)">Tipo</span></th>
            <th class="num">Base 16%</th><th class="num">IVA 16%</th>
            <th class="num">Base 8%</th><th class="num">IVA 8%</th>
            <th class="num">Base 0%</th><th class="num">Exento</th><th class="num">IVA ret.</th>
          </tr></thead>
          <tbody>
            ${r.proveedores.map((p) => `
              <tr>
                <td><div class="strong">${esc(p.nombre)}</div><small class="mono">${esc(p.rfc)}</small></td>
                <td><span class="badge badge-muted">${esc(p.tipoTerceroLabel)}</span></td>
                <td class="num">${p.base16 ? F.fmtMXN(p.base16) : '—'}</td>
                <td class="num">${p.iva16 ? F.fmtMXN(p.iva16) : '—'}</td>
                <td class="num">${p.base8 ? F.fmtMXN(p.base8) : '—'}</td>
                <td class="num">${p.iva8 ? F.fmtMXN(p.iva8) : '—'}</td>
                <td class="num">${p.base0 ? F.fmtMXN(p.base0) : '—'}</td>
                <td class="num">${p.baseExento ? F.fmtMXN(p.baseExento) : '—'}</td>
                <td class="num">${p.retIva ? F.fmtMXN(p.retIva) : '—'}</td>
              </tr>`).join('') || '<tr><td colspan="9" class="center muted" style="padding:24px">Sin gastos PUE para este contribuyente.</td></tr>'}
          </tbody>
          ${r.proveedores.length ? `<tfoot><tr class="strong">
            <td colspan="2">Totales</td>
            <td class="num">${F.fmtMXN(T.base16)}</td><td class="num">${F.fmtMXN(T.iva16)}</td>
            <td class="num">${F.fmtMXN(T.base8)}</td><td class="num">${F.fmtMXN(T.iva8)}</td>
            <td class="num">${F.fmtMXN(T.base0)}</td><td class="num">${F.fmtMXN(T.baseExento)}</td><td class="num">${F.fmtMXN(T.retIva)}</td>
          </tr></tfoot>` : ''}
        </table>
      </div>

      <div class="alert-row alert-info" style="margin-top:14px"><span class="a-ico">📋</span><span>El archivo .txt usa el formato nuevo del SAT (54 campos separados por «|», UTF-8, montos sin decimales). El <strong>orden exacto de las columnas debe cotejarse contra el instructivo oficial</strong> del SAT antes de presentarlo; el mapeo está centralizado en <span class="mono">diot.js</span> para ajustarlo en un solo lugar. Esta demo es informativa, no constituye asesoría fiscal.</span></div>`;
  }

  /* ======================================================================
   * VISTA: CALENDARIO
   * ==================================================================== */
  function calItem(e) {
    const [y, m, d] = e.fecha.split('-');
    const past = e.fecha < HOY;
    const dias = Math.round((new Date(e.fecha) - new Date(HOY)) / 86400000);
    const urgente = !past && dias <= 7;
    const MESES_ABR = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    return `
      <div class="card cal-item ${past ? 'past' : ''} ${urgente ? 'urgent' : ''}">
        <div class="cal-date"><div class="d">${Number(d)}</div><div class="m">${MESES_ABR[Number(m) - 1]} ${y.slice(2)}</div></div>
        <div style="flex:1">
          <div class="strong" style="font-size:.92rem">${esc(e.titulo)}</div>
          <small class="muted">${esc(e.detalle)}</small>
        </div>
        <div class="right" style="flex:none">
          ${past ? '<span class="badge badge-muted">Vencida</span>'
            : urgente ? `<span class="badge badge-bad">En ${dias} día${dias === 1 ? '' : 's'}</span>`
            : `<span class="badge badge-blue">${esc(e.ambito)}</span>`}
        </div>
      </div>`;
  }

  function vCalendario() {
    const eventos = F.generarCalendario2026();
    const futuros = eventos.filter((e) => e.fecha >= HOY);
    const pasados = eventos.filter((e) => e.fecha < HOY);
    return `
      <h1 class="view-title">Calendario fiscal 2026</h1>
      <p class="view-sub">Generado por reglas (no a mano): día 17 recorrido a día hábil, DIOT con facilidad a fin de mes, anuales, PTU y la multa del buzón. Cada cliente además recibe sus días extra por el 6º dígito del RFC.</p>
      <div class="alert-row alert-info"><span class="a-ico">🔔</span><span>En la versión completa, estos vencimientos se convierten en recordatorios automáticos por WhatsApp/correo para ti <em>y</em> para cada cliente.</span></div>
      <h3 style="margin-top:18px">Próximos</h3>
      <div class="cal-list">${futuros.map(calItem).join('')}</div>
      <h3 style="margin-top:26px" class="muted">Ya vencidos este año</h3>
      <div class="cal-list">${pasados.map(calItem).join('')}</div>`;
  }

  /* ======================================================================
   * VISTA: COBRANZA
   * ==================================================================== */
  function vCobranza() {
    const pend = D.COBRANZA.filter((f) => f.estado !== 'pagada');
    const vencidas = pend.filter((f) => f.estado === 'vencida');
    const porVencer = pend.filter((f) => f.estado === 'por_vencer');
    const mrr = state.clientes.reduce((s, c) => s + (c.iguala || 0), 0);
    const cobradoMes = D.COBRANZA.filter((f) => f.estado === 'pagada').reduce((s, f) => s + f.monto, 0);
    const cli4 = clientePorId('c4');

    return `
      <h1 class="view-title">Cobranza del despacho</h1>
      <p class="view-sub">Deja de trabajar gratis: recordatorios automáticos y suspensión del portal al cliente moroso — presión efectiva y 100% legal (retener su contabilidad no lo es).</p>

      <div class="aging-grid">
        <div class="aging-cell"><div class="ag-label"><span class="term" tabindex="0" data-tip="Suma de las igualas mensuales de toda tu cartera: tu ingreso recurrente">Iguala mensual total</span></div><div class="ag-val">${F.fmtMXN(mrr)}</div></div>
        <div class="aging-cell"><div class="ag-label">Cobrado este mes</div><div class="ag-val" style="color:var(--ok)">${F.fmtMXN(cobradoMes)}</div></div>
        <div class="aging-cell"><div class="ag-label">Por vencer</div><div class="ag-val">${F.fmtMXN(porVencer.reduce((s, f) => s + f.monto, 0))}</div></div>
        <div class="aging-cell"><div class="ag-label">Vencido</div><div class="ag-val" style="color:var(--bad)">${F.fmtMXN(vencidas.reduce((s, f) => s + f.monto, 0))}</div></div>
      </div>

      <div class="two-col">
        <div class="card table-wrap">
          <table class="tbl">
            <thead><tr><th>Cliente</th><th>Concepto</th><th>Vence</th><th class="num">Monto</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              ${D.COBRANZA.map((f) => {
                const c = clientePorId(f.clienteId);
                const badge = f.estado === 'pagada' ? '<span class="badge badge-ok">Pagada</span>'
                  : f.estado === 'por_vencer' ? '<span class="badge badge-warn">Por vencer</span>'
                  : '<span class="badge badge-bad">Vencida</span>';
                return `<tr>
                  <td><small class="strong">${esc(c ? c.nombre : '—')}</small></td>
                  <td><small>${esc(f.concepto)}</small></td>
                  <td><small>${esc(f.vence)}</small></td>
                  <td class="num">${F.fmtMXN(f.monto)}</td>
                  <td>${badge}</td>
                  <td>${f.estado === 'vencida' ? `<button class="btn btn-ghost btn-sm" data-recordar="${f.id}">Recordar 📲</button>` : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div>
          <div class="card card-pad">
            <h3>Así se ve el recordatorio automático</h3>
            <div class="wa-preview">
              Hola ${esc(cli4 ? cli4.nombre.split(' ')[0] : 'Luis')} 👋, te saluda el despacho <strong>Ríos &amp; Asociados</strong>.<br /><br />
              Te recordamos que tienes 2 igualas pendientes por <strong>$3,600.00</strong> (abril y mayo).
              Puedes pagar aquí: <span style="color:#0b6e99">pago.contaflow.mx/rios/f-2204</span><br /><br />
              ⚠️ Si no recibimos el pago antes del <strong>15 de junio</strong>, tu portal de documentos se
              suspenderá temporalmente y tus declaraciones podrían presentarse fuera de plazo.
              <div class="wa-meta">Aviso 3 de 3 · enviado automáticamente 08:15 ✓✓</div>
            </div>
            <p class="hint" style="margin-top:12px">Secuencia configurable: aviso amable (día 1) → recordatorio (día 7) → aviso de suspensión (día 21) → suspensión automática del portal. Tú nunca tienes la conversación incómoda.</p>
          </div>
        </div>
      </div>`;
  }

  /* ======================================================================
   * VISTA: PORTAL DEL CLIENTE
   * ==================================================================== */
  function vPortal() {
    const r = F.calcularResicoPF({ ingresosMes: 17400, retencionPM: 0 });
    return `
      <h1 class="view-title">Portal del cliente</h1>
      <p class="view-sub">Esto es lo que ve cada uno de tus clientes desde su celular. Tú dejas de perseguirlos: el portal lo hace por ti.</p>

      <div class="portal-frame">
        <div class="portal-top">
          <div><strong>Ríos &amp; Asociados</strong> <small style="opacity:.7">· portal del cliente</small></div>
          <small>María Elena Pérez Cruz</small>
        </div>
        <div class="portal-body">
          <div class="alert-row alert-warn"><span class="a-ico">📁</span><span><strong>Tu contadora necesita 1 documento</strong> para cerrar tu mes: estado de cuenta de mayo (BBVA). Súbelo antes del <strong>13 de junio</strong>.</span></div>

          <div class="grid" style="grid-template-columns:1fr 1fr; margin:16px 0">
            <div class="card card-pad">
              <div class="kpi-label" style="font-size:.74rem;color:var(--ink-500);text-transform:uppercase;font-weight:700">Tu impuesto estimado de mayo</div>
              <div style="font:800 1.6rem var(--font)">${F.fmtMXN(r.aCargo)}</div>
              <small class="muted">RESICO 1.00% sobre ${F.fmtMXN(17400)} cobrados</small>
            </div>
            <div class="card card-pad">
              <div class="kpi-label" style="font-size:.74rem;color:var(--ink-500);text-transform:uppercase;font-weight:700">Estatus general</div>
              <div style="font:800 1.6rem var(--font); color:var(--warn)">🟡 Casi listo</div>
              <small class="muted">Falta 1 documento · declaración vence 17-jun</small>
            </div>
          </div>

          <h4>Documentos de mayo</h4>
          <ul class="doc-check">
            <li><span class="dot dot-ok"></span> Facturas emitidas <small class="muted">— se descargan solas del SAT, no haces nada</small></li>
            <li><span class="dot dot-ok"></span> Facturas recibidas <small class="muted">— se descargan solas del SAT</small></li>
            <li><span class="dot dot-ok"></span> Estado de cuenta Santander <small class="muted">— subido el 6 de junio ✓</small></li>
            <li><span class="dot dot-bad"></span> <strong>Estado de cuenta BBVA</strong> <small class="muted">— pendiente</small></li>
          </ul>

          <div class="upload-zone" id="uploadZone" style="margin-top:14px" tabindex="0" role="button" aria-label="Subir estado de cuenta">
            📎 Arrastra aquí tu estado de cuenta (PDF) o haz clic para elegir el archivo
          </div>

          <p class="hint" style="margin-top:16px">El cliente también ve aquí su línea de captura, sus declaraciones presentadas con acuse, y un chat directo contigo. Disponible con tu logo y tus colores en el plan Firma.</p>
        </div>
      </div>`;
  }

  /* ======================================================================
   * VISTA: RADAR FISCAL
   * La única vista de la demo con DATOS REALES: noticias del SAT, DOF y
   * prensa fiscal, clasificadas por tema y cruzadas con la cartera.
   * ==================================================================== */
  function radarFiltrados() {
    let lista = R.items;
    if (state.radarTema !== 'todos') lista = lista.filter((n) => (n.temas || []).includes(state.radarTema));
    if (state.radarFuente !== 'todas') lista = lista.filter((n) => n.fuente === state.radarFuente);
    if (state.radarSoloNoLeidas) lista = lista.filter((n) => !R.leidas.has(n.id));
    const q = norm(state.radarBusqueda.trim());
    if (q) lista = lista.filter((n) => norm(`${n.titulo} ${n.resumen || ''}`).includes(q));
    return lista;
  }

  function radarAfectadosHTML(n) {
    const { clientes, total, esToda, urgentes } = R.clientesAfectados(n, state.clientes);
    if (!total) return { boton: '', panel: '' };
    const texto = esToda
      ? `Aplica a toda tu cartera (${total})`
      : `Afecta a ${total} de tus clientes`;
    const urgente = urgentes.length
      ? `<span class="radar-urgente">🚨 ${urgentes.length} ya con bandera 69-B</span>`
      : '';
    const boton = `
      <button class="radar-af-btn ${urgentes.length ? 'peligro' : ''}" data-radar-afectados="${n.id}" aria-expanded="false" aria-controls="af-${n.id}">
        ${urgentes.length ? '🚨' : '👥'} ${texto} ${urgente}
      </button>`;
    const panel = `
      <div class="radar-afectados" id="af-${n.id}" hidden>
        ${clientes.map((c) => `
          <button class="radar-af-chip ${c.riesgo69b && (n.temas || []).includes('69b') ? 'chip-peligro' : ''}" data-goto="clientes" data-cli="${c.id}" title="Abrir expediente">
            ${c.riesgo69b ? '🚨 ' : ''}${esc(c.nombre.split(',')[0])} <small>${esc(c.regimen)}</small>
          </button>`).join('')}
        <small class="hint w100">Clic en un cliente para abrir su expediente y actuar de una vez.</small>
      </div>`;
    return { boton, panel };
  }

  function radarCard(n, destacada = false) {
    const leida = R.leidas.has(n.id);
    const { boton, panel } = radarAfectadosHTML(n);
    const chips = (n.temas || [])
      .filter((t) => R.TEMAS[t])
      .map((t) => `<button class="radar-tema-chip" data-radar-tema="${t}">${R.TEMAS[t].label}</button>`)
      .join('');
    const impLabel = { alto: '⚠ Alto impacto', medio: 'Relevante', info: 'Contexto' }[n.impacto] || '';
    return `
      <article class="radar-card imp-${n.impacto} ${leida ? 'leida' : ''} ${destacada ? 'destacada' : ''}" data-radar-id="${n.id}">
        <div class="radar-top">
          <span class="radar-fuente">${esc(n.fuente)}</span>
          <span class="radar-fecha">${R.fechaRelativa(n.fecha)}</span>
          <span class="imp-badge imp-badge-${n.impacto}">${impLabel}</span>
          <button class="radar-leida-btn" data-radar-leida="${n.id}" title="${leida ? 'Marcar como no leída' : 'Marcar como leída'}" aria-label="${leida ? 'Marcar como no leída' : 'Marcar como leída'}">${leida ? '↩' : '✓'}</button>
        </div>
        <h3 class="radar-titulo"><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.titulo)}<span class="ext" aria-hidden="true"> ↗</span></a></h3>
        ${n.resumen ? `<p class="radar-resumen">${esc(n.resumen)}</p>` : ''}
        <div class="radar-pie">${chips}${boton}</div>
        ${panel}
      </article>`;
  }

  function radarListaHTML() {
    const lista = radarFiltrados();
    const hero = lista.filter((n) => n.impacto === 'alto' && !R.leidas.has(n.id)).slice(0, 3);
    const heroIds = new Set(hero.map((n) => n.id));
    const resto = lista.filter((n) => !heroIds.has(n.id));
    const vacio = `
      <div class="card card-pad center radar-vacio">
        <p class="strong mb0">Nada por aquí con esos filtros.</p>
        <p class="muted">Quita filtros, borra la búsqueda o pulsa “Actualizar ahora” para leer las fuentes de nuevo.</p>
      </div>`;
    return {
      hero: hero.length ? `
        <div class="radar-hero-head"><h3 class="mb0">Lo que no puedes dejar pasar</h3><small class="muted">Alto impacto sin leer</small></div>
        <div class="radar-hero">${hero.map((n) => radarCard(n, true)).join('')}</div>` : '',
      lista: resto.length || hero.length ? resto.map((n) => radarCard(n)).join('') : vacio,
      contador: `${lista.length} nota${lista.length === 1 ? '' : 's'} · ${lista.filter((n) => !R.leidas.has(n.id)).length} sin leer`,
    };
  }

  function pintarRadarLista() {
    const { hero, lista, contador } = radarListaHTML();
    const h = $('#radarHero'); const l = $('#radarLista'); const c = $('#radarContador');
    if (h) h.innerHTML = hero;
    if (l) l.innerHTML = lista;
    if (c) c.textContent = contador;
  }

  function radarMetaTexto() {
    const cuando = R.actualizadoEn
      ? new Date(R.actualizadoEn).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null;
    const origen = { repo: 'actualización automática', vivo: 'lectura en vivo', semilla: 'paquete local' }[R.origen] || '';
    return cuando ? `Última lectura: ${cuando} (${origen})` : `Fuente: ${origen}`;
  }

  function vRadar() {
    const temasPresentes = new Map();
    for (const n of R.items) for (const t of n.temas || []) {
      if (R.TEMAS[t]) temasPresentes.set(t, (temasPresentes.get(t) || 0) + 1);
    }
    const chipsTemas = [...temasPresentes.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([t]) => `<button class="chip-filter ${state.radarTema === t ? 'active' : ''}" data-radar-tema-filtro="${t}">${R.TEMAS[t].label}</button>`)
      .join('');
    const fuentes = [...new Set(R.items.map((n) => n.fuente))];
    const { hero, lista, contador } = radarListaHTML();

    return `
      <div class="flex between wrap">
        <div>
          <h1 class="view-title">Radar fiscal <span class="badge badge-live"><span class="dot-live"></span> Datos reales</span></h1>
          <p class="view-sub">Cambios del SAT, publicaciones del DOF y prensa fiscal — clasificados por tema y cruzados con tu cartera para decirte <strong>a quién le pegan</strong>. Deja de perseguir la noticia: aquí te encuentra a ti.</p>
        </div>
        <div class="radar-acciones">
          <button class="btn btn-primary btn-sm" id="btnRadarRefresh">⟳ Actualizar ahora</button>
          <small class="muted" id="radarMeta">${esc(radarMetaTexto())}</small>
        </div>
      </div>

      <div class="card card-pad radar-filtros">
        <div class="radar-chips" role="group" aria-label="Filtrar por tema">
          <button class="chip-filter ${state.radarTema === 'todos' ? 'active' : ''}" data-radar-tema-filtro="todos">Todos los temas</button>
          ${chipsTemas}
        </div>
        <div class="radar-controles">
          <input class="input" id="radarBusqueda" type="search" placeholder="Buscar (ej. “DIOT”, “multa”, “RESICO”)…" value="${esc(state.radarBusqueda)}" aria-label="Buscar en el radar" />
          <select class="input" id="radarFuente" aria-label="Filtrar por fuente">
            <option value="todas">Todas las fuentes</option>
            ${fuentes.map((f) => `<option value="${esc(f)}" ${state.radarFuente === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}
          </select>
          <label class="radar-noleidas"><input type="checkbox" id="radarNoLeidas" ${state.radarSoloNoLeidas ? 'checked' : ''}/> Solo sin leer</label>
          <button class="btn btn-ghost btn-sm" id="btnRadarTodoLeido">Marcar todo como leído</button>
        </div>
        <small class="muted" id="radarContador">${contador}</small>
      </div>

      <div id="radarHero">${hero}</div>
      <div class="radar-lista" id="radarLista">${lista}</div>

      <p class="hint" style="margin-top:14px">El radar se alimenta solo, dos veces al día, de fuentes públicas (El Contribuyente, DOF, IDC). El resumen es informativo: antes de aplicar un cambio con un cliente, confirma en la fuente original.</p>`;
  }

  function radarRefrescar() {
    const btn = $('#btnRadarRefresh');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Leyendo fuentes…';
    R.actualizarEnVivo().then(({ agregadas, errores }) => {
      if (agregadas) toast(`Radar actualizado: ${agregadas} nota${agregadas === 1 ? '' : 's'} nueva${agregadas === 1 ? '' : 's'}. 📡`);
      else if (errores.length === 3) toast('No se pudo leer ninguna fuente ahora. El radar conserva lo último que tenía.', 'warn');
      else toast('Radar al día: sin novedades desde la última lectura. ✅');
      if (errores.length && errores.length < 3) toast(`Fuente sin responder: ${errores.join(', ')}. Se leyó el resto.`, 'warn');
      if (state.view === 'radar') render();
    }).finally(() => { btn.disabled = false; btn.textContent = original; });
  }

  /* ======================================================================
   * Render raíz + navegación
   * ==================================================================== */
  const VISTAS = {
    resumen: vResumen,
    clientes: vClientes,
    impuestos: vImpuestos,
    cfdi: vCfdi,
    diot: vDiot,
    calendario: vCalendario,
    radar: vRadar,
    cobranza: vCobranza,
    portal: vPortal,
  };

  function render() {
    $('#viewHost').innerHTML = VISTAS[state.view]();
    $$('.nav-item').forEach((b) => {
      const activo = b.dataset.view === state.view;
      b.classList.toggle('active', activo);
      if (activo) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $$('.bn-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    afterRender();
    actualizarBadgesNav();
    $('#sidebar').classList.remove('open');
    escribirLS(LS.vista, state.view);
  }

  function actualizarBadgesNav() {
    $('#navClientes').textContent = state.clientes.length;
    $('#navCfdiAlert').textContent = D.CFDIS.filter((x) => x.riesgo).length || '';
    $('#navCobranzaAlert').textContent = D.COBRANZA.filter((f) => f.estado === 'vencida').length || '';
    const radarPend = R.items.filter((n) => n.impacto === 'alto' && !R.leidas.has(n.id)).length;
    const nr = $('#navRadarAlert');
    if (nr) nr.textContent = radarPend || '';
  }

  function afterRender() {
    if (state.view === 'impuestos') { aplicarCapturaGuardada(); calcular(); }
    if (state.view === 'clientes') {
      $('#btnNuevoCliente')?.addEventListener('click', () => abrirModalCliente());
    }
    if (state.view === 'cfdi') {
      $('#btnRobot')?.addEventListener('click', correrRobot);
      // Zona de carga real de XML (sube/arrastra → parsea en el navegador).
      const drop = $('#cfdiDrop');
      const input = $('#cfdiFileInput');
      if (drop && input) {
        drop.addEventListener('click', () => input.click());
        drop.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        ['dragover', 'dragenter'].forEach((ev) =>
          drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach((ev) =>
          drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
        drop.addEventListener('drop', (e) => procesarArchivosCFDI(e.dataTransfer.files));
        input.addEventListener('change', (e) => { procesarArchivosCFDI(e.target.files); e.target.value = ''; });
      }
      $('#btnLimpiarCfdi')?.addEventListener('click', () => {
        state.cfdiReales = [];
        render();
        toast('Lista de XML vaciada.');
      });
    }
    if (state.view === 'diot') {
      const generarResumen = () => window.DIOT.agruparPorProveedor(state.cfdiReales, state.diotRfc);
      $('#btnDiotTxt')?.addEventListener('click', () => {
        const r = generarResumen();
        if (!r.proveedores.length) { toast('No hay proveedores que exportar para este contribuyente.', 'warn'); return; }
        descargarArchivo(window.DIOT.nombreArchivo(r), window.DIOT.generarTxt(r));
        toast(`DIOT generada: ${r.proveedores.length} proveedor(es) · ${r.periodo.label}. ✅`);
      });
      $('#btnDiotCopiar')?.addEventListener('click', () => {
        const r = generarResumen();
        navigator.clipboard?.writeText(window.DIOT.generarTxt(r)).then(
          () => toast('Contenido del .txt copiado al portapapeles ✅'),
          () => toast('No se pudo copiar en este navegador', 'warn')
        );
      });
    }
    if (state.view === 'radar') {
      $('#btnRadarRefresh')?.addEventListener('click', radarRefrescar);
      // La búsqueda repinta SOLO la lista para no perder el foco del input.
      $('#radarBusqueda')?.addEventListener('input', (e) => {
        state.radarBusqueda = e.target.value;
        pintarRadarLista();
      });
      $('#radarFuente')?.addEventListener('change', (e) => { state.radarFuente = e.target.value; render(); });
      $('#radarNoLeidas')?.addEventListener('change', (e) => { state.radarSoloNoLeidas = e.target.checked; render(); });
      $('#btnRadarTodoLeido')?.addEventListener('click', () => {
        radarFiltrados().forEach((n) => R.marcarLeida(n.id, true));
        actualizarBadgesNav();
        render();
        toast('Radar despejado: todo marcado como leído. ✅');
      });
    }
    if (state.view === 'portal') {
      const z = $('#uploadZone');
      if (z) {
        ['dragover', 'dragenter'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.remove('drag'); }));
        const subir = () => {
          z.innerHTML = '✅ <strong>edo-cta-bbva-mayo.pdf</strong> recibido. Tu contadora fue notificada y tu semáforo pasará a verde.';
          toast('Documento recibido. Notificamos al despacho automáticamente. ✅');
        };
        z.addEventListener('drop', subir);
        z.addEventListener('click', subir);
        z.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); subir(); } });
      }
    }
  }

  /* --------------------------- Modal de cliente --------------------------- */
  function abrirModalCliente(cliente) {
    $('#clientModalTitle').textContent = cliente ? 'Editar cliente' : 'Nuevo cliente';
    $('#cId').value = cliente?.id || '';
    $('#cNombre').value = cliente?.nombre || '';
    $('#cRfc').value = cliente?.rfc || '';
    $('#cRegimen').value = cliente?.regimen || 'General de Ley PM';
    $('#cIguala').value = cliente?.iguala ?? 2000;
    $('#cEmail').value = cliente?.email || '';
    $('#cTel').value = cliente?.telefono || '';
    validarRfcEnVivo();
    $('#overlay').classList.add('open');
    $('#clientModal').classList.add('open');
    $('#cNombre').focus();
  }

  function cerrarCapas() {
    $('#overlay').classList.remove('open');
    $('#clientModal').classList.remove('open');
    $('#clientDrawer').classList.remove('open');
    cerrarPaleta();
  }

  function validarRfcEnVivo() {
    const input = $('#cRfc');
    const hint = $('#rfcHint');
    const v = F.validarRFC(input.value);
    if (!input.value.trim()) {
      input.classList.remove('invalid');
      hint.className = 'hint';
      hint.style.color = '';
      hint.textContent = 'Validamos estructura y fecha en tiempo real.';
      return v;
    }
    if (v.valido) {
      input.classList.remove('invalid');
      hint.className = 'hint';
      hint.style.color = 'var(--ok)';
      hint.textContent = `✓ RFC con estructura válida (${v.tipo === 'PF' ? 'Persona Física' : 'Persona Moral'}). Días extra por 6º dígito: +${F.diasExtraSextoDigito(v.rfc)} hábiles.`;
    } else {
      input.classList.add('invalid');
      hint.className = 'hint error';
      hint.style.color = '';
      hint.textContent = '✗ ' + v.errores[0];
    }
    return v;
  }

  function guardarCliente(e) {
    e.preventDefault();
    const v = validarRfcEnVivo();
    if (!$('#cNombre').value.trim()) { toast('Falta el nombre del cliente', 'warn'); $('#cNombre').focus(); return; }
    if (!v.valido) { toast('Revisa el RFC: ' + v.errores[0], 'warn'); $('#cRfc').focus(); return; }
    const id = $('#cId').value || 'u' + Date.now();
    const existente = clientePorId(id);
    const datos = {
      id,
      nombre: $('#cNombre').value.trim(),
      rfc: v.rfc,
      tipo: v.tipo,
      regimen: $('#cRegimen').value,
      iguala: parseFloat($('#cIguala').value) || 0,
      email: $('#cEmail').value.trim(),
      telefono: $('#cTel').value.trim(),
      custom: !D.CLIENTES.some((d) => d.id === id),
      estatus: existente?.estatus || { contabilidad: 'pendiente', declaracion: 'pendiente', diot: v.tipo === 'PM' ? 'pendiente' : 'na', buzon: 'ok', opinion32d: 'positiva', docs: 'pendiente' },
      riesgo69b: existente?.riesgo69b || false,
      xmlMes: existente?.xmlMes || { emitidos: 0, recibidos: 0, ultimaDescarga: 'programada esta noche 03:00' },
      saldo: existente?.saldo || 0,
      notas: existente?.notas || 'Cliente nuevo: descarga de XML y recordatorios programados.',
    };
    if (existente) Object.assign(existente, datos);
    else state.clientes.push(datos);
    persistirClientes();
    cerrarCapas();
    state.view = 'clientes';
    render();
    toast(existente ? 'Cliente actualizado ✅' : `${datos.nombre} dado de alta. XML y recordatorios programados. ✅`);
  }

  /* ===================== Paleta de comandos (Ctrl+K) ===================== */
  let paletaIdx = 0;

  function fuentesPaleta() {
    const items = [];
    for (const c of state.clientes) {
      items.push({
        ico: '👤', titulo: c.nombre, sub: `${c.rfc} · ${c.regimen}`, kind: 'Cliente',
        claves: `${c.nombre} ${c.rfc} ${c.regimen}`,
        run: () => abrirExpediente(c.id),
      });
    }
    const vistas = [
      ['◳', 'Resumen', 'resumen'], ['👥', 'Clientes', 'clientes'], ['🧮', 'Impuestos 2026', 'impuestos'],
      ['⬇️', 'CFDI / XML', 'cfdi'], ['📤', 'DIOT', 'diot'], ['📅', 'Calendario fiscal', 'calendario'],
      ['📡', 'Radar fiscal', 'radar'],
      ['💸', 'Cobranza', 'cobranza'], ['🤝', 'Portal del cliente', 'portal'],
    ];
    for (const [ico, titulo, view] of vistas) {
      items.push({ ico, titulo, sub: '', kind: 'Ir a', claves: `ir a ${titulo}`, run: () => { state.view = view; render(); } });
    }
    items.push(
      { ico: '➕', titulo: 'Nuevo cliente', sub: 'Dar de alta un contribuyente', kind: 'Acción', claves: 'nuevo cliente alta agregar registrar', run: () => { state.view = 'clientes'; render(); abrirModalCliente(); } },
      { ico: '🤖', titulo: 'Simular descarga de XML', sub: 'Corre el robot del SAT ahora', kind: 'Acción', claves: 'robot descarga xml sat simular corrida', run: () => { state.view = 'cfdi'; render(); correrRobot(); } },
      { ico: '📤', titulo: 'Generar DIOT', sub: 'Cuadre del IVA por proveedor y .txt', kind: 'Acción', claves: 'diot generar declaracion informativa operaciones terceros iva acreditable txt', run: () => { state.view = 'diot'; render(); } },
      { ico: '🧮', titulo: 'Calcular RESICO', sub: 'Persona física, tasa directa', kind: 'Acción', claves: 'calcular resico isr', run: () => { state.calcTab = 'resico'; state.view = 'impuestos'; render(); } },
      { ico: '🧮', titulo: 'Calcular IVA del mes', sub: 'Trasladado vs. acreditable', kind: 'Acción', claves: 'calcular iva mensual', run: () => { state.calcTab = 'iva'; state.view = 'impuestos'; render(); } },
      { ico: '🧮', titulo: 'Calcular ISR actividad empresarial', sub: 'Pagos provisionales acumulados', kind: 'Acción', claves: 'calcular isr actividad empresarial profesional honorarios', run: () => { state.calcTab = 'actividad'; state.view = 'impuestos'; render(); } },
      { ico: '🧮', titulo: 'Calcular ISR persona moral', sub: 'Coeficiente de utilidad, 30%', kind: 'Acción', claves: 'calcular isr persona moral coeficiente', run: () => { state.calcTab = 'pm'; state.view = 'impuestos'; render(); } },
      { ico: '📡', titulo: 'Actualizar radar fiscal', sub: 'Leer las fuentes ahora (SAT, DOF, prensa)', kind: 'Acción', claves: 'radar noticias actualizar novedades sat dof leyes cambios', run: () => { state.view = 'radar'; render(); setTimeout(radarRefrescar, 60); } },
      { ico: '▶', titulo: 'Ver tour de bienvenida', sub: 'Recorrido de 4 pasos', kind: 'Acción', claves: 'tour ayuda bienvenida como funciona', run: iniciarTour },
    );
    return items;
  }

  function abrirPaleta() {
    const p = $('#palette');
    p.hidden = false;
    const inp = $('#paletteInput');
    inp.value = '';
    paletaIdx = 0;
    pintarPaleta('');
    inp.focus();
  }

  function cerrarPaleta() {
    const p = $('#palette');
    if (!p.hidden) { p.hidden = true; $('#paletteBtn')?.focus(); }
  }

  function resultadosPaleta(q) {
    const nq = norm(q.trim());
    const todos = fuentesPaleta();
    if (!nq) {
      // Sin búsqueda: primero acciones y vistas, luego clientes.
      return [...todos.filter((i) => i.kind !== 'Cliente'), ...todos.filter((i) => i.kind === 'Cliente')].slice(0, 9);
    }
    const tokens = nq.split(/\s+/);
    return todos
      .filter((i) => tokens.every((t) => norm(`${i.claves} ${i.kind}`).includes(t)))
      .slice(0, 9);
  }

  function pintarPaleta(q) {
    const res = resultadosPaleta(q);
    paletaIdx = Math.min(paletaIdx, Math.max(0, res.length - 1));
    $('#paletteResults').innerHTML = res.length
      ? res.map((i, n) => `
        <button class="palette-item ${n === paletaIdx ? 'active' : ''}" data-pi="${n}" role="option" aria-selected="${n === paletaIdx}">
          <span class="pi-ico" aria-hidden="true">${i.ico}</span>
          <span>${esc(i.titulo)}${i.sub ? `<span class="pi-sub">${esc(i.sub)}</span>` : ''}</span>
          <span class="badge badge-muted pi-kind">${i.kind}</span>
        </button>`).join('')
      : '<div class="palette-empty">Sin resultados. Prueba con el nombre de un cliente, un RFC o palabras como “IVA”, “robot”, “nuevo”.</div>';
    $('#paletteResults').dataset.q = q;
  }

  function ejecutarPaleta(n) {
    const res = resultadosPaleta($('#paletteInput').value);
    const item = res[n];
    if (!item) return;
    $('#palette').hidden = true;
    item.run();
  }

  /* ========================= Tour de bienvenida ========================== */
  const PASOS_TOUR = [
    { sel: '#sideNav', titulo: '7 vistas, cero papeleo', txt: 'Todo tu despacho vive aquí: semáforo de clientes, impuestos 2026, XML del SAT, calendario, cobranza y el portal de tus clientes.' },
    { sel: '#paletteBtn', titulo: 'Encuentra todo con Ctrl+K', txt: 'Escribe el nombre o RFC de un cliente, o una acción como “calcular IVA” o “nuevo cliente”. Es la forma más rápida de moverte.' },
    { sel: '.todo-card', titulo: 'Tu plan de trabajo de hoy', txt: 'ContaFlow convierte las alertas en una lista palomeable: lo crítico arriba y cada pendiente con su acción a un clic.' },
    { sel: null, titulo: '¡Listo! Todo es interactivo', txt: 'Da de alta clientes, cambia estatus con un clic en el expediente, calcula impuestos y corre el robot de XML. Si algo se te pierde: Ctrl+K.' },
  ];
  let pasoTour = -1;

  function iniciarTour() {
    cerrarCapas();
    if (state.view !== 'resumen') { state.view = 'resumen'; render(); }
    pasoTour = 0;
    $('#tour').hidden = false;
    pintarTour();
  }

  function terminarTour() {
    pasoTour = -1;
    $('#tour').hidden = true;
    escribirLS(LS.tour, true);
  }

  function pintarTour() {
    if (pasoTour < 0) return;
    if (pasoTour >= PASOS_TOUR.length) { terminarTour(); return; }
    const paso = PASOS_TOUR[pasoTour];
    const ring = $('#tourRing');
    const card = $('#tourCard');
    const objetivo = paso.sel ? document.querySelector(paso.sel) : null;

    if (paso.sel && !objetivo) { pasoTour++; pintarTour(); return; }

    if (objetivo) {
      const r = objetivo.getBoundingClientRect();
      const pad = 8;
      Object.assign(ring.style, {
        display: 'block', borderStyle: 'solid',
        left: `${Math.max(4, r.left - pad)}px`, top: `${Math.max(4, r.top - pad)}px`,
        width: `${Math.min(window.innerWidth - 8, r.width + pad * 2)}px`,
        height: `${r.height + pad * 2}px`,
      });
    } else {
      // Paso final: solo atenuar la pantalla con la "dona" colapsada al centro.
      Object.assign(ring.style, {
        display: 'block', borderStyle: 'none',
        left: '50%', top: '50%', width: '0px', height: '0px',
      });
    }

    card.innerHTML = `
      <h4>${esc(paso.titulo)}</h4>
      <p>${esc(paso.txt)}</p>
      <div class="tour-foot">
        <span class="tour-step">${pasoTour + 1} / ${PASOS_TOUR.length}</span>
        <button class="btn btn-ghost btn-sm" id="tourSkip">Saltar</button>
        <button class="btn btn-primary btn-sm" id="tourNext">${pasoTour === PASOS_TOUR.length - 1 ? 'Empezar a usar la demo' : 'Siguiente →'}</button>
      </div>`;

    // Posicionar tarjeta: debajo del objetivo si cabe; arriba si no; centrada al final.
    const movil = window.innerWidth < 700;
    card.style.transform = '';
    if (!objetivo || movil) {
      if (movil) {
        Object.assign(card.style, { left: '14px', right: '14px', top: 'auto', bottom: '92px', width: 'auto' });
      } else {
        Object.assign(card.style, { left: '50%', top: '50%', right: 'auto', bottom: 'auto', width: '', transform: 'translate(-50%,-50%)' });
      }
    } else {
      const r = objetivo.getBoundingClientRect();
      const ancho = 360;
      const left = Math.min(Math.max(14, r.left), window.innerWidth - ancho - 14);
      const abajo = r.bottom + 18 + 180 < window.innerHeight;
      Object.assign(card.style, {
        left: `${left}px`, right: 'auto', width: '',
        top: abajo ? `${r.bottom + 16}px` : 'auto',
        bottom: abajo ? 'auto' : `${window.innerHeight - r.top + 16}px`,
      });
    }

    $('#tourNext').onclick = () => { pasoTour++; pintarTour(); };
    $('#tourSkip').onclick = terminarTour;
    $('#tourNext').focus();
  }

  window.addEventListener('resize', () => { if (pasoTour >= 0) pintarTour(); });

  /* ------------------------------ Eventos globales ------------------------ */
  document.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      const cli = goto.dataset.cli;
      const destino = goto.dataset.goto;
      cerrarCapas();
      if (destino === 'clientes' && cli) { abrirExpediente(cli); return; }
      if (destino === 'impuestos' && cli) {
        const c = clientePorId(cli);
        state.calcClienteId = cli;
        if (c) state.calcTab = TAB_POR_REGIMEN[c.regimen] || 'actividad';
      }
      state.view = destino;
      render();
      return;
    }

    const nav = e.target.closest('.nav-item, .bn-item[data-view]');
    if (nav) { state.view = nav.dataset.view; render(); return; }

    if (e.target.closest('#bnMore')) { $('#sidebar').classList.add('open'); return; }

    const filtro = e.target.closest('[data-filtro]');
    if (filtro) { state.filtroSem = filtro.dataset.filtro; render(); return; }

    // ---- Radar fiscal ----------------------------------------------------
    const chipFiltro = e.target.closest('[data-radar-tema-filtro]');
    if (chipFiltro) { state.radarTema = chipFiltro.dataset.radarTemaFiltro; render(); return; }

    const chipTema = e.target.closest('[data-radar-tema]');
    if (chipTema) {
      // Un chip de tema dentro de una tarjeta activa ese filtro.
      state.radarTema = chipTema.dataset.radarTema;
      if (state.view !== 'radar') state.view = 'radar';
      render();
      return;
    }

    const leidaBtn = e.target.closest('[data-radar-leida]');
    if (leidaBtn) {
      const id = leidaBtn.dataset.radarLeida;
      const ahora = !R.leidas.has(id);
      R.marcarLeida(id, ahora);
      // Actualiza la tarjeta in situ para no perder el scroll.
      const card = leidaBtn.closest('.radar-card');
      if (card) {
        card.classList.toggle('leida', ahora);
        leidaBtn.textContent = ahora ? '↩' : '✓';
        leidaBtn.title = ahora ? 'Marcar como no leída' : 'Marcar como leída';
      }
      actualizarBadgesNav();
      const c = $('#radarContador');
      if (c) {
        const lista = radarFiltrados();
        c.textContent = `${lista.length} nota${lista.length === 1 ? '' : 's'} · ${lista.filter((n) => !R.leidas.has(n.id)).length} sin leer`;
      }
      return;
    }

    const afBtn = e.target.closest('[data-radar-afectados]');
    if (afBtn) {
      const panel = $('#af-' + afBtn.dataset.radarAfectados);
      if (panel) {
        const abierto = !panel.hidden;
        panel.hidden = abierto;
        afBtn.setAttribute('aria-expanded', String(!abierto));
      }
      return;
    }

    const tab = e.target.closest('[data-tab]');
    if (tab) {
      state.calcTab = tab.dataset.tab;
      $('#calcForm').innerHTML = formCalc(state.calcTab);
      $$('.calc-tab').forEach((b) => {
        const activo = b.dataset.tab === state.calcTab;
        b.classList.toggle('active', activo);
        b.setAttribute('aria-selected', activo);
      });
      aplicarCapturaGuardada();
      calcular();
      return;
    }

    // Cambiar estatus desde el expediente (con deshacer).
    const tog = e.target.closest('[data-toggle]');
    if (tog) {
      const c = clientePorId(tog.dataset.id);
      const campo = tog.dataset.toggle;
      if (!c) return;
      const actual = c.estatus[campo];
      if (actual === 'na') { toast('Esta obligación no aplica para el régimen del cliente.', 'warn'); return; }
      const ciclo = CICLOS[campo];
      const previo = actual;
      const etiqueta = (CAMPOS_ESTATUS.find(([k]) => k === campo) || [campo, campo])[1];
      c.estatus[campo] = ciclo[(ciclo.indexOf(actual) + 1) % ciclo.length];
      persistirClientes();
      render();
      $('#clientDrawer').innerHTML = drawerCliente(c);
      toast(`${c.nombre.split(',')[0]}: ${etiqueta} → ${SEM[c.estatus[campo]].label}`, 'ok', {
        label: 'Deshacer',
        fn: () => {
          c.estatus[campo] = previo;
          persistirClientes();
          render();
          if ($('#clientDrawer').classList.contains('open')) $('#clientDrawer').innerHTML = drawerCliente(c);
        },
      });
      return;
    }

    const fila = e.target.closest('tr[data-cliente]');
    if (fila) { abrirExpediente(fila.dataset.cliente); return; }

    const editar = e.target.closest('#btnEditarCliente');
    if (editar) { const c = clientePorId(editar.dataset.id); cerrarCapas(); if (c) abrirModalCliente(c); return; }

    const rec = e.target.closest('[data-recordar]');
    if (rec) {
      rec.textContent = 'Enviado ✓';
      rec.disabled = true;
      toast('Recordatorio enviado por WhatsApp y correo. Si no paga en 7 días, su portal se suspende solo. 📲');
      return;
    }

    const pi = e.target.closest('[data-pi]');
    if (pi) { ejecutarPaleta(Number(pi.dataset.pi)); return; }
    if (e.target.id === 'palette') { cerrarPaleta(); return; }
    if (e.target.closest('#paletteBtn')) { abrirPaleta(); return; }
    if (e.target.closest('#btnTour')) { iniciarTour(); return; }
    if (e.target.closest('#btnReset')) {
      if (confirm('¿Restablecer la demo? Se borran clientes agregados, pendientes palomeados y capturas guardadas.')) {
        Object.values(LS).forEach((k) => localStorage.removeItem(k));
        location.reload();
      }
      return;
    }

    if (e.target.closest('[data-close]') || e.target.id === 'overlay') cerrarCapas();
  });

  document.addEventListener('input', (e) => {
    if (e.target.classList?.contains('calc-in')) {
      // La captura se guarda sola: al volver a la pestaña, sigue ahí.
      calcStore[state.calcTab] = calcStore[state.calcTab] || {};
      calcStore[state.calcTab][e.target.id] = e.target.value;
      escribirLS(LS.calc, calcStore);
      calcular();
    }
    if (e.target.id === 'cRfc') validarRfcEnVivo();
    if (e.target.id === 'clienteFiltro') {
      state.busqueda = e.target.value;
      const tbody = $('#tablaClientes tbody');
      if (tbody) tbody.innerHTML = clientesTbody(filtrarClientes());
    }
    if (e.target.id === 'paletteInput') { paletaIdx = 0; pintarPaleta(e.target.value); }
  });

  /** Actualiza contador y barra de pendientes sin re-renderizar (la fila no salta). */
  function actualizarTodoUI() {
    const tareas = tareasDeHoy();
    const listas = tareas.filter((t) => hechos.has(t.id)).length;
    const badge = $('#todoBadge');
    if (badge) {
      badge.textContent = `${listas} de ${tareas.length} listos`;
      badge.className = `badge ${listas === tareas.length && tareas.length ? 'badge-ok' : 'badge-blue'}`;
    }
    const bar = $('#todoBar');
    if (bar) bar.style.width = `${tareas.length ? (listas / tareas.length) * 100 : 0}%`;
  }

  function marcarPendiente(id, hecho) {
    if (hecho) hechos.add(id);
    else hechos.delete(id);
    persistirHechos();
    const cb = document.querySelector(`.todo-check[data-tarea="${id}"]`);
    if (cb) {
      cb.checked = hecho;
      cb.closest('.todo-row')?.classList.toggle('done', hecho);
    }
    actualizarTodoUI();
  }

  document.addEventListener('change', (e) => {
    if (e.target.classList?.contains('todo-check')) {
      const id = e.target.dataset.tarea;
      marcarPendiente(id, e.target.checked);
      if (e.target.checked) {
        toast('Pendiente marcado como hecho ✅', 'ok', {
          label: 'Deshacer',
          fn: () => marcarPendiente(id, false),
        });
      }
    }
    if (e.target.id === 'calcCliente') {
      state.calcClienteId = e.target.value;
      const c = clientePorId(state.calcClienteId);
      if (c) {
        state.calcTab = TAB_POR_REGIMEN[c.regimen] || 'actividad';
        // Que el coeficiente del cliente mande sobre cualquier captura previa.
        if (c.coeficienteUtilidad && calcStore.pm) { delete calcStore.pm.inCoef; escribirLS(LS.calc, calcStore); }
      }
      render();
      if (c) toast(`Calculando para ${c.nombre.split(',')[0]} — régimen ${c.regimen}.`);
    }
    if (e.target.id === 'diotContribuyente') {
      state.diotRfc = e.target.value;
      render();
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#palette').hidden ? abrirPaleta() : cerrarPaleta();
      return;
    }
    if (e.key === 'Escape') {
      if (pasoTour >= 0) { terminarTour(); return; }
      cerrarCapas();
      return;
    }
    if (!$('#palette').hidden) {
      const res = $$('.palette-item');
      if (e.key === 'ArrowDown') { e.preventDefault(); paletaIdx = Math.min(paletaIdx + 1, res.length - 1); pintarPaleta($('#paletteInput').value); }
      if (e.key === 'ArrowUp') { e.preventDefault(); paletaIdx = Math.max(paletaIdx - 1, 0); pintarPaleta($('#paletteInput').value); }
      if (e.key === 'Enter') { e.preventDefault(); ejecutarPaleta(paletaIdx); }
    }
  });

  $('#clientForm').addEventListener('submit', guardarCliente);
  $('#hamburger').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  /* ------------------------------ Arranque -------------------------------- */
  const vistaGuardada = leerLS(LS.vista, 'resumen');
  if (VISTAS[vistaGuardada]) state.view = vistaGuardada;
  const tourVisto = leerLS(LS.tour, false);
  if (!tourVisto) state.view = 'resumen';
  render();
  if (!tourVisto) setTimeout(iniciarTour, 450);

  // El radar carga su base (JSON del repo + caché) en segundo plano y
  // refresca la vista solo si no interrumpe nada (tour cerrado).
  R.cargarBase().then(() => {
    actualizarBadgesNav();
    if (pasoTour < 0 && (state.view === 'radar' || state.view === 'resumen')) render();
  });
})();
