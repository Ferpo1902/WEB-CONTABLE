#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ContaFlow — Radar fiscal: actualizador de noticias.

Lee feeds RSS/Atom de fuentes fiscales mexicanas, clasifica cada nota por
tema, filtra lo irrelevante (el DOF publica de todo) y regenera
assets/data/noticias.json mezclando con lo que ya existía.

Diseñado para correr en GitHub Actions 2 veces al día, pero puedes
ejecutarlo a mano cuando quieras:

    python3 scripts/actualizar_noticias.py

Solo usa la librería estándar de Python: nada que instalar.
"""

import json
import re
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "assets" / "data" / "noticias.json"
MAX_ITEMS = 120
TIMEOUT = 20
UA = "Mozilla/5.0 (compatible; ContaFlowRadar/1.0; +https://github.com/Ferpo1902/WEB-CONTABLE)"

# --------------------------------------------------------------------------
# Fuentes. Cada una prueba varias URLs (la primera que responda, gana).
# "filtrar": True => solo se conservan notas con temas fiscales detectados
# (necesario para el DOF, que publica desde decretos del SAT hasta avisos
# de la SEDENA).
# --------------------------------------------------------------------------
FUENTES = [
    {
        "nombre": "El Contribuyente",
        "urls": [
            "https://www.elcontribuyente.mx/feed/",
            "https://www.elcontribuyente.mx/feed",
            "https://www.elcontribuyente.mx/rss",
        ],
        "filtrar": False,
    },
    {
        "nombre": "DOF",
        "urls": [
            "https://www.dof.gob.mx/sumario.xml",
            "https://dof.gob.mx/index.php/sumario.xml",
        ],
        "filtrar": True,
    },
    {
        "nombre": "IDC Online",
        "urls": [
            "https://idconline.mx/feed",
            "https://www.idconline.mx/feed",
        ],
        "filtrar": False,
    },
]

# --------------------------------------------------------------------------
# Taxonomía de temas — espejo de assets/js/noticias.js. Si agregas un tema
# aquí, agrégalo también allá para que la interfaz sepa pintarlo y cruzarlo
# con la cartera.
# --------------------------------------------------------------------------
TEMAS = {
    "69b": ["69-b", "69 b", "efos", "edos", "operaciones inexistentes",
            "facturas sin capacidad", "empresas fantasma", "lista negra del sat",
            "listado presunto"],
    "cfdi": ["cfdi", "factura", "facturacion", "complemento de pago", "ppd",
             "cancelacion de factura", "cancelaciones de factura",
             "descarga masiva", "xml", "constancia de situacion fiscal", "csf"],
    "fiscalizacion": ["fiscalizacion", "fiscalizar", "revision", "revisiones",
                      "auditoria", "carta invitacion", "cartas invitacion",
                      "vigilancia profunda", "requerimiento", "visita domiciliaria",
                      "facultades de comprobacion", "embargo", "credito fiscal"],
    "buzon": ["buzon tributario", "buzon fiscal"],
    "cff": ["codigo fiscal", "cff", "reforma fiscal", "paquete economico",
            "miscelanea fiscal", "rmf", "iniciativa fiscal", "decreto"],
    "isr": ["isr", "impuesto sobre la renta", "tarifa", "tarifas",
            "coeficiente de utilidad", "pagos provisionales"],
    "iva": ["iva", "impuesto al valor agregado", "acreditamiento", "acreditar",
            "tasa cero", "diot"],
    "resico": ["resico", "regimen simplificado de confianza"],
    "pm": ["personas morales", "persona moral"],
    "nominas": ["imss", "infonavit", "nomina", "nominas", "cuotas obrero",
                "sueldos", "salario minimo", "aguinaldo", "ptu", "pension",
                "semanas cotizadas", "subcontratacion", "repse"],
    "plataformas": ["plataformas tecnologicas", "plataformas digitales",
                    "plataforma digital", "uber", "didi", "rappi", "airbnb",
                    "mercado libre"],
    "arrendamiento": ["arrendamiento", "arrendador", "renta de inmuebles"],
    "anualpf": ["declaracion anual", "deducciones personales",
                "devolucion de saldo", "saldo a favor"],
    "satServicios": ["portal del sat", "caida del sat", "intermitencia",
                     "citas del sat", "retrasos del sat", "fallas del sat",
                     "e.firma", "efirma", "contrasena del sat"],
    "comercioExt": ["aduana", "aduanas", "arancel", "aranceles",
                    "comercio exterior", "importacion", "pedimento", "anexo 24"],
    "cripto": ["cripto", "criptomoneda", "bitcoin", "exchanges",
               "activos virtuales"],
}

# Palabras extra que hacen a una nota del DOF "fiscal" aunque no caiga en un
# tema específico (p. ej. "SHCP", "SAT", "hacienda").
FISCAL_GENERICO = ["sat", "shcp", "hacienda", "tributaria", "tributario",
                   "fiscal", "contribuyente", "impuesto"]

KW_ALTO = ["multa", "multas", "sancion", "entra en vigor", "entrara en vigor",
           "obligatorio", "plazo", "fecha limite", "vence", "endurece",
           "cancelar rfc", "suspender", "suspension", "restriccion de sellos",
           "nueva obligacion", "prorroga", "listado presunto", "embargo"]
TEMAS_ALTO = {"69b", "cff", "fiscalizacion", "satServicios"}
TEMAS_MEDIO = {"cfdi", "isr", "iva", "resico", "nominas", "buzon", "anualpf",
               "pm", "plataformas", "arrendamiento"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def clasificar(texto: str) -> list:
    t = " " + norm(texto) + " "
    return [tema for tema, kws in TEMAS.items() if any(k in t for k in kws)]


def calcular_impacto(texto: str, temas: list) -> str:
    t = norm(texto)
    if set(temas) & TEMAS_ALTO or any(k in t for k in KW_ALTO):
        return "alto"
    if set(temas) & TEMAS_MEDIO:
        return "medio"
    return "info"


def limpiar_html(s: str) -> str:
    s = unescape(s or "")
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def clave(titulo: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", norm(titulo)).strip()[:90]


def descargar(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/rss+xml, application/xml, text/xml, */*"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read()


def texto_de(nodo, *nombres) -> str:
    """Busca el primer subelemento cuyo tag (sin namespace) coincida."""
    for hijo in nodo.iter():
        tag = hijo.tag.split("}")[-1]
        if tag in nombres and (hijo.text or "").strip():
            return hijo.text.strip()
    return ""


def link_de(nodo) -> str:
    for hijo in nodo.iter():
        tag = hijo.tag.split("}")[-1]
        if tag == "link":
            if (hijo.text or "").strip():
                return hijo.text.strip()
            href = hijo.attrib.get("href", "").strip()
            if href:
                return href
    return ""


def fecha_iso(cruda: str) -> str:
    cruda = (cruda or "").strip()
    if cruda:
        try:  # RFC 2822: 'Fri, 10 Jul 2026 09:00:00 -0600'
            return parsedate_to_datetime(cruda).date().isoformat()
        except (TypeError, ValueError):
            pass
        try:  # ISO 8601
            return datetime.fromisoformat(cruda.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            m = re.search(r"(\d{2})/(\d{2})/(\d{4})", cruda)  # DOF usa dd/mm/aaaa
            if m:
                return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return datetime.now(timezone.utc).date().isoformat()


def parsear_feed(xml_bytes: bytes, fuente: str, filtrar: bool) -> list:
    try:
        raiz = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []
    nodos = [n for n in raiz.iter() if n.tag.split("}")[-1] in ("item", "entry")]
    notas = []
    for nodo in nodos[:30]:
        titulo = limpiar_html(texto_de(nodo, "title"))
        url = link_de(nodo)
        if not titulo or not url:
            continue
        resumen = limpiar_html(texto_de(nodo, "description", "summary", "content"))[:260]
        fecha = fecha_iso(texto_de(nodo, "pubDate", "published", "updated", "date"))
        texto = f"{titulo} {resumen}"
        temas = clasificar(texto)
        if filtrar and not temas and not any(k in norm(texto) for k in FISCAL_GENERICO):
            continue  # nota del DOF sin relación fiscal: fuera
        notas.append({
            "id": "auto-" + clave(titulo).replace(" ", "-")[:60],
            "fecha": fecha,
            "fuente": fuente,
            "titulo": titulo[:220],
            "resumen": resumen,
            "url": url,
            "temas": temas,
            "impacto": calcular_impacto(texto, temas),
        })
    return notas


def main() -> None:
    previas = []
    if DESTINO.exists():
        try:
            previas = json.loads(DESTINO.read_text(encoding="utf-8")).get("items", [])
        except json.JSONDecodeError:
            print("Aviso: noticias.json previo ilegible; se regenera desde cero.")

    nuevas, fallidas = [], []
    for fuente in FUENTES:
        conseguido = False
        for url in fuente["urls"]:
            try:
                notas = parsear_feed(descargar(url), fuente["nombre"], fuente["filtrar"])
                if notas:
                    nuevas.extend(notas)
                    print(f"✔ {fuente['nombre']}: {len(notas)} notas ({url})")
                    conseguido = True
                    break
            except Exception as e:  # red caída, robots, 403… la fuente se salta
                print(f"  {fuente['nombre']} falló en {url}: {e}")
        if not conseguido:
            fallidas.append(fuente["nombre"])

    # Mezcla: nuevas pisan a previas con el mismo título; se ordena por fecha.
    mapa = {}
    for n in previas + nuevas:
        k = clave(n.get("titulo", ""))
        if not k:
            continue
        if k not in mapa or (n.get("fecha", "") > mapa[k].get("fecha", "")):
            mapa[k] = n
    items = sorted(mapa.values(), key=lambda n: n.get("fecha", ""), reverse=True)[:MAX_ITEMS]

    salida = {
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "fuentes": [f["nombre"] for f in FUENTES if f["nombre"] not in fallidas],
        "items": items,
    }

    # Solo escribimos si el contenido (sin timestamp) cambió, para que el
    # workflow no haga commits vacíos.
    if DESTINO.exists():
        try:
            anterior = json.loads(DESTINO.read_text(encoding="utf-8"))
            if anterior.get("items") == items:
                print(f"Sin cambios ({len(items)} notas). No se reescribe.")
                return
        except json.JSONDecodeError:
            pass

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + "\n",
                       encoding="utf-8")
    print(f"Escrito {DESTINO.relative_to(RAIZ)}: {len(items)} notas "
          f"({len(nuevas)} recién leídas; fuentes caídas: {fallidas or 'ninguna'})")


if __name__ == "__main__":
    main()
