// ============================================
// MERCADITO VIRTUAL - MENDOZA
// JavaScript Completo (Versión Híbrida Optimizada + Admin Full)
// ============================================

// ============================================
// CONFIGURACIÓN GLOBAL
// ============================================
const ADMIN_PASSWORD_HASH = 'hash_5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5'; // hash de '12345' (cambiar en producción)
const NUMERO_WHATSAPP = '5492616312850';
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRO5TmA-MgtcLCMPHMiGnxK_vtjDviMIEQJk6o2WmgrCl4XHjxtuI26HJRFLgiQC4VCT0XO1gPoKSfR/pub?output=csv';

// ============================================
// VARIABLES GLOBALES
// ============================================
let productos = JSON.parse(localStorage.getItem('productosTienda_v2')) || [];
let carrito = JSON.parse(localStorage.getItem('carritoTienda_v2')) || [];
let ofertas = JSON.parse(localStorage.getItem('ofertasTienda')) || [];
let usuarioYaCompro = localStorage.getItem('yaCompro') === 'true';

// Configuración de márgenes y stock
let config = JSON.parse(localStorage.getItem('configTienda')) || {
    margenGeneral: 30,
    descuentoCantidad: 5,
    margenesSecciones: {},
    margenesFamilias: {},
    margenesSubfamilias: {},
    topDinamico: 100,
    stockMinimo: 20,
    stockCritico: 5,
    stockBajo: 20
};

// Configuración de promociones
let PROMOS = JSON.parse(localStorage.getItem('promosConfig')) || {
    dia: {
        0: { activo: true, minimo: 25000, porcentaje: 12 }, // domingo
        1: { activo: true, minimo: 20000, porcentaje: 8 },  // lunes
        2: { activo: false, minimo: 25000, porcentaje: 10 }, // martes
        3: { activo: false, minimo: 25000, porcentaje: 10 }, // miércoles
        4: { activo: false, minimo: 25000, porcentaje: 10 }, // jueves
        5: { activo: true, minimo: 25000, porcentaje: 12 },  // viernes
        6: { activo: true, minimo: 25000, porcentaje: 12 },  // sábado
    },
    envioGratis: { minimo: 35000, activo: true },
    primeraCompra: { activo: true, minimo: 25000, porcentaje: 10, incluyeEnvio: true },
    especial: { activo: false, nombre: 'Black Friday', inicio: '', fin: '', minimo: 30000, porcentaje: 20 }
};

// Filtros actuales
let filtros = { seccion: '', familia: '', subfamilia: '', busqueda: '' };

// ============================================
// FUNCIONES DE UTILIDAD
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
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function generarIdUnico() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function guardar() {
    try {
        localStorage.setItem('productosTienda_v2', JSON.stringify(productos));
        localStorage.setItem('carritoTienda_v2', JSON.stringify(carrito));
        localStorage.setItem('configTienda', JSON.stringify(config));
        localStorage.setItem('ofertasTienda', JSON.stringify(ofertas));
        localStorage.setItem('promosConfig', JSON.stringify(PROMOS));
        localStorage.setItem('yaCompro', usuarioYaCompro ? 'true' : 'false');
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            toast('⚠ Almacenamiento lleno. Elimina productos antiguos.', 'error');
        } else {
            toast('❌ Error al guardar datos', 'error');
        }
    }
}

function validarURL(url) {
    if (!url || url.trim() === '') return false;
    const protocolosPeligrosos = ['javascript:', 'data:', 'vbscript:', 'file:'];
    const urlLower = url.toLowerCase().trim();
    for (let proto of protocolosPeligrosos) {
        if (urlLower.startsWith(proto)) return false;
    }
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch { 
        return false; 
    }
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
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return 'hash_' + hashHex;
}

// ============================================
// FUNCIONES DE PROMOCIONES
// ============================================
function esPrimeraCompra() {
    return PROMOS.primeraCompra.activo && !usuarioYaCompro;
}

function marcarComoComprado() {
    usuarioYaCompro = true;
    localStorage.setItem('yaCompro', 'true');
}

function getPromoDelDia() {
    const ahora = new Date();
    const fechaArgentina = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Mendoza' }));
    const diaArgentina = fechaArgentina.getDay(); // 0 domingo, 1 lunes, ...
    return PROMOS.dia[diaArgentina] || null;
}

function calcularDescuentos(total) {
    let descuentos = { porcentaje: 0, envioGratis: false, montoDescuento: 0, totalFinal: total, mensajes: [] };

    // Promoción especial (fechas)
    if (PROMOS.especial && PROMOS.especial.activo && PROMOS.especial.inicio && PROMOS.especial.fin) {
        const hoy = new Date();
        const inicio = new Date(PROMOS.especial.inicio);
        const fin = new Date(PROMOS.especial.fin);
        fin.setHours(23, 59, 59, 999);
        if (hoy >= inicio && hoy <= fin && total >= PROMOS.especial.minimo) {
            descuentos.porcentaje = PROMOS.especial.porcentaje;
            descuentos.mensajes.push(`🔥 ${PROMOS.especial.nombre}: ${PROMOS.especial.porcentaje}% OFF`);
        }
    }

    // Promo del día
    const promoDia = getPromoDelDia();
    if (promoDia && promoDia.activo && total >= promoDia.minimo) {
        if (promoDia.porcentaje > descuentos.porcentaje) {
            descuentos.porcentaje = promoDia.porcentaje;
            descuentos.mensajes = [`${promoDia.porcentaje}% OFF por promo del día`];
        }
    }

    // Primera compra
    if (esPrimeraCompra() && total >= PROMOS.primeraCompra.minimo) {
        if (PROMOS.primeraCompra.porcentaje > descuentos.porcentaje) {
            descuentos.porcentaje = PROMOS.primeraCompra.porcentaje;
            descuentos.mensajes = [`${PROMOS.primeraCompra.porcentaje}% OFF por primera compra`];
        }
        if (PROMOS.primeraCompra.incluyeEnvio) {
            descuentos.envioGratis = true;
            descuentos.mensajes.push('🚚 Envío gratis incluido');
        }
    }

    // Envío gratis general (si no se activó ya)
    if (PROMOS.envioGratis.activo && total >= PROMOS.envioGratis.minimo && !descuentos.envioGratis) {
        descuentos.envioGratis = true;
        descuentos.mensajes.push('🚚 Envío gratis incluido');
    }

    if (descuentos.porcentaje > 0) {
        descuentos.montoDescuento = total * (descuentos.porcentaje / 100);
        descuentos.totalFinal = total - descuentos.montoDescuento;
    }

    return descuentos;
}

function actualizarBannerPrimeraCompra(total) {
    const banner = document.getElementById('bannerPrimeraCompra');
    const mensaje = document.getElementById('bannerMensaje');
    const progreso = document.getElementById('bannerProgreso');
    if (!banner || !PROMOS.primeraCompra.activo) {
        if (banner) banner.style.display = 'none';
        return;
    }
    banner.style.display = 'block';
    const minimo = PROMOS.primeraCompra.minimo;
    const falta = Math.max(0, minimo - total);
    if (total >= minimo) {
        mensaje.innerText = '🎉 ¡Desbloqueaste 10% OFF + envío gratis!';
        progreso.innerText = '✅ Beneficio aplicado';
    } else {
        mensaje.innerText = `10% off + envío gratis en compras > $${minimo.toLocaleString('es-AR')}`;
        progreso.innerText = `Llevás $${total.toLocaleString('es-AR')} · Te faltan $${falta.toLocaleString('es-AR')}`;
    }
}

// ============================================
// FUNCIONES DE PRODUCTOS Y PRECIOS
// ============================================
function calcularPrecio(producto, cant = 1) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const oferta = ofertas.find(o => {
        if (o.productoId !== producto.id || !o.activa) return false;
        const inicio = new Date(o.fechaInicio);
        inicio.setHours(0, 0, 0, 0);
        const fin = new Date(o.fechaFin);
        fin.setHours(23, 59, 59, 999);
        return hoy >= inicio && hoy <= fin;
    });

    if (oferta) return oferta.precioOferta;

    let margen = config.margenGeneral;

    if (producto.subfamilia && config.margenesSubfamilias[producto.subfamilia.toLowerCase()]) {
        margen = config.margenesSubfamilias[producto.subfamilia.toLowerCase()];
    } else if (producto.familia && config.margenesFamilias[producto.familia.toLowerCase()]) {
        margen = config.margenesFamilias[producto.familia.toLowerCase()];
    } else if (producto.seccion && config.margenesSecciones[producto.seccion.toLowerCase()]) {
        margen = config.margenesSecciones[producto.seccion.toLowerCase()];
    }

    if (cant >= 3) margen -= config.descuentoCantidad;

    return parseFloat((producto.costo * (1 + margen / 100)).toFixed(2));
}

function estaEnOferta(p) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return ofertas.some(o => {
        if (o.productoId !== p.id || !o.activa) return false;
        const inicio = new Date(o.fechaInicio);
        inicio.setHours(0, 0, 0, 0);
        const fin = new Date(o.fechaFin);
        fin.setHours(23, 59, 59, 999);
        return hoy >= inicio && hoy <= fin;
    });
}

function filtrarProductos() {
    let prods = productos.filter(p => p.stock >= (config.stockMinimo || 0));
    prods.sort((a, b) => (b.venta_diaria || 0) - (a.venta_diaria || 0));
    const topValue = config.topDinamico || 100;
    prods = prods.slice(0, topValue);

    if (filtros.seccion) prods = prods.filter(p => p.seccion === filtros.seccion);
    if (filtros.familia) prods = prods.filter(p => p.familia === filtros.familia);
    if (filtros.subfamilia) prods = prods.filter(p => p.subfamilia === filtros.subfamilia);

    if (filtros.busqueda.trim()) {
        const term = filtros.busqueda.toLowerCase();
        prods = prods.filter(p => p.nombre.toLowerCase().includes(term));
    }

    return prods;
}

function renderProductos() {
    const grid = document.getElementById('productsGrid');
    grid.classList.remove('skeleton-loading');

    const prods = filtrarProductos();
    actualizarBreadcrumb();

    let titulo = '🌟 Nuestros Productos';
    if (filtros.subfamilia) titulo = filtros.subfamilia;
    else if (filtros.familia) titulo = filtros.familia;
    else if (filtros.seccion) titulo = filtros.seccion;
    document.getElementById('sectionTitle').textContent = titulo;

    if (prods.length === 0) {
        grid.innerHTML = `<div class="no-results"><h3>No hay productos</h3></div>`;
        return;
    }

    grid.innerHTML = prods.map(p => {
        const p1 = calcularPrecio(p, 1);
        const p3 = calcularPrecio(p, 3);
        const enOf = estaEnOferta(p);
        const pOrig = p.costo * (1 + config.margenGeneral / 100);

        let stockBadge = '', stockClass = '', stockText = '';
        if (p.stock <= 0) {
            stockBadge = '<span class="stock-badge sin-stock">✕ Sin stock</span>';
            stockClass = 'danger';
            stockText = '❌ Agotado';
        } else if (p.stock <= config.stockCritico) {
            stockBadge = '<span class="stock-badge sin-stock">🔴 CRÍTICO</span>';
            stockClass = 'danger';
            stockText = p.stock === 1 ? '🔴 Última unidad' : `🔴 Últimas ${p.stock} unidades`;
        } else if (p.stock <= config.stockBajo) {
            stockBadge = '<span class="stock-badge poco-stock">🟡 BAJO</span>';
            stockClass = 'warning';
            stockText = `🟡 Quedan ${p.stock} unidades`;
        } else {
            stockBadge = '<span class="stock-badge disponible">✅ Disponible</span>';
            stockClass = '';
            stockText = '✅ Disponible';
        }

        // Imagen con WebP y lazy loading
        const imgHTML = validarURL(p.imagen)
            ? `<picture>
                <source srcset="${escapeHTMLAttr(p.imagen).replace(/\.(jpg|jpeg|png)$/i, '.webp')}" type="image/webp">
                <source srcset="${escapeHTMLAttr(p.imagen)}" type="image/${p.imagen.match(/\.(jpg|jpeg)$/i) ? 'jpeg' : 'png'}">
                <img src="${escapeHTMLAttr(p.imagen)}" alt="${escapeHTMLAttr(p.nombre)}" loading="lazy" decoding="async" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
              </picture>
              <div class="image-placeholder" style="display: none;">${escapeHTML(p.emoji) || '📦'}</div>`
            : `<div class="image-placeholder">${escapeHTML(p.emoji) || '📦'}</div>`;

        const precio = enOf
            ? `<div class="product-price oferta-price">$${p1.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>
               <span class="product-price-original">$${pOrig.toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>`
            : `<div class="product-price">$${p1.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>`;

        const p3HTML = p3 < p1
            ? `<div class="precio-por-cantidad">🎁 3+ unidades: $${p3.toLocaleString('es-AR', {minimumFractionDigits: 2})} c/u</div>`
            : '';

        const nombreCorto = escapeHTML(p.nombre.length > 50 ? p.nombre.substring(0, 50) + '...' : p.nombre);

        return `
            <div class="product-card ${enOf ? 'en-oferta' : ''}">
                ${enOf ? '<div class="oferta-badge">🔥 OFERTA</div>' : ''}
                <div class="product-image-container">
                    ${imgHTML}
                    ${stockBadge}
                </div>
                <div class="product-info">
                    <h3 class="product-name" title="${escapeHTMLAttr(p.nombre)}" data-fullname="${escapeHTMLAttr(p.nombre)}">${nombreCorto}</h3>
                    <div class="price-container">
                        ${precio}
                        ${p3HTML}
                    </div>
                    <div class="product-stock ${stockClass}">${stockText}</div>
                    <button class="add-to-cart-btn" onclick="agregarAlCarrito('${p.id}')" ${p.stock <= 0 ? 'disabled' : ''}>
                        ${p.stock > 0 ? '🛒 Sumar al pedido' : '✕ Sin stock'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Nota: la sección de productos relacionados se ha eliminado (no implementada)
    document.getElementById('relatedProducts').style.display = 'none';
}

// ============================================
// FILTROS Y BREADCRUMB
// ============================================
function actualizarFiltros() {
    const productosVisibles = productos.filter(p => p.stock >= (config.stockMinimo || 0));

    const secciones = [...new Set(productosVisibles.map(p => p.seccion).filter(Boolean))].sort();

    let familias = [];
    if (filtros.seccion) {
        familias = [...new Set(productosVisibles.filter(p => p.seccion === filtros.seccion).map(p => p.familia).filter(Boolean))].sort();
    } else {
        familias = [...new Set(productosVisibles.map(p => p.familia).filter(Boolean))].sort();
    }

    let subfamilias = [];
    if (filtros.familia) {
        subfamilias = [...new Set(productosVisibles.filter(p => p.familia === filtros.familia).map(p => p.subfamilia).filter(Boolean))].sort();
    } else if (filtros.seccion) {
        subfamilias = [...new Set(productosVisibles.filter(p => p.seccion === filtros.seccion).map(p => p.subfamilia).filter(Boolean))].sort();
    } else {
        subfamilias = [...new Set(productosVisibles.map(p => p.subfamilia).filter(Boolean))].sort();
    }

    function actualizarSelect(id, opciones, valorActual) {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">Todas</option>' + 
            opciones.map(v => `<option value="${v}">${v}</option>`).join('');
        if (valorActual && opciones.includes(valorActual)) {
            sel.value = valorActual;
        } else {
            sel.value = '';
        }
    }

    actualizarSelect('seccionFilter', secciones, filtros.seccion);
    actualizarSelect('familiaFilter', familias, filtros.familia);
    actualizarSelect('subfamiliaFilter', subfamilias, filtros.subfamilia);
    actualizarSelect('seccionFilterDesktop', secciones, filtros.seccion);
    actualizarSelect('familiaFilterDesktop', familias, filtros.familia);
    actualizarSelect('subfamiliaFilterDesktop', subfamilias, filtros.subfamilia);
}

function resetFiltros() {
    filtros = { seccion: '', familia: '', subfamilia: '', busqueda: filtros.busqueda };
    document.getElementById('searchInput').value = filtros.busqueda;
    actualizarFiltros();
    renderProductos();
    actualizarContadorFiltros();
    toast('🔄 Filtros limpiados', 'success');
}

function contarFiltrosActivos() {
    return (filtros.seccion ? 1 : 0) + (filtros.familia ? 1 : 0) + (filtros.subfamilia ? 1 : 0);
}

function actualizarContadorFiltros() {
    const count = contarFiltrosActivos();
    const badge = document.getElementById('filtersCount');
    const resetBtn = document.getElementById('filtersReset');

    badge.textContent = count;
    if (count > 0) {
        badge.classList.remove('zero');
        resetBtn.disabled = false;
    } else {
        badge.classList.add('zero');
        resetBtn.disabled = true;
    }
}

function actualizarBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    let html = '<a href="#" data-action="home">🏠 Inicio</a>';

    if (filtros.seccion) html += ` <span>›</span> <a href="#" data-action="seccion">${filtros.seccion}</a>`;
    if (filtros.familia) html += ` <span>›</span> <a href="#" data-action="familia">${filtros.familia}</a>`;
    if (filtros.subfamilia) html += ` <span>›</span> <span>${filtros.subfamilia}</span>`;

    bc.innerHTML = html;

    bc.querySelectorAll('[data-action]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const action = e.target.dataset.action;
            if (action === 'home') {
                filtros.seccion = filtros.familia = filtros.subfamilia = '';
            } else if (action === 'seccion') {
                filtros.familia = filtros.subfamilia = '';
            } else if (action === 'familia') {
                filtros.subfamilia = '';
            }
            actualizarFiltros();
            renderProductos();
        });
    });
}

function scrollToProducts() {
    document.getElementById('productsGrid').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// CARRITO
// ============================================
function actualizarCarrito() {
    const items = document.getElementById('cartItems');
    const total = document.getElementById('cartTotal');
    const savings = document.getElementById('cartSavings');

    const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);

    let totalSinDescuento = 0;
    carrito.forEach(item => {
        const p = productos.find(x => x.id === item.id);
        if (p) {
            totalSinDescuento += calcularPrecio(p, item.cantidad) * item.cantidad;
        }
    });

    const descuentos = calcularDescuentos(totalSinDescuento);

    const montoFormateado = totalSinDescuento > 0 
        ? `$${Math.round(totalSinDescuento).toLocaleString('es-AR')}`
        : '$0';

    document.getElementById('cartText').textContent = totalItems > 0 
        ? `Carrito (${totalItems}) - ${montoFormateado}`
        : 'Carrito (0)';

    document.getElementById('ctaMobileText').textContent = totalItems > 0
        ? `Comprar (${totalItems}) - ${montoFormateado}`
        : 'Comprar (0) - $0';

    // Actualizar banner de primera compra
    actualizarBannerPrimeraCompra(totalSinDescuento);

    if (typeof gtag === "function" && totalSinDescuento > 0) {
        gtag("event", "view_cart", {
            currency: "ARS",
            value: descuentos.totalFinal || totalSinDescuento
        });
    }

    if (carrito.length === 0) {
        items.innerHTML = `<div class="empty-cart">🛒 Carrito vacío</div>`;
        total.textContent = '$0,00';
        savings.style.display = 'none';
        return;
    }

    let html = '';
    carrito.forEach(item => {
        const p = productos.find(x => x.id === item.id);
        if (!p) return;

        const pUnit = calcularPrecio(p, item.cantidad);
        const sub = pUnit * item.cantidad;

        html += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHTML(item.nombre)}</div>
                    <div class="cart-item-price">$${pUnit.toLocaleString('es-AR')} x ${item.cantidad} = $${sub.toLocaleString('es-AR')}</div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="actualizarCantidad('${item.id}', -1)">−</button>
                        <span class="qty-display">${item.cantidad}</span>
                        <button class="qty-btn" onclick="actualizarCantidad('${item.id}', 1)">+</button>
                        <button class="remove-btn" onclick="eliminarDelCarrito('${item.id}')">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    });

    items.innerHTML = html;

    if (descuentos.montoDescuento > 0) {
        total.textContent = `$${descuentos.totalFinal.toLocaleString('es-AR')}`;
        savings.innerHTML = `
            <div style="background: #e8f4f8; padding: 10px; border-radius: 8px;">
                <strong>💰 DESCUENTOS APLICADOS:</strong><br>
                ${descuentos.mensajes.join('<br>')}<br>
                <span style="color: var(--success);">-$${descuentos.montoDescuento.toLocaleString('es-AR')}</span>
            </div>
        `;
        savings.style.display = 'block';
    } else {
        total.textContent = `$${totalSinDescuento.toLocaleString('es-AR')}`;
        savings.style.display = 'none';
    }
}

function agregarAlCarrito(id) {
    const p = productos.find(x => x.id === id);
    if (!p || p.stock <= 0) {
        toast('❌ Sin stock', 'error');
        return;
    }

    const item = carrito.find(x => x.id === id);
    if (item) {
        if (item.cantidad >= p.stock) {
            toast('⚠ No hay más stock', 'warning');
            return;
        }
        item.cantidad++;
    } else {
        carrito.push({
            id: p.id,
            nombre: p.nombre,
            costo: p.costo,
            cantidad: 1,
            imagen: p.imagen,
            emoji: p.emoji,
            seccion: p.seccion,
            familia: p.familia,
            subfamilia: p.subfamilia
        });
    }

    guardar();
    actualizarCarrito();
    toast(`✅ ${p.nombre} agregado`, 'success');

    if (typeof gtag === "function") {
        gtag("event", "add_to_cart", {
            currency: "ARS",
            value: calcularPrecio(p, 1),
            items: [{
                item_id: p.id,
                item_name: p.nombre,
                price: calcularPrecio(p, 1),
                quantity: 1,
                item_category: p.seccion || "General"
            }]
        });
    }
}

function actualizarCantidad(id, cambio) {
    const item = carrito.find(x => x.id === id);
    const p = productos.find(x => x.id === id);
    if (!item || !p) return;

    const nueva = item.cantidad + cambio;
    if (nueva <= 0) {
        eliminarDelCarrito(id);
        return;
    }

    if (nueva > p.stock) {
        toast('⚠ No hay más stock', 'warning');
        return;
    }

    item.cantidad = nueva;
    guardar();
    actualizarCarrito();
}

function eliminarDelCarrito(id) {
    carrito = carrito.filter(x => x.id !== id);
    guardar();
    actualizarCarrito();
    toast('🗑️ Eliminado', 'success');
}

function vaciarCarrito() {
    if (carrito.length === 0) {
        toast('⚠ Ya está vacío', 'warning');
        return;
    }
    if (confirm(`¿Vaciar carrito? (${carrito.length} productos)`)) {
        carrito = [];
        guardar();
        actualizarCarrito();
        toast('🗑️ Carrito vaciado', 'success');
    }
}

function generarWhatsApp() {
    if (carrito.length === 0) {
        toast('⚠ Carrito vacío', 'warning');
        return;
    }

    let totalSinDescuento = 0;
    let msg = '🛒 *Pedido - Mercadito Virtual*\n\nHola 👋 te paso mi pedido:\n\n';

    carrito.forEach((item, i) => {
        const p = productos.find(x => x.id === item.id);
        if (!p) return;

        const pUnit = calcularPrecio(p, item.cantidad);
        const sub = pUnit * item.cantidad;
        totalSinDescuento += sub;

        msg += `${i + 1}. ${item.nombre}\n`;
        msg += `   Cantidad: ${item.cantidad}\n`;
        msg += `   Precio: $${pUnit.toLocaleString('es-AR')}\n`;
        msg += `   Subtotal: $${sub.toLocaleString('es-AR')}\n\n`;
    });

    msg += `💰 *SUBTOTAL: $${totalSinDescuento.toLocaleString('es-AR')}*\n\n`;

    const descuentos = calcularDescuentos(totalSinDescuento);

    if (descuentos.montoDescuento > 0) {
        msg += `🎁 *DESCUENTOS APLICADOS* 🎁\n`;
        msg += descuentos.mensajes.join('\n') + '\n';
        msg += `   Descuento: -$${descuentos.montoDescuento.toLocaleString('es-AR')}\n`;
        msg += `   TOTAL FINAL: $${descuentos.totalFinal.toLocaleString('es-AR')}\n`;

        if (esPrimeraCompra() && totalSinDescuento >= PROMOS.primeraCompra.minimo) {
            marcarComoComprado();
        }
    } else {
        msg += `💰 *TOTAL: $${totalSinDescuento.toLocaleString('es-AR')}*\n`;

        const promoDia = getPromoDelDia();
        if (promoDia && totalSinDescuento < promoDia.minimo) {
            const falta = promoDia.minimo - totalSinDescuento;
            msg += `\n💡 *PROMO DEL DÍA*: Sumá $${falta.toLocaleString('es-AR')} más y obtené ${promoDia.porcentaje}% OFF\n`;
        }
    }

    if (typeof gtag === "function") {
        gtag("event", "begin_checkout", {
            currency: "ARS",
            value: descuentos.totalFinal || totalSinDescuento,
            items: carrito.map(item => {
                const p = productos.find(x => x.id === item.id);
                return {
                    item_id: item.id,
                    item_name: item.nombre,
                    price: p ? calcularPrecio(p, item.cantidad) : 0,
                    quantity: item.cantidad
                };
            })
        });
    }

    window.open(`https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================
// IMPORTACIÓN / EXPORTACIÓN
// ============================================
function validarArchivoImportacion(file) {
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    const maxSize = 10 * 1024 * 1024; // 10MB

    const msgDiv = document.getElementById('fileValidationMsg');

    if (!allowedExtensions.includes(fileExtension)) {
        msgDiv.className = 'error';
        msgDiv.innerHTML = '❌ Formato no válido. Usá: .xlsx, .xls o .csv';
        msgDiv.style.display = 'block';
        return false;
    }

    if (file.size > maxSize) {
        msgDiv.className = 'error';
        msgDiv.innerHTML = '❌ Archivo muy grande. Máximo 10MB.';
        msgDiv.style.display = 'block';
        return false;
    }

    msgDiv.className = 'success';
    msgDiv.innerHTML = `✅ ${file.name} (${(file.size / 1024).toFixed(1)} KB) listo para importar`;
    msgDiv.style.display = 'block';
    return true;
}

function importarExcel(e) {
    const arch = e.target.files[0];
    if (!arch) return;

    if (!validarArchivoImportacion(arch)) return;

    const prev = document.getElementById('previewContainer');
    const prevCont = document.getElementById('previewContent');
    prev.style.display = 'block';
    prevCont.innerHTML = '<p style="color: var(--gray);">⏳ Procesando...</p>';

    const lector = new FileReader();
    lector.onload = function(ev) {
        try {
            const datos = new Uint8Array(ev.target.result);
            const libro = XLSX.read(datos, { type: 'array' });
            const hoja = libro.Sheets[libro.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(hoja);

            if (json.length === 0) throw new Error('Archivo vacío');

            const primeraFila = json[0];
            const columnasRequeridas = ['descripcion', 'costo'];
            const columnasOpcionales = ['seccion', 'familia', 'subfamilia', 'stock', 'venta_diaria'];

            const columnasEncontradas = Object.keys(primeraFila).map(k => k.toLowerCase());
            const columnasFaltantes = columnasRequeridas.filter(col => 
                !columnasEncontradas.some(c => c.includes(col))
            );

            if (columnasFaltantes.length > 0) {
                throw new Error(`Columnas faltantes: ${columnasFaltantes.join(', ')}`);
            }

            const nuevos = [];
            let errores = 0;

            json.forEach((fila, idx) => {
                try {
                    let nombre = fila.descripcion || fila.Descripcion || fila.nombre || fila.Nombre || fila.PRODUCTO || fila.producto;
                    if (!nombre || nombre.toString().trim() === '') return;
                    nombre = nombre.toString().trim();

                    let costo = parseFloat(fila.costo || fila.Costo || fila.PRECIO || fila.precio || 0);
                    if (isNaN(costo) || costo <= 0) {
                        errores++;
                        return;
                    }

                    let seccion = 'OTROS';
                    if (fila['Des. Seccion*'] && fila['Des. Seccion*'].toString().trim() !== '') {
                        seccion = fila['Des. Seccion*'].toString().trim().toUpperCase();
                    } else if (fila.seccion && fila.seccion.toString().trim() !== '') {
                        seccion = fila.seccion.toString().trim().toUpperCase();
                    } else if (fila.Seccion && fila.Seccion.toString().trim() !== '') {
                        seccion = fila.Seccion.toString().trim().toUpperCase();
                    }

                    let familia = '';
                    if (fila['Des.Grp. Familia*'] && fila['Des.Grp. Familia*'].toString().trim() !== '') {
                        familia = fila['Des.Grp. Familia*'].toString().trim().toUpperCase();
                    } else if (fila.familia && fila.familia.toString().trim() !== '') {
                        familia = fila.familia.toString().trim().toUpperCase();
                    } else if (fila.Familia && fila.Familia.toString().trim() !== '') {
                        familia = fila.Familia.toString().trim().toUpperCase();
                    }

                    let subfamilia = '';
                    if (fila.subfamilia && fila.subfamilia.toString().trim() !== '') {
                        subfamilia = fila.subfamilia.toString().trim().toUpperCase();
                    } else if (fila.Subfamilia && fila.Subfamilia.toString().trim() !== '') {
                        subfamilia = fila.Subfamilia.toString().trim().toUpperCase();
                    }

                    let stock = parseInt(fila.Stock || fila.stock || fila.STOCK) || 0;
                    let venta_diaria = parseFloat(fila.venta_diaria || fila.ventadiaria || fila.ventas || fila.VENTAS) || 0;

                    nuevos.push({
                        id: generarIdUnico(),
                        nombre,
                        seccion: seccion || 'OTROS',
                        familia: familia || '',
                        subfamilia: subfamilia || '',
                        costo,
                        stock: Math.max(0, stock),
                        venta_diaria: Math.max(0, venta_diaria),
                        imagen: fila.imagen || fila.Imagen || '',
                        emoji: fila.emoji || fila.Emoji || '📦'
                    });
                } catch (e) {
                    errores++;
                }
            });

            if (nuevos.length === 0) throw new Error('No se encontraron productos válidos');

            productos = [...productos, ...nuevos];
            guardar();
            actualizarFiltros();
            renderProductos();
            renderProductosAdmin();

            let resumen = `✅ ${nuevos.length} productos importados`;
            if (errores > 0) resumen += `<br>⚠️ ${errores} filas con errores ignoradas`;

            prevCont.innerHTML = resumen;
            toast(`✅ ${nuevos.length} productos importados`, 'success');

        } catch (error) {
            prevCont.innerHTML = `<span style="color: var(--primary);">❌ ${error.message}</span>`;
            toast('❌ Error al importar: ' + error.message, 'error');
        }
    };
    lector.readAsArrayBuffer(arch);
}

async function cargarDesdeGoogleSheets(silencioso = false) {
    try {
        if (!silencioso) toast('⏳ Cargando desde Google Sheets...', 'success');

        const response = await fetch(GOOGLE_SHEET_URL);
        if (!response.ok) throw new Error('Error al cargar');

        const csvText = await response.text();

        const parseResult = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: h => h.trim().replace(/^"|"$/g, ''),
            transform: v => v.trim().replace(/^"|"$/g, '')
        });

        if (parseResult.errors.length > 0) {
            console.warn('Errores parsing CSV:', parseResult.errors);
        }

        const nuevos = [];

        for (const fila of parseResult.data) {
            if (!fila || Object.keys(fila).length === 0) continue;

            let nombre = fila.descripcion || fila.Descripcion || fila.nombre || fila.Nombre || fila.PRODUCTO;
            if (!nombre || nombre.trim() === '') continue;
            nombre = nombre.trim();

            let costo = parseFloat(fila.costo || fila.Costo || fila.PRECIO || 0);
            if (isNaN(costo) || costo <= 0) continue;

            let seccion = fila.seccion || fila.Seccion || fila['Des. Seccion*'] || 'OTROS';
            seccion = seccion.toString().trim().toUpperCase();

            let familia = fila.familia || fila.Familia || fila['Des.Grp. Familia*'] || '';
            familia = familia.toString().trim().toUpperCase();

            let subfamilia = fila.subfamilia || fila.Subfamilia || '';
            subfamilia = subfamilia.toString().trim().toUpperCase();

            let stock = parseInt(fila.Stock || fila.stock) || 0;
            let venta_diaria = parseFloat(fila.venta_diaria || fila.ventadiaria || fila.ventas) || 0;

            nuevos.push({
                id: generarIdUnico(),
                nombre,
                seccion: seccion || 'OTROS',
                familia: familia || '',
                subfamilia: subfamilia || '',
                costo,
                stock: Math.max(0, stock),
                venta_diaria: Math.max(0, venta_diaria),
                imagen: fila.imagen || fila.Imagen || '',
                emoji: fila.emoji || fila.Emoji || '📦'
            });
        }

        if (nuevos.length === 0) throw new Error('No se encontraron productos');

        productos = nuevos;
        localStorage.setItem('ultimaActualizacion', new Date().toISOString());
        guardar();
        actualizarFiltros();
        renderProductos();
        renderProductosAdmin();

        if (!silencioso) toast(`✅ ${nuevos.length} productos cargados`, 'success');

    } catch (error) {
        if (!silencioso) toast('❌ Error al cargar', 'error');
        console.error('Error cargando desde Google Sheets:', error);
    }
}

// ============================================
// ADMIN: FUNCIONES GENERALES
// ============================================
function renderProductosAdmin() {
    const term = document.getElementById('buscarProductoAdmin')?.value.toLowerCase() || '';
    const prods = term ? productos.filter(p => p.nombre.toLowerCase().includes(term)) : productos;

    document.getElementById('productListAdmin').innerHTML = prods.map(p => `
        <div style="padding: 10px; border: 1px solid var(--accent); margin-bottom: 5px; display: flex; justify-content: space-between;">
            <div><strong>${escapeHTML(p.nombre)}</strong> - Stock: ${p.stock} - $${calcularPrecio(p,1).toLocaleString('es-AR')}</div>
            <button class="btn-delete" onclick="eliminarProducto('${p.id}')">🗑️</button>
        </div>
    `).join('') || '<p>Sin productos</p>';
}

function eliminarProducto(id) {
    if (!confirm('¿Eliminar producto?')) return;
    productos = productos.filter(p => p.id !== id);
    carrito = carrito.filter(c => c.id !== id);
    guardar();
    renderProductos();
    renderProductosAdmin();
    actualizarCarrito();
    actualizarFiltros();
    toast('✅ Producto eliminado', 'success');
}

async function verificarPassword() {
    const pass = document.getElementById('passwordInput').value;
    const hash = await hashPassword(pass);
    if (hash === ADMIN_PASSWORD_HASH) {
        document.getElementById('passwordModal').classList.remove('show');
        document.getElementById('adminPanel').classList.add('open');
        document.getElementById('passwordInput').value = '';
        // Cargar datos en las pestañas del admin al abrir
        renderMargenes();
        renderStockPreviews();
        renderOfertas();
    } else {
        toast('❌ Contraseña incorrecta', 'error');
    }
}

// ============================================
// ADMIN: MÁRGENES
// ============================================
function renderMargenes() {
    // Actualizar displays de top dinámico
    document.getElementById('topValorDisplay').textContent = config.topDinamico;
    document.getElementById('topRange').value = config.topDinamico;
    document.getElementById('topExacto').value = config.topDinamico;

    document.getElementById('margenGeneral').value = config.margenGeneral;
    document.getElementById('descuentoCantidad').value = config.descuentoCantidad;

    // Renderizar márgenes por sección
    let htmlSecciones = '';
    for (let [seccion, margen] of Object.entries(config.margenesSecciones)) {
        htmlSecciones += `
            <div class="margin-item">
                <span class="margin-item-name">${escapeHTML(seccion)}</span>
                <span>${margen}%</span>
                <button class="btn-delete" onclick="eliminarMargenSeccion('${seccion}')">🗑️</button>
            </div>
        `;
    }
    document.getElementById('margenesSecciones').innerHTML = htmlSecciones || '<p>No hay márgenes por sección</p>';

    // Familias
    let htmlFamilias = '';
    for (let [familia, margen] of Object.entries(config.margenesFamilias)) {
        htmlFamilias += `
            <div class="margin-item">
                <span class="margin-item-name">${escapeHTML(familia)}</span>
                <span>${margen}%</span>
                <button class="btn-delete" onclick="eliminarMargenFamilia('${familia}')">🗑️</button>
            </div>
        `;
    }
    document.getElementById('margenesFamilias').innerHTML = htmlFamilias || '<p>No hay márgenes por familia</p>';

    // Subfamilias
    let htmlSubfamilias = '';
    for (let [subfamilia, margen] of Object.entries(config.margenesSubfamilias)) {
        htmlSubfamilias += `
            <div class="margin-item">
                <span class="margin-item-name">${escapeHTML(subfamilia)}</span>
                <span>${margen}%</span>
                <button class="btn-delete" onclick="eliminarMargenSubfamilia('${subfamilia}')">🗑️</button>
            </div>
        `;
    }
    document.getElementById('margenesSubfamilias').innerHTML = htmlSubfamilias || '<p>No hay márgenes por subfamilia</p>';

    // Vista previa dinámica
    actualizarPreviewTop();
}

function guardarMargenGeneral() {
    const nuevo = parseFloat(document.getElementById('margenGeneral').value);
    if (isNaN(nuevo) || nuevo < 0) return toast('❌ Valor inválido', 'error');
    config.margenGeneral = nuevo;
    guardar();
    renderProductos();
    toast('✅ Margen general guardado', 'success');
}

function guardarDescuentoCantidad() {
    const nuevo = parseFloat(document.getElementById('descuentoCantidad').value);
    if (isNaN(nuevo) || nuevo < 0) return toast('❌ Valor inválido', 'error');
    config.descuentoCantidad = nuevo;
    guardar();
    renderProductos();
    toast('✅ Descuento por cantidad guardado', 'success');
}

function agregarMargenSeccion() {
    const nombre = document.getElementById('nuevaSeccionNombre').value.trim().toUpperCase();
    const margen = parseFloat(document.getElementById('nuevaSeccionMargen').value);
    if (!nombre || isNaN(margen)) return toast('❌ Completa todos los campos', 'error');
    config.margenesSecciones[nombre] = margen;
    guardar();
    renderMargenes();
    renderProductos();
    toast('✅ Margen agregado', 'success');
}

function eliminarMargenSeccion(nombre) {
    delete config.margenesSecciones[nombre];
    guardar();
    renderMargenes();
    renderProductos();
    toast('✅ Eliminado', 'success');
}

function agregarMargenFamilia() {
    const nombre = document.getElementById('nuevaFamiliaNombre').value.trim().toUpperCase();
    const margen = parseFloat(document.getElementById('nuevaFamiliaMargen').value);
    if (!nombre || isNaN(margen)) return toast('❌ Completa todos los campos', 'error');
    config.margenesFamilias[nombre] = margen;
    guardar();
    renderMargenes();
    renderProductos();
    toast('✅ Margen agregado', 'success');
}

function eliminarMargenFamilia(nombre) {
    delete config.margenesFamilias[nombre];
    guardar();
    renderMargenes();
    renderProductos();
    toast('✅ Eliminado', 'success');
}

function agregarMargenSubfamilia() {
    const nombre = document.getElementById('nuevaSubfamiliaNombre').value.trim().toUpperCase();
    const margen = parseFloat(document.getElementById('nuevaSubfamiliaMargen').value);
    if (!nombre || isNaN(margen)) return toast('❌ Completa todos los campos', 'error');
    config.margenesSubfamilias[nombre] = margen;
    guardar();
    renderMargenes();
    renderProductos();
    toast('✅ Margen agregado', 'success');
}

function eliminarMargenSubfamilia(nombre) {
    delete config.margenesSubfamilias[nombre];
    guardar();
    renderMargenes();
    renderProductos();
    toast('✅ Eliminado', 'success');
}

function guardarTopDinamico() {
    const top = parseInt(document.getElementById('topExacto').value);
    if (isNaN(top) || top < 1) return toast('❌ Valor inválido', 'error');
    config.topDinamico = top;
    guardar();
    renderProductos();
    toast('✅ Top dinámico guardado', 'success');
}

function actualizarPreviewTop() {
    const range = document.getElementById('topRange');
    const exacto = document.getElementById('topExacto');
    const display = document.getElementById('topValorDisplay');
    const stats = document.getElementById('statsDinamicas');

    range.addEventListener('input', () => {
        exacto.value = range.value;
        display.textContent = range.value;
        // Mostrar estadística aproximada
        const totalProd = productos.length;
        const mostrados = Math.min(range.value, totalProd);
        stats.innerHTML = `Mostrando ${mostrados} de ${totalProd} productos (top ${range.value})`;
    });

    exacto.addEventListener('input', () => {
        let val = parseInt(exacto.value) || 100;
        if (val < 1) val = 1;
        if (val > 6000) val = 6000;
        range.value = val;
        display.textContent = val;
        const totalProd = productos.length;
        const mostrados = Math.min(val, totalProd);
        stats.innerHTML = `Mostrando ${mostrados} de ${totalProd} productos (top ${val})`;
    });
}

// ============================================
// ADMIN: STOCK
// ============================================
function renderStockPreviews() {
    // Sincronizar sliders con valores actuales
    document.getElementById('stockMinimoRange').value = config.stockMinimo;
    document.getElementById('stockMinimoExacto').value = config.stockMinimo;
    document.getElementById('stockCriticoRange').value = config.stockCritico;
    document.getElementById('stockCriticoExacto').value = config.stockCritico;
    document.getElementById('stockBajoRange').value = config.stockBajo;
    document.getElementById('stockBajoExacto').value = config.stockBajo;
    document.getElementById('stockBajoMin').value = config.stockCritico + 1;
    document.getElementById('stockNormalMin').value = config.stockBajo + 1;

    actualizarPreviewStock();
}

function actualizarPreviewStock() {
    const stockMin = parseInt(document.getElementById('stockMinimoExacto').value) || 20;
    const stockCrit = parseInt(document.getElementById('stockCriticoExacto').value) || 5;
    const stockBajo = parseInt(document.getElementById('stockBajoExacto').value) || 20;

    const totalProd = productos.length;
    const filtrados = productos.filter(p => p.stock >= stockMin).length;
    const criticos = productos.filter(p => p.stock > 0 && p.stock <= stockCrit).length;
    const bajos = productos.filter(p => p.stock > stockCrit && p.stock <= stockBajo).length;
    const normales = productos.filter(p => p.stock > stockBajo).length;

    document.getElementById('statsStockFiltro').innerHTML = `
        Productos con stock ≥ ${stockMin}: ${filtrados} de ${totalProd}<br>
        Stock crítico (≤ ${stockCrit}): ${criticos}<br>
        Stock bajo (${stockCrit+1}-${stockBajo}): ${bajos}<br>
        Stock normal: ${normales}
    `;
}

function guardarConfiguracionStockCompleta() {
    config.stockMinimo = parseInt(document.getElementById('stockMinimoExacto').value) || 20;
    config.stockCritico = parseInt(document.getElementById('stockCriticoExacto').value) || 5;
    config.stockBajo = parseInt(document.getElementById('stockBajoExacto').value) || 20;

    if (config.stockCritico >= config.stockBajo) {
        toast('❌ El stock crítico debe ser menor que el stock bajo', 'error');
        return;
    }

    guardar();
    renderProductos();
    renderStockPreviews();
    toast('✅ Configuración de stock guardada', 'success');
}

// Eventos para sliders de stock
document.addEventListener('input', function(e) {
    if (e.target.id === 'stockMinimoRange') {
        document.getElementById('stockMinimoExacto').value = e.target.value;
        actualizarPreviewStock();
    }
    if (e.target.id === 'stockMinimoExacto') {
        document.getElementById('stockMinimoRange').value = e.target.value;
        actualizarPreviewStock();
    }
    if (e.target.id === 'stockCriticoRange') {
        document.getElementById('stockCriticoExacto').value = e.target.value;
        document.getElementById('stockBajoMin').value = parseInt(e.target.value) + 1;
        actualizarPreviewStock();
    }
    if (e.target.id === 'stockCriticoExacto') {
        document.getElementById('stockCriticoRange').value = e.target.value;
        document.getElementById('stockBajoMin').value = parseInt(e.target.value) + 1;
        actualizarPreviewStock();
    }
    if (e.target.id === 'stockBajoRange') {
        document.getElementById('stockBajoExacto').value = e.target.value;
        document.getElementById('stockNormalMin').value = parseInt(e.target.value) + 1;
        actualizarPreviewStock();
    }
    if (e.target.id === 'stockBajoExacto') {
        document.getElementById('stockBajoRange').value = e.target.value;
        document.getElementById('stockNormalMin').value = parseInt(e.target.value) + 1;
        actualizarPreviewStock();
    }
});

// ============================================
// ADMIN: OFERTAS
// ============================================
let productoSeleccionadoOferta = null;

function renderOfertas() {
    const lista = document.getElementById('listaOfertas');
    if (!lista) return;

    if (ofertas.length === 0) {
        lista.innerHTML = '<p>No hay ofertas activas</p>';
        return;
    }

    lista.innerHTML = ofertas.map(o => {
        const prod = productos.find(p => p.id === o.productoId);
        return `
            <div class="oferta-item">
                <strong>${prod ? prod.nombre : 'Producto no encontrado'}</strong><br>
                Precio oferta: $${o.precioOferta.toLocaleString('es-AR')}<br>
                Vigencia: ${new Date(o.fechaInicio).toLocaleDateString()} - ${new Date(o.fechaFin).toLocaleDateString()}<br>
                Activa: ${o.activa ? '✅' : '❌'}<br>
                <button class="btn-delete" onclick="eliminarOferta('${o.id}')">🗑️ Eliminar</button>
            </div>
        `;
    }).join('');
}

function eliminarOferta(id) {
    ofertas = ofertas.filter(o => o.id !== id);
    guardar();
    renderOfertas();
    renderProductos();
    toast('✅ Oferta eliminada', 'success');
}

function buscarProductosOferta(termino) {
    if (termino.length < 2) {
        document.getElementById('autocompleteOfertas').innerHTML = '';
        return;
    }
    const resultados = productos.filter(p => 
        p.nombre.toLowerCase().includes(termino.toLowerCase()) &&
        p.stock > 0
    ).slice(0, 10);

    let html = '';
    resultados.forEach(p => {
        html += `<div onclick="seleccionarProductoOferta('${p.id}', '${escapeHTML(p.nombre)}')">
            <strong>${escapeHTML(p.nombre)}</strong> <small>$${calcularPrecio(p,1).toLocaleString('es-AR')}</small>
        </div>`;
    });
    document.getElementById('autocompleteOfertas').innerHTML = html;
}

function seleccionarProductoOferta(id, nombre) {
    productoSeleccionadoOferta = { id, nombre };
    document.getElementById('buscarProductoOferta').value = nombre;
    document.getElementById('autocompleteOfertas').innerHTML = '';

    // Mostrar formulario para agregar oferta
    const resultadosDiv = document.getElementById('resultadosBusquedaOferta');
    resultadosDiv.innerHTML = `
        <div style="background: #e8f4f8; padding: 15px; border-radius: 8px;">
            <h4>Configurar oferta para: ${escapeHTML(nombre)}</h4>
            <div class="form-group">
                <label>Precio oferta ($)</label>
                <input type="number" id="precioOfertaInput" step="0.01" min="0">
            </div>
            <div style="display: flex; gap: 15px;">
                <div class="form-group" style="flex:1">
                    <label>Fecha inicio</label>
                    <input type="date" id="ofertaInicio">
                </div>
                <div class="form-group" style="flex:1">
                    <label>Fecha fin</label>
                    <input type="date" id="ofertaFin">
                </div>
            </div>
            <button class="btn-primary" onclick="guardarOferta()">✅ Guardar Oferta</button>
        </div>
    `;

    // Establecer fechas por defecto: hoy a 7 días
    const hoy = new Date();
    const fin = new Date();
    fin.setDate(fin.getDate() + 7);
    document.getElementById('ofertaInicio').value = hoy.toISOString().split('T')[0];
    document.getElementById('ofertaFin').value = fin.toISOString().split('T')[0];
}

function guardarOferta() {
    if (!productoSeleccionadoOferta) return toast('❌ Selecciona un producto', 'error');

    const precio = parseFloat(document.getElementById('precioOfertaInput').value);
    const inicio = document.getElementById('ofertaInicio').value;
    const fin = document.getElementById('ofertaFin').value;

    if (isNaN(precio) || precio <= 0) return toast('❌ Precio inválido', 'error');
    if (!inicio || !fin) return toast('❌ Fechas requeridas', 'error');

    const nuevaOferta = {
        id: generarIdUnico(),
        productoId: productoSeleccionadoOferta.id,
        precioOferta: precio,
        fechaInicio: inicio,
        fechaFin: fin,
        activa: true
    };

    ofertas.push(nuevaOferta);
    guardar();
    renderOfertas();
    renderProductos();
    document.getElementById('resultadosBusquedaOferta').innerHTML = '';
    document.getElementById('buscarProductoOferta').value = '';
    productoSeleccionadoOferta = null;
    toast('✅ Oferta guardada', 'success');
}

// ============================================
// ADMIN: AGREGAR PRODUCTO MANUAL
// ============================================
function agregarProductoManual() {
    const nombre = document.getElementById('productName').value.trim();
    const seccion = document.getElementById('productSeccion').value.trim().toUpperCase();
    const familia = document.getElementById('productFamilia').value.trim().toUpperCase();
    const subfamilia = document.getElementById('productSubfamilia').value.trim().toUpperCase();
    const costo = parseFloat(document.getElementById('productCosto').value);
    const stock = parseInt(document.getElementById('productStock').value);
    const emoji = document.getElementById('productEmoji').value.trim() || '📦';
    const imagen = document.getElementById('productImage').value.trim();

    if (!nombre || !seccion || !familia || isNaN(costo) || costo <= 0 || isNaN(stock) || stock < 0) {
        return toast('❌ Completa todos los campos obligatorios', 'error');
    }

    const nuevoProducto = {
        id: generarIdUnico(),
        nombre,
        seccion,
        familia,
        subfamilia,
        costo,
        stock,
        venta_diaria: 0,
        imagen: validarURL(imagen) ? imagen : '',
        emoji
    };

    productos.push(nuevoProducto);
    guardar();
    actualizarFiltros();
    renderProductos();
    renderProductosAdmin();

    // Limpiar formulario
    document.getElementById('productName').value = '';
    document.getElementById('productSeccion').value = '';
    document.getElementById('productFamilia').value = '';
    document.getElementById('productSubfamilia').value = '';
    document.getElementById('productCosto').value = '';
    document.getElementById('productStock').value = '';
    document.getElementById('productEmoji').value = '';
    document.getElementById('productImage').value = '';

    toast(`✅ Producto "${nombre}" agregado`, 'success');
}

// ============================================
// ADMIN: PROMOCIONES
// ============================================
function cargarPromosEnFormulario() {
    // Días
    document.getElementById('promoLunes').checked = PROMOS.dia[1]?.activo || false;
    document.getElementById('promoLunesMin').value = PROMOS.dia[1]?.minimo || 20000;
    document.getElementById('promoLunesDesc').value = PROMOS.dia[1]?.porcentaje || 8;

    document.getElementById('promoMartes').checked = PROMOS.dia[2]?.activo || false;
    document.getElementById('promoMartesMin').value = PROMOS.dia[2]?.minimo || 25000;
    document.getElementById('promoMartesDesc').value = PROMOS.dia[2]?.porcentaje || 10;

    document.getElementById('promoMiercoles').checked = PROMOS.dia[3]?.activo || false;
    document.getElementById('promoMiercolesMin').value = PROMOS.dia[3]?.minimo || 25000;
    document.getElementById('promoMiercolesDesc').value = PROMOS.dia[3]?.porcentaje || 10;

    document.getElementById('promoJueves').checked = PROMOS.dia[4]?.activo || false;
    document.getElementById('promoJuevesMin').value = PROMOS.dia[4]?.minimo || 25000;
    document.getElementById('promoJuevesDesc').value = PROMOS.dia[4]?.porcentaje || 10;

    document.getElementById('promoViernes').checked = PROMOS.dia[5]?.activo || false;
    document.getElementById('promoViernesMin').value = PROMOS.dia[5]?.minimo || 25000;
    document.getElementById('promoViernesDesc').value = PROMOS.dia[5]?.porcentaje || 12;

    document.getElementById('promoSabado').checked = PROMOS.dia[6]?.activo || false;
    document.getElementById('promoSabadoMin').value = PROMOS.dia[6]?.minimo || 25000;
    document.getElementById('promoSabadoDesc').value = PROMOS.dia[6]?.porcentaje || 12;

    document.getElementById('promoDomingo').checked = PROMOS.dia[0]?.activo || false;
    document.getElementById('promoDomingoMin').value = PROMOS.dia[0]?.minimo || 25000;
    document.getElementById('promoDomingoDesc').value = PROMOS.dia[0]?.porcentaje || 12;

    // Envío gratis
    document.getElementById('envioGratisActivo').checked = PROMOS.envioGratis.activo;
    document.getElementById('envioGratisMin').value = PROMOS.envioGratis.minimo;

    // Primera compra
    document.getElementById('primeraCompraActivo').checked = PROMOS.primeraCompra.activo;
    document.getElementById('primeraCompraMin').value = PROMOS.primeraCompra.minimo;
    document.getElementById('primeraCompraDesc').value = PROMOS.primeraCompra.porcentaje;
    document.getElementById('primeraCompraEnvio').checked = PROMOS.primeraCompra.incluyeEnvio;

    // Especial
    document.getElementById('promoEspecialActivo').checked = PROMOS.especial.activo;
    document.getElementById('promoEspecialNombre').value = PROMOS.especial.nombre;
    document.getElementById('promoEspecialInicio').value = PROMOS.especial.inicio;
    document.getElementById('promoEspecialFin').value = PROMOS.especial.fin;
    document.getElementById('promoEspecialMin').value = PROMOS.especial.minimo;
    document.getElementById('promoEspecialDesc').value = PROMOS.especial.porcentaje;
}

function guardarConfiguracionPromos() {
    // Días
    PROMOS.dia[1] = {
        activo: document.getElementById('promoLunes').checked,
        minimo: parseInt(document.getElementById('promoLunesMin').value) || 20000,
        porcentaje: parseInt(document.getElementById('promoLunesDesc').value) || 8
    };
    PROMOS.dia[2] = {
        activo: document.getElementById('promoMartes').checked,
        minimo: parseInt(document.getElementById('promoMartesMin').value) || 25000,
        porcentaje: parseInt(document.getElementById('promoMartesDesc').value) || 10
    };
    PROMOS.dia[3] = {
        activo: document.getElementById('promoMiercoles').checked,
        minimo: parseInt(document.getElementById('promoMiercolesMin').value) || 25000,
        porcentaje: parseInt(document.getElementById('promoMiercolesDesc').value) || 10
    };
    PROMOS.dia[4] = {
        activo: document.getElementById('promoJueves').checked,
        minimo: parseInt(document.getElementById('promoJuevesMin').value) || 25000,
        porcentaje: parseInt(document.getElementById('promoJuevesDesc').value) || 10
    };
    PROMOS.dia[5] = {
        activo: document.getElementById('promoViernes').checked,
        minimo: parseInt(document.getElementById('promoViernesMin').value) || 25000,
        porcentaje: parseInt(document.getElementById('promoViernesDesc').value) || 12
    };
    PROMOS.dia[6] = {
        activo: document.getElementById('promoSabado').checked,
        minimo: parseInt(document.getElementById('promoSabadoMin').value) || 25000,
        porcentaje: parseInt(document.getElementById('promoSabadoDesc').value) || 12
    };
    PROMOS.dia[0] = {
        activo: document.getElementById('promoDomingo').checked,
        minimo: parseInt(document.getElementById('promoDomingoMin').value) || 25000,
        porcentaje: parseInt(document.getElementById('promoDomingoDesc').value) || 12
    };

    // Envío gratis
    PROMOS.envioGratis.activo = document.getElementById('envioGratisActivo').checked;
    PROMOS.envioGratis.minimo = parseInt(document.getElementById('envioGratisMin').value) || 35000;

    // Primera compra
    PROMOS.primeraCompra.activo = document.getElementById('primeraCompraActivo').checked;
    PROMOS.primeraCompra.minimo = parseInt(document.getElementById('primeraCompraMin').value) || 25000;
    PROMOS.primeraCompra.porcentaje = parseInt(document.getElementById('primeraCompraDesc').value) || 10;
    PROMOS.primeraCompra.incluyeEnvio = document.getElementById('primeraCompraEnvio').checked;

    // Especial
    PROMOS.especial.activo = document.getElementById('promoEspecialActivo').checked;
    PROMOS.especial.nombre = document.getElementById('promoEspecialNombre').value;
    PROMOS.especial.inicio = document.getElementById('promoEspecialInicio').value;
    PROMOS.especial.fin = document.getElementById('promoEspecialFin').value;
    PROMOS.especial.minimo = parseInt(document.getElementById('promoEspecialMin').value) || 30000;
    PROMOS.especial.porcentaje = parseInt(document.getElementById('promoEspecialDesc').value) || 20;

    guardar();
    toast('✅ Configuración de promociones guardada', 'success');
    actualizarPreviewPromosActivas();
}

function actualizarPreviewPromosActivas() {
    const div = document.getElementById('promosActivasHoy');
    if (!div) return;

    const totalCarrito = carrito.reduce((sum, item) => {
        const p = productos.find(x => x.id === item.id);
        return sum + (p ? calcularPrecio(p, item.cantidad) * item.cantidad : 0);
    }, 0);

    const descuentos = calcularDescuentos(totalCarrito);
    let html = '<strong>Hoy tenés:</strong><br>';
    if (descuentos.mensajes.length > 0) {
        html += descuentos.mensajes.join('<br>');
        if (descuentos.montoDescuento > 0) {
            html += `<br><span style="color:var(--success);">Ahorro: $${descuentos.montoDescuento.toLocaleString('es-AR')}</span>`;
        }
    } else {
        html += 'No hay promociones activas hoy.';
    }
    div.innerHTML = html;
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 Inicializando tienda mejorada...');

    // Mostrar skeleton loading inicialmente
    const grid = document.getElementById('productsGrid');
    grid.classList.add('skeleton-loading');

    actualizarFiltros();
    renderProductos();
    actualizarCarrito();
    actualizarContadorFiltros();
    actualizarBannerPrimeraCompra(0);

    // Cargar datos en admin si está abierto (por si acaso)
    cargarPromosEnFormulario();

    // Event listeners
    document.getElementById('searchInput').addEventListener('input', debounce((e) => {
        filtros.busqueda = e.target.value;
        renderProductos();
    }, 300));

    document.getElementById('cartBtn').addEventListener('click', () => {
        document.getElementById('cartSidebar').classList.add('open');
    });

    document.getElementById('closeCartBtn').addEventListener('click', () => {
        document.getElementById('cartSidebar').classList.remove('open');
    });

    document.getElementById('checkoutBtn').addEventListener('click', generarWhatsApp);
    document.getElementById('clearCartBtn').addEventListener('click', vaciarCarrito);

    document.getElementById('logoBtn').addEventListener('click', (e) => {
        if (e.detail === 3) {
            document.getElementById('passwordModal').classList.add('show');
            setTimeout(() => document.getElementById('passwordInput').focus(), 100);
        }
    });

    document.getElementById('confirmPasswordBtn').addEventListener('click', verificarPassword);
    document.getElementById('passwordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verificarPassword();
    });

    document.getElementById('cancelPasswordBtn').addEventListener('click', () => {
        document.getElementById('passwordModal').classList.remove('show');
        document.getElementById('passwordInput').value = '';
    });

    document.getElementById('closeAdminBtn').addEventListener('click', () => {
        document.getElementById('adminPanel').classList.remove('open');
    });

    // Tabs del admin
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(`${this.dataset.tab}Tab`).classList.add('active');

            // Cargar datos específicos al abrir cada pestaña
            if (this.dataset.tab === 'margins') renderMargenes();
            if (this.dataset.tab === 'stock') renderStockPreviews();
            if (this.dataset.tab === 'ofertas') renderOfertas();
            if (this.dataset.tab === 'products') renderProductosAdmin();
            if (this.dataset.tab === 'promos') cargarPromosEnFormulario();
        });
    });

    // Filtros móvil
    document.getElementById('filtersToggleBtn')?.addEventListener('click', () => {
        document.getElementById('filtersModal').classList.add('show');
    });

    document.getElementById('closeFiltersBtn')?.addEventListener('click', () => {
        document.getElementById('filtersModal').classList.remove('show');
    });

    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
        filtros.seccion = document.getElementById('seccionFilter').value;
        filtros.familia = document.getElementById('familiaFilter').value;
        filtros.subfamilia = document.getElementById('subfamiliaFilter').value;

        document.getElementById('seccionFilterDesktop').value = filtros.seccion;
        document.getElementById('familiaFilterDesktop').value = filtros.familia;
        document.getElementById('subfamiliaFilterDesktop').value = filtros.subfamilia;

        actualizarFiltros();
        renderProductos();
        actualizarContadorFiltros();
        document.getElementById('filtersModal').classList.remove('show');
    });

    // Filtros desktop
    document.getElementById('seccionFilterDesktop')?.addEventListener('change', (e) => {
        filtros.seccion = e.target.value;
        filtros.familia = '';
        filtros.subfamilia = '';
        actualizarFiltros();
        renderProductos();
        actualizarContadorFiltros();
    });

    document.getElementById('familiaFilterDesktop')?.addEventListener('change', (e) => {
        filtros.familia = e.target.value;
        filtros.subfamilia = '';
        actualizarFiltros();
        renderProductos();
        actualizarContadorFiltros();
    });

    document.getElementById('subfamiliaFilterDesktop')?.addEventListener('change', (e) => {
        filtros.subfamilia = e.target.value;
        renderProductos();
        actualizarContadorFiltros();
    });

    document.getElementById('filtersReset').addEventListener('click', resetFiltros);

    // Importación Excel
    document.getElementById('dropZone').addEventListener('click', () => {
        document.getElementById('excelFile').click();
    });

    document.getElementById('excelFile').addEventListener('change', importarExcel);
    document.getElementById('importBtn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('excelFile').click();
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        if (productos.length === 0) return toast('⚠ Sin productos', 'warning');

        const datos = productos.map(p => ({
            nombre: p.nombre,
            seccion: p.seccion,
            familia: p.familia,
            subfamilia: p.subfamilia,
            costo: p.costo,
            stock: p.stock,
            imagen: p.imagen || '',
            emoji: p.emoji || ''
        }));

        const ws = XLSX.utils.json_to_sheet(datos);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Productos');
        XLSX.writeFile(wb, `productos_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast('✅ Exportado', 'success');
    });

    document.getElementById('deleteAllBtn').addEventListener('click', () => {
        if (!productos.length) return toast('⚠ Sin productos', 'warning');
        if (!confirm(`¿Eliminar ${productos.length} productos?`)) return;
        productos = [];
        carrito = [];
        guardar();
        renderProductos();
        renderProductosAdmin();
        actualizarCarrito();
        actualizarFiltros();
        toast('✅ Productos eliminados', 'success');
    });

    document.getElementById('buscarProductoAdmin').addEventListener('input', renderProductosAdmin);

    // Búsqueda de productos para ofertas
    document.getElementById('buscarProductoOferta').addEventListener('input', debounce((e) => {
        buscarProductosOferta(e.target.value);
    }, 300));

    // Agregar producto manual
    document.getElementById('addProductBtn').addEventListener('click', agregarProductoManual);

    // Fecha de última actualización
    document.getElementById('lastUpdate').textContent = new Date().toLocaleDateString('es-AR');

    // Carga automática desde Google Sheets si no hay productos
    if (productos.length === 0) {
        console.log('🔄 Primera carga - sincronizando con Google Sheets...');
        cargarDesdeGoogleSheets(true);
    }

    console.log('✅ Tienda mejorada inicializada correctamente');
});