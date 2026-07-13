/* =========================================================================
 * ContaFlow — Generador de DIOT (Declaración Informativa de Operaciones
 * con Terceros) a partir de los CFDI ya parseados, 100% en el navegador.
 * -------------------------------------------------------------------------
 * La DIOT reporta el IVA de los GASTOS (facturas RECIBIDAS) agrupado por
 * proveedor. Aquí:
 *   1) Detectamos para qué contribuyente armar la DIOT (su RFC como receptor).
 *   2) Agrupamos sus gastos por RFC de proveedor y sumamos las bases por tasa
 *      (16 % / 8 % / 0 % / exento) y las retenciones.
 *   3) Generamos el archivo .txt de carga batch.
 *
 * ⚠️ FORMATO DEL .txt (nueva plataforma SAT 2025): son 54 campos separados
 * por "|", en UTF-8 y con montos SIN decimales. El ORDEN EXACTO de las 54
 * columnas debe cotejarse contra el "Instructivo para el armado del archivo
 * de carga masiva" del SAT antes de presentar de verdad. Para facilitar ese
 * ajuste, el mapeo está centralizado en la constante COL (abajo): cuando
 * tengas el instructivo, corriges los índices en un solo lugar.
 * ========================================================================= */
(function (global) {
  'use strict';

  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  // Catálogos del SAT.
  const TIPO_OPERACION_DEFAULT = '85'; // 85 = Otros (03 = serv. profesionales, 06 = arrendamiento)
  const RFC_GENERICO_NACIONAL = 'XAXX010101000';
  const RFC_GENERICO_EXTRANJERO = 'XEXX010101000';

  const round0 = (n) => String(Math.round(n || 0)); // montos enteros (sin decimales)

  // Validación mínima de RFC para las alertas (autónoma; no depende de Fiscal).
  const RFC_OK = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

  /** Clasifica al tercero por su RFC (nacional / extranjero / global). */
  function clasificarTercero(rfc) {
    if (rfc === RFC_GENERICO_EXTRANJERO) return { clave: '05', label: 'Extranjero' };
    if (rfc === RFC_GENERICO_NACIONAL) return { clave: '15', label: 'Global' };
    return { clave: '04', label: 'Nacional' };
  }

  /** Lista de contribuyentes candidatos: los RFC que aparecen como RECEPTOR
   *  en CFDI de gasto, con cuántos gastos tiene cada uno. */
  function detectarContribuyentes(cfdis) {
    const map = new Map();
    for (const x of cfdis) {
      if (!x.ok || (x.tipo !== 'I' && x.tipo !== 'E')) continue;
      const rfc = x.receptor && x.receptor.rfc;
      if (!rfc) continue;
      const e = map.get(rfc) || { rfc, nombre: x.receptor.nombre || rfc, gastos: 0 };
      e.gastos++;
      map.set(rfc, e);
    }
    return [...map.values()].sort((a, b) => b.gastos - a.gastos);
  }

  /** Detecta el periodo (mes/año) más frecuente de una lista de CFDI. */
  function detectarPeriodo(cfdis) {
    const cuenta = {};
    for (const x of cfdis) {
      const p = (x.fecha || '').slice(0, 7); // "AAAA-MM"
      if (p) cuenta[p] = (cuenta[p] || 0) + 1;
    }
    const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
    if (!top) return { anio: '', mes: '', label: 'sin fecha' };
    const [anio, mes] = top[0].split('-');
    return { anio, mes, label: `${MESES[parseInt(mes, 10) - 1] || mes} ${anio}` };
  }

  /**
   * Arma el cuadre de la DIOT para un contribuyente.
   * Incluye los gastos PUE (efectivamente pagados). Los PPD se reportan aparte
   * porque solo entran a la DIOT del mes en que se pagan (tendrán su REP).
   */
  function agruparPorProveedor(cfdis, rfcContribuyente) {
    const gastos = cfdis.filter(
      (x) => x.ok && (x.tipo === 'I' || x.tipo === 'E') &&
        x.receptor && x.receptor.rfc === rfcContribuyente
    );
    const incluidos = gastos.filter((x) => x.metodoPago !== 'PPD'); // PUE o sin método
    const ppd = gastos.filter((x) => x.metodoPago === 'PPD');
    const notasCredito = incluidos.filter((x) => x.tipo === 'E');

    // Agrupar por RFC de proveedor (emisor).
    const porRfc = new Map();
    for (const x of incluidos) {
      const rfc = (x.emisor && x.emisor.rfc) || 'SIN-RFC';
      const p = porRfc.get(rfc) || {
        rfc,
        nombre: (x.emisor && x.emisor.nombre) || rfc,
        tipoTercero: clasificarTercero(rfc).clave,
        tipoTerceroLabel: clasificarTercero(rfc).label,
        tipoOperacion: TIPO_OPERACION_DEFAULT,
        base16: 0, iva16: 0, base8: 0, iva8: 0, base0: 0, baseExento: 0,
        retIva: 0, retIsr: 0, numCfdi: 0,
      };
      const im = x.impuestos;
      p.base16 += im.iva16.base; p.iva16 += im.iva16.importe;
      p.base8 += im.iva8.base; p.iva8 += im.iva8.importe;
      p.base0 += im.iva0.base;
      p.baseExento += im.exento.base;
      p.retIva += im.retIva; p.retIsr += im.retIsr;
      p.numCfdi++;
      porRfc.set(rfc, p);
    }
    const proveedores = [...porRfc.values()].sort((a, b) => b.iva16 - a.iva16);

    // Totales.
    const T = { base16: 0, iva16: 0, base8: 0, iva8: 0, base0: 0, baseExento: 0, retIva: 0, retIsr: 0 };
    for (const p of proveedores) {
      T.base16 += p.base16; T.iva16 += p.iva16;
      T.base8 += p.base8; T.iva8 += p.iva8;
      T.base0 += p.base0; T.baseExento += p.baseExento;
      T.retIva += p.retIva; T.retIsr += p.retIsr;
    }
    T.ivaAcreditable = T.iva16 + T.iva8;
    T.baseTotal = T.base16 + T.base8 + T.base0 + T.baseExento;
    T.numProveedores = proveedores.length;
    T.numCfdi = incluidos.length;

    // Alertas de cuadre.
    const alertas = [];
    for (const p of proveedores) {
      if (!RFC_OK.test(p.rfc)) alertas.push(`El proveedor "${p.nombre}" tiene un RFC con estructura inválida (${p.rfc}).`);
    }
    if (ppd.length) {
      const m = ppd.reduce((s, x) => s + x.total, 0);
      alertas.push(`${ppd.length} gasto(s) PPD por ${m.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} no se incluyen aún: entran a la DIOT del mes en que se paguen (cuando tengan su REP).`);
    }
    if (notasCredito.length) {
      alertas.push(`${notasCredito.length} nota(s) de crédito (Egreso) detectada(s): revisa que el signo reste correctamente en tu DIOT.`);
    }
    if (!proveedores.length) {
      alertas.push('No hay gastos PUE para este contribuyente en los XML cargados.');
    }

    return {
      contribuyente: { rfc: rfcContribuyente, nombre: gastos[0] ? gastos[0].receptor.nombre : rfcContribuyente },
      periodo: detectarPeriodo(incluidos.length ? incluidos : gastos),
      proveedores,
      ppd,
      totales: T,
      alertas,
    };
  }

  /* ----------------------- Generación del archivo .txt ------------------- */
  // Mapeo de las 54 columnas (índice 0-based). Solo se llenan las clave; el
  // resto van vacías (la mayoría son opcionales). ⚠️ Cotejar el ORDEN contra
  // el instructivo oficial del SAT — se ajusta aquí, en un solo lugar.
  const COL = {
    tipoTercero: 0,
    tipoOperacion: 1,
    rfc: 2,
    idFiscalExtranjero: 3,
    nombreExtranjero: 4,
    paisResidencia: 5,
    nacionalidad: 6,
    valorActos16: 7,       // base gravable a 16 %
    ivaAcreditable16: 8,
    valorActos8: 9,        // base a 8 % (frontera)
    ivaAcreditable8: 10,
    valorActos0: 11,       // base a 0 %
    valorActosExento: 12,  // base exenta
    ivaRetenido: 13,
  };
  const TOTAL_COLUMNAS = 54;

  function generarLinea(p) {
    const campos = new Array(TOTAL_COLUMNAS).fill('');
    campos[COL.tipoTercero] = p.tipoTercero;
    campos[COL.tipoOperacion] = p.tipoOperacion;
    campos[COL.rfc] = p.rfc;
    campos[COL.valorActos16] = round0(p.base16);
    campos[COL.ivaAcreditable16] = round0(p.iva16);
    campos[COL.valorActos8] = round0(p.base8);
    campos[COL.ivaAcreditable8] = round0(p.iva8);
    campos[COL.valorActos0] = round0(p.base0);
    campos[COL.valorActosExento] = round0(p.baseExento);
    campos[COL.ivaRetenido] = round0(p.retIva);
    return campos.join('|');
  }

  /** Devuelve el contenido del .txt (una línea por proveedor). */
  function generarTxt(resumen) {
    return resumen.proveedores.map(generarLinea).join('\n');
  }

  /** Nombre sugerido del archivo: DIOT_RFC_AAAAMM.txt */
  function nombreArchivo(resumen) {
    const { rfc } = resumen.contribuyente;
    const { anio, mes } = resumen.periodo;
    return `DIOT_${rfc || 'CONTRIBUYENTE'}_${anio}${mes}.txt`;
  }

  global.DIOT = {
    detectarContribuyentes,
    agruparPorProveedor,
    generarTxt,
    nombreArchivo,
    COL,
    TOTAL_COLUMNAS,
  };
})(window);
