# Investigación de mercado — Software contable en México (2026)

> Investigación realizada en junio de 2026 para fundamentar el diseño de **ContaFlow**.
> Objetivo: identificar los cuellos de botella que más tiempo quitan a los contadores
> mexicanos y las quejas recurrentes sobre el software existente, para construir un
> producto diferenciado por el que los despachos estén dispuestos a pagar.

---

## 1. Los 7 ladrones de tiempo del contador mexicano

### 1.1 Descarga de XML (CFDI) del SAT — el dolor #1
- El portal del SAT se satura en cierres de mes y fechas límite: errores
  "intente más tarde", descargas que fallan a la mitad, captchas.
- El Web Service de descarga masiva con e.firma ha llegado a tardar **horas e
  incluso días** en responder solicitudes; el SAT llegó a reportar XML
  "inexistentes" que sí existían.
- La "solución" recomendada por la comunidad es literalmente *"reintente en 30
  minutos, 1 hora o al día siguiente"* — es decir, el contador pierde su tiempo
  vigilando un portal.
- Fuentes: [ContadorMx — error en descarga masiva](https://contadormx.com/error-en-descarga-masiva-de-xml-cancela-y-recupera-tus-facturas-sat/),
  [ContadorMx — Web Service demorando](https://contadormx.com/falla-descarga-masiva-de-xml-del-sat-con-web-service-solucion/),
  [ElConta.MX — fallas generalizadas](https://elconta.mx/aviso-fallas-generalizadas-en-descarga-masiva-de-xml-dmxml/),
  [Facturando — XML inexistentes](https://www.facturando.mx/blog/index.php/2026/02/12/sat-reporta-xml-inexistentes-al-descargar-emitidos-que-esta-pasando-y-que-hacer/),
  [SW Sapien — problemas al descargar del portal](https://sw.com.mx/blog/cumplimiento-fiscal/principales-problemas-al-descargar-archivos-xml-del-portal-desde-el-sat)

### 1.2 Captura manual y contabilización
- Los contadores dedicaban **en promedio ~9 horas por cliente al mes** en
  capturar información, contrastarla con movimientos bancarios y CFDI del SAT.
- La operación de la mayoría de los despachos sigue siendo mayormente analógica
  (Excel + papel + WhatsApp).
- Fuentes: [Experto PYME — rentabilidad de despachos](https://expertopyme.com/despachos-contables/),
  [Plan-in — gestión del tiempo en despachos](https://plan-in.net/mx/gestion-del-tiempo/gestion-del-tiempo-en-despachos-contables/),
  [OficinaWeb — automatizar un despacho](https://oficinaweb.mx/2026/03/12/automatizar-despacho-contable/)

### 1.3 Perseguir clientes: documentos y honorarios
- El cliente que no manda sus estados de cuenta / facturas a tiempo obliga al
  contador a perseguirlo por WhatsApp cada cierre.
- En cobranza, el contador **no puede legalmente retener la contabilidad** para
  presionar el pago de honorarios (sanciones disciplinarias); su única vía es
  reclamar por la vía civil — lenta y cara. Resultado: muchos despachos cargan
  carteras vencidas enormes y siguen trabajando gratis.
- Fuentes: [Ámbito Jurídico — no se pueden retener documentos](https://www.ambitojuridico.com/noticias/tributario/contador-publico-no-puede-retener-documentos-de-sus-clientes-para-lograr-pago),
  [Nubox — problemas de una oficina contable](https://blog.nubox.com/contadores/oficina-contable)

### 1.4 DIOT: la nueva plataforma del SAT nació fallando
- Desde 2025 la DIOT se presenta solo en la nueva plataforma digital del SAT
  (captura manual o carga masiva .txt).
- La plataforma tuvo tantas fallas técnicas que el **IMCP emitió un aviso formal
  (27-feb-2025)** y el SAT tuvo que **reactivar temporalmente el viejo DEM**.
- Fecha límite: día 17 del mes siguiente, con facilidad administrativa hasta el
  último día del mes (RMF 2026).
- Fuentes: [SAT — comunicado 042-2025](https://www.gob.mx/sat/prensa/sat-informa-que-la-diot-debe-presentarse-unicamente-por-medio-de-la-nueva-plataforma-digital-042-2025?idiom=es),
  [ContadorMx — SAT habilita versión anterior](https://contadormx.com/sat-habilita-la-version-anterior-de-la-diot/),
  [ElConta.MX — la no-prórroga de la DIOT](https://elconta.mx/la-diot-2025-y-su-no-prorroga-sat-reactiva-el-portal-anterior/)

### 1.5 Vigilancia multi-cliente del Buzón Tributario
- Multa por no habilitar buzón o no actualizar medios de contacto:
  **$3,850 a $11,540 MXN** (Arts. 86-C y 86-D CFF); la sanción aplica a partir
  del **1 de enero de 2027** (transitorio RMF 2026) — bomba de tiempo para
  carteras de clientes.
- Revisar el buzón de 40 clientes uno por uno es trabajo manual puro.
- Fuentes: [SAT — Buzón Tributario](https://www.sat.gob.mx/minisitio/BuzonTributario/index.html),
  [Noticias Delicias — multas 2026](https://noticiasdelicias.mx/multa-no-habilitar-buzon-tributario-2026-2/),
  [Tesio — buzón 2026](https://tesio.com.mx/blog/buzon-tributario-sat-2026-como-activarlo/)

### 1.6 Tablas y tarifas que cambian: 2026 cambió TODO
- El Anexo 8 de la RMF 2026 (DOF 28-dic-2025) **actualizó todas las tarifas de
  ISR por inflación acumulada de 13.21%** (INPC nov-2022 → nov-2025). Primera
  actualización desde las tablas vigentes 2024-2025.
- Todo despacho que calcula en Excel debe actualizar a mano cada plantilla; un
  Excel viejo = impuestos mal calculados = multas y recargos para el cliente.
- Fuentes: [SAT — Anexo 8 RMF 2026 (DOF 28/12/2025)](https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-8-RMF-2026_DOF-28122025.pdf),
  [ContadorMx — Tablas ISR 2026](https://contadormx.com/tablas-isr-2026/),
  [ElConta.MX — Tablas y tarifas ISR 2026](https://elconta.mx/tablas-y-tarifas-isr-2026-anexo-8-de-la-resolucion-miscelanea-fiscal-2026/),
  [El Contribuyente — Tablas ISR 2026](https://www.elcontribuyente.mx/2025/12/tablas-isr-2026/)

### 1.7 Calendario de obligaciones disperso
- Pagos provisionales e IVA el día 17; DIOT a fin de mes; anual de morales el
  31 de marzo; anual de físicas el 30 de abril; constancias, 32-D, 69-B, PTU…
  Cada cliente con su combinación de obligaciones según régimen. Hoy se
  administra con memoria, Excel y alarmas del celular.

---

## 2. Quejas sobre el software existente (la oportunidad)

### CONTPAQi (líder del mercado)
- **Interfaz que "no se actualiza desde los 90"**, pensada solo para contadores;
  los empresarios la odian.
- **Solo escritorio/Windows**: requiere instalación local o servidor; sin app
  móvil funcional.
- **Precio**: lista 2026 — Contabilidad desde ~$8,500 MXN + IVA anual,
  Comercial Premium desde ~$15,000 + IVA; usuarios y RFCs adicionales **cuestan
  extra** y solo durante la vigencia de la licencia; renovación anual en la
  práctica obligatoria (tablas fiscales, timbrado).
- Soporte vía red de distribuidores → lento y desigual.
- Fuentes: [TaxID — el software que los contadores aman y los empresarios odian](https://taxid.mx/english/contpaqi-contabilidad-el-software-que-los-contadores-amamos-y-que-los-empresarios-odian/),
  [Lista de precios CONTPAQi 2026](https://www.contpaqi.com/listadeprecios),
  [IDNUBE — precios CONTPAQi 2026](https://idnube.com/blog/precios-contpaqi-2026)

### Aspel (Siigo)
- Enfoque 100% de escritorio; tener todos los módulos es **caro** y la
  implementación es **larga y requiere personal especializado**.
- Fuente: [Vanguardia — análisis de los 4 principales](https://vanguardia.com.mx/dinero/cual-es-el-mejor-software-contable-aqui-un-analisis-de-los-4-principales-CPVG3430442)

### QuickBooks
- **Abandonó México** (30-abr-2023) dejando colgados a miles de usuarios →
  desconfianza hacia plataformas globales sin compromiso local.
- Fuentes: [Alegra — por qué se va QuickBooks](https://blog.alegra.com/mexico/quickbooks-mexico-2023/),
  [Bind — alternativa QuickBooks](https://bind.com.mx/blog/tecnologia-en-la-nube/quickbooks-mexico)

### Contalink (competidor nube más directo)
- Bien evaluado en conciliación y pólizas automáticas, pero **cobra por
  empresa**: Plan Pro ~$413 MXN/mes (limitado a 50 CFDI/mes) y Premium ~$495
  MXN/mes por empresa. Un despacho con 40 clientes pagaría **~$19,800 MXN al
  mes**. El modelo castiga el crecimiento del despacho.
- Fuentes: [Contalink — precios](https://www.contalink.com/precios/),
  [Tutoriales Contalink — planes](https://tutoriales.contalink.com/es/articles/8754032-planes-contalink),
  [ComparaSoftware — Contalink](https://www.comparasoftware.com/contalink)

### Nube genérica LATAM (Alegra, etc.)
- Buenas para pymes, pero con menor profundidad fiscal mexicana (DIOT,
  contabilidad electrónica, papeles de trabajo por régimen) y pensadas para el
  empresario, no para el despacho multi-cliente.

---

## 3. Estrategia de diferenciación de ContaFlow

| # | Dolor validado | Solución ContaFlow |
|---|----------------|--------------------|
| 1 | Descarga de XML falla y consume horas | Robot de descarga nocturna con reintentos automáticos y backoff; el contador amanece con los XML de TODOS sus clientes |
| 2 | Software caro que cobra por RFC/empresa | **Precio plano por contador, RFCs ilimitados** |
| 3 | Solo Windows/escritorio | 100% nube: Mac, Windows, tablet y celular |
| 4 | Perseguir clientes por documentos | Portal del cliente con recordatorios automáticos por WhatsApp/email y semáforo de entrega |
| 5 | Cartera vencida de honorarios (retener papeles es ilegal) | Cobranza automática de igualas: recordatorios, domiciliación y **suspensión automática del portal** al no pago — presión legal y efectiva |
| 6 | Tablas fiscales desactualizadas en Excel | Motor fiscal siempre vigente (Anexo 8 RMF 2026) con papel de trabajo descargable |
| 7 | DIOT nueva plataforma fallando | Generación del .txt de carga masiva listo para subir |
| 8 | Buzón/69-B/32-D revisados a mano | Semáforo de cumplimiento multi-cliente con alertas |
| 9 | Soporte lento vía distribuidores | Soporte por contadores reales, chat < 5 min, sin intermediarios |
| 10 | Miedo al abandono (caso QuickBooks) | Exportación total de datos en 1 clic, sin candados ni plazos forzosos |

### Posicionamiento de precio (ancla competitiva)
- **Contador Solo**: $590/mes — 1 usuario, RFCs ilimitados.
- **Despacho**: $1,290/mes — 5 usuarios, portal del cliente, cobranza automática.
- **Firma**: $2,490/mes — 15 usuarios, API, marca blanca del portal.
- Mensaje: *"Con 40 clientes, la competencia te cuesta ~$20,000/mes. ContaFlow
  te cuesta $1,290. Crecer no debería salirte caro."*

---

## 4. Datos fiscales incorporados al producto (verificados)

### Tarifa ISR mensual 2026 (pagos provisionales — Anexo 8 RMF 2026, DOF 28-dic-2025)
Actualizada por inflación acumulada 13.21%. Valores ancla verificados contra
publicaciones especializadas: límite 1er renglón $844.59 (1.92%), cuota fija
2º renglón $16.22, último renglón desde $425,642.00 (35%).

| Límite inferior | Límite superior | Cuota fija | % s/ excedente |
|---|---|---|---|
| 0.01 | 844.59 | 0.00 | 1.92% |
| 844.60 | 7,168.51 | 16.22 | 6.40% |
| 7,168.52 | 12,598.02 | 420.95 | 10.88% |
| 12,598.03 | 14,644.64 | 1,011.68 | 16.00% |
| 14,644.65 | 17,533.63 | 1,339.14 | 17.92% |
| 17,533.64 | 35,362.83 | 1,856.85 | 21.36% |
| 35,362.84 | 55,736.68 | 5,665.17 | 23.52% |
| 55,736.69 | 106,410.50 | 10,457.10 | 30.00% |
| 106,410.51 | 141,880.66 | 25,659.24 | 32.00% |
| 141,880.67 | 425,641.99 | 37,009.69 | 34.00% |
| 425,642.00 | En adelante | 133,488.54 | 35.00% |

> Nota: cifras reconstruidas con el factor oficial 1.1321 sobre la tarifa
> 2024-2025 y verificadas en sus anclas contra fuentes públicas; antes de
> producción, cotejar centavo a centavo contra el
> [Anexo 8 RMF 2026 (DOF)](https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-8-RMF-2026_DOF-28122025.pdf).

### RESICO Personas Físicas (Art. 113-E LISR — tasas de ley, sin cambio)
Mensual: hasta $25,000 → 1.00% · hasta $50,000 → 1.10% · hasta $83,333.33 →
1.50% · hasta $208,333.33 → 2.00% · hasta $291,666.67 → 2.50%.
Tope anual de permanencia: $3,500,000. Retención de PM a PF RESICO: 1.25% ISR.
Fuentes: [Facturama — tabla RESICO 2026](https://facturama.mx/blog/tablas-resico/),
[SAT Fácil — RESICO 2026](https://www.satfacil.com.mx/blog/regimen-simplificado-confianza-resico-guia-2026)

### IVA y retenciones
- IVA general 16% (fronterizo 8% con estímulo).
- Retenciones por servicios profesionales PF → PM: ISR 10%, IVA 2/3 (10.6667%).

### Fechas clave del calendario fiscal
- Pagos provisionales y definitivos (ISR/IVA/retenciones): **día 17** del mes
  siguiente (si es inhábil, recorre al siguiente hábil).
- DIOT: día 17 con facilidad administrativa hasta el **último día del mes**.
- Declaración anual personas morales: **31 de marzo**; personas físicas:
  **30 de abril**.
- PTU: mayo (PM) / junio (PF).
- Multa buzón tributario: $3,850–$11,540, aplicable desde 1-ene-2027.

---

## 5. Modelo de negocio y roadmap

**Fase 1 (este repo)**: landing de venta + demo funcional del dashboard
(captación de lista de espera y validación de propuesta de valor).

**Fase 2 (MVP productivo)**:
- Integración real con el Web Service de descarga masiva del SAT (e.firma),
  con cola de reintentos y caché propio de XML.
- Autenticación multi-usuario por despacho, base de datos multi-tenant.
- Conciliación bancaria (importar estados de cuenta → matching con CFDI).
- Generación real del .txt DIOT y XML de contabilidad electrónica (balanza).
- Pagos/cobranza con domiciliación (Stripe/Conekta + SPEI).

**Fase 3**: IA de clasificación de pólizas, detección de discrepancias CFDI vs
declarado, copiloto fiscal con citas a CFF/LISR/RMF.

**KPI de éxito**: que un despacho de 40 clientes cierre su mes en 2 días en vez
de 2 semanas, pagando menos del 10% de lo que paga hoy en licencias.
