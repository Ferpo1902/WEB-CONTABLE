# ContaFlow — El sistema operativo del despacho contable mexicano

Página web + demo funcional de un SaaS para contadores en México, diseñado a
partir de una investigación real de los cuellos de botella que más tiempo
quitan a los despachos y de las quejas más repetidas sobre el software
existente (CONTPAQi, Aspel, nube por-empresa, Excel + portal del SAT).

**La tesis del producto:** el contador mexicano pierde su semana en cuatro
cosas que una máquina hace mejor — descargar XML de un SAT saturado, calcular
impuestos con tablas que cambian, perseguir clientes por documentos y cobrar
igualas vencidas. ContaFlow automatiza esas cuatro y cobra **precio plano por
contador con RFCs ilimitados**, atacando el modelo "por empresa" de la
competencia.

📄 La investigación completa con fuentes está en
[`docs/INVESTIGACION.md`](docs/INVESTIGACION.md).

---

## Cómo verlo

No hay build ni dependencias: es HTML/CSS/JS puro.

```bash
# Opción 1: abrir directo
open index.html        # macOS  (en Windows: doble clic)

# Opción 2: servidor local (recomendado)
python3 -m http.server 8000
# → http://localhost:8000          (landing)
# → http://localhost:8000/app.html (demo del panel)
```

También funciona tal cual en GitHub Pages / Netlify / Vercel (sitio estático).

## Qué incluye

### `index.html` — Landing de venta
- Los **7 ladrones de tiempo** documentados con la investigación.
- Features mapeadas 1:1 a cada dolor.
- **Comparativa honesta** vs. escritorio (CONTPAQi/Aspel), nube por-empresa
  (Contalink y similares) y Excel + portal SAT.
- **Calculadora de ROI** interactiva (horas liberadas, valor del tiempo,
  ahorro vs. cobro por empresa).
- Precios con el diferenciador central: RFCs ilimitados en todos los planes.
- FAQ con las objeciones reales (seguridad de la e.firma, datos al salir,
  miedo al abandono tipo QuickBooks).

### `app.html` — Demo funcional del panel (sin registro)

**Diseñado para usarse sin manual.** La capa de usabilidad incluye:
- **Tour de bienvenida** de 4 pasos en la primera visita (omitible, repetible
  desde la barra lateral o con Ctrl+K → "tour").
- **Paleta de comandos `Ctrl+K`**: encuentra clientes por nombre/RFC/régimen
  (ignora acentos) y ejecuta acciones directas — "nuevo cliente", "calcular
  IVA", "simular descarga" — con teclado (↑ ↓ Enter Esc).
- **Pendientes de hoy**: las alertas se convierten en una lista palomeable con
  barra de progreso; cada pendiente trae su acción a un clic y el palomeo se
  deshace desde el propio aviso.
- **Semáforo editable**: en el expediente, cada obligación cambia de estatus
  con un clic (con "Deshacer"); los cambios persisten en `localStorage`.
- **Calculadora precargable por cliente**: al elegir un cliente (o llegar desde
  su expediente), la pestaña del régimen y el coeficiente de utilidad se
  llenan solos; el papel de trabajo sale a su nombre. La captura **se guarda
  sola** por pestaña y los montos se muestran formateados en pesos al teclear.
- **Glosario fiscal integrado**: tooltips en términos como DIOT, 32-D, 69-B,
  REP/PPD y coeficiente de utilidad — útil para personal junior.
- **Móvil de verdad**: barra de navegación inferior tipo app, objetivos
  táctiles ≥48 px y vistas a una mano.
- **Accesibilidad**: navegación completa por teclado, foco visible,
  `aria-current`/`aria-label`, skip-link y respeto a `prefers-reduced-motion`.
- **Restablecer demo** en un clic (barra lateral) para volver al estado inicial.

| Vista | Qué demuestra |
|---|---|
| **Resumen** | Pendientes de hoy palomeables + semáforo de cartera, alertas críticas (69-B, buzón, 32-D), actividad de la noche |
| **Clientes** | CRUD real con validación de RFC en vivo y persistencia en `localStorage`; expediente con días extra por 6º dígito del RFC |
| **Impuestos 2026** | Calculadora funcional: RESICO PF, Actividad Empresarial (acumulados Art. 106), PM 30% con coeficiente, sueldos e IVA — con papel de trabajo copiable/imprimible y la tarifa aplicada resaltada |
| **CFDI / XML** | **Lector real de CFDI 4.0**: sube o arrastra tus XML y se parsean en el navegador (emisor/receptor, PUE/PPD, IVA 16/8/0/exento, retenciones, UUID) + **validación de REP** (cruza las PPD contra sus complementos de pago) + simulador del robot de descarga y monitor de riesgos (EFOS 69-B, duplicados, cancelados) |
| **DIOT** | **Cuadre real**: agrupa los gastos por proveedor, suma bases de IVA por tasa (16/8/0/exento), IVA acreditable y retenciones; aparta los PPD; y genera el **.txt de carga batch** (54 campos, layout a cotejar contra el SAT) |
| **Calendario fiscal** | Generado por reglas: día 17 → día hábil, DIOT fin de mes, anuales, PTU, multa de buzón 2027 |
| **Cobranza** | Aging de igualas, recordatorio automático estilo WhatsApp y suspensión de portal |
| **Portal del cliente** | Lo que ve el cliente final: checklist de documentos, su impuesto estimado, zona de carga |

### Motor fiscal (`assets/js/fiscal.js`)
- Tarifa ISR mensual 2026 (Anexo 8 RMF 2026, DOF 28-dic-2025; actualización
  por inflación 13.21%). Anclas verificadas contra fuentes públicas;
  **cotejar centavos contra el DOF antes de producción**.
- Tablas RESICO PF (Art. 113-E), ISR PM 30%, IVA con retenciones.
- Validador de estructura de RFC y cálculo de días extra por 6º dígito
  (Decreto de facilidades Art. 5.1).
- Calendario 2026 generado por reglas con días inhábiles y recorrido a hábil.

### Lector de CFDI (`assets/js/cfdi.js`)
- Parser de **CFDI 4.0** 100 % en el navegador (`DOMParser`): acepta uno o varios
  XML y extrae emisor/receptor, tipo (Ingreso/Egreso/Pago/Nómina), método de pago
  (PUE/PPD), totales, desglose de IVA (16/8/0/exento) y retenciones (IVA/ISR),
  UUID del timbre y los documentos relacionados de los complementos de Pago (REP).
- Tolerante a prefijos de namespace y con manejo de errores para XML mal formados.
- **Privacidad:** ningún archivo sale del equipo; los datos viven solo en memoria.
- Archivos de prueba en [`docs/ejemplos/`](docs/ejemplos/).

### Generador de DIOT (`assets/js/diot.js`)
- A partir de los CFDI parseados, agrupa los **gastos** (facturas recibidas) por
  proveedor y suma las bases de IVA por tasa (16/8/0/exento), el IVA acreditable
  y las retenciones — con **visor de cuadre** antes de descargar.
- Genera el archivo **.txt de carga batch** (formato nuevo SAT 2025: 54 campos
  separados por «|», UTF-8, montos sin decimales). ⚠️ El **orden exacto de las
  columnas debe cotejarse contra el instructivo oficial** del SAT; el mapeo está
  centralizado en la constante `COL` de `diot.js` para ajustarlo en un solo lugar.
- Los gastos **PPD** se reportan aparte: solo entran a la DIOT del mes en que se
  pagan (cuando tengan su REP — ver el validador de REP).

### Validador de REP (`assets/js/rep.js`)
- Cruza las facturas **PPD** contra los **complementos de pago (REP)** que subas:
  marca las **PPD sin REP** (riesgo de multa y de no poder deducir/acreditar) y,
  para las que sí lo tienen, calcula la **cobertura de pago** (pagado, saldo y
  parcialidades). Detecta también REP "huérfanos" (referencian una factura que
  no está entre los XML cargados).

## Estructura

```
├── index.html              # Landing
├── app.html                # Demo del panel
├── assets/
│   ├── css/ base.css · landing.css · app.css
│   └── js/  fiscal.js · data.js · cfdi.js · diot.js · rep.js · app.js · landing.js
├── docs/INVESTIGACION.md   # Investigación de mercado con fuentes
├── docs/ejemplos/          # XML de prueba (CFDI 4.0) para el lector
└── README.md
```

## Decisiones de diseño

- **Sin frameworks ni build**: la fase actual es validar propuesta de valor;
  un sitio estático se hospeda gratis, carga rápido y no se rompe.
- **Datos 100% ficticios** con estructura válida (RFCs, CFDIs) para que la
  demo se sienta real sin exponer a nadie.
- **Anclada al 10-jun-2026** (`HOY` en `app.js`) para que la historia de la
  demo sea coherente (vencimientos, aging, actividad nocturna).
- "ContaFlow" es **nombre provisional**: validar disponibilidad de marca y
  dominio antes de lanzar.

## Roadmap hacia producto real

1. **Backend multi-tenant** (auth por despacho, roles, bitácora).
2. **Integración real con el SAT**: Web Service de descarga masiva con
   e.firma cifrada (AES-256), cola de reintentos con backoff, caché de XML.
3. **Conciliación bancaria**: importación de estados de cuenta y matching
   contra CFDI; pólizas automáticas.
4. **DIOT real** (.txt de carga masiva) y contabilidad electrónica (balanza XML).
5. **Cobranza real**: pasarela (SPEI/tarjeta/domiciliación), secuencias de
   recordatorio por WhatsApp Business API y suspensión automática del portal.
6. **IA**: clasificación de pólizas, detección de discrepancias CFDI vs.
   declarado, copiloto fiscal con citas a CFF/LISR/RMF.

> ⚠️ Este sitio es una demostración y no constituye asesoría fiscal.
