/* =========================================================================
 * ContaFlow — Parser de CFDI 4.0 (100% en el navegador)
 * -------------------------------------------------------------------------
 * Lee XML de comprobantes (Ingreso, Egreso, Pago, Nómina) y extrae lo que
 * el despacho necesita: emisor/receptor, totales, método de pago (PUE/PPD),
 * desglose de IVA (16 % / 8 % / 0 % / exento) y retenciones (IVA e ISR),
 * el UUID del timbre y —para los comprobantes de Pago— los documentos
 * relacionados (la base para validar REP más adelante).
 *
 * PRIVACIDAD: no sube nada a ningún servidor. Usa el DOMParser que ya trae
 * el navegador, así que los XML nunca salen del equipo del usuario.
 * ========================================================================= */
(function (global) {
  'use strict';

  // URIs oficiales del SAT (son fijas). Las dejamos como referencia, pero la
  // lectura real ignora el prefijo del namespace para tolerar XML "editados"
  // o mal formados por proveedores que no respetan el estándar.
  const NS = {
    cfdi: 'http://www.sat.gob.mx/cfd/4',
    tfd: 'http://www.sat.gob.mx/TimbreFiscalDigital',
    pagos20: 'http://www.sat.gob.mx/Pagos20',
  };

  const TIPOS = { I: 'Ingreso', E: 'Egreso', T: 'Traslado', N: 'Nómina', P: 'Pago' };

  /* ---------- Utilidades de lectura del DOM (tolerantes a prefijos) ------- */

  // Hijos DIRECTOS con cierto nombre local (ignora el prefijo del namespace).
  // Clave para no confundir el nodo <Impuestos> del comprobante con los
  // <Impuestos> que cuelgan de cada <Concepto>.
  function hijos(nodo, local) {
    if (!nodo) return [];
    return Array.from(nodo.children).filter((n) => n.localName === local);
  }
  const hijo = (nodo, local) => hijos(nodo, local)[0] || null;

  // Primer descendiente con cierto nombre local, a cualquier profundidad.
  function buscar(nodo, local) {
    if (!nodo) return null;
    const els = nodo.getElementsByTagNameNS('*', local);
    return els.length ? els[0] : null;
  }
  // Todos los descendientes con cierto nombre local.
  function buscarTodos(nodo, local) {
    if (!nodo) return [];
    return Array.from(nodo.getElementsByTagNameNS('*', local));
  }

  const attr = (el, nombre) => (el && el.getAttribute(nombre)) || '';
  const num = (v) => {
    const n = parseFloat(v);
    return isFinite(n) ? n : 0;
  };

  /* --------------------------- Desglose de impuestos --------------------- */
  // Agrupa los traslados y retenciones del nodo <Impuestos> del comprobante.
  // Devuelve las BASES por tasa (lo que pide la DIOT) además de los importes.
  function leerImpuestos(comprobante) {
    const out = {
      iva16: { base: 0, importe: 0 },
      iva8: { base: 0, importe: 0 },
      iva0: { base: 0, importe: 0 },
      exento: { base: 0 }, // exento solo tiene base, no importe
      ieps: { base: 0, importe: 0 },
      retIva: 0,
      retIsr: 0,
      trasladadoTotal: 0,
      retenidoTotal: 0,
    };
    const imp = hijo(comprobante, 'Impuestos'); // <- nivel comprobante, no concepto
    if (!imp) return out;

    // --- Traslados (IVA / IEPS que se cobran) ---
    for (const t of buscarTodos(hijo(imp, 'Traslados'), 'Traslado')) {
      const impuesto = attr(t, 'Impuesto'); // 002 = IVA, 003 = IEPS
      const factor = attr(t, 'TipoFactor'); // Tasa / Cuota / Exento
      const tasa = num(attr(t, 'TasaOCuota'));
      const base = num(attr(t, 'Base'));
      const importe = num(attr(t, 'Importe'));
      if (impuesto === '002') {
        if (factor === 'Exento') out.exento.base += base;
        else if (Math.abs(tasa - 0.16) < 1e-6) { out.iva16.base += base; out.iva16.importe += importe; }
        else if (Math.abs(tasa - 0.08) < 1e-6) { out.iva8.base += base; out.iva8.importe += importe; }
        else if (Math.abs(tasa) < 1e-6) { out.iva0.base += base; out.iva0.importe += importe; }
        out.trasladadoTotal += importe;
      } else if (impuesto === '003') {
        out.ieps.base += base; out.ieps.importe += importe;
        out.trasladadoTotal += importe;
      }
    }

    // --- Retenciones (IVA / ISR que te retienen) ---
    for (const r of buscarTodos(hijo(imp, 'Retenciones'), 'Retencion')) {
      const impuesto = attr(r, 'Impuesto'); // 001 = ISR, 002 = IVA
      const importe = num(attr(r, 'Importe'));
      if (impuesto === '001') out.retIsr += importe;
      else if (impuesto === '002') out.retIva += importe;
      out.retenidoTotal += importe;
    }
    return out;
  }

  /* --------------------------- Complemento de Pago (REP) ----------------- */
  // Solo aplica a comprobantes tipo "P". Cada pago puede saldar varios
  // documentos (PPD); guardamos el UUID de cada uno para cruzarlos después.
  function leerPagos(comprobante) {
    const comp = hijo(comprobante, 'Complemento');
    const pagosNodo = buscar(comp, 'Pagos');
    if (!pagosNodo) return [];
    return buscarTodos(pagosNodo, 'Pago').map((p) => ({
      fecha: attr(p, 'FechaPago'),
      monto: num(attr(p, 'Monto')),
      forma: attr(p, 'FormaDePagoP'),
      moneda: attr(p, 'MonedaP'),
      relacionados: buscarTodos(p, 'DoctoRelacionado').map((d) => ({
        uuid: (attr(d, 'IdDocumento') || '').toUpperCase(),
        serie: attr(d, 'Serie'),
        folio: attr(d, 'Folio'),
        parcialidad: attr(d, 'NumParcialidad'),
        pagado: num(attr(d, 'ImpPagado')),
        saldoInsoluto: num(attr(d, 'ImpSaldoInsoluto')),
      })),
    }));
  }

  /* ------------------------------- Parser principal ---------------------- */
  // Recibe el texto del XML y devuelve un objeto plano. Nunca lanza: ante un
  // error devuelve { ok:false, errores:[...] } con un mensaje entendible.
  function parseXML(texto, archivo = 'cfdi.xml') {
    let doc;
    try {
      doc = new DOMParser().parseFromString(texto, 'application/xml');
    } catch (_) {
      return { ok: false, archivo, errores: ['No se pudo leer el archivo como XML.'] };
    }
    // El navegador inserta un nodo <parsererror> cuando el XML está roto.
    if (doc.querySelector('parsererror') || doc.documentElement.nodeName === 'parsererror') {
      return { ok: false, archivo, errores: ['XML mal formado: el archivo parece incompleto o corrupto.'] };
    }

    const c = doc.documentElement;
    if (!c || c.localName !== 'Comprobante') {
      return { ok: false, archivo, errores: ['No parece un CFDI: no se encontró el nodo Comprobante.'] };
    }

    const avisos = [];
    const version = attr(c, 'Version');
    if (version && version !== '4.0') {
      avisos.push(`Versión ${version}: este lector está hecho para CFDI 4.0; se intentó leer de todos modos.`);
    }

    const emisorEl = hijo(c, 'Emisor');
    const receptorEl = hijo(c, 'Receptor');
    const tfd = buscar(hijo(c, 'Complemento'), 'TimbreFiscalDigital');

    const tipo = attr(c, 'TipoDeComprobante');
    const uuid = (attr(tfd, 'UUID') || '').toUpperCase();
    if (!uuid) avisos.push('Sin UUID: el comprobante no está timbrado o falta el Timbre Fiscal Digital.');
    if (!emisorEl) avisos.push('Falta el nodo Emisor.');
    if (!receptorEl) avisos.push('Falta el nodo Receptor.');

    return {
      ok: true,
      archivo,
      version: version || '—',
      uuid,
      tipo,
      tipoLabel: TIPOS[tipo] || tipo || '—',
      serie: attr(c, 'Serie'),
      folio: attr(c, 'Folio'),
      fecha: attr(c, 'Fecha'),
      fechaTimbrado: attr(tfd, 'FechaTimbrado'),
      metodoPago: attr(c, 'MetodoPago') || null, // PUE / PPD
      formaPago: attr(c, 'FormaPago') || null,
      moneda: attr(c, 'Moneda') || 'MXN',
      subtotal: num(attr(c, 'SubTotal')),
      descuento: num(attr(c, 'Descuento')),
      total: num(attr(c, 'Total')),
      emisor: {
        rfc: (attr(emisorEl, 'Rfc') || '').toUpperCase(),
        nombre: attr(emisorEl, 'Nombre'),
        regimen: attr(emisorEl, 'RegimenFiscal'),
      },
      receptor: {
        rfc: (attr(receptorEl, 'Rfc') || '').toUpperCase(),
        nombre: attr(receptorEl, 'Nombre'),
        usoCFDI: attr(receptorEl, 'UsoCFDI'),
      },
      impuestos: leerImpuestos(c),
      pagos: tipo === 'P' ? leerPagos(c) : [],
      avisos,
    };
  }

  // Lee un objeto File (de <input type=file> o de un drag&drop) y lo parsea.
  // Devuelve una Promise para poder procesar muchos archivos a la vez.
  function parseArchivo(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(parseXML(String(reader.result), file.name));
      reader.onerror = () => resolve({ ok: false, archivo: file.name, errores: ['No se pudo leer el archivo.'] });
      reader.readAsText(file, 'UTF-8');
    });
  }

  /* --------------------- Resumen agregado (para las tarjetas) ------------ */
  function resumir(lista) {
    const ok = lista.filter((x) => x.ok);
    const r = {
      total: lista.length,
      validos: ok.length,
      conError: lista.length - ok.length,
      ingresos: 0, egresos: 0, pagos: 0, nomina: 0,
      ivaTrasladado: 0, retenido: 0,
      baseIva16: 0, baseIva8: 0, baseIva0: 0, baseExento: 0,
      totalFacturado: 0,
    };
    for (const x of ok) {
      if (x.tipo === 'I') { r.ingresos++; r.totalFacturado += x.total; }
      else if (x.tipo === 'E') r.egresos++;
      else if (x.tipo === 'P') r.pagos++;
      else if (x.tipo === 'N') r.nomina++;
      const im = x.impuestos;
      r.baseIva16 += im.iva16.base;
      r.baseIva8 += im.iva8.base;
      r.baseIva0 += im.iva0.base;
      r.baseExento += im.exento.base;
      r.ivaTrasladado += im.trasladadoTotal;
      r.retenido += im.retenidoTotal;
    }
    return r;
  }

  global.CFDI = { parseXML, parseArchivo, resumir, NS, TIPOS };
})(window);
