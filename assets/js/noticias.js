/* =========================================================================
 * ContaFlow — Radar fiscal (assets/js/noticias.js)
 * Monitoreo de noticias del SAT, DOF y prensa fiscal mexicana.
 *
 * A diferencia del resto de la demo, ESTE MÓDULO TRABAJA CON DATOS REALES:
 *  1) Fuente base: assets/data/noticias.json — lo regenera 2 veces al día un
 *     GitHub Action (scripts/actualizar_noticias.py) leyendo RSS reales.
 *  2) Botón "Actualizar ahora": lee los feeds desde el navegador vía un
 *     proxy CORS público y mezcla lo nuevo, sin recargar la página.
 *  3) Si todo lo anterior falla (p. ej. abriste el archivo con file://),
 *     se usa la SEMILLA embebida abajo: noticias reales de jun–jul 2026.
 *
 * El diferenciador: cada noticia se clasifica por temas y se CRUZA con la
 * cartera del despacho (régimen fiscal, riesgo 69-B) para responder la
 * pregunta que importa: "¿a cuál de MIS clientes le afecta esto?"
 * ========================================================================= */
(function () {
  'use strict';

  const norm = (s) =>
    String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /* ======================================================================
   * 1. Taxonomía de temas
   *    kw: palabras clave (sin acentos) que activan el tema.
   *    regimenes: a qué regímenes de la cartera afecta.
   *               'todos' = toda la cartera. null = no cruza con clientes.
   * ==================================================================== */
  const TEMAS = {
    '69b': {
      label: '69-B / EFOS',
      kw: ['69-b', '69 b', 'efos', 'edos', 'operaciones inexistentes', 'facturas sin capacidad', 'empresas fantasma', 'lista negra del sat', 'listado presunto'],
      regimenes: 'todos',
    },
    cfdi: {
      label: 'CFDI / Facturación',
      kw: ['cfdi', 'factura', 'facturacion', 'complemento de pago', 'ppd', 'cancelacion de factura', 'cancelaciones de factura', 'descarga masiva', 'xml', 'constancia de situacion fiscal', 'csf'],
      regimenes: 'todos',
    },
    fiscalizacion: {
      label: 'Fiscalización',
      kw: ['fiscalizacion', 'fiscalizar', 'revision', 'revisiones', 'auditoria', 'carta invitacion', 'cartas invitacion', 'vigilancia profunda', 'requerimiento', 'visita domiciliaria', 'facultades de comprobacion', 'embargo', 'credito fiscal'],
      regimenes: 'todos',
    },
    buzon: {
      label: 'Buzón tributario',
      kw: ['buzon tributario', 'buzon fiscal'],
      regimenes: 'todos',
    },
    cff: {
      label: 'CFF / Reformas',
      kw: ['codigo fiscal', 'cff', 'reforma fiscal', 'paquete economico', 'miscelanea fiscal', 'rmf', 'iniciativa fiscal', 'decreto'],
      regimenes: 'todos',
    },
    isr: {
      label: 'ISR',
      kw: ['isr', 'impuesto sobre la renta', 'tarifa', 'tarifas', 'coeficiente de utilidad', 'pagos provisionales'],
      regimenes: 'todos',
    },
    iva: {
      label: 'IVA',
      kw: ['iva', 'impuesto al valor agregado', 'acreditamiento', 'acreditar', 'tasa cero', 'diot'],
      regimenes: 'todos',
    },
    resico: {
      label: 'RESICO',
      kw: ['resico', 'regimen simplificado de confianza'],
      regimenes: ['RESICO PF', 'RESICO PM'],
    },
    pm: {
      label: 'Personas morales',
      kw: ['personas morales', 'persona moral'],
      regimenes: ['General de Ley PM', 'RESICO PM'],
    },
    nominas: {
      label: 'Nóminas / IMSS',
      kw: ['imss', 'infonavit', 'nomina', 'nominas', 'cuotas obrero', 'sueldos', 'salario minimo', 'aguinaldo', 'ptu', 'pension', 'semanas cotizadas', 'subcontratacion', 'repse'],
      regimenes: ['General de Ley PM', 'RESICO PM', 'Sueldos y salarios'],
    },
    plataformas: {
      label: 'Plataformas digitales',
      kw: ['plataformas tecnologicas', 'plataformas digitales', 'plataforma digital', 'uber', 'didi', 'rappi', 'airbnb', 'mercado libre'],
      regimenes: ['Plataformas tecnológicas'],
    },
    arrendamiento: {
      label: 'Arrendamiento',
      kw: ['arrendamiento', 'arrendador', 'renta de inmuebles'],
      regimenes: ['Arrendamiento'],
    },
    anualpf: {
      label: 'Anual / Deducciones PF',
      kw: ['declaracion anual', 'deducciones personales', 'devolucion de saldo', 'saldo a favor'],
      regimenes: ['RESICO PF', 'Actividad Empresarial y Profesional', 'Sueldos y salarios', 'Arrendamiento', 'Plataformas tecnológicas'],
    },
    satServicios: {
      label: 'Portal / servicios SAT',
      kw: ['portal del sat', 'caida del sat', 'intermitencia', 'citas del sat', 'retrasos del sat', 'fallas del sat', 'e.firma', 'efirma', 'contrasena del sat'],
      regimenes: 'todos',
    },
    comercioExt: {
      label: 'Comercio exterior',
      kw: ['aduana', 'aduanas', 'arancel', 'aranceles', 'comercio exterior', 'importacion', 'pedimento', 'anexo 24'],
      regimenes: null,
    },
    cripto: {
      label: 'Criptoactivos',
      kw: ['cripto', 'criptomoneda', 'bitcoin', 'exchanges', 'activos virtuales'],
      regimenes: null,
    },
  };

  // Señales de urgencia: si aparecen, la noticia sube a impacto ALTO.
  const KW_ALTO = [
    'multa', 'multas', 'sancion', 'entra en vigor', 'entrara en vigor', 'obligatorio',
    'plazo', 'fecha limite', 'vence', 'endurece', 'cancelar rfc', 'suspender', 'suspension',
    'restriccion de sellos', 'nueva obligacion', 'prorroga', 'listado presunto', 'embargo',
  ];
  const TEMAS_ALTO = ['69b', 'cff', 'fiscalizacion', 'satServicios'];
  const TEMAS_MEDIO = ['cfdi', 'isr', 'iva', 'resico', 'nominas', 'buzon', 'anualpf', 'pm', 'plataformas', 'arrendamiento'];

  function clasificar(texto) {
    const t = ' ' + norm(texto) + ' ';
    const temas = [];
    for (const [id, def] of Object.entries(TEMAS)) {
      if (def.kw.some((k) => t.includes(k))) temas.push(id);
    }
    return temas;
  }

  function calcularImpacto(texto, temas) {
    const t = norm(texto);
    if (temas.some((x) => TEMAS_ALTO.includes(x)) || KW_ALTO.some((k) => t.includes(k))) return 'alto';
    if (temas.some((x) => TEMAS_MEDIO.includes(x))) return 'medio';
    return 'info';
  }

  /* ======================================================================
   * 2. Cruce noticia ↔ cartera
   *    Devuelve { clientes: [...], total, esToda, urgentes: [...] }
   * ==================================================================== */
  function clientesAfectados(noticia, cartera) {
    const regs = new Set();
    let toda = false;
    for (const id of noticia.temas || []) {
      const def = TEMAS[id];
      if (!def || def.regimenes == null) continue;
      if (def.regimenes === 'todos') { toda = true; break; }
      def.regimenes.forEach((r) => regs.add(r));
    }
    const lista = toda ? [...cartera] : cartera.filter((c) => regs.has(c.regimen));
    // Con noticias 69-B, los clientes que YA tienen bandera de riesgo van primero.
    const urgentes = (noticia.temas || []).includes('69b')
      ? lista.filter((c) => c.riesgo69b)
      : [];
    lista.sort((a, b) => (b.riesgo69b === true) - (a.riesgo69b === true) || a.nombre.localeCompare(b.nombre, 'es'));
    return { clientes: lista, total: lista.length, esToda: toda && lista.length === cartera.length, urgentes };
  }

  /* ======================================================================
   * 3. Semilla — noticias fiscales REALES (jun–jul 2026)
   *    Verificadas contra El Contribuyente al construir este módulo.
   *    El pipeline las reemplaza/renueva; esto solo garantiza que el radar
   *    nunca se vea vacío, ni siquiera sin conexión.
   * ==================================================================== */
  const SEMILLA = [
    {
      id: 'sem-efos-64',
      fecha: '2026-07-08',
      fuente: 'El Contribuyente',
      titulo: 'El SAT publica en el DOF listado presunto de 64 contribuyentes por facturas sin capacidad real (69-B)',
      resumen: 'Los señalados como presuntos EFOS tienen 15 días hábiles para desvirtuar los hechos. Revisa si algún proveedor de tus clientes aparece en la lista antes de que las deducciones queden en riesgo.',
      url: 'https://www.elcontribuyente.mx/sat/',
      temas: ['69b', 'cfdi', 'fiscalizacion'],
      impacto: 'alto',
    },
    {
      id: 'sem-descarga-retrasos',
      fecha: '2026-07-10',
      fuente: 'El Contribuyente',
      titulo: 'Retrasos en la descarga masiva del SAT: hasta seis días por paquete solicitado',
      resumen: 'El Web Service de descarga masiva acumula demoras de varios días por paquete. Si dependes de los XML para conciliar el mes, programa las solicitudes con anticipación y no dejes el cierre para el día 15.',
      url: 'https://www.elcontribuyente.mx/2026/07/descarga-masiva-que-no-colapsa/',
      temas: ['cfdi', 'satServicios'],
      impacto: 'alto',
    },
    {
      id: 'sem-fiscalizacion-inteligente',
      fecha: '2026-06-24',
      fuente: 'El Contribuyente',
      titulo: 'El SAT ya no espera errores evidentes: así funciona la fiscalización inteligente',
      resumen: 'Con cruces de información, inteligencia fiscal y nuevas facultades, el SAT detecta riesgos en tiempo récord mediante revisiones exprés. Lo que empresas y contadores deben saber para no ser tomados por sorpresa.',
      url: 'https://www.elcontribuyente.mx/2026/06/el-sat-ya-no-espera-errores-evidentes-asi-funciona-la-fiscalizacion-inteligente/',
      temas: ['fiscalizacion'],
      impacto: 'alto',
    },
    {
      id: 'sem-cartas-invitacion',
      fecha: '2026-06-15',
      fuente: 'El Contribuyente',
      titulo: 'Cartas invitación de vigilancia profunda del SAT: no las ignores, pero tampoco entregues información de más',
      resumen: 'Recibir una notificación del SAT genera preocupación entendible. La recomendación: atender en plazo, acotar la respuesta a lo solicitado y documentar todo. Ignorarla escala el asunto; sobreexponerse abre frentes nuevos.',
      url: 'https://www.elcontribuyente.mx/2026/06/cartas-invitacion-de-vigilancia-profunda-del-sat-no-las-ignores-pero-tampoco-entregues-informacion-de-mas/',
      temas: ['fiscalizacion', 'buzon'],
      impacto: 'medio',
    },
    {
      id: 'sem-paquete-2026-cff',
      fecha: '2025-11-12',
      fuente: 'El Contribuyente',
      titulo: 'Paquete Económico 2026 endurece el CFF: el SAT puede negar o cancelar RFC ligados a EFOS/EDOS y suspender facturación',
      resumen: 'Las reformas al Código Fiscal vigentes en 2026 amplían facultades: negativa o cancelación de RFC a empresas vinculadas con factureras, suspensión de emisión de CFDI y visitas domiciliarias con plazos acotados.',
      url: 'https://www.elcontribuyente.mx/sat/',
      temas: ['cff', '69b', 'fiscalizacion'],
      impacto: 'alto',
    },
    {
      id: 'sem-tarifas-isr-2026',
      fecha: '2026-01-05',
      fuente: 'El Contribuyente',
      titulo: 'Tarifas de ISR para personas físicas se actualizan en 2026 tras acumularse más de 10% de inflación',
      resumen: 'Desde enero de 2026 aplican tarifas actualizadas de ISR para personas físicas. Verifica que tus papeles de trabajo y sistemas usen el Anexo 8 vigente: usar la tabla anterior genera diferencias en cada pago provisional.',
      url: 'https://www.elcontribuyente.mx/tablas-isr/',
      temas: ['isr', 'cff'],
      impacto: 'alto',
    },
    {
      id: 'sem-resico-44m',
      fecha: '2026-06-02',
      fuente: 'El Contribuyente',
      titulo: 'El RESICO alcanza 4.4 millones de contribuyentes al cierre de abril de 2026',
      resumen: 'El régimen simplificado ya supera al Repeco y al RIF en padrón. La informalidad, sin embargo, apenas bajó 4.7 puntos en 16 años. Para despachos: el flujo de altas RESICO sigue siendo la puerta de entrada de clientes nuevos.',
      url: 'https://www.elcontribuyente.mx/',
      temas: ['resico'],
      impacto: 'medio',
    },
    {
      id: 'sem-cripto-exchanges',
      fecha: '2026-05-20',
      fuente: 'El Contribuyente',
      titulo: 'El SAT ya recibe datos de exchanges en 2026: cómo tributa operar Bitcoin spot frente a CFDs',
      resumen: 'Con el intercambio de información de plataformas cripto, las diferencias fiscales entre comprar el activo y operar derivados dejan de ser teóricas. Si algún cliente opera cripto, este es el año para ordenar su expediente.',
      url: 'https://www.elcontribuyente.mx/lo-ultimo/',
      temas: ['cripto', 'isr'],
      impacto: 'medio',
    },
    {
      id: 'sem-iva-deducciones',
      fecha: '2026-07-06',
      fuente: 'El Contribuyente',
      titulo: 'Acreditar el IVA de deducciones personales: tiene base legal, pero el SAT lo rechaza en revisiones',
      resumen: 'La postura de acreditar IVA vinculado a deducciones personales encuentra sustento normativo, pero en la práctica la autoridad lo objeta. Evalúa costo-beneficio y el apetito de riesgo del cliente antes de aplicarlo.',
      url: 'https://www.elcontribuyente.mx/lo-ultimo/',
      temas: ['iva', 'anualpf'],
      impacto: 'medio',
    },
    {
      id: 'sem-csf-multa',
      fecha: '2026-06-10',
      fuente: 'El Contribuyente',
      titulo: 'Proponen multar a quien condicione la emisión de un CFDI a exigir la constancia de situación fiscal',
      resumen: 'La iniciativa en el Congreso modificaría el CFF: el emisor puede validar datos del receptor sin exigir la CSF completa. De aprobarse, cambia el guion de facturación que muchos negocios siguen usando.',
      url: 'https://www.elcontribuyente.mx/sat/',
      temas: ['cfdi', 'cff'],
      impacto: 'medio',
    },
    {
      id: 'sem-herencias-debate',
      fecha: '2026-07-10',
      fuente: 'El Contribuyente',
      titulo: '¿Hay impuesto a las herencias en México? Esto dice la ley y por qué volvió el debate',
      resumen: 'La exención de ISR aplica al recibir la herencia, no al aprovecharla. Así funciona hoy el régimen fiscal de las sucesiones y qué propuesta reabrió la discusión pública.',
      url: 'https://www.elcontribuyente.mx/2026/07/hay-impuesto-a-las-herencias-en-mexico-esto-dice-la-ley-y-por-que-volvio-el-debate/',
      temas: ['isr'],
      impacto: 'medio',
    },
    {
      id: 'sem-herencias-sheinbaum',
      fecha: '2026-07-10',
      fuente: 'El Contribuyente',
      titulo: 'Sheinbaum cierra el debate: el gobierno no gravará herencias ni Afores',
      resumen: 'Tras la propuesta de gravar herencias para reducir desigualdad, la presidenta descartó la medida y señaló que, de requerir mayor recaudación, se buscarían otras alternativas.',
      url: 'https://www.elcontribuyente.mx/2026/07/sheinbaum-cierra-el-debate-el-gobierno-no-gravara-herencias-ni-afores/',
      temas: [],
      impacto: 'info',
    },
    {
      id: 'sem-afores-isr-jueces',
      fecha: '2026-07-09',
      fuente: 'El Contribuyente',
      titulo: 'Jueces rechazan que las Afores hereden la retención de ISR: los tribunales no recaudan',
      resumen: 'Resoluciones judiciales acotan el papel de las administradoras en retenciones de ISR sobre recursos heredados, delimitando responsabilidades entre Afore, beneficiario y autoridad fiscal.',
      url: 'https://www.elcontribuyente.mx/2026/07/jueces-rechazan-que-afores-hereden-isr-los-tribunales-no-recaudan/',
      temas: ['isr'],
      impacto: 'medio',
    },
    {
      id: 'sem-imss-coyotes',
      fecha: '2026-07-10',
      fuente: 'El Contribuyente',
      titulo: 'IMSS advierte: los "coyotes" que ofrecen semanas cotizadas pueden costarte la pensión',
      resumen: 'Trabajadores recurren a intermediarios para reactivar semanas de cotización. El Instituto alerta que esas gestiones irregulares pueden anular derechos. Vale avisar a clientes con trabajadores cerca del retiro.',
      url: 'https://www.elcontribuyente.mx/2026/07/imss-advierte-los-coyotes-que-ofrecen-semanas-pueden-quitarte-tu-pension/',
      temas: ['nominas'],
      impacto: 'medio',
    },
  ];

  /* ======================================================================
   * 4. Fuentes para "Actualizar ahora" (lectura en el navegador)
   *    Se leen vía proxy CORS público. Si una falla, se salta sin drama.
   * ==================================================================== */
  const FUENTES_VIVO = [
    { nombre: 'El Contribuyente', tipo: 'rss', urls: ['https://www.elcontribuyente.mx/feed/', 'https://www.elcontribuyente.mx/feed'] },
    { nombre: 'DOF', tipo: 'rss', urls: ['https://www.dof.gob.mx/sumario.xml', 'https://dof.gob.mx/index.php/sumario.xml'] },
    { nombre: 'IDC Online', tipo: 'rss', urls: ['https://idconline.mx/feed'] },
  ];
  const PROXY = (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`;

  const LSK = {
    cache: 'contaflow.radar.cache.v1',
    leidas: 'contaflow.radar.leidas.v1',
  };
  const leerLS = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (_) { return def; } };
  const escribirLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  /* ------------------------- Normalización / dedup ----------------------- */
  const claveDe = (n) => norm(n.titulo).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);

  function mezclar(base, extra) {
    const mapa = new Map();
    for (const n of [...base, ...extra]) {
      const k = claveDe(n);
      if (!k) continue;
      const previa = mapa.get(k);
      // Ante duplicado, gana la de fecha más reciente / con URL más específica.
      if (!previa || (n.fecha || '') > (previa.fecha || '')) mapa.set(k, n);
    }
    return [...mapa.values()]
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
      .slice(0, 120);
  }

  function completar(n) {
    // Garantiza temas/impacto aunque la fuente no los traiga.
    const texto = `${n.titulo} ${n.resumen || ''}`;
    const temas = n.temas && n.temas.length ? n.temas : clasificar(texto);
    const impacto = n.impacto || calcularImpacto(texto, temas);
    return { ...n, temas, impacto };
  }

  /* --------------------------- Carga de la base -------------------------- */
  let items = SEMILLA.map(completar);
  let origen = 'semilla';
  let actualizadoEn = null;

  async function cargarBase() {
    // 1) Caché de un refresco en vivo previo (lo más fresco que tenemos).
    const cache = leerLS(LSK.cache, null);
    // 2) JSON del repo, regenerado por el GitHub Action.
    try {
      const r = await fetch('assets/data/noticias.json', { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.items) && data.items.length) {
          items = mezclar(data.items.map(completar), items);
          origen = 'repo';
          actualizadoEn = data.generado || null;
        }
      }
    } catch (_) { /* file:// o sin red: seguimos con la semilla */ }
    if (cache && Array.isArray(cache.items) && cache.items.length) {
      items = mezclar(cache.items.map(completar), items);
      if ((cache.fetchedAt || '') > (actualizadoEn || '')) {
        origen = 'vivo';
        actualizadoEn = cache.fetchedAt;
      }
    }
    return items;
  }

  /* ------------------------ Actualización en vivo ------------------------ */
  function parsearFeed(xmlTexto, nombreFuente) {
    const doc = new DOMParser().parseFromString(xmlTexto, 'text/xml');
    if (doc.querySelector('parsererror')) return [];
    const nodos = [...doc.querySelectorAll('item, entry')].slice(0, 25);
    return nodos.map((el) => {
      const g = (sel) => el.querySelector(sel)?.textContent?.trim() || '';
      const titulo = g('title');
      let url = g('link');
      if (!url) url = el.querySelector('link')?.getAttribute('href') || '';
      const desc = g('description') || g('summary') || '';
      const fechaRaw = g('pubDate') || g('published') || g('updated') || g('dc\\:date');
      const d = fechaRaw ? new Date(fechaRaw) : null;
      const fecha = d && !isNaN(d) ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const resumen = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260);
      return completar({
        id: 'vivo-' + claveDe({ titulo }).replace(/\s+/g, '-').slice(0, 60),
        fecha, fuente: nombreFuente, titulo, resumen, url,
      });
    }).filter((n) => n.titulo && n.url);
  }

  async function actualizarEnVivo() {
    const nuevas = [];
    const errores = [];
    for (const f of FUENTES_VIVO) {
      let ok = false;
      for (const u of f.urls) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 12000);
          const r = await fetch(PROXY(u), { signal: ctrl.signal });
          clearTimeout(t);
          if (!r.ok) continue;
          const txt = await r.text();
          const parseadas = parsearFeed(txt, f.nombre);
          if (parseadas.length) { nuevas.push(...parseadas); ok = true; break; }
        } catch (_) { /* siguiente URL de la fuente */ }
      }
      if (!ok) errores.push(f.nombre);
    }
    if (nuevas.length) {
      const antes = items.length;
      const clavesPrevias = new Set(items.map(claveDe));
      items = mezclar(items, nuevas);
      const agregadas = nuevas.filter((n) => !clavesPrevias.has(claveDe(n))).length;
      actualizadoEn = new Date().toISOString();
      origen = 'vivo';
      escribirLS(LSK.cache, { items, fetchedAt: actualizadoEn });
      return { agregadas, total: items.length - antes >= 0 ? items.length : antes, errores };
    }
    return { agregadas: 0, errores };
  }

  /* ------------------------------ Leídas --------------------------------- */
  const leidas = new Set(leerLS(LSK.leidas, []));
  const marcarLeida = (id, valor = true) => {
    if (valor) leidas.add(id); else leidas.delete(id);
    escribirLS(LSK.leidas, [...leidas]);
  };

  /* ------------------------------ Fechas --------------------------------- */
  function fechaRelativa(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (dias < 0) return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'ayer';
    if (dias < 7) return `hace ${dias} días`;
    if (dias < 30) return `hace ${Math.floor(dias / 7)} sem`;
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  }

  /* ------------------------------- API ----------------------------------- */
  window.Radar = {
    TEMAS,
    cargarBase,
    actualizarEnVivo,
    get items() { return items; },
    get origen() { return origen; },
    get actualizadoEn() { return actualizadoEn; },
    clientesAfectados,
    leidas,
    marcarLeida,
    fechaRelativa,
  };
})();
