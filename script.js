// ============================================
// MERCADITO VIRTUAL - MENDOZA
// script.js — Versión con corrección de ofertas
// Cambios principales:
// - Nueva función getPrecioOriginal() para precios sin oferta
// - renderOfertasDestacadas y renderProductos usan getPrecioOriginal()
// - parseLocalDate para fechas sin desfase UTC
// - getOfertasActivasHoy() ahora usa parseLocalDate
// ============================================

const ADMIN_PASSWORD_HASH = 'hash_5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5';

const NUMERO_WHATSAPP  = '5492616312850';
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRO5TmA-MgtcLCMPHMiGnxK_vtjDviMIEQJk6o2WmgrCl4XHjxtuI26HJRFLgiQC4VCT0XO1gPoKSfR/pub?output=csv';
const CONFIG_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRO5TmA-MgtcLCMPHMiGnxK_vtjDviMIEQJk6o2WmgrCl4XHjxtuI26HJRFLgiQC4VCT0XO1gPoKSfR/pub?gid=1139334877&single=true&output=csv';
const APPS_SCRIPT_URL  = 'https://script.google.com/macros/s/AKfycbzpTmsw711qEXzB3nqIZfbObjYy6C0a-CgEQxhgoPMEO45R__znIZLaHTyFKehADCh30Q/exec';

// URL hoja "folleto" del mismo Sheet (publicada como CSV — gid de la hoja folleto)
// ⚠️ Reemplazá FOLLETO_GID con el gid real de tu hoja "folleto" en Google Sheets
const FOLLETO_GID      = '671906371';
const FOLLETO_SHEET_URL = `https://docs.google.com/spreadsheets/d/e/2PACX-1vRO5TmA-MgtcLCMPHMiGnxK_vtjDviMIEQJk6o2WmgrCl4XHjxtuI26HJRFLgiQC4VCT0XO1gPoKSfR/pub?gid=${FOLLETO_GID}&single=true&output=csv`;

// ============================================
// CARGA DIFERIDA DE LIBRERÍAS (solo admin)
// ============================================
let _libreriasAdminCargadas = false;

async function cargarLibreriasAdmin() {
    if (_libreriasAdminCargadas) return;
    if (typeof XLSX !== 'undefined' && typeof Papa !== 'undefined') {
        _libreriasAdminCargadas = true;
        return;
    }
    toast('⏳ Preparando herramientas...', 'success');
    await Promise.all([
        new Promise((resolve, reject) => {
            if (typeof XLSX !== 'undefined') return resolve();
            const s = document.createElement('script');
            s.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('No se pudo cargar SheetJS'));
            document.head.appendChild(s);
        }),
        new Promise((resolve, reject) => {
            if (typeof Papa !== 'undefined') return resolve();
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('No se pudo cargar PapaParse'));
            document.head.appendChild(s);
        })
    ]);
    _libreriasAdminCargadas = true;
}

// ============================================
// SEGURIDAD Y UTILIDADES
// ============================================
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeHTMLAttr(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generarIdUnico() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function validarURL(url) {
    if (!url || url.trim() === '') return false;
    const protocolosPeligrosos = ['javascript:', 'data:', 'vbscript:', 'file:'];
    const urlLower = url.toLowerCase().trim();
    for (const proto of protocolosPeligrosos) {
        if (urlLower.startsWith(proto)) return false;
    }
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch { return false; }
}

function toast(msg, tipo = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 100);
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

async function hashPassword(password) {
    const msgBuffer  = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    return 'hash_' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Modal de confirmación nativo (reemplaza confirm() — compatible con PWAs)
function confirmarAccion(mensaje, onConfirmar) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <p style="font-size:1rem;color:#1d3557;margin-bottom:20px;line-height:1.5;">${escapeHTML(mensaje)}</p>
            <div style="display:flex;gap:10px;">
                <button id="confirmNo"  style="flex:1;padding:12px;border:none;border-radius:8px;background:#8d99ae;color:white;font-weight:600;cursor:pointer;font-size:0.95rem;">Cancelar</button>
                <button id="confirmSi"  style="flex:1;padding:12px;border:none;border-radius:8px;background:#e63946;color:white;font-weight:600;cursor:pointer;font-size:0.95rem;">Confirmar</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirmNo').addEventListener('click',  () => { overlay.remove(); });
    overlay.querySelector('#confirmSi').addEventListener('click',  () => { overlay.remove(); onConfirmar(); });
}

// ============================================
// FECHA LOCAL (evita desfase UTC)
// ============================================
function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// ============================================
// ESTADO GLOBAL
// ============================================
let PROMOS = JSON.parse(localStorage.getItem('promosConfig')) || {
    dia: {
        0: { activo: true,  minimo: 25000, porcentaje: 12 }, // domingo
        1: { activo: true,  minimo: 20000, porcentaje: 8  }, // lunes
        2: { activo: false, minimo: 25000, porcentaje: 10 }, // martes
        3: { activo: false, minimo: 25000, porcentaje: 10 }, // miércoles
        4: { activo: false, minimo: 25000, porcentaje: 10 }, // jueves
        5: { activo: true,  minimo: 25000, porcentaje: 12 }, // viernes
        6: { activo: true,  minimo: 25000, porcentaje: 12 }, // sábado
    },
    envioGratis:   { minimo: 35000, activo: true },
    primeraCompra: { activo: true, minimo: 25000, porcentaje: 10, incluyeEnvio: true },
    especial:      { activo: false, nombre: 'Black Friday', inicio: '', fin: '', minimo: 30000, porcentaje: 20 }
};

let productos = JSON.parse(localStorage.getItem('productosTienda_v2')) || [];
let carrito   = JSON.parse(localStorage.getItem('carritoTienda_v2'))   || [];
let config    = JSON.parse(localStorage.getItem('configTienda')) || {
    margenGeneral: 30, descuentoCantidad: 5,
    margenesSecciones: {}, margenesFamilias: {}, margenesSubfamilias: {},
    topDinamico: 100, stockMinimo: 0, stockCritico: 5, stockBajo: 20
};
let ofertas = JSON.parse(localStorage.getItem('ofertasTienda')) || [];
// Folleto: items del folleto semanal, cargados desde Google Sheets
// Se indexan por EAN (string) para búsqueda O(1)
let folletoItems = JSON.parse(localStorage.getItem('folletoItems')) || {};
let filtros = { seccion: '', familia: '', subfamilia: '', busqueda: '' };
let usuarioYaCompro = localStorage.getItem('yaCompro') === 'true';

// ============================================
// PERSISTENCIA
// ============================================
function guardar() {
    try {
        localStorage.setItem('productosTienda_v2', JSON.stringify(productos));
        localStorage.setItem('carritoTienda_v2',   JSON.stringify(carrito));
        localStorage.setItem('configTienda',        JSON.stringify(config));
        localStorage.setItem('ofertasTienda',       JSON.stringify(ofertas));
        localStorage.setItem('promosConfig',        JSON.stringify(PROMOS));
        localStorage.setItem('folletoItems',        JSON.stringify(folletoItems));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            toast('⚠ Almacenamiento lleno. Eliminá productos antiguos.', 'error');
        } else {
            toast('❌ Error al guardar datos', 'error');
        }
    }
}

// ============================================
// CONFIG REMOTA — leer y escribir en Google Sheet
// ============================================
async function cargarConfigRemota() {
    try {
        const response = await fetch(CONFIG_SHEET_URL);
        if (!response.ok) return;
        const csv = await response.text();
        const lineas = csv.trim().split('\n').slice(1); // saltar encabezado
        const configRemota = {};
        lineas.forEach(linea => {
            const partes = linea.split(',');
            const clave  = partes[0]?.trim().replace(/^"|"$/g, '');
            const valor  = partes[1]?.trim().replace(/^"|"$/g, '');
            if (clave && valor !== undefined) {
                configRemota[clave] = isNaN(valor) ? valor : Number(valor);
            }
        });
        // Aplicar solo las claves numéricas de config (no tocar márgenes)
        const clavesAplicar = ['topDinamico','stockMinimo','stockCritico','stockBajo','margenGeneral','descuentoCantidad'];
        let huboCAmbios = false;
        clavesAplicar.forEach(clave => {
            if (configRemota[clave] !== undefined && config[clave] !== configRemota[clave]) {
                config[clave] = configRemota[clave];
                huboCAmbios = true;
            }
        });
        if (huboCAmbios) {
            guardar();
            renderProductos();
            console.log('✅ Config remota aplicada:', configRemota);
        }
    } catch (err) {
        console.warn('⚠ No se pudo cargar config remota:', err.message);
    }
}

async function guardarConfigRemota(configParcial) {
    try {
        const params = new URLSearchParams();
        params.append('payload', JSON.stringify(configParcial));
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        console.log('✅ Config enviada al Sheet');
        return true;
    } catch (err) {
        console.error('❌ Error al guardar config:', err.message);
        return false;
    }
}

// ============================================
// FOLLETO SEMANAL
// ============================================

// Retorna el item de folleto vigente hoy para un EAN dado, o null si no existe.
// folletoItems es un dict: { "7792799000097": { precio_normal, precio_folleto, mecanica, fecha_desde, fecha_hasta } }
function getItemFolleto(ean) {
    // EAN vacío, nulo o muy corto no puede hacer match
    if (!ean || String(ean).trim().length < 8) return null;
    if (!folletoItems[String(ean).trim()]) return null;
    const item = folletoItems[String(ean)];
    const hoy  = new Date();
    hoy.setHours(0, 0, 0, 0);
    const desde = parseLocalDate(item.fecha_desde);
    const hasta = parseLocalDate(item.fecha_hasta);
    if (!desde || !hasta) return null;
    hasta.setHours(23, 59, 59, 999);
    return (hoy >= desde && hoy <= hasta) ? item : null;
}

// Carga la hoja "folleto" del Google Sheet y actualiza folletoItems.
// Se llama al inicio (silencioso) y desde el panel admin.
async function cargarFolleto(silencioso = false) {
    if (FOLLETO_GID === 'FOLLETO_GID') {
        if (!silencioso) toast('⚠ Configurá el FOLLETO_GID en el código', 'warning');
        return;
    }
    try {
        if (!silencioso) toast('⏳ Cargando folleto...', 'success');
        // PapaParse puede no estar cargado fuera del admin — cargamos solo lo necesario
        if (typeof Papa === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
                s.onload = resolve;
                s.onerror = () => reject(new Error('No se pudo cargar PapaParse'));
                document.head.appendChild(s);
            });
        }
        const response = await fetch(FOLLETO_SHEET_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();
        const result  = Papa.parse(csvText, {
            header: true, skipEmptyLines: true,
            transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_'),
            transform: v => v.trim()
        });

        const nuevos = {};
        let cargados = 0;
        for (const fila of result.data) {
            const ean = String(fila.ean || '').trim();
            if (!ean) continue;
            const precio_folleto = parseFloat(fila.precio_folleto);
            if (isNaN(precio_folleto) || precio_folleto <= 0) continue;
            const fecha_desde = fila.fecha_desde || '';
            const fecha_hasta = fila.fecha_hasta || '';
            if (!fecha_desde || !fecha_hasta) continue;
            nuevos[ean] = {
                precio_folleto,
                mecanica:   fila.mecanica || '',
                fecha_desde,
                fecha_hasta
            };
            cargados++;
        }

        // Siempre reemplazar folletoItems (incluso si está vacío),
        // así al borrar el folleto del Sheet se limpian los precios viejos
        folletoItems = nuevos;
        localStorage.setItem('folletoItems', JSON.stringify(folletoItems));
        localStorage.setItem('ultimaActualizacionFolleto', new Date().toISOString());
        renderProductos();
        // Mostrar stats en el panel admin si está visible
        const statsEl = document.getElementById('folletoStats');
        if (statsEl) {
            // Contar cuántos están vigentes hoy
            const hoy = new Date(); hoy.setHours(0,0,0,0);
            const vigentes = Object.values(folletoItems).filter(it => {
                const desde = parseLocalDate(it.fecha_desde);
                const hasta = parseLocalDate(it.fecha_hasta);
                if (!desde || !hasta) return false;
                hasta.setHours(23,59,59,999);
                return hoy >= desde && hoy <= hasta;
            }).length;
            statsEl.textContent = `✅ ${cargados} productos en folleto · ${vigentes} vigentes hoy`;
        }
        if (!silencioso) toast(`✅ Folleto: ${cargados} productos cargados`, 'success');
        console.log(`✅ Folleto cargado: ${cargados} items`);
    } catch (error) {
        if (!silencioso) toast(`❌ Error al cargar folleto: ${error.message}`, 'error');
        console.error('Folleto error:', error);
    }
}

// ============================================
// FUNCIÓN CENTRALIZADA: OFERTAS ACTIVAS HOY
// (usa parseLocalDate para evitar desfase UTC)
// ============================================
function getOfertasActivasHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    return ofertas.filter(o => {
        if (!o.activa) return false;
        const inicio = parseLocalDate(o.fechaInicio);
        const fin    = parseLocalDate(o.fechaFin);
        if (!inicio || !fin) return false;

        inicio.setHours(0, 0, 0, 0);
        fin.setHours(23, 59, 59, 999);

        return hoy >= inicio && hoy <= fin;
    });
}

// ============================================
// PROMOS Y DESCUENTOS
// ============================================
function esPrimeraCompra() {
    return PROMOS.primeraCompra.activo && !usuarioYaCompro;
}

function marcarComoComprado() {
    usuarioYaCompro = true;
    localStorage.setItem('yaCompro', 'true');
}

function getPromoDelDia() {
    const ahora   = new Date();
    const fechaAR = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Mendoza' }));
    return PROMOS.dia[fechaAR.getDay()] || null;
}

function calcularDescuentos(total) {
    let desc = { porcentaje: 0, envioGratis: false, montoDescuento: 0, totalFinal: total, mensajes: [] };

    // Promo especial (mayor prioridad si está activa y en rango de fechas)
    if (PROMOS.especial?.activo && PROMOS.especial.inicio && PROMOS.especial.fin) {
        const hoy   = new Date();
        const inicio = parseLocalDate(PROMOS.especial.inicio);
        const fin    = parseLocalDate(PROMOS.especial.fin);
        if (inicio && fin) {
            fin.setHours(23, 59, 59, 999);
            if (hoy >= inicio && hoy <= fin && total >= PROMOS.especial.minimo) {
                desc.porcentaje = PROMOS.especial.porcentaje;
                desc.mensajes   = [`🔥 ${PROMOS.especial.nombre}: ${PROMOS.especial.porcentaje}% OFF`];
            }
        }
    }

    // Promo del día
    const promoDia = getPromoDelDia();
    if (promoDia?.activo && total >= promoDia.minimo && promoDia.porcentaje > desc.porcentaje) {
        desc.porcentaje = promoDia.porcentaje;
        desc.mensajes   = [`🗓 ${promoDia.porcentaje}% OFF por promo del día`];
    }

    // Primera compra
    if (esPrimeraCompra() && total >= PROMOS.primeraCompra.minimo &&
        PROMOS.primeraCompra.porcentaje > desc.porcentaje) {
        desc.porcentaje = PROMOS.primeraCompra.porcentaje;
        desc.mensajes   = [`🎉 ${PROMOS.primeraCompra.porcentaje}% OFF por primera compra`];
    }

    // Envío gratis (acumula al descuento)
    if (PROMOS.envioGratis.activo && total >= PROMOS.envioGratis.minimo) {
        desc.envioGratis = true;
        desc.mensajes.push('🚚 Envío gratis incluido');
    }

    if (desc.porcentaje > 0) {
        desc.montoDescuento = total * (desc.porcentaje / 100);
        desc.totalFinal     = total - desc.montoDescuento;
    }
    return desc;
}

// ============================================
// BANNER DE PRIMERA COMPRA (dinámico)
// ============================================
function actualizarBannerPrimeraCompra(totalCarrito) {
    const banner   = document.getElementById('bannerPrimeraCompra');
    const mensaje  = document.getElementById('bannerMensaje');
    const progreso = document.getElementById('bannerProgreso');
    if (!banner) return;

    if (!PROMOS.primeraCompra.activo || usuarioYaCompro) {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = 'block';
    const minimo = PROMOS.primeraCompra.minimo;
    const falta  = Math.max(0, minimo - totalCarrito);

    if (totalCarrito >= minimo) {
        mensaje.textContent  = `🎉 ¡Desbloqueaste ${PROMOS.primeraCompra.porcentaje}% OFF + envío gratis!`;
        progreso.textContent = '✅ Beneficio aplicado al finalizar el pedido';
    } else {
        mensaje.textContent  = `${PROMOS.primeraCompra.porcentaje}% off + envío gratis en compras > $${minimo.toLocaleString('es-AR')}`;
        progreso.textContent = `Llevás $${totalCarrito.toLocaleString('es-AR')} · Te faltan $${falta.toLocaleString('es-AR')}`;
    }
}

// ============================================
// BARRA PROGRESO ENVÍO GRATIS (NUEVA)
// ============================================
function actualizarBarraEnvioGratis(total) {
    const bar    = document.getElementById('envioGratisBar');
    const texto  = document.getElementById('envioGratisBarTexto');
    const fill   = document.getElementById('envioGratisFill');
    if (!bar || !texto || !fill) return;

    if (!PROMOS.envioGratis.activo) { bar.style.display = 'none'; return; }

    const minimo = PROMOS.envioGratis.minimo;
    if (total >= minimo) {
        bar.style.display     = 'block';
        texto.textContent     = '🚚 ¡Tenés envío gratis en este pedido!';
        fill.style.width      = '100%';
        fill.style.background = '#2a9d8f';
    } else {
        const falta   = minimo - total;
        const pct     = Math.min(100, Math.round((total / minimo) * 100));
        bar.style.display = 'block';
        texto.textContent = `🚚 Sumá $${falta.toLocaleString('es-AR')} más y el envío es gratis`;
        fill.style.width  = pct + '%';
        fill.style.background = pct >= 75 ? '#e9c46a' : '#a8dadc';
    }
}

// ============================================
// PRECIOS
// ============================================
function calcularPrecio(producto, cant = 1, ofertasHoy = null) {
    // Acepta ofertas pre-calculadas para evitar recalcular en loops
    if (ofertasHoy === null) ofertasHoy = getOfertasActivasHoy();

    // PRIORIDAD 1: Folleto semanal (precio del maxi, más confiable)
    if (producto.ean) {
        const itemFolleto = getItemFolleto(producto.ean);
        if (itemFolleto) return itemFolleto.precio_folleto;
    }

    // PRIORIDAD 2: Oferta manual cargada desde admin
    const oferta = ofertasHoy.find(o => o.productoId === producto.id);
    if (oferta) return oferta.precioOferta;

    // Margen jerárquico: subfamilia > familia > sección > general
    let margen = config.margenGeneral;
    const sf = producto.subfamilia?.toLowerCase();
    const fa = producto.familia?.toLowerCase();
    const se = producto.seccion?.toLowerCase();

    if (sf && config.margenesSubfamilias[sf] != null) margen = config.margenesSubfamilias[sf];
    else if (fa && config.margenesFamilias[fa] != null) margen = config.margenesFamilias[fa];
    else if (se && config.margenesSecciones[se] != null) margen = config.margenesSecciones[se];

    if (cant >= 3) margen = Math.max(0, margen - config.descuentoCantidad);
    return parseFloat((producto.costo * (1 + margen / 100)).toFixed(2));
}

// PRECIO ORIGINAL (sin oferta) – usado para mostrar tachado y calcular ahorro
function getPrecioOriginal(producto) {
    let margen = config.margenGeneral;
    const sf = producto.subfamilia?.toLowerCase();
    const fa = producto.familia?.toLowerCase();
    const se = producto.seccion?.toLowerCase();

    if (sf && config.margenesSubfamilias[sf] != null) margen = config.margenesSubfamilias[sf];
    else if (fa && config.margenesFamilias[fa] != null) margen = config.margenesFamilias[fa];
    else if (se && config.margenesSecciones[se] != null) margen = config.margenesSecciones[se];

    // No aplicar descuento por cantidad para el precio original
    return parseFloat((producto.costo * (1 + margen / 100)).toFixed(2));
}

function estaEnOferta(p) {
    return getOfertasActivasHoy().some(o => o.productoId === p.id);
}

// Retorna el item de folleto vigente para el producto, o null
function estaEnFolleto(p) {
    if (!p.ean || String(p.ean).trim().length < 8) return null;
    return getItemFolleto(p.ean);
}

// ============================================
// OFERTAS DESTACADAS (sección superior)
// ============================================
function renderOfertasDestacadas() {
    const seccion = document.getElementById('ofertasSection');
    const grid    = document.getElementById('ofertasDestacadasGrid');
    if (!seccion || !grid) return;

    const activas = getOfertasActivasHoy();
    // También incluir productos en folleto en la sección de destacados
    const enFolletoDestacados = productos
        .filter(p => p.ean && getItemFolleto(p.ean))
        .slice(0, 30) // Hasta 30 del folleto en destacados
        .map(p => {
            const item = getItemFolleto(p.ean);
            return { productoId: p.id, precioOferta: item.precio_folleto, esFolleto: true };
        });
    const todasDestacadas = [...activas, ...enFolletoDestacados.filter(f => !activas.some(a => a.productoId === f.productoId))];

    if (!todasDestacadas.length) { seccion.style.display = 'none'; return; }

    seccion.style.display = 'block';
    grid.innerHTML = todasDestacadas.map(o => {
        const p = productos.find(x => x.id === o.productoId);
        if (!p) return '';
        const precioOriginal = getPrecioOriginal(p);
        const ahorro = Math.round(((precioOriginal - o.precioOferta) / precioOriginal) * 100);
        const imgHTML = validarURL(p.imagen)
            ? `<img src="${escapeHTMLAttr(p.imagen)}" alt="${escapeHTMLAttr(p.nombre)}" loading="lazy" decoding="async"
                   onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="image-placeholder" style="display:none;">${escapeHTML(p.emoji) || '📦'}</div>`
            : `<div class="image-placeholder">${escapeHTML(p.emoji) || '📦'}</div>`;

        return `
            <div class="oferta-destacada-card ${o.esFolleto ? 'en-folleto' : ''}" onclick="agregarAlCarrito('${escapeHTMLAttr(p.id)}')">
                <div class="oferta-destacada-badge">${o.esFolleto ? '🗞️' : '🔥'} ${ahorro > 0 ? ahorro + '% OFF' : 'FOLLETO'}</div>
                <div class="oferta-destacada-image">${imgHTML}</div>
                <div class="oferta-destacada-info">
                    <div class="oferta-destacada-nombre">${escapeHTML(p.nombre)}</div>
                    <div class="oferta-destacada-precios">
                        <span class="oferta-destacada-precio-original">$${precioOriginal.toLocaleString('es-AR')}</span>
                        <span class="oferta-destacada-precio-oferta">$${o.precioOferta.toLocaleString('es-AR')}</span>
                    </div>
                    <div class="oferta-destacada-ahorro">💰 Ahorrás $${(precioOriginal - o.precioOferta).toLocaleString('es-AR')}</div>
                    <button class="oferta-destacada-btn">🛒 Agregar</button>
                </div>
            </div>`;
    }).join('');
}

// ============================================
// RENDERIZADO DE PRODUCTOS
// ============================================
function renderProductos() {
    const grid = document.getElementById('productsGrid');
    grid.classList.remove('skeleton-loading');
    renderOfertasDestacadas();
    const prods = filtrarProductos();
    actualizarBreadcrumb();

    let titulo = '🌟 Nuestros Productos';
    if (filtros.subfamilia)   titulo = filtros.subfamilia;
    else if (filtros.familia) titulo = filtros.familia;
    else if (filtros.seccion) titulo = filtros.seccion;
    document.getElementById('sectionTitle').textContent = titulo;

    if (prods.length === 0) {
        grid.innerHTML = `
            <div class="no-results">
                <h3>😕 No hay productos</h3>
                <p>Probá con otro filtro o búsqueda</p>
                ${filtros.busqueda ? `<p>Intentá con: <strong>${escapeHTML(filtros.busqueda.substring(0,1).toUpperCase())}</strong> o una palabra más corta</p>` : ''}
            </div>`;
        document.getElementById('relatedProducts').style.display = 'none';
        return;
    }

    // Calcular ofertas activas UNA sola vez (no N veces dentro del .map)
    const ofertasHoyCache = getOfertasActivasHoy();
    grid.innerHTML = prods.map(p => {
        const itemFolleto   = estaEnFolleto(p);          // null o { precio_folleto, mecanica, ... }
        const enFolleto     = !!itemFolleto;
        const p1            = calcularPrecio(p, 1, ofertasHoyCache);
        const p3            = calcularPrecio(p, 3, ofertasHoyCache);
        const enOf          = !enFolleto && ofertasHoyCache.some(o => o.productoId === p.id);
        const precioOriginal = getPrecioOriginal(p);
        const ahorro = (enOf || enFolleto) ? Math.round(((precioOriginal - p1) / precioOriginal) * 100) : 0;

        let stockBadge = '', stockClass = '', stockText = '';
        if (p.stock <= 0) {
            stockBadge = '<span class="stock-badge sin-stock">✕ Sin stock</span>';
            stockClass = 'danger';
            stockText  = '❌ Agotado';
        } else if (p.stock <= config.stockCritico) {
            stockBadge = '<span class="stock-badge sin-stock">🔴 CRÍTICO</span>';
            stockClass = 'danger';
            stockText  = p.stock === 1 ? '🔴 Última unidad' : `🔴 Últimas ${p.stock} unidades`;
        } else if (p.stock <= config.stockBajo) {
            stockBadge = '<span class="stock-badge poco-stock">🟡 BAJO</span>';
            stockClass = 'warning';
            stockText  = `🟡 Quedan ${p.stock} unidades`;
        } else {
            stockBadge = '<span class="stock-badge disponible">✅ Disponible</span>';
            stockText  = '✅ Disponible';
        }

        const imgHTML = validarURL(p.imagen)
            ? `<img src="${escapeHTMLAttr(p.imagen)}" alt="${escapeHTMLAttr(p.nombre)}" loading="lazy" decoding="async"
                   onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="image-placeholder" style="display:none;">${escapeHTML(p.emoji) || '📦'}</div>`
            : `<div class="image-placeholder">${escapeHTML(p.emoji) || '📦'}</div>`;

        let precioHTML;
        if (enFolleto) {
            precioHTML = `<div class="product-price folleto-price">$${p1.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>
               <span class="product-price-original">$${precioOriginal.toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>
               ${itemFolleto.mecanica ? `<div class="folleto-mecanica">${escapeHTML(itemFolleto.mecanica)}</div>` : ''}`;
        } else if (enOf) {
            precioHTML = `<div class="product-price oferta-price">$${p1.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>
               <span class="product-price-original">$${precioOriginal.toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>`;
        } else {
            precioHTML = `<div class="product-price">$${p1.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>`;
        }

        const p3HTML = p3 < p1
            ? `<div class="precio-por-cantidad">🎁 3+ unidades: $${p3.toLocaleString('es-AR', {minimumFractionDigits: 2})} c/u</div>`
            : '';

        const nombreCorto = escapeHTML(p.nombre.length > 50 ? p.nombre.substring(0, 50) + '…' : p.nombre);

        return `
            <div class="product-card ${enFolleto ? 'en-folleto' : enOf ? 'en-oferta' : ''}">
                ${enFolleto ? `<div class="folleto-badge">🗞️ FOLLETO ${ahorro > 0 ? ahorro + '% OFF' : ''}</div>` : enOf ? `<div class="oferta-badge">🔥 ${ahorro}% OFF</div>` : ''}
                <div class="product-image-container">
                    ${imgHTML}
                    ${stockBadge}
                </div>
                <div class="product-info">
                    <h3 class="product-name" title="${escapeHTMLAttr(p.nombre)}">${nombreCorto}</h3>
                    <div class="price-container">
                        ${precioHTML}
                        ${p3HTML}
                    </div>
                    <div class="product-stock ${stockClass}">${stockText}</div>
                    <button class="add-to-cart-btn" data-id="${escapeHTMLAttr(p.id)}" ${p.stock <= 0 ? 'disabled' : ''}>
                        ${p.stock > 0 ? '🛒 Sumar al pedido' : '✕ Sin stock'}
                    </button>
                </div>
            </div>`;
    }).join('');

    document.getElementById('relatedProducts').style.display = 'none';
}

function filtrarProductos() {
    let prods = productos.filter(p => p.stock >= (config.stockMinimo || 0));

    prods.sort((a, b) => (b.venta_diaria || 0) - (a.venta_diaria || 0));
    prods = prods.slice(0, config.topDinamico || 100);

    prods.sort((a, b) => {
        const seccionA = a.seccion || '';
        const seccionB = b.seccion || '';
        if (seccionA < seccionB) return -1;
        if (seccionA > seccionB) return 1;
        const familiaA = a.familia || '';
        const familiaB = b.familia || '';
        if (familiaA < familiaB) return -1;
        if (familiaA > familiaB) return 1;
        return (b.venta_diaria || 0) - (a.venta_diaria || 0);
    });

    if (filtros.seccion)    prods = prods.filter(p => p.seccion    === filtros.seccion);
    if (filtros.familia)    prods = prods.filter(p => p.familia    === filtros.familia);
    if (filtros.subfamilia) prods = prods.filter(p => p.subfamilia === filtros.subfamilia);

    if (filtros.busqueda.trim()) {
        const term = filtros.busqueda.toLowerCase();
        prods = prods.filter(p => p.nombre.toLowerCase().includes(term));
    }
    return prods;
}

// ============================================
// CARRITO (resto de funciones igual que antes)
// ============================================
function actualizarCarrito() {
    const items   = document.getElementById('cartItems');
    const total   = document.getElementById('cartTotal');
    const savings = document.getElementById('cartSavings');

    const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);
    let totalSinDescuento = 0;
    carrito.forEach(item => {
        const p = productos.find(x => x.id === item.id);
        if (p) totalSinDescuento += calcularPrecio(p, item.cantidad) * item.cantidad;
    });

    const descuentos = calcularDescuentos(totalSinDescuento);

    const esMobile = window.innerWidth <= 768;
    const montoFmt = `$${Math.round(totalSinDescuento).toLocaleString('es-AR')}`;
    document.getElementById('cartText').textContent = totalItems > 0
        ? (esMobile ? `🛒 ${totalItems}` : `Carrito (${totalItems}) - ${montoFmt}`)
        : (esMobile ? '🛒' : 'Carrito (0)');
    document.getElementById('ctaMobileText').textContent = totalItems > 0
        ? `Comprar (${totalItems}) - ${montoFmt}` : 'Comprar (0) - $0';

    actualizarBannerPrimeraCompra(totalSinDescuento);
    actualizarBarraEnvioGratis(totalSinDescuento);

    if (carrito.length === 0) {
        items.innerHTML = `<div class="empty-cart">🛒 Carrito vacío<br><small>Agregá productos para empezar</small></div>`;
        total.textContent = '$0';
        savings.style.display = 'none';
        return;
    }

    let html = '';
    carrito.forEach(item => {
        const p = productos.find(x => x.id === item.id);
        if (!p) return;
        const pUnit = calcularPrecio(p, item.cantidad);
        const sub   = pUnit * item.cantidad;
        html += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHTML(item.nombre)}</div>
                    <div class="cart-item-price">
                        $${pUnit.toLocaleString('es-AR')} × ${item.cantidad} = <strong>$${sub.toLocaleString('es-AR')}</strong>
                    </div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" data-id="${escapeHTMLAttr(item.id)}" data-accion="-1">−</button>
                        <span class="qty-display">${item.cantidad}</span>
                        <button class="qty-btn" data-id="${escapeHTMLAttr(item.id)}" data-accion="1">+</button>
                        <button class="remove-btn" data-id="${escapeHTMLAttr(item.id)}" data-accion="remove">🗑️</button>
                    </div>
                </div>
            </div>`;
    });
    items.innerHTML = html;

    if (descuentos.montoDescuento > 0) {
        total.textContent = `$${descuentos.totalFinal.toLocaleString('es-AR')}`;
        savings.innerHTML = `
            <div style="background:#e8f4f8;padding:10px;border-radius:8px;">
                <strong>💰 DESCUENTOS:</strong><br>
                ${descuentos.mensajes.join('<br>')}
                <br><span style="color:var(--success);">− $${descuentos.montoDescuento.toLocaleString('es-AR')}</span>
            </div>`;
        savings.style.display = 'block';
    } else {
        total.textContent = `$${totalSinDescuento.toLocaleString('es-AR')}`;
        savings.style.display = 'none';
    }

    if (typeof gtag === 'function' && totalSinDescuento > 0) {
        gtag('event', 'view_cart', { currency: 'ARS', value: descuentos.totalFinal || totalSinDescuento });
    }
}

function agregarAlCarrito(id) {
    const p = productos.find(x => x.id === id);
    if (!p || p.stock <= 0) { toast('❌ Sin stock', 'error'); return; }

    const item = carrito.find(x => x.id === id);
    if (item) {
        if (item.cantidad >= p.stock) { toast('⚠ No hay más stock disponible', 'warning'); return; }
        item.cantidad++;
    } else {
        carrito.push({
            id: p.id, nombre: p.nombre, costo: p.costo,
            cantidad: 1, imagen: p.imagen, emoji: p.emoji,
            seccion: p.seccion, familia: p.familia, subfamilia: p.subfamilia
        });
    }

    guardar();
    actualizarCarrito();
    toast(`✅ ${p.nombre.length > 30 ? p.nombre.substring(0,30) + '…' : p.nombre} agregado`, 'success');

    if (typeof gtag === 'function') {
        gtag('event', 'add_to_cart', {
            currency: 'ARS', value: calcularPrecio(p, 1),
            items: [{ item_id: p.id, item_name: p.nombre, price: calcularPrecio(p, 1), quantity: 1, item_category: p.seccion || 'General' }]
        });
    }
}

function actualizarCantidad(id, cambio) {
    const item = carrito.find(x => x.id === id);
    const p    = productos.find(x => x.id === id);
    if (!item || !p) return;
    const nueva = item.cantidad + cambio;
    if (nueva <= 0) { eliminarDelCarrito(id); return; }
    if (nueva > p.stock) { toast('⚠ No hay más stock disponible', 'warning'); return; }
    item.cantidad = nueva;
    guardar();
    actualizarCarrito();
}

function eliminarDelCarrito(id) {
    carrito = carrito.filter(x => x.id !== id);
    guardar();
    actualizarCarrito();
    toast('🗑️ Producto eliminado del carrito', 'success');
}

function vaciarCarrito() {
    if (carrito.length === 0) { toast('⚠ El carrito ya está vacío', 'warning'); return; }
    confirmarAccion(`¿Vaciar el carrito? (${carrito.length} producto${carrito.length > 1 ? 's' : ''})`, () => {
        carrito = [];
        guardar();
        actualizarCarrito();
        toast('🗑️ Carrito vaciado', 'success');
    });
}

// ============================================
// MODAL DE ENTREGA
// ============================================
function abrirModalEntrega() {
    if (carrito.length === 0) { toast('⚠ El carrito está vacío', 'warning'); return; }
    document.getElementById('deliveryModal').classList.add('show');
    setTimeout(() => document.getElementById('deliveryName').focus(), 100);
}

function cerrarModalEntrega() {
    document.getElementById('deliveryModal').classList.remove('show');
}

function generarWhatsApp() {
    if (carrito.length === 0) { toast('⚠ El carrito está vacío', 'warning'); return; }

    const nombre    = document.getElementById('deliveryName')?.value.trim() || '';
    const direccion = document.getElementById('deliveryAddress')?.value.trim() || '';
    const horario   = document.getElementById('deliveryTime')?.value || '';
    const notas     = document.getElementById('deliveryNotes')?.value.trim() || '';

    if (!direccion) {
        toast('⚠ Por favor ingresá tu dirección de entrega', 'warning');
        document.getElementById('deliveryAddress').focus();
        return;
    }

    let totalSinDescuento = 0;
    let msg = '🛒 *Pedido - Mercadito Virtual*\n\nHola 👋 te paso mi pedido:\n\n';

    carrito.forEach((item, i) => {
        const p = productos.find(x => x.id === item.id);
        if (!p) return;
        const pUnit = calcularPrecio(p, item.cantidad);
        const sub   = pUnit * item.cantidad;
        totalSinDescuento += sub;
        msg += `${i + 1}. *${item.nombre}*\n`;
        msg += `   Cant: ${item.cantidad} × $${pUnit.toLocaleString('es-AR')} = $${sub.toLocaleString('es-AR')}\n\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 Subtotal: $${totalSinDescuento.toLocaleString('es-AR')}\n\n`;

    const descuentos = calcularDescuentos(totalSinDescuento);

    if (descuentos.montoDescuento > 0) {
        msg += `🎁 *DESCUENTOS APLICADOS:*\n`;
        msg += descuentos.mensajes.join('\n') + '\n';
        msg += `Ahorrás: $${descuentos.montoDescuento.toLocaleString('es-AR')}\n`;
        msg += `\n✅ *TOTAL FINAL: $${descuentos.totalFinal.toLocaleString('es-AR')}*\n`;
        if (esPrimeraCompra() && totalSinDescuento >= PROMOS.primeraCompra.minimo) {
            marcarComoComprado();
        }
    } else {
        msg += `✅ *TOTAL: $${totalSinDescuento.toLocaleString('es-AR')}*\n`;
        const promoDia = getPromoDelDia();
        if (promoDia?.activo && totalSinDescuento < promoDia.minimo) {
            const falta = promoDia.minimo - totalSinDescuento;
            msg += `\n💡 Sumá $${falta.toLocaleString('es-AR')} más y obtené ${promoDia.porcentaje}% OFF 🎉\n`;
        }
    }

    msg += `\n━━━━━━━━━━━━━━━━━\n`;
    if (nombre)    msg += `👤 *Nombre:* ${nombre}\n`;
    msg += `📍 *Dirección:* ${direccion}\n`;
    if (horario)   msg += `⏰ *Horario:* ${horario}\n`;
    if (notas)     msg += `📝 *Nota:* ${notas}\n`;

    if (typeof gtag === 'function') {
        gtag('event', 'begin_checkout', {
            currency: 'ARS',
            value: descuentos.totalFinal || totalSinDescuento,
            items: carrito.map(item => {
                const p = productos.find(x => x.id === item.id);
                return { item_id: item.id, item_name: item.nombre, price: p ? calcularPrecio(p, item.cantidad) : 0, quantity: item.cantidad };
            })
        });
    }

    cerrarModalEntrega();
    window.open(`https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================
// FILTROS Y NAVEGACIÓN (resto igual)
// ============================================
function actualizarFiltros() {
    const vis = productos.filter(p => p.stock >= (config.stockMinimo || 0));
    const secciones  = [...new Set(vis.map(p => p.seccion).filter(Boolean))].sort();
    const familias   = [...new Set(
        (filtros.seccion ? vis.filter(p => p.seccion === filtros.seccion) : vis)
        .map(p => p.familia).filter(Boolean))].sort();
    const subfamilias = [...new Set(
        (filtros.familia ? vis.filter(p => p.familia === filtros.familia)
         : filtros.seccion ? vis.filter(p => p.seccion === filtros.seccion) : vis)
        .map(p => p.subfamilia).filter(Boolean))].sort();

    const setSelect = (id, opciones, valor) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '<option value="">Todas</option>' +
            opciones.map(v => `<option value="${escapeHTMLAttr(v)}">${escapeHTML(v)}</option>`).join('');
        el.value = (valor && opciones.includes(valor)) ? valor : '';
    };

    setSelect('seccionFilter',          secciones,    filtros.seccion);
    setSelect('familiaFilter',          familias,     filtros.familia);
    setSelect('subfamiliaFilter',       subfamilias,  filtros.subfamilia);
    setSelect('seccionFilterDesktop',   secciones,    filtros.seccion);
    setSelect('familiaFilterDesktop',   familias,     filtros.familia);
    setSelect('subfamiliaFilterDesktop',subfamilias,  filtros.subfamilia);
}

function resetFiltros() {
    filtros = { seccion: '', familia: '', subfamilia: '', busqueda: filtros.busqueda };
    document.getElementById('searchInput').value = filtros.busqueda;
    actualizarFiltros();
    renderProductos();
    actualizarContadorFiltros();
    toast('🔄 Filtros limpiados', 'success');
}

function actualizarContadorFiltros() {
    const count    = (filtros.seccion ? 1 : 0) + (filtros.familia ? 1 : 0) + (filtros.subfamilia ? 1 : 0);
    const badge    = document.getElementById('filtersCount');
    const resetBtn = document.getElementById('filtersReset');
    badge.textContent = count;
    badge.classList.toggle('zero', count === 0);
    resetBtn.disabled = count === 0;
}

function actualizarBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    let html = '<a href="#" data-action="home">🏠 Inicio</a>';
    if (filtros.seccion)    html += ` <span>›</span> <a href="#" data-action="seccion">${escapeHTML(filtros.seccion)}</a>`;
    if (filtros.familia)    html += ` <span>›</span> <a href="#" data-action="familia">${escapeHTML(filtros.familia)}</a>`;
    if (filtros.subfamilia) html += ` <span>›</span> <span>${escapeHTML(filtros.subfamilia)}</span>`;
    bc.innerHTML = html;

    bc.querySelectorAll('[data-action]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const action = e.currentTarget.dataset.action;
            if (action === 'home')     { filtros.seccion = filtros.familia = filtros.subfamilia = ''; }
            else if (action === 'seccion') { filtros.familia = filtros.subfamilia = ''; }
            else if (action === 'familia') { filtros.subfamilia = ''; }
            actualizarFiltros(); renderProductos(); actualizarContadorFiltros();
        });
    });
}

function scrollToProducts() {
    document.getElementById('productsGrid').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// ADMIN (se mantiene igual, sólo se agregan las funciones ya definidas)
// ============================================
function renderProductosAdmin() {
    const term  = document.getElementById('buscarProductoAdmin')?.value.toLowerCase() || '';
    const prods = term ? productos.filter(p => p.nombre.toLowerCase().includes(term)) : productos;
    document.getElementById('productListAdmin').innerHTML = prods.length
        ? prods.map(p => `
            <div style="padding:10px;border:1px solid var(--accent);margin-bottom:5px;display:flex;justify-content:space-between;align-items:center;border-radius:8px;">
                <div>
                    <strong>${escapeHTML(p.nombre)}</strong>
                    <span style="color:var(--gray);font-size:0.85rem;"> · ${escapeHTML(p.seccion)} · Stock: ${p.stock} · $${calcularPrecio(p, 1).toLocaleString('es-AR')}</span>
                </div>
                <button class="btn-delete" data-id="${escapeHTMLAttr(p.id)}" style="padding:6px 12px;">🗑️</button>
            </div>`).join('')
        : '<p style="color:var(--gray);">Sin productos</p>';
}

function eliminarProducto(id) {
    confirmarAccion('¿Eliminar este producto?', () => {
        productos = productos.filter(p => p.id !== id);
        carrito   = carrito.filter(c => c.id !== id);
        guardar(); renderProductos(); renderProductosAdmin(); actualizarCarrito(); actualizarFiltros();
        toast('✅ Producto eliminado', 'success');
    });
}

function agregarProductoManual() {
    const nombre    = document.getElementById('productName')?.value.trim();
    const seccion   = document.getElementById('productSeccion')?.value.trim().toUpperCase() || 'OTROS';
    const familia   = document.getElementById('productFamilia')?.value.trim().toUpperCase() || '';
    const subfamilia= document.getElementById('productSubfamilia')?.value.trim().toUpperCase() || '';
    const costo     = parseFloat(document.getElementById('productCosto')?.value);
    const stock     = parseInt(document.getElementById('productStock')?.value) || 0;
    const emoji     = document.getElementById('productEmoji')?.value.trim() || '📦';
    const imagen    = document.getElementById('productImage')?.value.trim() || '';

    if (!nombre)         return toast('❌ El nombre es obligatorio', 'error');
    if (!costo || costo <= 0) return toast('❌ El costo debe ser mayor a 0', 'error');

    const precio = parseFloat((costo * (1 + config.margenGeneral / 100)).toFixed(2));
    productos.push({ id: generarIdEstable(nombre), nombre, seccion, familia, subfamilia, costo, precio, stock: Math.max(0, stock), venta_diaria: 0, imagen, emoji });
    guardar(); actualizarFiltros(); renderProductos(); renderProductosAdmin();

    ['productName','productSeccion','productFamilia','productSubfamilia',
     'productCosto','productStock','productEmoji','productImage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('productEmoji').value = '📦';
    toast(`✅ "${nombre}" agregado`, 'success');
}

async function guardarMargenGeneral() {
    const val = parseFloat(document.getElementById('margenGeneral')?.value);
    if (isNaN(val) || val < 0) return toast('❌ Margen inválido', 'error');
    config.margenGeneral = val; guardar(); renderProductos();
    await guardarConfigRemota({ margenGeneral: val });
    toast('✅ Margen general guardado para todos', 'success');
}

async function guardarDescuentoCantidad() {
    const val = parseFloat(document.getElementById('descuentoCantidad')?.value);
    if (isNaN(val) || val < 0) return toast('❌ Valor inválido', 'error');
    config.descuentoCantidad = val; guardar();
    await guardarConfigRemota({ descuentoCantidad: val });
    toast('✅ Descuento por cantidad guardado para todos', 'success');
}

function _agregarMargenCategoria(inputNombre, inputMargen, tipoConfig, label) {
    const nombre = document.getElementById(inputNombre)?.value.trim().toLowerCase();
    const margen = parseFloat(document.getElementById(inputMargen)?.value);
    if (!nombre) return toast(`❌ Ingresá un nombre de ${label}`, 'error');
    if (isNaN(margen) || margen < 0) return toast('❌ Margen inválido', 'error');
    config[tipoConfig][nombre] = margen; guardar(); renderMargenes(); renderProductos();
    document.getElementById(inputNombre).value = '';
    document.getElementById(inputMargen).value = '';
    toast(`✅ Margen para "${nombre.toUpperCase()}" guardado`, 'success');
}

function agregarMargenSeccion()    { _agregarMargenCategoria('nuevaSeccionNombre',    'nuevaSeccionMargen',    'margenesSecciones',  'sección'); }
function agregarMargenFamilia()    { _agregarMargenCategoria('nuevaFamiliaNombre',    'nuevaFamiliaMargen',    'margenesFamilias',   'familia'); }
function agregarMargenSubfamilia() { _agregarMargenCategoria('nuevaSubfamiliaNombre', 'nuevaSubfamiliaMargen', 'margenesSubfamilias','subfamilia'); }

function eliminarMargen(tipoConfig, nombre) {
    delete config[tipoConfig][nombre]; guardar(); renderMargenes(); renderProductos();
    toast('✅ Margen eliminado', 'success');
}

function renderMargenes() {
    const renderLista = (containerId, obj, tipoConfig) => {
        const el = document.getElementById(containerId);
        if (!el) return;
        const entradas = Object.entries(obj);
        el.innerHTML = entradas.length
            ? entradas.map(([nombre, margen]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee;">
                    <span><strong>${escapeHTML(nombre.toUpperCase())}</strong> → ${margen}%</span>
                    <button class="btn-delete" style="padding:4px 8px;font-size:0.8rem;" onclick="eliminarMargen('${tipoConfig}','${escapeHTMLAttr(nombre)}')">✕</button>
                </div>`).join('')
            : '<p style="color:var(--gray);font-size:0.9rem;">Sin márgenes personalizados</p>';
    };
    renderLista('margenesSecciones',   config.margenesSecciones,   'margenesSecciones');
    renderLista('margenesFamilias',    config.margenesFamilias,    'margenesFamilias');
    renderLista('margenesSubfamilias', config.margenesSubfamilias, 'margenesSubfamilias');
}

async function guardarConfiguracionStockCompleta() {
    config.stockMinimo  = parseInt(document.getElementById('stockMinimoExacto')?.value) || 0;
    config.stockCritico = parseInt(document.getElementById('stockCriticoExacto')?.value) || 5;
    config.stockBajo    = parseInt(document.getElementById('stockBajoExacto')?.value) || 20;
    guardar(); renderProductos(); actualizarFiltros();
    await guardarConfigRemota({
        stockMinimo:  config.stockMinimo,
        stockCritico: config.stockCritico,
        stockBajo:    config.stockBajo
    });
    toast('✅ Config de stock guardada para todos', 'success');
}

async function guardarTopDinamico() {
    const val = parseInt(document.getElementById('topExacto')?.value);
    if (isNaN(val) || val < 1) return toast('❌ Valor inválido', 'error');
    config.topDinamico = val; guardar(); renderProductos();
    await guardarConfigRemota({ topDinamico: val });
    toast(`✅ Top catálogo: ${val} productos (guardado para todos)`, 'success');
}

function actualizarPreviewTop() {
    const top = parseInt(document.getElementById('topRange')?.value) || config.topDinamico;
    const vis = productos.filter(p => p.stock >= (config.stockMinimo || 0));
    const el  = document.getElementById('statsDinamicas');
    if (el) el.innerHTML = `Mostrás los <strong>${Math.min(top, vis.length)}</strong> más vendidos de <strong>${vis.length}</strong> disponibles`;
}

function actualizarPreviewStock() {
    const minimo  = parseInt(document.getElementById('stockMinimoExacto')?.value) || 0;
    const visible = productos.filter(p => p.stock >= minimo);
    const ocultos = productos.length - visible.length;
    const el      = document.getElementById('statsStockFiltro');
    if (el) el.innerHTML = `Mostrando <strong>${visible.length}</strong> productos · <strong>${ocultos}</strong> ocultos por stock bajo`;
}

function renderListaOfertas() {
    const lista = document.getElementById('listaOfertas');
    if (!lista) return;
    const activas = ofertas.filter(o => o.activa);
    lista.innerHTML = activas.length
        ? activas.map(o => {
            const p = productos.find(x => x.id === o.productoId);
            return `
                <div style="padding:10px;border:1px solid var(--accent);margin-bottom:8px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <strong>${escapeHTML(p?.nombre || 'Producto eliminado')}</strong><br>
                        <small>$${o.precioOferta.toLocaleString('es-AR')} · ${o.fechaInicio} → ${o.fechaFin}</small>
                    </div>
                    <button class="btn-delete" onclick="eliminarOferta('${escapeHTMLAttr(o.id)}')" style="padding:6px 12px;">✕</button>
                </div>`;
          }).join('')
        : '<p style="color:var(--gray);">Sin ofertas activas</p>';
}

function eliminarOferta(id) {
    ofertas = ofertas.filter(o => o.id !== id);
    guardar(); renderListaOfertas(); renderProductos();
    toast('✅ Oferta eliminada', 'success');
}

function iniciarBusquedaOferta() {
    const input       = document.getElementById('buscarProductoOferta');
    const autocomplete = document.getElementById('autocompleteOfertas');
    if (!input || !autocomplete) return;

    input.addEventListener('input', debounce(() => {
        const term = input.value.toLowerCase().trim();
        if (term.length < 2) { autocomplete.innerHTML = ''; return; }
        const resultados = productos.filter(p => p.nombre.toLowerCase().includes(term)).slice(0, 8);
        autocomplete.innerHTML = resultados.map(p => `
            <div class="autocomplete-item" data-id="${escapeHTMLAttr(p.id)}" style="padding:10px;cursor:pointer;border-bottom:1px solid #eee;">
                ${escapeHTML(p.emoji || '📦')} ${escapeHTML(p.nombre)}
                <small style="color:var(--gray);"> · $${calcularPrecio(p, 1).toLocaleString('es-AR')}</small>
            </div>`).join('') || '<div style="padding:10px;color:var(--gray);">Sin resultados</div>';

        autocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                mostrarFormularioOferta(item.dataset.id);
                autocomplete.innerHTML = '';
                input.value = '';
            });
        });
    }, 250));
}

function mostrarFormularioOferta(productoId) {
    const p = productos.find(x => x.id === productoId);
    if (!p) return;
    const precioActual = calcularPrecio(p, 1);
    const hoy  = new Date().toISOString().split('T')[0];
    const en7  = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const cont = document.getElementById('resultadosBusquedaOferta');
    cont.innerHTML = `
        <div style="background:#f8f9fa;padding:15px;border-radius:8px;border:2px solid var(--primary);">
            <strong>🔥 ${escapeHTML(p.nombre)}</strong>
            <p style="color:var(--gray);margin:5px 0;">Precio actual: $${precioActual.toLocaleString('es-AR')}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
                <div class="form-group">
                    <label>Precio oferta</label>
                    <input type="number" id="ofertaPrecio" value="${(precioActual * 0.85).toFixed(2)}" step="0.01" min="0">
                </div>
                <div></div>
                <div class="form-group"><label>Desde</label><input type="date" id="ofertaInicio" value="${hoy}"></div>
                <div class="form-group"><label>Hasta</label><input type="date" id="ofertaFin" value="${en7}"></div>
            </div>
            <button class="btn-primary" onclick="guardarOferta('${escapeHTMLAttr(p.id)}')" style="margin-top:10px;width:100%;">
                🔥 Activar Oferta
            </button>
        </div>`;
}

function guardarOferta(productoId) {
    const precio = parseFloat(document.getElementById('ofertaPrecio')?.value);
    const inicio = document.getElementById('ofertaInicio')?.value;
    const fin    = document.getElementById('ofertaFin')?.value;
    if (!precio || precio <= 0) return toast('❌ Precio inválido', 'error');
    if (!inicio || !fin)        return toast('❌ Fechas inválidas', 'error');
    if (inicio > fin)           return toast('❌ La fecha inicio debe ser anterior al fin', 'error');
    ofertas = ofertas.filter(o => o.productoId !== productoId);
    ofertas.push({ id: generarIdUnico(), productoId, precioOferta: precio, fechaInicio: inicio, fechaFin: fin, activa: true });
    guardar(); renderListaOfertas(); renderProductos();
    document.getElementById('resultadosBusquedaOferta').innerHTML = '';
    toast('✅ Oferta activada', 'success');
}

function guardarConfiguracionPromos() {
    const dias = [
        { key: 1, id: 'Lunes' }, { key: 2, id: 'Martes' }, { key: 3, id: 'Miercoles' },
        { key: 4, id: 'Jueves' }, { key: 5, id: 'Viernes' }, { key: 6, id: 'Sabado' }, { key: 0, id: 'Domingo' }
    ];
    dias.forEach(({ key, id }) => {
        PROMOS.dia[key] = {
            activo:     document.getElementById(`promo${id}`)?.checked ?? false,
            minimo:     parseFloat(document.getElementById(`promo${id}Min`)?.value) || 0,
            porcentaje: parseFloat(document.getElementById(`promo${id}Desc`)?.value) || 0
        };
    });
    PROMOS.envioGratis.activo   = document.getElementById('envioGratisActivo')?.checked ?? true;
    PROMOS.envioGratis.minimo   = parseFloat(document.getElementById('envioGratisMin')?.value) || 35000;
    PROMOS.primeraCompra.activo      = document.getElementById('primeraCompraActivo')?.checked ?? true;
    PROMOS.primeraCompra.minimo      = parseFloat(document.getElementById('primeraCompraMin')?.value) || 25000;
    PROMOS.primeraCompra.porcentaje  = parseFloat(document.getElementById('primeraCompraDesc')?.value) || 10;
    PROMOS.primeraCompra.incluyeEnvio= document.getElementById('primeraCompraEnvio')?.checked ?? true;
    PROMOS.especial.activo     = document.getElementById('promoEspecialActivo')?.checked ?? false;
    PROMOS.especial.nombre     = document.getElementById('promoEspecialNombre')?.value.trim() || 'Black Friday';
    PROMOS.especial.inicio     = document.getElementById('promoEspecialInicio')?.value || '';
    PROMOS.especial.fin        = document.getElementById('promoEspecialFin')?.value || '';
    PROMOS.especial.minimo     = parseFloat(document.getElementById('promoEspecialMin')?.value) || 30000;
    PROMOS.especial.porcentaje = parseFloat(document.getElementById('promoEspecialDesc')?.value) || 20;
    guardar(); actualizarCarrito(); mostrarPromosActivasHoy();
    toast('✅ Configuración de promociones guardada', 'success');
}

function cargarUIPromos() {
    const dias = [
        { key: 1, id: 'Lunes' }, { key: 2, id: 'Martes' }, { key: 3, id: 'Miercoles' },
        { key: 4, id: 'Jueves' }, { key: 5, id: 'Viernes' }, { key: 6, id: 'Sabado' }, { key: 0, id: 'Domingo' }
    ];
    dias.forEach(({ key, id }) => {
        const promo = PROMOS.dia[key]; if (!promo) return;
        const cb = document.getElementById(`promo${id}`);
        const mi = document.getElementById(`promo${id}Min`);
        const de = document.getElementById(`promo${id}Desc`);
        if (cb) cb.checked = promo.activo;
        if (mi) mi.value   = promo.minimo;
        if (de) de.value   = promo.porcentaje;
    });
    const eg = document.getElementById('envioGratisActivo'); if (eg) eg.checked = PROMOS.envioGratis.activo;
    const em = document.getElementById('envioGratisMin');    if (em) em.value   = PROMOS.envioGratis.minimo;
    const pa = document.getElementById('primeraCompraActivo'); if (pa) pa.checked = PROMOS.primeraCompra.activo;
    const pm = document.getElementById('primeraCompraMin');    if (pm) pm.value   = PROMOS.primeraCompra.minimo;
    const pd = document.getElementById('primeraCompraDesc');   if (pd) pd.value   = PROMOS.primeraCompra.porcentaje;
    const pe = document.getElementById('primeraCompraEnvio');  if (pe) pe.checked = PROMOS.primeraCompra.incluyeEnvio;
    const ea = document.getElementById('promoEspecialActivo'); if (ea) ea.checked = PROMOS.especial.activo;
    const en = document.getElementById('promoEspecialNombre'); if (en) en.value   = PROMOS.especial.nombre;
    const ei = document.getElementById('promoEspecialInicio'); if (ei) ei.value   = PROMOS.especial.inicio;
    const ef = document.getElementById('promoEspecialFin');    if (ef) ef.value   = PROMOS.especial.fin;
    const emi= document.getElementById('promoEspecialMin');    if (emi)emi.value  = PROMOS.especial.minimo;
    const ede= document.getElementById('promoEspecialDesc');   if (ede)ede.value  = PROMOS.especial.porcentaje;
}

function mostrarPromosActivasHoy() {
    const cont = document.getElementById('promosActivasHoy'); if (!cont) return;
    const hoy  = new Date();
    const msgs = [];
    const promoDia = getPromoDelDia();
    if (promoDia?.activo) msgs.push(`🗓 Promo del día: ${promoDia.porcentaje}% OFF en compras > $${promoDia.minimo.toLocaleString('es-AR')}`);
    if (PROMOS.envioGratis.activo)   msgs.push(`🚚 Envío gratis en compras > $${PROMOS.envioGratis.minimo.toLocaleString('es-AR')}`);
    if (PROMOS.primeraCompra.activo) msgs.push(`🎉 Primera compra: ${PROMOS.primeraCompra.porcentaje}% OFF en compras > $${PROMOS.primeraCompra.minimo.toLocaleString('es-AR')}`);
    if (PROMOS.especial?.activo && PROMOS.especial.inicio && PROMOS.especial.fin) {
        const inicio = parseLocalDate(PROMOS.especial.inicio);
        const fin    = parseLocalDate(PROMOS.especial.fin);
        if (inicio && fin) {
            fin.setHours(23, 59, 59, 999);
            if (hoy >= inicio && hoy <= fin) msgs.push(`🔥 ${PROMOS.especial.nombre}: ${PROMOS.especial.porcentaje}% OFF`);
        }
    }
    cont.innerHTML = msgs.length
        ? msgs.map(m => `<p style="padding:8px;background:#e8f4f8;border-radius:6px;margin-bottom:6px;">✅ ${escapeHTML(m)}</p>`).join('')
        : '<p style="color:var(--gray);">No hay promos activas en este momento</p>';
}

// ============================================
// IMPORTACIÓN / EXPORTACIÓN
// ============================================

// Parsea una fila (de Excel o CSV) a un objeto producto normalizado.
// Retorna null si la fila es inválida.
// Genera un ID estable y reproducible a partir del nombre del producto.
// Así, si reimportás desde Sheets, el mismo producto conserva su ID
// y las ofertas asignadas no se rompen.
function generarIdEstable(nombre) {
    // Normalizar: minúsculas, sin acentos, sin espacios extras, sin caracteres especiales
    return 'p_' + nombre
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
        .replace(/[^a-z0-9]+/g, '_')                        // reemplazar no-alfanum con _
        .replace(/^_+|_+$/g, '')                            // trim underscores
        .substring(0, 80);                                   // máximo 80 chars
}

function parsearFilaProducto(fila) {
    const nombre = (fila.descripcion || fila.Descripcion || fila.nombre || fila.Nombre || fila.PRODUCTO || '').toString().trim();
    if (!nombre) return null;
    const costo = parseFloat(fila.costo || fila.Costo || fila.PRECIO || 0);
    if (isNaN(costo) || costo <= 0) return null;
    const seccion     = (fila['Des. Seccion*']      || fila.seccion     || 'OTROS').toString().trim().toUpperCase();
    const familia     = (fila['Des.Grp. Familia*']  || fila.familia     || '').toString().trim().toUpperCase();
    const subfamilia  = (fila.subfamilia || '').toString().trim().toUpperCase();
    const stock       = Math.max(0, parseInt(fila.Stock || fila.stock || 0) || 0);
    const venta_diaria = Math.max(0, parseFloat(fila.venta_diaria || fila.ventas || 0) || 0);
    // EAN: identificador universal del producto (código de barras)
    const ean = String(fila['*Codigo E.A.N. *'] || fila.Ean || fila.ean || fila.EAN || fila.ean_codigo || '').trim();
    return {
        // ID estable: siempre el mismo para el mismo nombre de producto
        id: generarIdEstable(nombre),
        ean,
        nombre, seccion, familia, subfamilia,
        costo, precio: parseFloat((costo * (1 + config.margenGeneral / 100)).toFixed(2)),
        stock, venta_diaria,
        imagen: fila.imagen || fila.Imagen || '',
        emoji:  fila.emoji  || fila.Emoji  || '📦'
    };
}

function validarArchivoImportacion(file) {
    const ext     = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    const allowed = ['.xlsx', '.xls', '.csv'];
    const msgDiv  = document.getElementById('fileValidationMsg');
    if (!allowed.includes(ext)) {
        msgDiv.className = 'error';
        msgDiv.innerHTML = '❌ Formato no válido. Usá: .xlsx, .xls o .csv';
        msgDiv.style.display = 'block';
        return false;
    }
    if (file.size > 10 * 1024 * 1024) {
        msgDiv.className = 'error';
        msgDiv.innerHTML = '❌ Archivo demasiado grande. Máximo 10 MB.';
        msgDiv.style.display = 'block';
        return false;
    }
    msgDiv.className = 'success';
    msgDiv.innerHTML = `✅ ${escapeHTML(file.name)} (${(file.size / 1024).toFixed(1)} KB) listo para importar`;
    msgDiv.style.display = 'block';
    return true;
}

async function importarExcel(e) {
    const arch = e.target.files[0];
    if (!arch) return;
    if (!validarArchivoImportacion(arch)) return;
    try { await cargarLibreriasAdmin(); }
    catch (err) { toast('❌ No se pudo cargar la librería de importación', 'error'); return; }

    const prev     = document.getElementById('previewContainer');
    const prevCont = document.getElementById('previewContent');
    prev.style.display  = 'block';
    prevCont.innerHTML  = '<p style="color:var(--gray);">⏳ Procesando archivo...</p>';

    const lector = new FileReader();
    lector.onload = function (ev) {
        try {
            const datos = new Uint8Array(ev.target.result);
            const libro = XLSX.read(datos, { type: 'array' });
            const hoja  = libro.Sheets[libro.SheetNames[0]];
            const json  = XLSX.utils.sheet_to_json(hoja);
            if (!json.length) throw new Error('El archivo está vacío');
            const cols     = Object.keys(json[0]).map(k => k.toLowerCase());
            const faltantes = ['descripcion', 'costo'].filter(c => !cols.some(k => k.includes(c)));
            if (faltantes.length) throw new Error(`Columnas faltantes: ${faltantes.join(', ')}`);
            const nuevos = []; let errores = 0;
            json.forEach(fila => {
                try {
                    const prod = parsearFilaProducto(fila);
                    if (prod) nuevos.push(prod); else errores++;
                } catch { errores++; }
            });
            if (!nuevos.length) throw new Error('No se encontraron productos válidos');
            productos = [...productos, ...nuevos];
            localStorage.setItem('ultimaActualizacion', new Date().toISOString());
            guardar(); actualizarFiltros(); renderProductos(); renderProductosAdmin();
            prevCont.innerHTML = `✅ <strong>${nuevos.length}</strong> productos importados${errores ? ` · ⚠️ ${errores} filas con errores ignoradas` : ''}`;
            toast(`✅ ${nuevos.length} productos importados`, 'success');
        } catch (error) {
            prevCont.innerHTML = `<span style="color:var(--primary);">❌ ${escapeHTML(error.message)}</span>`;
            toast('❌ Error: ' + error.message, 'error');
        }
    };
    lector.readAsArrayBuffer(arch);
}

async function cargarDesdeGoogleSheets(silencioso = false) {
    try { await cargarLibreriasAdmin(); }
    catch { if (!silencioso) toast('❌ No se pudo cargar PapaParse', 'error'); return; }
    try {
        if (!silencioso) toast('⏳ Cargando desde Google Sheets...', 'success');
        const response = await fetch(GOOGLE_SHEET_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();
        const result  = Papa.parse(csvText, {
            header: true, skipEmptyLines: true,
            transformHeader: h => h.trim().replace(/^"|"$/g, ''),
            transform: v => v.trim().replace(/^"|"$/g, '')
        });
        if (result.errors.length) console.warn('Errores CSV:', result.errors);
        const nuevos = [];
        for (const fila of result.data) {
            if (!fila || !Object.keys(fila).length) continue;
            const prod = parsearFilaProducto(fila);
            if (prod) nuevos.push(prod);
        }
        if (!nuevos.length) throw new Error('No se encontraron productos en el sheet');
        // Solo reemplazar si la carga fue exitosa (no destruir datos locales si el sheet falla)
        productos = nuevos;
        // Limpiar ofertas huérfanas: eliminar ofertas que apuntan a productos que ya no existen
        const idsValidos = new Set(nuevos.map(p => p.id));
        const ofertasAntes = ofertas.length;
        ofertas = ofertas.filter(o => idsValidos.has(o.productoId));
        const ofertasEliminadas = ofertasAntes - ofertas.length;
        if (ofertasEliminadas > 0) {
            console.warn(`🧹 ${ofertasEliminadas} oferta(s) huérfana(s) eliminadas al recargar productos`);
        }
        localStorage.setItem('ultimaActualizacion', new Date().toISOString());
        guardar(); actualizarFiltros(); renderProductos(); renderProductosAdmin();
        if (!silencioso) toast(`✅ ${nuevos.length} productos cargados`, 'success');
    } catch (error) {
        if (!silencioso) toast(`❌ Error al cargar: ${error.message}`, 'error');
        console.error('Google Sheets error:', error);
    }
}

// ============================================
// VERIFICACIÓN DE PASSWORD
// ============================================
async function verificarPassword() {
    const pass = document.getElementById('passwordInput').value;
    if (!pass) return;
    const hash = await hashPassword(pass);
    if (hash === ADMIN_PASSWORD_HASH) {
        document.getElementById('passwordModal').classList.remove('show');
        document.getElementById('adminPanel').classList.add('open');
        document.getElementById('passwordInput').value = '';
        renderProductosAdmin(); renderMargenes(); renderListaOfertas();
        cargarUIPromos(); actualizarPreviewTop(); actualizarPreviewStock();
        const topR = document.getElementById('topRange');
        const topE = document.getElementById('topExacto');
        const topD = document.getElementById('topValorDisplay');
        if (topR) topR.value = config.topDinamico;
        if (topE) topE.value = config.topDinamico;
        if (topD) topD.textContent = config.topDinamico;
        const smR = document.getElementById('stockMinimoRange');
        const smE = document.getElementById('stockMinimoExacto');
        const scR = document.getElementById('stockCriticoRange');
        const scE = document.getElementById('stockCriticoExacto');
        const sbR = document.getElementById('stockBajoRange');
        const sbE = document.getElementById('stockBajoExacto');
        const snM = document.getElementById('stockNormalMin');
        if (smR) smR.value = config.stockMinimo;
        if (smE) smE.value = config.stockMinimo;
        if (scR) scR.value = config.stockCritico;
        if (scE) scE.value = config.stockCritico;
        if (sbR) sbR.value = config.stockBajo;
        if (sbE) sbE.value = config.stockBajo;
        if (snM) snM.value = config.stockBajo + 1;
    } else {
        toast('❌ Contraseña incorrecta', 'error');
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordInput').focus();
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 Mercadito Virtual iniciando...');

    const badge = document.getElementById('badgeMendoza');
    if (badge) {
        const updateStickyHeights = () => {
            const badgeH = badge.offsetHeight;
            document.documentElement.style.setProperty('--badge-height', badgeH + 'px');
        };
        updateStickyHeights();
        window.addEventListener('resize', debounce(updateStickyHeights, 200));
    }

    document.getElementById('adminPanel')?.classList.remove('open');
    document.getElementById('cartSidebar')?.classList.remove('open');
    document.getElementById('passwordModal')?.classList.remove('show');
    document.getElementById('deliveryModal')?.classList.remove('show');

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.update()));
    }

    cargarConfigRemota();

    const ultimaSync = localStorage.getItem('ultimaActualizacion');
    const hace6hs    = Date.now() - 6 * 3600 * 1000;
    if (!ultimaSync || new Date(ultimaSync).getTime() < hace6hs || productos.length === 0) {
        cargarDesdeGoogleSheets(true);
    }

    // Cargar folleto: refrescar cada 12hs o si no hay datos
    const ultimaFolleto = localStorage.getItem('ultimaActualizacionFolleto');
    const hace12hs = Date.now() - 12 * 3600 * 1000;
    if (!ultimaFolleto || new Date(ultimaFolleto).getTime() < hace12hs || Object.keys(folletoItems).length === 0) {
        cargarFolleto(true); // silencioso al inicio
    }

    actualizarFiltros();
    renderProductos();
    actualizarCarrito();
    actualizarContadorFiltros();

    document.getElementById('searchInput').addEventListener('input', debounce(e => {
        filtros.busqueda = e.target.value;
        renderProductos();
    }, 300));

    const searchToggleBtn = document.getElementById('searchToggleBtn');
    const searchBarMobile = document.getElementById('searchBarMobile');
    const searchInputMobile = document.getElementById('searchInputMobile');
    const searchCloseBtn = document.getElementById('searchCloseBtn');

    searchToggleBtn?.addEventListener('click', () => {
        searchBarMobile.classList.add('open');
        setTimeout(() => searchInputMobile.focus(), 50);
    });
    searchCloseBtn?.addEventListener('click', () => {
        searchBarMobile.classList.remove('open');
        searchInputMobile.value = '';
        filtros.busqueda = '';
        renderProductos();
    });
    searchInputMobile?.addEventListener('input', debounce(e => {
        filtros.busqueda = e.target.value;
        renderProductos();
    }, 300));

    document.getElementById('cartBtn').addEventListener('click', () =>
        document.getElementById('cartSidebar').classList.add('open'));
    document.getElementById('closeCartBtn').addEventListener('click', () =>
        document.getElementById('cartSidebar').classList.remove('open'));
    document.getElementById('checkoutBtn').addEventListener('click', abrirModalEntrega);
    document.getElementById('clearCartBtn').addEventListener('click', vaciarCarrito);

    document.getElementById('cartItems').addEventListener('click', e => {
        const btn = e.target.closest('[data-id]');
        if (!btn) return;
        const id     = btn.dataset.id;
        const accion = btn.dataset.accion;
        if (accion === 'remove') eliminarDelCarrito(id);
        else actualizarCantidad(id, parseInt(accion));
    });

    document.getElementById('productsGrid').addEventListener('click', e => {
        const btn = e.target.closest('.add-to-cart-btn');
        if (btn && !btn.disabled) agregarAlCarrito(btn.dataset.id);
    });

    document.getElementById('cancelDeliveryBtn')?.addEventListener('click', cerrarModalEntrega);
    document.getElementById('confirmDeliveryBtn')?.addEventListener('click', generarWhatsApp);
    document.getElementById('deliveryModal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('deliveryModal')) cerrarModalEntrega();
    });
    ['deliveryName','deliveryAddress','deliveryNotes'].forEach(id => {
        document.getElementById(id)?.addEventListener('keypress', e => {
            if (e.key === 'Enter') generarWhatsApp();
        });
    });

    document.getElementById('logoBtn').addEventListener('click', e => {
        if (e.detail === 3) {
            document.getElementById('passwordModal').classList.add('show');
            setTimeout(() => document.getElementById('passwordInput').focus(), 100);
        }
    });
    document.getElementById('confirmPasswordBtn').addEventListener('click', verificarPassword);
    document.getElementById('passwordInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') verificarPassword();
    });
    document.getElementById('cancelPasswordBtn').addEventListener('click', () => {
        document.getElementById('passwordModal').classList.remove('show');
        document.getElementById('passwordInput').value = '';
    });
    document.getElementById('closeAdminBtn').addEventListener('click', () =>
        document.getElementById('adminPanel').classList.remove('open'));

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(`${this.dataset.tab}Tab`).classList.add('active');
        });
    });

    document.getElementById('buscarProductoAdmin').addEventListener('input', renderProductosAdmin);
    document.getElementById('productListAdmin').addEventListener('click', e => {
        const btn = e.target.closest('.btn-delete[data-id]');
        if (btn) eliminarProducto(btn.dataset.id);
    });
    document.getElementById('deleteAllBtn').addEventListener('click', () => {
        if (!productos.length) return toast('⚠ Sin productos', 'warning');
        confirmarAccion(`¿Eliminar los ${productos.length} productos? Esta acción no se puede deshacer.`, () => {
            productos = []; carrito = [];
            guardar(); renderProductos(); renderProductosAdmin(); actualizarCarrito(); actualizarFiltros();
            toast('✅ Todos los productos eliminados', 'success');
        });
    });

    document.getElementById('addProductBtn')?.addEventListener('click', agregarProductoManual);

    document.getElementById('dropZone').addEventListener('click', () =>
        document.getElementById('excelFile').click());
    document.getElementById('excelFile').addEventListener('change', importarExcel);
    document.getElementById('importBtn').addEventListener('click', async e => {
        e.preventDefault();
        try { await cargarLibreriasAdmin(); } catch { toast('❌ Error cargando librerías', 'error'); return; }
        document.getElementById('excelFile').click();
    });
    document.getElementById('exportBtn').addEventListener('click', async () => {
        if (!productos.length) return toast('⚠ Sin productos para exportar', 'warning');
        try {
            await cargarLibreriasAdmin();
            const datos = productos.map(p => ({
                nombre: p.nombre, seccion: p.seccion, familia: p.familia, subfamilia: p.subfamilia,
                costo: p.costo, precio: p.precio, stock: p.stock, imagen: p.imagen || '', emoji: p.emoji || ''
            }));
            const ws = XLSX.utils.json_to_sheet(datos);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Productos');
            XLSX.writeFile(wb, `productos_${new Date().toISOString().split('T')[0]}.xlsx`);
            toast('✅ Exportado correctamente', 'success');
        } catch (err) { toast('❌ Error al exportar: ' + err.message, 'error'); }
    });

    const syncSlider = (rangeId, numId, numMin, callback) => {
        const range = document.getElementById(rangeId);
        const num   = document.getElementById(numId);
        if (!range || !num) return;
        range.addEventListener('input', () => { num.value = range.value; if (numMin) document.getElementById(numMin).value = parseInt(range.value) + 1; if (callback) callback(); });
        num.addEventListener('input',   () => { range.value = num.value; if (numMin) document.getElementById(numMin).value = parseInt(num.value) + 1; if (callback) callback(); });
    };
    syncSlider('stockMinimoRange',  'stockMinimoExacto',  null,            actualizarPreviewStock);
    syncSlider('stockCriticoRange', 'stockCriticoExacto', null,            actualizarPreviewStock);
    syncSlider('stockBajoRange',    'stockBajoExacto',    'stockNormalMin',actualizarPreviewStock);

    const topRange  = document.getElementById('topRange');
    const topExacto = document.getElementById('topExacto');
    if (topRange && topExacto) {
        topRange.value  = config.topDinamico;
        topExacto.value = config.topDinamico;
        topRange.addEventListener('input', () => {
            topExacto.value = topRange.value;
            document.getElementById('topValorDisplay').textContent = topRange.value;
            actualizarPreviewTop();
        });
        topExacto.addEventListener('input', () => {
            topRange.value = topExacto.value;
            document.getElementById('topValorDisplay').textContent = topExacto.value;
            actualizarPreviewTop();
        });
    }

    const mgEl = document.getElementById('margenGeneral');
    const dcEl = document.getElementById('descuentoCantidad');
    if (mgEl) mgEl.value = config.margenGeneral;
    if (dcEl) dcEl.value = config.descuentoCantidad;

    iniciarBusquedaOferta();

    document.getElementById('filtersToggleBtn')?.addEventListener('click', () =>
        document.getElementById('filtersModal').classList.add('show'));
    document.getElementById('closeFiltersBtn')?.addEventListener('click', () =>
        document.getElementById('filtersModal').classList.remove('show'));
    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
        filtros.seccion    = document.getElementById('seccionFilter').value;
        filtros.familia    = document.getElementById('familiaFilter').value;
        filtros.subfamilia = document.getElementById('subfamiliaFilter').value;
        document.getElementById('seccionFilterDesktop').value    = filtros.seccion;
        document.getElementById('familiaFilterDesktop').value    = filtros.familia;
        document.getElementById('subfamiliaFilterDesktop').value = filtros.subfamilia;
        actualizarFiltros(); renderProductos(); actualizarContadorFiltros();
        document.getElementById('filtersModal').classList.remove('show');
    });
    document.getElementById('seccionFilterDesktop')?.addEventListener('change', e => {
        filtros.seccion = e.target.value; filtros.familia = ''; filtros.subfamilia = '';
        actualizarFiltros(); renderProductos(); actualizarContadorFiltros();
    });
    document.getElementById('familiaFilterDesktop')?.addEventListener('change', e => {
        filtros.familia = e.target.value; filtros.subfamilia = '';
        actualizarFiltros(); renderProductos(); actualizarContadorFiltros();
    });
    document.getElementById('subfamiliaFilterDesktop')?.addEventListener('change', e => {
        filtros.subfamilia = e.target.value;
        renderProductos(); actualizarContadorFiltros();
    });
    document.getElementById('filtersReset').addEventListener('click', resetFiltros);

    document.getElementById('lastUpdate').textContent = new Date().toLocaleDateString('es-AR');

    console.log('✅ Mercadito Virtual listo');
});