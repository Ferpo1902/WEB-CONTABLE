/* =========================================================================
 * ContaFlow — Motor fiscal MX 2026
 * Tablas: Anexo 8 RMF 2026 (DOF 28-dic-2025), actualización por inflación
 * acumulada 13.21% (INPC nov-2022 → nov-2025).
 * Antes de usar en producción, cotejar centavos contra el DOF.
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ---------- Tarifa ISR mensual 2026 (pagos provisionales, Art. 96/106) -- */
  const TARIFA_ISR_MENSUAL_2026 = [
    { li: 0.01,      ls: 844.59,     cf: 0.00,      pct: 0.0192 },
    { li: 844.60,    ls: 7168.51,    cf: 16.22,     pct: 0.0640 },
    { li: 7168.52,   ls: 12598.02,   cf: 420.95,    pct: 0.1088 },
    { li: 12598.03,  ls: 14644.64,   cf: 1011.68,   pct: 0.1600 },
    { li: 14644.65,  ls: 17533.63,   cf: 1339.14,   pct: 0.1792 },
    { li: 17533.64,  ls: 35362.83,   cf: 1856.85,   pct: 0.2136 },
    { li: 35362.84,  ls: 55736.68,   cf: 5665.17,   pct: 0.2352 },
    { li: 55736.69,  ls: 106410.50,  cf: 10457.10,  pct: 0.3000 },
    { li: 106410.51, ls: 141880.66,  cf: 25659.24,  pct: 0.3200 },
    { li: 141880.67, ls: 425641.99,  cf: 37009.69,  pct: 0.3400 },
    { li: 425642.00, ls: Infinity,   cf: 133488.54, pct: 0.3500 },
  ];

  /* ---------- RESICO Personas Físicas (Art. 113-E LISR, tasas de ley) ----- */
  const RESICO_PF_MENSUAL = [
    { hasta: 25000.00,    tasa: 0.0100 },
    { hasta: 50000.00,    tasa: 0.0110 },
    { hasta: 83333.33,    tasa: 0.0150 },
    { hasta: 208333.33,   tasa: 0.0200 },
    { hasta: 291666.67,   tasa: 0.0250 }, // tope anual de permanencia: $3.5M
  ];
  const RESICO_PF_ANUAL = [
    { hasta: 300000.00,  tasa: 0.0100 },
    { hasta: 600000.00,  tasa: 0.0110 },
    { hasta: 1000000.00, tasa: 0.0150 },
    { hasta: 2500000.00, tasa: 0.0200 },
    { hasta: 3500000.00, tasa: 0.0250 },
  ];

  const IVA_TASA_GENERAL = 0.16;
  const RET_IVA_DOS_TERCIOS = 0.106667; // 2/3 del IVA por servicios PF→PM
  const RET_ISR_HONORARIOS = 0.10;      // 10% servicios profesionales PF→PM
  const RET_ISR_RESICO_PM = 0.0125;     // 1.25% PM que paga a PF RESICO
  const ISR_PM_TASA = 0.30;             // Régimen general personas morales

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const fmtMXN = (n) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
      isFinite(n) ? n : 0
    );

  const fmtPct = (n) => `${(n * 100).toFixed(2)}%`;

  /* ---------- ISR actividad empresarial / profesional / sueldos ---------- */
  function aplicarTarifa(base, tarifa = TARIFA_ISR_MENSUAL_2026) {
    if (!(base > 0)) {
      return { base: 0, renglon: tarifa[0], excedente: 0, marginal: 0, isr: 0 };
    }
    const renglon =
      tarifa.find((r) => base >= r.li && base <= r.ls) || tarifa[tarifa.length - 1];
    const excedente = round2(base - renglon.li);
    const marginal = round2(excedente * renglon.pct);
    const isr = round2(marginal + renglon.cf);
    return { base: round2(base), renglon, excedente, marginal, isr };
  }

  /**
   * Pago provisional mensual PF Actividad Empresarial y Profesional (Art. 106).
   * Trabaja con cifras ACUMULADAS al periodo, como marca la ley.
   */
  function calcularActividadEmpresarial({
    ingresosAcum = 0,
    deduccionesAcum = 0,
    pagosProvPrevios = 0,
    retencionesAcum = 0,
  }) {
    const utilidad = Math.max(0, round2(ingresosAcum - deduccionesAcum));
    const t = aplicarTarifa(utilidad);
    const aCargo = Math.max(0, round2(t.isr - pagosProvPrevios - retencionesAcum));
    return {
      regimen: 'Actividad empresarial y profesional (PF)',
      utilidad,
      ...t,
      pagosProvPrevios: round2(pagosProvPrevios),
      retencionesAcum: round2(retencionesAcum),
      aCargo,
      pasos: [
        ['Ingresos acumulados del periodo', fmtMXN(ingresosAcum)],
        ['(−) Deducciones autorizadas acumuladas', fmtMXN(deduccionesAcum)],
        ['(=) Utilidad fiscal (base gravable)', fmtMXN(utilidad)],
        ['(−) Límite inferior', fmtMXN(t.renglon.li)],
        ['(=) Excedente del límite inferior', fmtMXN(t.excedente)],
        [`(×) Tasa sobre excedente (${fmtPct(t.renglon.pct)})`, fmtMXN(t.marginal)],
        ['(+) Cuota fija', fmtMXN(t.renglon.cf)],
        ['(=) ISR causado acumulado', fmtMXN(t.isr)],
        ['(−) Pagos provisionales anteriores', fmtMXN(pagosProvPrevios)],
        ['(−) Retenciones de ISR acumuladas', fmtMXN(retencionesAcum)],
        ['(=) ISR a cargo del periodo', fmtMXN(aCargo)],
      ],
    };
  }

  /** RESICO PF mensual (Art. 113-E): tasa directa sobre ingresos cobrados. */
  function calcularResicoPF({ ingresosMes = 0, retencionPM = 0 }) {
    const fueraDeRango = ingresosMes > 291666.67;
    const renglon =
      RESICO_PF_MENSUAL.find((r) => ingresosMes <= r.hasta) ||
      RESICO_PF_MENSUAL[RESICO_PF_MENSUAL.length - 1];
    const isr = round2(ingresosMes * renglon.tasa);
    const aCargo = Math.max(0, round2(isr - retencionPM));
    return {
      regimen: 'RESICO Persona Física',
      tasa: renglon.tasa,
      isr,
      retencionPM: round2(retencionPM),
      aCargo,
      fueraDeRango,
      pasos: [
        ['Ingresos efectivamente cobrados (sin IVA)', fmtMXN(ingresosMes)],
        [`(×) Tasa RESICO aplicable (${fmtPct(renglon.tasa)})`, fmtMXN(isr)],
        ['(−) Retención 1.25% por personas morales', fmtMXN(retencionPM)],
        ['(=) ISR a cargo del mes', fmtMXN(aCargo)],
      ],
      alerta: fueraDeRango
        ? 'Los ingresos exceden el equivalente mensual del tope de $3,500,000 anuales: riesgo de salida de RESICO.'
        : null,
    };
  }

  /** Pago provisional PM régimen general con coeficiente de utilidad (Art. 14). */
  function calcularPersonaMoral({
    ingresosNominalesAcum = 0,
    coeficienteUtilidad = 0,
    pagosProvPrevios = 0,
    perdidasPorAmortizar = 0,
  }) {
    const utilidadEstim = round2(ingresosNominalesAcum * coeficienteUtilidad);
    const base = Math.max(0, round2(utilidadEstim - perdidasPorAmortizar));
    const isr = round2(base * ISR_PM_TASA);
    const aCargo = Math.max(0, round2(isr - pagosProvPrevios));
    return {
      regimen: 'Persona Moral — Régimen General',
      utilidadEstim,
      base,
      isr,
      aCargo,
      pasos: [
        ['Ingresos nominales acumulados', fmtMXN(ingresosNominalesAcum)],
        [`(×) Coeficiente de utilidad (${coeficienteUtilidad.toFixed(4)})`, fmtMXN(utilidadEstim)],
        ['(−) Pérdidas fiscales por amortizar', fmtMXN(perdidasPorAmortizar)],
        ['(=) Base del pago provisional', fmtMXN(base)],
        ['(×) Tasa ISR PM (30%)', fmtMXN(isr)],
        ['(−) Pagos provisionales anteriores', fmtMXN(pagosProvPrevios)],
        ['(=) ISR a cargo del periodo', fmtMXN(aCargo)],
      ],
    };
  }

  /** ISR mensual por sueldos (tarifa Art. 96; no incluye subsidio al empleo). */
  function calcularSueldos({ sueldoMensualGravado = 0 }) {
    const t = aplicarTarifa(sueldoMensualGravado);
    return {
      regimen: 'Sueldos y salarios (retención mensual)',
      ...t,
      pasos: [
        ['Ingreso mensual gravado', fmtMXN(sueldoMensualGravado)],
        ['(−) Límite inferior', fmtMXN(t.renglon.li)],
        ['(=) Excedente', fmtMXN(t.excedente)],
        [`(×) Tasa (${fmtPct(t.renglon.pct)})`, fmtMXN(t.marginal)],
        ['(+) Cuota fija', fmtMXN(t.renglon.cf)],
        ['(=) ISR a retener (antes de subsidio al empleo)', fmtMXN(t.isr)],
      ],
      alerta:
        'No incluye subsidio al empleo (decreto vigente): verificar procedencia para ingresos bajos.',
    };
  }

  /** IVA mensual definitivo. */
  function calcularIVA({
    trasladado = 0,
    acreditable = 0,
    retenido = 0,
    saldoFavorAnterior = 0,
  }) {
    const causado = round2(trasladado - retenido);
    const resultado = round2(causado - acreditable - saldoFavorAnterior);
    const aCargo = Math.max(0, resultado);
    const aFavor = Math.max(0, -resultado);
    return {
      regimen: 'IVA mensual definitivo',
      aCargo,
      aFavor,
      pasos: [
        ['IVA trasladado efectivamente cobrado', fmtMXN(trasladado)],
        ['(−) IVA retenido al contribuyente', fmtMXN(retenido)],
        ['(=) IVA causado', fmtMXN(causado)],
        ['(−) IVA acreditable efectivamente pagado', fmtMXN(acreditable)],
        ['(−) Saldo a favor de periodos anteriores', fmtMXN(saldoFavorAnterior)],
        [
          resultado >= 0 ? '(=) IVA a cargo' : '(=) Saldo a favor',
          fmtMXN(Math.abs(resultado)),
        ],
      ],
    };
  }

  /* ----------------------------- RFC ------------------------------------ */
  const RFC_REGEX =
    /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{2})([A\d])$/;

  /** Valida estructura de RFC (PF 13 / PM 12) incluyendo fecha plausible. */
  function validarRFC(rfcRaw) {
    const rfc = String(rfcRaw || '').trim().toUpperCase();
    const errores = [];
    if (!rfc) return { rfc, valido: false, tipo: null, errores: ['RFC vacío'] };
    const m = rfc.match(RFC_REGEX);
    if (!m) {
      errores.push(
        'Estructura inválida: se esperan 3 letras (PM) o 4 (PF) + fecha AAMMDD + homoclave de 3.'
      );
      return { rfc, valido: false, tipo: null, errores };
    }
    const tipo = m[1].length === 4 ? 'PF' : 'PM';
    const mes = parseInt(m[3], 10);
    const dia = parseInt(m[4], 10);
    if (mes < 1 || mes > 12) errores.push('Mes de la fecha inválido.');
    if (dia < 1 || dia > 31) errores.push('Día de la fecha inválido.');
    return { rfc, valido: errores.length === 0, tipo, errores };
  }

  /* ------------------------ Calendario fiscal 2026 ----------------------- */
  // Días inhábiles 2026 (CFF Art. 12 + festivos bancarios usuales).
  const INHABILES_2026 = new Set([
    '2026-01-01', '2026-02-02', '2026-03-16', '2026-04-02', '2026-04-03',
    '2026-05-01', '2026-09-16', '2026-11-02', '2026-12-25',
  ]);

  const toISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  function esInhabil(d) {
    const dow = d.getDay();
    return dow === 0 || dow === 6 || INHABILES_2026.has(toISO(d));
  }

  function siguienteHabil(d) {
    const x = new Date(d);
    while (esInhabil(x)) x.setDate(x.getDate() + 1);
    return x;
  }

  /** Días hábiles adicionales según 6º dígito numérico del RFC (Art. 5.1 Decreto facilidades). */
  function diasExtraSextoDigito(rfc) {
    const v = validarRFC(rfc);
    if (!v.valido) return 0;
    const idx = v.tipo === 'PF' ? 9 : 8; // 6º dígito numérico de la fecha+...
    const d = parseInt(v.rfc.charAt(idx), 10);
    if (d === 1 || d === 2) return 1;
    if (d === 3 || d === 4) return 2;
    if (d === 5 || d === 6) return 3;
    if (d === 7 || d === 8) return 4;
    return 5; // 9 y 0
  }

  function sumarHabiles(d, n) {
    const x = new Date(d);
    let falta = n;
    while (falta > 0) {
      x.setDate(x.getDate() + 1);
      if (!esInhabil(x)) falta--;
    }
    return x;
  }

  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  /** Genera las obligaciones del año 2026 por reglas. */
  function generarCalendario2026() {
    const eventos = [];
    for (let mes = 0; mes < 12; mes++) {
      const periodo = mes === 0 ? 'diciembre 2025' : `${MESES[mes - 1]} 2026`;
      const dia17 = siguienteHabil(new Date(2026, mes, 17));
      eventos.push({
        fecha: toISO(dia17),
        titulo: 'Pagos provisionales y definitivos',
        detalle: `ISR e IVA de ${periodo} (PF y PM). Vence el día 17; recorrido a día hábil.`,
        tipo: 'declaracion',
        ambito: 'Todos los regímenes',
      });
      const finMes = new Date(2026, mes + 1, 0);
      eventos.push({
        fecha: toISO(finMes),
        titulo: 'DIOT (facilidad administrativa)',
        detalle: `Operaciones con terceros de ${periodo}. Nueva plataforma SAT, carga .txt.`,
        tipo: 'informativa',
        ambito: 'Contribuyentes con IVA',
      });
    }
    eventos.push(
      {
        fecha: '2026-02-16',
        titulo: 'Informativa de sueldos y retenciones (visor)',
        detalle: 'Conciliación de nómina timbrada 2025 antes de la anual de PM.',
        tipo: 'informativa',
        ambito: 'Patrones',
      },
      {
        fecha: '2026-03-31',
        titulo: 'Declaración anual Personas Morales 2025',
        detalle: 'Régimen general y RESICO PM. ISR del ejercicio 2025.',
        tipo: 'anual',
        ambito: 'Personas Morales',
      },
      {
        fecha: '2026-04-30',
        titulo: 'Declaración anual Personas Físicas 2025',
        detalle: 'Todos los regímenes de PF. Deducciones personales aplicables.',
        tipo: 'anual',
        ambito: 'Personas Físicas',
      },
      {
        fecha: '2026-06-01',
        titulo: 'Reparto de PTU — Personas Morales',
        detalle: 'Límite: 60 días tras la anual de PM (30-may inhábil, recorre).',
        tipo: 'laboral',
        ambito: 'Patrones PM',
      },
      {
        fecha: '2026-06-29',
        titulo: 'Reparto de PTU — Personas Físicas',
        detalle: 'Límite: 60 días tras la anual de PF.',
        tipo: 'laboral',
        ambito: 'Patrones PF',
      },
      {
        fecha: '2026-12-31',
        titulo: 'Buzón Tributario: último día sin multa',
        detalle:
          'Desde el 1-ene-2027 aplica multa de $3,850 a $11,540 por no habilitarlo o no actualizar medios de contacto (Arts. 86-C y 86-D CFF).',
        tipo: 'alerta',
        ambito: 'Todos los contribuyentes',
      }
    );
    return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  const fmtFechaLarga = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  /* ------------------------------ API ------------------------------------ */
  global.Fiscal = {
    TARIFA_ISR_MENSUAL_2026,
    RESICO_PF_MENSUAL,
    RESICO_PF_ANUAL,
    IVA_TASA_GENERAL,
    RET_IVA_DOS_TERCIOS,
    RET_ISR_HONORARIOS,
    RET_ISR_RESICO_PM,
    aplicarTarifa,
    calcularActividadEmpresarial,
    calcularResicoPF,
    calcularPersonaMoral,
    calcularSueldos,
    calcularIVA,
    validarRFC,
    generarCalendario2026,
    diasExtraSextoDigito,
    siguienteHabil,
    fmtMXN,
    fmtPct,
    fmtFechaLarga,
  };
})(window);
