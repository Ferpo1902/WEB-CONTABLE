/* =========================================================================
 * ContaFlow — Landing: calculadora de ROI y navegación móvil
 * ========================================================================= */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const fmtMXN = (n) =>
    new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
    }).format(n);

  /* ----------------------------- Nav móvil -------------------------------- */
  const burger = $('#navBurger');
  const links = $('#navLinks');
  burger?.addEventListener('click', () => links.classList.toggle('open'));
  links?.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') links.classList.remove('open');
  });

  /* ----------------------------- ROI -------------------------------------- */
  const AUTOMATIZACION = 0.7;        // estimación conservadora de tiempo liberado
  const PRECIO_NUBE_POR_EMPRESA = 495; // referencia pública de competidores por RFC
  const PLAN_DESPACHO = 1290;

  function calcROI() {
    const clientes = Number($('#roiClientes').value);
    const horas = Number($('#roiHoras').value);
    const tarifa = Number($('#roiTarifa').value);

    $('#roiClientesVal').textContent = clientes;
    $('#roiHorasVal').textContent = horas;
    $('#roiTarifaVal').textContent = fmtMXN(tarifa);

    const horasLiberadas = Math.round(clientes * horas * AUTOMATIZACION);
    const valor = horasLiberadas * tarifa;
    const costoNube = clientes * PRECIO_NUBE_POR_EMPRESA;
    const ahorroVsNube = Math.max(0, costoNube - PLAN_DESPACHO);

    $('#roiHorasMes').textContent = horasLiberadas.toLocaleString('es-MX') + ' h';
    $('#roiDinero').textContent = fmtMXN(valor);
    $('#roiVsNube').textContent = fmtMXN(ahorroVsNube) + '/mes';
    $('#roiNota').textContent =
      `Con ${clientes} clientes: la nube que cobra por empresa te costaría ~${fmtMXN(costoNube)}/mes; ` +
      `el plan Despacho de ContaFlow cuesta ${fmtMXN(PLAN_DESPACHO)}/mes con RFCs ilimitados. ` +
      `Las ${horasLiberadas.toLocaleString('es-MX')} horas liberadas equivalen a ~${Math.round(horasLiberadas / (horas || 1))} clientes más que podrías atender con tu equipo actual.`;
  }

  ['roiClientes', 'roiHoras', 'roiTarifa'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', calcROI);
  });
  if ($('#roiClientes')) calcROI();
})();
