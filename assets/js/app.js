/* =========================================================================
 * ContaFlow — Panel del despacho (demo funcional)
 * Sin frameworks: render por vista + estado en memoria/localStorage.
 * ========================================================================= */
(function () {
  'use strict';

  const F = window.Fiscal;
  const D = window.DemoData;
  const LS_KEY = 'contaflow.clientes.v1';
  // La demo está anclada al 10-jun-2026 para que los datos cuenten una historia coherente.
  const HOY = '2026-06-10';

  /* ------------------------------ Estado --------------------------------- */
  const state = {
    view: 'resumen',
    clientes: cargarClientes(),
    filtroSem: 'todos',
    busqueda: '',
    calcTab: 'resico',
    robotCorriendo: false,
  };

  function cargarClientes() {
    const base = D.CLIENTES.map((c) => ({ ...c }));
    try {
      const extra = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      for (const e of extra) {
        const i = base.findIndex((b) => b.id === e.id);
        if (i >= 0) base[i] = { ...base[i], ...e };
        else base.push(e);
      }
    } catch (_) { /* localStorage corrupto: seguimos con demo */ }
    return base;
  }

  function persistirClientes() {
    const propios = state.clientes.filter(
      (c) => c.custom || D.CLIENTES.some((d) => d.id === c.id && JSON.stringify(d) !== JSON.stringify(c))
    );
    localStorage.setItem(LS_KEY, JSON.stringify(propios));
  }

  /* ------------------------------ Utilidades ----------------------------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );

  function toast(msg, tipo = 'ok') {
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3400);
    setTimeout(() => t.remove(), 3800);
  }

  const SEM = {
    ok:            { cls: 'ok',    dot: 'dot-ok',    label: 'Al corriente' },
    proceso:       { cls: 'warn',  dot: 'dot-warn',  label: 'En proceso' },
    pendiente:     { cls: 'bad',   dot: 'dot-bad',   label: 'Pendiente' },
    faltante:      { cls: 'bad',   dot: 'dot-bad',   label: 'Faltan docs' },
    sin_habilitar: { cls: 'bad',   dot: 'dot-bad',   label: 'Sin habilitar' },
    na:            { cls: 'muted', dot: 'dot-muted', label: 'N/A' },
    positiva:      { cls: 'ok',    dot: 'dot-ok',    label: 'Positiva' },
    negativa:      { cls: 'bad',   dot: 'dot-bad',   label: 'Negativa' },
  };
  const sem = (estado) => {
    const s = SEM[estado] || SEM.na;
    return `<span class="sem-cell"><span class="dot ${s.dot}"></span>${s.label}</span>`;
  };

  const clientePorId = (id) => state.clientes.find((c) => c.id === id);

  function salud(c) {
    // Rojo: riesgo fiscal grave. Amarillo: pendientes operativos. Verde: al día.
    if (c.riesgo69b || c.estatus.opinion32d === 'negativa' || c.estatus.buzon === 'sin_habilitar') return 'rojo';
    const vals = Object.values(c.estatus);
    if (vals.includes('pendiente') || vals.includes('faltante') || vals.includes('proceso')) return 'amarillo';
    return 'verde';
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
    const xmlHoy = cls.reduce((s, c) => s + c.xmlMes.emitidos + c.xmlMes.recibidos, 0);
    const eventos = F.generarCalendario2026().filter((e) => e.fecha >= HOY).slice(0, 4);

    const alertas = [];
    for (const c of cls) {
      if (c.riesgo69b)
        alertas.push({ tipo: 'bad', ico: '🚨', txt: `<strong>${esc(c.nombre)}</strong>: proveedor en listado 69-B presunto. Revisa los CFDI marcados antes de deducir.`, id: c.id, accion: 'Ver CFDI', vista: 'cfdi' });
      if (c.estatus.buzon === 'sin_habilitar')
        alertas.push({ tipo: 'bad', ico: '📬', txt: `<strong>${esc(c.nombre)}</strong>: buzón tributario sin habilitar. Multa de $3,850–$11,540 aplicable desde el 1-ene-2027.`, id: c.id, accion: 'Ver cliente', vista: 'clientes' });
      if (c.estatus.opinion32d === 'negativa')
        alertas.push({ tipo: 'bad', ico: '⚠️', txt: `<strong>${esc(c.nombre)}</strong>: opinión de cumplimiento (32-D) negativa. Puede perder contratos y devoluciones.`, id: c.id, accion: 'Ver cliente', vista: 'clientes' });
      if (c.estatus.docs === 'faltante')
        alertas.push({ tipo: 'warn', ico: '📁', txt: `<strong>${esc(c.nombre)}</strong>: no ha entregado documentos del periodo. Recordatorio automático activo.`, id: c.id, accion: 'Portal', vista: 'portal' });
    }
    if (vencido > 0)
      alertas.push({ tipo: 'warn', ico: '💸', txt: `Tienes <strong>${F.fmtMXN(vencido)}</strong> en igualas vencidas. La cobranza automática está trabajando por ti.`, accion: 'Cobranza', vista: 'cobranza' });

    return `
      <h1 class="view-title">Buenos días, Alejandra 👋</h1>
      <p class="view-sub">Esto es lo que ContaFlow resolvió mientras dormías — y lo que necesita tu atención hoy.</p>

      <div class="kpi-grid">
        <div class="card kpi"><div class="kpi-label">Clientes activos</div><div class="kpi-value">${cls.length}</div><div class="kpi-foot">RFCs ilimitados en tu plan</div></div>
        <div class="card kpi ${rojos.length ? 'kpi-bad' : 'kpi-ok'}"><div class="kpi-label">Semáforo en rojo</div><div class="kpi-value">${rojos.length}</div><div class="kpi-foot">${amarillos.length} en amarillo · ${cls.length - rojos.length - amarillos.length} en verde</div></div>
        <div class="card kpi"><div class="kpi-label">XML del mes</div><div class="kpi-value">${xmlHoy.toLocaleString('es-MX')}</div><div class="kpi-foot">Descarga nocturna automática 03:14 h</div></div>
        <div class="card kpi ${vencido ? 'kpi-warn' : ''}"><div class="kpi-label">Por cobrar</div><div class="kpi-value">${F.fmtMXN(porCobrar)}</div><div class="kpi-foot">${F.fmtMXN(vencido)} vencido</div></div>
      </div>

      <div class="two-col">
        <div>
          <div class="card card-pad">
            <div class="flex between"><h3>Necesita tu atención</h3><span class="badge badge-bad">${alertas.filter(a => a.tipo === 'bad').length} críticas</span></div>
            ${alertas.map((a) => `
              <div class="alert-row alert-${a.tipo}">
                <span class="a-ico">${a.ico}</span>
                <span>${a.txt}</span>
                <button class="btn btn-ghost btn-sm" data-goto="${a.vista}">${a.accion}</button>
              </div>`).join('') || '<p class="muted">Sin alertas. Todo en verde. 🎉</p>'}
          </div>

          <div class="card card-pad" style="margin-top:16px">
            <h3>Próximas obligaciones</h3>
            <div class="cal-list">
              ${eventos.map((e) => calItem(e)).join('')}
            </div>
            <div class="right" style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-goto="calendario">Ver calendario completo →</button></div>
          </div>
        </div>

        <div class="card card-pad">
          <h3>Actividad de hoy</h3>
          <ul class="feed">
            ${D.ACTIVIDAD.map((a) => `<li><span class="f-hora">${a.hora}</span><span>${a.icono} ${esc(a.texto)}</span></li>`).join('')}
          </ul>
        </div>
      </div>`;
  }

  /* ======================================================================
   * VISTA: CLIENTES
   * ==================================================================== */
  function vClientes() {
    const q = state.busqueda.trim().toLowerCase();
    let lista = state.clientes;
    if (q) lista = lista.filter((c) => c.nombre.toLowerCase().includes(q) || c.rfc.toLowerCase().includes(q));
    if (state.filtroSem !== 'todos') lista = lista.filter((c) => salud(c) === state.filtroSem);

    return `
      <div class="flex between wrap">
        <div>
          <h1 class="view-title">Clientes</h1>
          <p class="view-sub">Semáforo de cumplimiento de toda tu cartera en una sola pantalla.</p>
        </div>
        <button class="btn btn-primary" id="btnNuevoCliente">+ Nuevo cliente</button>
      </div>

      <div class="toolbar">
        ${['todos', 'rojo', 'amarillo', 'verde'].map((f) =>
          `<button class="chip-filter ${state.filtroSem === f ? 'active' : ''}" data-filtro="${f}">
            ${f === 'todos' ? `Todos (${state.clientes.length})` : `${f === 'rojo' ? '🔴' : f === 'amarillo' ? '🟡' : '🟢'} ${f[0].toUpperCase() + f.slice(1)} (${state.clientes.filter((c) => salud(c) === f).length})`}
          </button>`).join('')}
        ${q ? `<span class="badge badge-blue">Filtro: “${esc(q)}”</span>` : ''}
      </div>

      <div class="card table-wrap">
        <table class="tbl">
          <thead><tr>
            <th>Cliente</th><th>Régimen</th><th>Contabilidad</th><th>Declaración</th><th>DIOT</th><th>Buzón</th><th>32-D</th><th>Docs</th><th class="num">Iguala</th>
          </tr></thead>
          <tbody>
            ${lista.map((c) => `
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
              </tr>`).join('') || '<tr><td colspan="9" class="center muted">Sin resultados con ese filtro.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="hint" style="margin-top:10px">Haz clic en cualquier cliente para ver su expediente: obligaciones, XML, vencimientos con facilidad del 6º dígito del RFC y notas.</p>`;
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
        <button class="x-btn" data-close>✕</button>
      </div>

      ${c.riesgo69b ? '<div class="alert-row alert-bad"><span class="a-ico">🚨</span><span>Proveedor en listado <strong>69-B presunto</strong>. Hay CFDI marcados en el monitor.</span></div>' : ''}
      ${c.estatus.opinion32d === 'negativa' ? '<div class="alert-row alert-bad"><span class="a-ico">⚠️</span><span>Opinión de cumplimiento <strong>negativa</strong>. En aclaración.</span></div>' : ''}

      <div class="card card-pad" style="margin-bottom:14px">
        <h4 class="mt0">Cumplimiento del periodo</h4>
        <div class="grid" style="grid-template-columns:1fr 1fr; font-size:.88rem">
          <div>Contabilidad: ${sem(c.estatus.contabilidad)}</div>
          <div>Declaración: ${sem(c.estatus.declaracion)}</div>
          <div>DIOT: ${sem(c.estatus.diot)}</div>
          <div>Buzón: ${sem(c.estatus.buzon)}</div>
          <div>Opinión 32-D: ${sem(c.estatus.opinion32d)}</div>
          <div>Documentos: ${sem(c.estatus.docs)}</div>
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
        <button class="btn btn-primary btn-sm" data-goto="impuestos">Calcular impuestos →</button>
      </div>`;
  }

  /* ======================================================================
   * VISTA: IMPUESTOS (calculadora 2026)
   * ==================================================================== */
  function vImpuestos() {
    const tabs = [
      ['resico', 'RESICO PF'],
      ['actividad', 'Act. empresarial PF'],
      ['pm', 'Persona Moral 30%'],
      ['sueldos', 'Sueldos'],
      ['iva', 'IVA mensual'],
    ];
    return `
      <h1 class="view-title">Impuestos 2026</h1>
      <p class="view-sub">Tarifas del Anexo 8 RMF 2026 (DOF 28-dic-2025) ya cargadas — sin actualizar Excel a mano. Genera el papel de trabajo en un clic.</p>
      <div class="calc-tabs">
        ${tabs.map(([id, label]) => `<button class="calc-tab ${state.calcTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
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
        <p class="hint">El impuesto se calcula por tasa directa sobre lo cobrado, sin deducciones.</p>`,
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
        <label class="field"><span class="lbl">Coeficiente de utilidad</span>
          <input class="input calc-in" type="number" id="inCoef" value="0.0892" min="0" max="1" step="0.0001" /></label>
        <label class="field"><span class="lbl">Pagos provisionales anteriores</span>
          <input class="input calc-in" type="number" id="inPagos" value="42000" min="0" step="1000" /></label>
        <label class="field"><span class="lbl">Pérdidas fiscales por amortizar</span>
          <input class="input calc-in" type="number" id="inPerdidas" value="0" min="0" step="1000" /></label>`,
      sueldos: `
        <h3>Sueldos y salarios — retención mensual <span class="badge badge-blue">Art. 96 LISR</span></h3>
        <label class="field"><span class="lbl">Ingreso mensual gravado</span>
          <input class="input calc-in" type="number" id="inIngresos" value="28500" min="0" step="500" /></label>
        <p class="hint">Cálculo antes de subsidio al empleo. La tarifa 2026 ya incluye la actualización por inflación de 13.21%.</p>`,
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

  function calcular() {
    const num = (id) => parseFloat($(id)?.value) || 0;
    let r;
    switch (state.calcTab) {
      case 'resico':
        r = F.calcularResicoPF({ ingresosMes: num('#inIngresos'), retencionPM: num('#inRetencion') });
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
    pintarResultado(r);
  }

  function pintarResultado(r) {
    const principal = r.aCargo ?? r.isr ?? 0;
    const esFavor = r.aFavor > 0;
    const usaTarifa = ['actividad', 'sueldos'].includes(state.calcTab);
    $('#calcResult').innerHTML = `
      <div class="resultado-hero">
        <div class="rh-label">${esFavor ? 'Saldo a favor' : 'Impuesto a cargo del periodo'}</div>
        <div class="rh-value">${F.fmtMXN(esFavor ? r.aFavor : principal)}</div>
        <small style="color:#9fb0d8">${esc(r.regimen)}</small>
      </div>
      ${r.alerta ? `<div class="alert-row alert-warn"><span class="a-ico">⚠️</span><span>${esc(r.alerta)}</span></div>` : ''}
      <div class="card card-pad papel" id="papelTrabajo">
        <div class="flex between"><h3 class="mb0">Papel de trabajo</h3>
          <div class="flex">
            <button class="btn btn-ghost btn-sm" id="btnCopiarPapel">Copiar</button>
            <button class="btn btn-ghost btn-sm" onclick="window.print()">Imprimir / PDF</button>
          </div>
        </div>
        <div style="margin-top:10px">
          ${r.pasos.map(([k, v], i) => `<div class="papel-row ${i === r.pasos.length - 1 ? 'total' : ''}"><span>${esc(k)}</span><span class="mono">${esc(v)}</span></div>`).join('')}
        </div>
        <p class="hint" style="margin-top:12px">Tarifas Anexo 8 RMF 2026 · DOF 28-dic-2025 · Esta demo es informativa, no constituye asesoría fiscal.</p>
      </div>
      ${usaTarifa ? tarifaMini(r) : ''}`;
    $('#btnCopiarPapel')?.addEventListener('click', () => {
      const texto = `${r.regimen} — ContaFlow (tarifas 2026)\n` + r.pasos.map(([k, v]) => `${k}: ${v}`).join('\n');
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
      <p class="view-sub">El robot descarga los XML de todos tus clientes cada noche, con reintentos automáticos cuando el SAT se satura. Tú solo revisas los riesgos.</p>

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
        <p class="hint" style="margin:6px 0 0">Cruce diario contra listados 69-B (EFOS), cancelaciones del emisor, facturas duplicadas y pagos PPD sin complemento (REP).</p>
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

  function correrRobot() {
    if (state.robotCorriendo) return;
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
        <div class="aging-cell"><div class="ag-label">Iguala mensual total (MRR)</div><div class="ag-val">${F.fmtMXN(mrr)}</div></div>
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

          <div class="upload-zone" id="uploadZone" style="margin-top:14px">
            📎 Arrastra aquí tu estado de cuenta (PDF) o haz clic para elegir el archivo
          </div>

          <p class="hint" style="margin-top:16px">El cliente también ve aquí su línea de captura, sus declaraciones presentadas con acuse, y un chat directo contigo. Disponible con tu logo y tus colores en el plan Firma.</p>
        </div>
      </div>`;
  }

  /* ======================================================================
   * Render raíz + navegación
   * ==================================================================== */
  const VISTAS = {
    resumen: vResumen,
    clientes: vClientes,
    impuestos: vImpuestos,
    cfdi: vCfdi,
    calendario: vCalendario,
    cobranza: vCobranza,
    portal: vPortal,
  };

  function render() {
    $('#viewHost').innerHTML = VISTAS[state.view]();
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    afterRender();
    actualizarBadgesNav();
    $('#sidebar').classList.remove('open');
  }

  function actualizarBadgesNav() {
    $('#navClientes').textContent = state.clientes.length;
    $('#navCfdiAlert').textContent = D.CFDIS.filter((x) => x.riesgo).length || '';
    $('#navCobranzaAlert').textContent = D.COBRANZA.filter((f) => f.estado === 'vencida').length || '';
  }

  function afterRender() {
    if (state.view === 'impuestos') calcular();
    if (state.view === 'clientes') {
      $('#btnNuevoCliente')?.addEventListener('click', () => abrirModalCliente());
    }
    if (state.view === 'cfdi') {
      $('#btnRobot')?.addEventListener('click', correrRobot);
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
  }

  function validarRfcEnVivo() {
    const input = $('#cRfc');
    const hint = $('#rfcHint');
    const v = F.validarRFC(input.value);
    if (!input.value.trim()) {
      input.classList.remove('invalid');
      hint.className = 'hint';
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
    if (!$('#cNombre').value.trim()) { toast('Falta el nombre del cliente', 'warn'); return; }
    if (!v.valido) { toast('Revisa el RFC: ' + v.errores[0], 'warn'); return; }
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

  /* ------------------------------ Eventos globales ------------------------ */
  document.addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) { state.view = goto.dataset.goto; render(); return; }

    const nav = e.target.closest('.nav-item');
    if (nav) { state.view = nav.dataset.view; render(); return; }

    const filtro = e.target.closest('[data-filtro]');
    if (filtro) { state.filtroSem = filtro.dataset.filtro; render(); return; }

    const tab = e.target.closest('[data-tab]');
    if (tab) {
      state.calcTab = tab.dataset.tab;
      $('#calcForm').innerHTML = formCalc(state.calcTab);
      $$('.calc-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.calcTab));
      calcular();
      return;
    }

    const fila = e.target.closest('tr[data-cliente]');
    if (fila) {
      const c = clientePorId(fila.dataset.cliente);
      if (c) {
        $('#clientDrawer').innerHTML = drawerCliente(c);
        $('#overlay').classList.add('open');
        $('#clientDrawer').classList.add('open');
        $('#btnEditarCliente')?.addEventListener('click', () => { cerrarCapas(); abrirModalCliente(c); });
      }
      return;
    }

    const rec = e.target.closest('[data-recordar]');
    if (rec) {
      rec.textContent = 'Enviado ✓';
      rec.disabled = true;
      toast('Recordatorio enviado por WhatsApp y correo. Si no paga en 7 días, su portal se suspende solo. 📲');
      return;
    }

    if (e.target.closest('[data-close]') || e.target.id === 'overlay') cerrarCapas();
  });

  document.addEventListener('input', (e) => {
    if (e.target.classList?.contains('calc-in')) calcular();
    if (e.target.id === 'cRfc') validarRfcEnVivo();
    if (e.target.id === 'globalSearch') {
      state.busqueda = e.target.value;
      if (state.view !== 'clientes') state.view = 'clientes';
      render();
      const gs = $('#globalSearch');
      gs.value = state.busqueda;
      gs.focus();
      gs.setSelectionRange(gs.value.length, gs.value.length);
    }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarCapas(); });
  $('#clientForm').addEventListener('submit', guardarCliente);
  $('#hamburger').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  /* ------------------------------ Arranque -------------------------------- */
  render();
})();
