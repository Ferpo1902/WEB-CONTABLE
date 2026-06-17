/* =========================================================================
 * ContaFlow — Validador de REP (Complemento de Pago) 100% en el navegador.
 * -------------------------------------------------------------------------
 * Una factura PPD (Pago en Parcialidades o Diferido) NO se considera pagada
 * al emitirse: cuando se cobra, el emisor debe emitir un CFDI tipo "P" (Pago)
 * cuyo complemento referencia el UUID de la factura PPD (DoctoRelacionado).
 * Si falta ese REP, el SAT puede multar y el gasto/IVA no es deducible.
 *
 * Este módulo cruza, sobre los CFDI ya parseados:
 *   - Facturas PPD (tipo I, MetodoPago = PPD)
 *   - Complementos de Pago (tipo P) y los UUID que saldan
 * y clasifica cada PPD en CON REP (con su cobertura de pago) o SIN REP.
 * ========================================================================= */
(function (global) {
  'use strict';

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  /**
   * Cruza facturas PPD contra complementos de pago (REP).
   * @param {Array} cfdis - resultados del parser CFDI.
   * @returns objeto con ppd con/sin REP, REP huérfanos y un resumen.
   */
  function validar(cfdis) {
    const validos = (cfdis || []).filter((x) => x.ok);
    const ppd = validos.filter((x) => x.tipo === 'I' && x.metodoPago === 'PPD');
    const reps = validos.filter((x) => x.tipo === 'P');

    // UUID de factura -> lista de pagos que la referencian.
    const pagosPorUuid = new Map();
    const uuidsConocidos = new Set(validos.map((x) => x.uuid).filter(Boolean));
    const repsHuerfanos = [];

    for (const rep of reps) {
      for (const pago of rep.pagos) {
        for (const dr of pago.relacionados) {
          if (!dr.uuid) continue;
          const arr = pagosPorUuid.get(dr.uuid) || [];
          arr.push({ rep, pago, dr });
          pagosPorUuid.set(dr.uuid, arr);
          // REP que referencia una factura que no está entre los XML cargados.
          if (!uuidsConocidos.has(dr.uuid)) {
            repsHuerfanos.push({ rep, uuid: dr.uuid, dr });
          }
        }
      }
    }

    const conRep = [];
    const sinRep = [];
    for (const f of ppd) {
      const refs = pagosPorUuid.get(f.uuid) || [];
      if (refs.length) {
        const pagado = round2(refs.reduce((s, r) => s + (r.dr.pagado || 0), 0));
        const saldo = round2(f.total - pagado);
        conRep.push({
          factura: f,
          refs,
          parcialidades: refs.length,
          pagado,
          saldo,
          cubierta: saldo <= 0.005, // pagada por completo
        });
      } else {
        sinRep.push(f);
      }
    }

    const montoSinRep = round2(sinRep.reduce((s, f) => s + f.total, 0));

    return {
      ppd,
      reps,
      conRep,
      sinRep,
      repsHuerfanos,
      resumen: {
        totalPpd: ppd.length,
        conRep: conRep.length,
        sinRep: sinRep.length,
        montoSinRep,
        totalReps: reps.length,
        huerfanos: repsHuerfanos.length,
      },
    };
  }

  global.REP = { validar };
})(window);
