// ============================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ============================================
const ADMIN_PASSWORD_HASH = 'hash_5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5';
const NUMERO_WHATSAPP = '5492616312850';
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRO5TmA-MgtcLCMPHMiGnxK_vtjDviMIEQJk6o2WmgrCl4XHjxtuI26HJRFLgiQC4VCT0XO1gPoKSfR/pub?output=csv';

// ============================================
// CONFIGURACIÓN DE DESCUENTOS Y PROMOS
// ============================================
const PROMOS = {
    dia: {
        5: { activo: true, minimo: 25000, porcentaje: 12 }, // Viernes
        6: { activo: true, minimo: 25000, porcentaje: 12 }, // Sábado
        0: { activo: true, minimo: 25000, porcentaje: 12 }, // Domingo
        1: { activo: true, minimo: 20000, porcentaje: 8 },  // Lunes
    },
    envioGratis: {
        minimo: 35000,
        activo: true
    },
    primeraCompra: {
        activo: true,
        minimo: 25000,
        porcentaje: 10,
        incluyeEnvio: true
    }
};

let productos = JSON.parse(localStorage.getItem('productosTienda_v2')) || [];
let ultimaActualizacion = localStorage.getItem('ultimaActualizacion') || null;
let carrito = JSON.parse(localStorage.getItem('carritoTienda_v2')) || [];
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
let ofertas = JSON.parse(localStorage.getItem('ofertasTienda')) || [];

let filtros = { seccion: '', familia: '', subfamilia: '', busqueda: '' };
let usuarioYaCompro = localStorage.getItem('yaCompro') === 'true';

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function guardar() {
    localStorage.setItem('productosTienda_v2', JSON.stringify(productos));
    localStorage.setItem('carritoTienda_v2', JSON.stringify(carrito));
    localStorage.setItem('configTienda', JSON.stringify(config));
    localStorage.setItem('ofertasTienda', JSON.stringify(ofertas));
}

function validarURL(url) {
    if (!url || url.trim() === '') return false;
    try { new URL(url); return true; } catch { return false; }
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
// FUNCIONES DE PRIMERA COMPRA Y PROMOS
// ============================================
function esPrimeraCompra() {
    return PROMOS.primeraCompra.activo && !usuarioYaCompro;
}

function marcarComoComprado() {
    usuarioYaCompro = true;
    localStorage.setItem('yaCompro', 'true');
}

function getPromoDelDia() {
    const hoy = new Date().getDay();
    return PROMOS.dia[hoy] || null;
}

function calcularDescuentos(total) {
    let descuentos = {
        porcentaje: 0,
        envioGratis: false,
        montoDescuento: 0,
        totalFinal: total,
        mensajes: []
    };
    
    const promoDia = getPromoDelDia();
    if (promoDia && promoDia.activo && total >= promoDia.minimo) {
        descuentos.porcentaje = promoDia.porcentaje;
        descuentos.mensajes.push(`${promoDia.porcentaje}% OFF por promo del día`);
    }
    
    if (esPrimeraCompra() && total >= PROMOS.primeraCompra.minimo) {
        if (PROMOS.primeraCompra.porcentaje > descuentos.porcentaje) {
            descuentos.porcentaje = PROMOS.primeraCompra.porcentaje;
            descuentos.mensajes = [`${PROMOS.primeraCompra.porcentaje}% OFF por primera compra`];
        }
    }
    
    if (PROMOS.envioGratis.activo && total >= PROMOS.envioGratis.minimo) {
        descuentos.envioGratis = true;
        descuentos.mensajes.push('🚚 Envío gratis incluido');
    } else if (esPrimeraCompra() && PROMOS.primeraCompra.incluyeEnvio && total >= PROMOS.primeraCompra.minimo) {
        descuentos.envioGratis = true;
    }
    
    if (descuentos.porcentaje > 0) {
        descuentos.montoDescuento = total * (descuentos.porcentaje / 100);
        descuentos.totalFinal = total - descuentos.montoDescuento;
    }
    
    return descuentos;
}

// ============================================
// ACTUALIZAR BANNER DE PRIMERA COMPRA
// ============================================
function actualizarBannerPrimeraCompra() {
    const banner = document.getElementById('bannerPrimeraCompra');
    const bannerMensaje = document.getElementById('bannerMensaje');
    const bannerProgreso = document.getElementById('bannerProgreso');
    
    if (!banner || !bannerMensaje || !bannerProgreso) return;
    
    if (!esPrimeraCompra()) {
        banner.style.display = 'none';
        return;
    }
    
    banner.style.display = 'block';
    
    let total = 0;
    carrito.forEach(item => {
        const p = productos.find(x => x.id === item.id);
        if (p) {
            total += calcularPrecio(p, item.cantidad) * item.cantidad;
        }
    });
    
    const MINIMO = PROMOS.primeraCompra.minimo;
    
    if (total >= MINIMO) {
        const descuentos = calcularDescuentos(total);
        bannerMensaje.innerHTML = `<strong>🎁 ¡DESCUENTO APLICADO!</strong> ${descuentos.porcentaje}% off ${descuentos.envioGratis ? '+ envío gratis' : ''}`;
        bannerProgreso.innerHTML = `✅ Total: $${total.toLocaleString('es-AR')} → <strong>$${descuentos.totalFinal.toLocaleString('es-AR')}</strong>`;
        bannerProgreso.style.background = 'rgba(72, 187, 120, 0.3)';
    } else {
        const falta = MINIMO - total;
        bannerMensaje.innerHTML = `<strong>🎁 PRIMERA COMPRA</strong> ${PROMOS.primeraCompra.porcentaje}% off + envío gratis en compras > $${MINIMO.toLocaleString('es-AR')}`;
        bannerProgreso.innerHTML = `🛒 Llevás $${total.toLocaleString('es-AR')} · Te faltan $${falta.toLocaleString('es-AR')}`;
        bannerProgreso.style.background = 'rgba(255,255,255,0.2)';
    }
}

// ============================================
// FILTRADO INTELIGENTE
// ============================================
function obtenerProductosVisibles() {
    let productosConStockMinimo = productos.filter(p => p.stock >= (config.stockMinimo || 0));
    let productosOrdenados = [...productosConStockMinimo].sort((a, b) => 
        (b.venta_diaria || 0) - (a.venta_diaria || 0)
    );
    const topValue = config.topDinamico || 100;
    return productosOrdenados.slice(0, topValue);
}

// ============================================
// RENDERIZAR OFERTAS DESTACADAS
// ============================================
function renderOfertasDestacadas() {
    const section = document.querySelector('.ofertas-destacadas-section');
    const grid = document.getElementById('ofertasDestacadasGrid');
    
    if (!section || !grid) return;
    
    const productosEnOferta = productos.filter(p => estaEnOferta(p) && p.stock > 0);
    
    if (productosEnOferta.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    
    grid.innerHTML = productosEnOferta.map(p => {
        const oferta = ofertas.find(o => 
            o.productoId === p.id && 
            o.activa && 
            new Date() >= new Date(o.fechaInicio) && 
            new Date() <= new Date(o.fechaFin)
        );
        
        if (!oferta) return '';
        
        const ahorro = oferta.precioOriginal - oferta.precioOferta;
        const porcentaje = ((ahorro / oferta.precioOriginal) * 100).toFixed(0);
        
        const imgHTML = validarURL(p.imagen)
            ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy">`
            : `<div class="image-placeholder">${p.emoji || '📦'}</div>`;
        
        return `
            <div class="oferta-destacada-card" onclick="verProducto('${p.id}')">
                <div class="oferta-destacada-badge">🔥 -${porcentaje}%</div>
                <div class="oferta-destacada-image">${imgHTML}</div>
                <div class="oferta-destacada-info">
                    <div class="oferta-destacada-nombre">${p.nombre}</div>
                    <div class="oferta-destacada-precios">
                        <span class="oferta-destacada-precio-original">$${oferta.precioOriginal.toLocaleString('es-AR')}</span>
                        <span class="oferta-destacada-precio-oferta">$${oferta.precioOferta.toLocaleString('es-AR')}</span>
                    </div>
                    <div class="oferta-destacada-ahorro">💰 Ahorrás $${ahorro.toLocaleString('es-AR')}</div>
                    <button class="oferta-destacada-btn" onclick="event.stopPropagation(); agregarAlCarrito('${p.id}')">🛒 Sumar</button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// RENDERIZADO DE PRODUCTOS (SIN CATEGORÍAS)
// ============================================
function renderProductos() {
    const grid = document.getElementById('productsGrid');
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

        const imgHTML = validarURL(p.imagen)
            ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="image-placeholder" style="display: none;">${p.emoji || '📦'}</div>`
            : `<div class="image-placeholder">${p.emoji || '📦'}</div>`;
        
        const precio = enOf
            ? `<div class="product-price oferta-price">$${p1.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>
               <span class="product-price-original">$${pOrig.toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>`
            : `<div class="product-price">$${p1.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>`;
        
        const p3HTML = p3 < p1
            ? `<div class="precio-por-cantidad">🎁 3+ unidades: $${p3.toLocaleString('es-AR', {minimumFractionDigits: 2})} c/u</div>`
            : '';

        const nombreCorto = p.nombre.length > 50 ? p.nombre.substring(0, 50) + '...' : p.nombre;
        
        return `
            <div class="product-card ${enOf ? 'en-oferta' : ''}">
                ${enOf ? '<div class="oferta-badge">🔥 OFERTA</div>' : ''}
                <div class="product-image-container">
                    ${imgHTML}
                    ${stockBadge}
                </div>
                <div class="product-info">
                    <h3 class="product-name" data-fullname="${p.nombre.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}">${nombreCorto}</h3>
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
}

// ============================================
// FILTRAR PRODUCTOS
// ============================================
function filtrarProductos() {
    let prods = obtenerProductosVisibles();
    
    if (filtros.seccion) prods = prods.filter(p => p.seccion === filtros.seccion);
    if (filtros.familia) prods = prods.filter(p => p.familia === filtros.familia);
    if (filtros.subfamilia) prods = prods.filter(p => p.subfamilia === filtros.subfamilia);
    
    if (filtros.busqueda.trim()) {
        const term = filtros.busqueda.toLowerCase();
        prods = prods.filter(p => p.nombre.toLowerCase().includes(term));
    }
    
    return prods;
}

// ============================================
// CALCULAR PRECIO
// ============================================
function calcularPrecio(producto, cant = 1) {
    const oferta = ofertas.find(o => 
        o.productoId === producto.id && 
        o.activa && 
        new Date() >= new Date(o.fechaInicio) && 
        new Date() <= new Date(o.fechaFin)
    );
    
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
    return ofertas.some(o => 
        o.productoId === p.id && 
        o.activa && 
        new Date() >= new Date(o.fechaInicio) && 
        new Date() <= new Date(o.fechaFin)
    );
}

// ============================================
// ACTUALIZAR CARRITO
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
    
    if (carrito.length === 0) {
        items.innerHTML = `<div class="empty-cart">🛒 Carrito vacío</div>`;
        total.textContent = '$0,00';
        savings.style.display = 'none';
        actualizarBannerPrimeraCompra();
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
                    <div class="cart-item-name">${item.nombre}</div>
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
    
    actualizarBannerPrimeraCompra();
}

// ============================================
// GENERAR WHATSAPP CON DESCUENTOS
// ============================================
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
        
        if (PROMOS.envioGratis.activo && totalSinDescuento < PROMOS.envioGratis.minimo) {
            const falta = PROMOS.envioGratis.minimo - totalSinDescuento;
            msg += `🚚 *ENVÍO GRATIS*: Sumá $${falta.toLocaleString('es-AR')} más y lo llevamos sin cargo\n`;
        }
    }
    
    window.open(`https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================
// GESTIÓN DEL CARRITO
// ============================================
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

// ============================================
// FUNCIONES DE FILTROS
// ============================================
function actualizarFiltros() {
    const productosVisibles = obtenerProductosVisibles();
    const secciones = [...new Set(productosVisibles.map(p => p.seccion).filter(Boolean))];
    const familias = [...new Set(productosVisibles.map(p => p.familia).filter(Boolean))];
    const subfamilias = [...new Set(productosVisibles.map(p => p.subfamilia).filter(Boolean))];
    
    const selects = ['seccionFilter', 'familiaFilter', 'subfamiliaFilter', 
                     'seccionFilterDesktop', 'familiaFilterDesktop', 'subfamiliaFilterDesktop'];
    
    selects.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        
        if (id.includes('seccion')) {
            sel.innerHTML = '<option value="">Todas</option>' + 
                secciones.map(s => `<option value="${s}">${s}</option>`).join('');
        } else if (id.includes('familia')) {
            let fams = familias;
            if (filtros.seccion) {
                fams = [...new Set(productosVisibles.filter(p => p.seccion === filtros.seccion).map(p => p.familia).filter(Boolean))];
            }
            sel.innerHTML = '<option value="">Todas</option>' + 
                fams.map(f => `<option value="${f}">${f}</option>`).join('');
        } else if (id.includes('subfamilia')) {
            let subs = subfamilias;
            if (filtros.familia) {
                subs = [...new Set(productosVisibles.filter(p => p.familia === filtros.familia).map(p => p.subfamilia).filter(Boolean))];
            }
            sel.innerHTML = '<option value="">Todas</option>' + 
                subs.map(s => `<option value="${s}">${s}</option>`).join('');
        }
    });
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
// FUNCIONES DE ADMIN (MÁRGENES)
// ============================================
function guardarMargenGeneral() {
    const val = parseFloat(document.getElementById('margenGeneral').value);
    if (isNaN(val) || val < 0) return toast('⚠ Valor inválido', 'warning');
    config.margenGeneral = val;
    guardar();
    renderProductos();
    toast('✅ Margen guardado', 'success');
}

function guardarDescuentoCantidad() {
    const val = parseFloat(document.getElementById('descuentoCantidad').value);
    if (isNaN(val) || val < 0) return toast('⚠ Valor inválido', 'warning');
    config.descuentoCantidad = val;
    guardar();
    renderProductos();
    actualizarCarrito();
    toast('✅ Descuento guardado', 'success');
}

function guardarTopDinamico() {
    const val = parseInt(document.getElementById('topRange').value);
    config.topDinamico = val;
    guardar();
    renderProductos();
    toast(`✅ Mostrando TOP ${val} productos`, 'success');
}

function guardarConfiguracionStockCompleta() {
    const stockMinimo = parseInt(document.getElementById('stockMinimoExacto').value);
    const stockCritico = parseInt(document.getElementById('stockCriticoExacto').value);
    const stockBajo = parseInt(document.getElementById('stockBajoExacto').value);
    
    if (stockMinimo < 0) return toast('⚠ Stock mínimo inválido', 'warning');
    if (stockCritico < 1) return toast('⚠ Stock crítico inválido', 'warning');
    if (stockBajo <= stockCritico) return toast('⚠ Stock bajo debe ser mayor que crítico', 'warning');
    
    config.stockMinimo = stockMinimo;
    config.stockCritico = stockCritico;
    config.stockBajo = stockBajo;
    
    guardar();
    renderProductos();
    toast('✅ Configuración de stock guardada', 'success');
}

function agregarMargenSeccion() {
    const nombre = document.getElementById('nuevaSeccionNombre').value.trim();
    const margen = parseFloat(document.getElementById('nuevaSeccionMargen').value);
    if (!nombre || isNaN(margen)) return toast('⚠ Completá todos los campos', 'warning');
    config.margenesSecciones[nombre.toLowerCase()] = margen;
    guardar();
    renderMargenes();
    renderProductos();
    toast(`✅ Margen para ${nombre} guardado`, 'success');
    document.getElementById('nuevaSeccionNombre').value = '';
    document.getElementById('nuevaSeccionMargen').value = '';
}

function agregarMargenFamilia() {
    const nombre = document.getElementById('nuevaFamiliaNombre').value.trim();
    const margen = parseFloat(document.getElementById('nuevaFamiliaMargen').value);
    if (!nombre || isNaN(margen)) return toast('⚠ Completá todos los campos', 'warning');
    config.margenesFamilias[nombre.toLowerCase()] = margen;
    guardar();
    renderMargenes();
    renderProductos();
    toast(`✅ Margen para ${nombre} guardado`, 'success');
    document.getElementById('nuevaFamiliaNombre').value = '';
    document.getElementById('nuevaFamiliaMargen').value = '';
}

function agregarMargenSubfamilia() {
    const nombre = document.getElementById('nuevaSubfamiliaNombre').value.trim();
    const margen = parseFloat(document.getElementById('nuevaSubfamiliaMargen').value);
    if (!nombre || isNaN(margen)) return toast('⚠ Completá todos los campos', 'warning');
    config.margenesSubfamilias[nombre.toLowerCase()] = margen;
    guardar();
    renderMargenes();
    renderProductos();
    toast(`✅ Margen para ${nombre} guardado`, 'success');
    document.getElementById('nuevaSubfamiliaNombre').value = '';
    document.getElementById('nuevaSubfamiliaMargen').value = '';
}

function eliminarMargen(tipo, nombre) {
    if (!confirm(`¿Eliminar margen ${nombre}?`)) return;
    delete config[`margenes${tipo.charAt(0).toUpperCase() + tipo.slice(1)}s`][nombre];
    guardar();
    renderMargenes();
    renderProductos();
    toast('✅ Margen eliminado', 'success');
}

function renderMargenes() {
    const secciones = document.getElementById('margenesSecciones');
    const familias = document.getElementById('margenesFamilias');
    const subfamilias = document.getElementById('margenesSubfamilias');
    
    if (secciones) {
        secciones.innerHTML = Object.entries(config.margenesSecciones).map(([n, m]) => `
            <div class="margin-item">
                <span class="margin-item-name">${n.toUpperCase()}</span>
                <div><span style="color: var(--primary);">${m}%</span> <button class="btn-delete" onclick="eliminarMargen('seccion', '${n}')">🗑️</button></div>
            </div>
        `).join('') || '<p class="text-gray">Sin márgenes</p>';
    }
    
    if (familias) {
        familias.innerHTML = Object.entries(config.margenesFamilias).map(([n, m]) => `
            <div class="margin-item">
                <span class="margin-item-name">${n.toUpperCase()}</span>
                <div><span style="color: var(--primary);">${m}%</span> <button class="btn-delete" onclick="eliminarMargen('familia', '${n}')">🗑️</button></div>
            </div>
        `).join('') || '<p class="text-gray">Sin márgenes</p>';
    }
    
    if (subfamilias) {
        subfamilias.innerHTML = Object.entries(config.margenesSubfamilias).map(([n, m]) => `
            <div class="margin-item">
                <span class="margin-item-name">${n.toUpperCase()}</span>
                <div><span style="color: var(--primary);">${m}%</span> <button class="btn-delete" onclick="eliminarMargen('subfamilia', '${n}')">🗑️</button></div>
            </div>
        `).join('') || '<p class="text-gray">Sin márgenes</p>';
    }
}

// ============================================
// FUNCIONES DE OFERTAS
// ============================================
function setupAutocompleteOfertas() {
    const input = document.getElementById('buscarProductoOferta');
    const container = document.getElementById('autocompleteOfertas');
    if (!input || !container) return;
    
    input.addEventListener('input', function() {
        const val = this.value.toLowerCase();
        if (val.length < 2) {
            container.innerHTML = '';
            return;
        }
        
        const resultados = productos.filter(p => p.nombre.toLowerCase().includes(val)).slice(0, 10);
        container.innerHTML = resultados.map(p => `
            <div onclick="seleccionarProductoOferta('${p.id}', '${p.nombre.replace(/'/g, "\\'")}')">
                <strong>${p.nombre}</strong>
            </div>
        `).join('');
    });
}

function seleccionarProductoOferta(id, nombre) {
    document.getElementById('buscarProductoOferta').value = nombre;
    document.getElementById('autocompleteOfertas').innerHTML = '';
    mostrarProductoParaOfertar(id);
}

function mostrarProductoParaOfertar(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    
    const precioAct = calcularPrecio(p, 1);
    document.getElementById('resultadosBusquedaOferta').innerHTML = `
        <div style="padding: 10px; border: 1px solid var(--accent); border-radius: 8px;">
            <strong>${p.nombre}</strong><br>
            Precio actual: $${precioAct.toLocaleString('es-AR')}<br>
            <button class="btn-primary" onclick="crearOferta('${p.id}')" style="margin-top: 10px;">🔥 Ofertar</button>
        </div>
    `;
}

function crearOferta(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    
    const precioAct = calcularPrecio(p, 1);
    const precioOf = prompt(`Precio de oferta para ${p.nombre}:`, precioAct);
    if (!precioOf) return;
    
    const pOf = parseFloat(precioOf);
    if (isNaN(pOf) || pOf <= 0) return toast('⚠ Precio inválido', 'warning');
    
    const hoy = new Date();
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() + (1 - hoy.getDay()));
    inicio.setHours(0,0,0,0);
    
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    fin.setHours(23,59,59,999);
    
    ofertas.push({
        id: Date.now().toString(),
        productoId: id,
        productoNombre: p.nombre,
        precioOferta: pOf,
        precioOriginal: precioAct,
        fechaInicio: inicio.toISOString(),
        fechaFin: fin.toISOString(),
        activa: true
    });
    
    guardar();
    renderOfertas();
    renderProductos();
    toast('🔥 Oferta creada', 'success');
    document.getElementById('buscarProductoOferta').value = '';
    document.getElementById('resultadosBusquedaOferta').innerHTML = '';
}

function desactivarOferta(id) {
    const o = ofertas.find(x => x.id === id);
    if (o) {
        o.activa = false;
        guardar();
        renderOfertas();
        renderProductos();
        toast('✅ Oferta desactivada', 'success');
    }
}

function activarOferta(id) {
    const o = ofertas.find(x => x.id === id);
    if (o) {
        o.activa = true;
        guardar();
        renderOfertas();
        renderProductos();
        toast('✅ Oferta activada', 'success');
    }
}

function eliminarOferta(id) {
    if (!confirm('¿Eliminar oferta?')) return;
    ofertas = ofertas.filter(x => x.id !== id);
    guardar();
    renderOfertas();
    renderProductos();
    toast('✅ Oferta eliminada', 'success');
}

function renderOfertas() {
    const cont = document.getElementById('listaOfertas');
    if (!cont) return;
    
    if (ofertas.length === 0) {
        cont.innerHTML = '<p class="text-gray">Sin ofertas</p>';
        renderOfertasDestacadas();
        return;
    }
    
    cont.innerHTML = ofertas.sort((a,b) => new Date(b.fechaInicio) - new Date(a.fechaInicio)).map(o => {
        const enVig = new Date() >= new Date(o.fechaInicio) && new Date() <= new Date(o.fechaFin);
        return `
            <div class="oferta-item">
                <div><strong>${o.productoNombre}</strong></div>
                <div>$${o.precioOriginal.toLocaleString('es-AR')} → $${o.precioOferta.toLocaleString('es-AR')}</div>
                <div>
                    <button onclick="${o.activa ? 'desactivarOferta' : 'activarOferta'}('${o.id}')">${o.activa ? '❌' : '✅'}</button>
                    <button onclick="eliminarOferta('${o.id}')">🗑️</button>
                </div>
                ${enVig ? '<span class="badge-success">VIGENTE</span>' : ''}
            </div>
        `;
    }).join('');
    
    renderOfertasDestacadas();
}

// ============================================
// FUNCIONES DE IMPORTACIÓN/EXPORTACIÓN REALES
// ============================================
function importarExcel(e) {
    const arch = e.target.files[0];
    if (!arch) return;
    
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
            
            const nuevos = [];
            
            json.forEach((fila, idx) => {
                try {
                    let nombre = fila.descripcion || fila.Descripcion || fila.nombre || fila.Nombre || fila.PRODUCTO || fila.producto;
                    if (!nombre || nombre.toString().trim() === '') return;
                    nombre = nombre.toString().trim();
                    
                    let costo = 0;
                    if (fila.costo !== undefined) costo = parseFloat(fila.costo);
                    else if (fila.Costo !== undefined) costo = parseFloat(fila.Costo);
                    else if (fila.PRECIO !== undefined) costo = parseFloat(fila.PRECIO);
                    else if (fila.precio !== undefined) costo = parseFloat(fila.precio);
                    
                    if (isNaN(costo) || costo <= 0) return;
                    
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
                    
                    let stock = parseInt(fila.Stock || fila.stock) || 0;
                    let venta_diaria = parseFloat(fila.venta_diaria || fila.ventadiaria || fila.ventas) || 0;
                    
                    const precio = costo * (1 + config.margenGeneral / 100);
                    
                    nuevos.push({
                        id: Date.now() + Math.random().toString(36).substr(2, 9) + idx,
                        nombre,
                        seccion: seccion || 'OTROS',
                        familia: familia || '',
                        subfamilia: subfamilia || '',
                        precio: parseFloat(precio.toFixed(2)),
                        costo,
                        stock: Math.max(0, stock),
                        venta_diaria: Math.max(0, venta_diaria),
                        imagen: fila.imagen || fila.Imagen || '',
                        emoji: fila.emoji || fila.Emoji || '📦'
                    });
                } catch (e) {}
            });
            
            if (nuevos.length === 0) throw new Error('No se encontraron productos válidos');
            
            productos = [...productos, ...nuevos];
            guardar();
            actualizarFiltros();
            renderProductos();
            renderProductosAdmin();
            renderOfertasDestacadas();
            
            prevCont.innerHTML = `✅ ${nuevos.length} productos importados`;
            toast(`✅ ${nuevos.length} productos importados`, 'success');
            
        } catch (error) {
            toast('❌ Error al importar', 'error');
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
        const lineas = csvText.split('\n');
        if (lineas.length < 2) throw new Error('Archivo vacío');
        
        const headers = lineas[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const nuevos = [];
        
        for (let i = 1; i < lineas.length; i++) {
            if (!lineas[i].trim()) continue;
            
            const valores = lineas[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const fila = {};
            headers.forEach((header, idx) => fila[header] = valores[idx] || '');
            
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
            
            const precio = costo * (1 + config.margenGeneral / 100);
            
            nuevos.push({
                id: Date.now() + Math.random().toString(36).substr(2, 9) + i,
                nombre,
                seccion: seccion || 'OTROS',
                familia: familia || '',
                subfamilia: subfamilia || '',
                precio: parseFloat(precio.toFixed(2)),
                costo,
                stock: Math.max(0, stock),
                venta_diaria: Math.max(0, venta_diaria),
                imagen: fila.imagen || fila.Imagen || '',
                emoji: fila.emoji || fila.Emoji || '📦'
            });
        }
        
        if (nuevos.length === 0) throw new Error('No se encontraron productos');
        
        productos = nuevos;
        ultimaActualizacion = new Date().toISOString();
        localStorage.setItem('ultimaActualizacion', ultimaActualizacion);
        guardar();
        actualizarFiltros();
        renderProductos();
        renderProductosAdmin();
        renderOfertasDestacadas();
        
        toast(`✅ ${nuevos.length} productos cargados`, 'success');
        
    } catch (error) {
        toast('❌ Error al cargar', 'error');
    }
}

function exportarProductos() {
    if (productos.length === 0) return toast('⚠ Sin productos', 'warning');
    
    const datos = productos.map(p => ({
        nombre: p.nombre,
        seccion: p.seccion,
        familia: p.familia,
        subfamilia: p.subfamilia,
        costo: p.costo,
        precio: p.precio,
        stock: p.stock,
        imagen: p.imagen || '',
        emoji: p.emoji || ''
    }));
    
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, `productos_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast('✅ Exportado', 'success');
}

function agregarProductoManual() {
    const nombre = document.getElementById('productName').value.trim();
    const costo = parseFloat(document.getElementById('productCosto').value);
    const stock = parseInt(document.getElementById('productStock').value);
    
    if (!nombre || isNaN(costo) || isNaN(stock)) return toast('⚠ Completá todos los campos', 'warning');
    
    productos.push({
        id: Date.now() + Math.random().toString(36).substring(2),
        nombre,
        seccion: document.getElementById('productSeccion').value.trim().toUpperCase() || 'OTROS',
        familia: document.getElementById('productFamilia').value.trim().toUpperCase() || '',
        subfamilia: document.getElementById('productSubfamilia').value.trim().toUpperCase() || '',
        precio: parseFloat((costo * (1 + config.margenGeneral / 100)).toFixed(2)),
        costo,
        stock,
        venta_diaria: 0,
        imagen: document.getElementById('productImage').value.trim() || '',
        emoji: document.getElementById('productEmoji').value.trim() || '📦'
    });
    
    guardar();
    renderProductos();
    renderProductosAdmin();
    actualizarFiltros();
    toast('✅ Producto agregado', 'success');
    
    ['productName', 'productSeccion', 'productFamilia', 'productSubfamilia', 'productCosto', 'productStock', 'productEmoji', 'productImage']
        .forEach(id => document.getElementById(id).value = '');
}

function eliminarTodosProductos() {
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
}

function renderProductosAdmin() {
    const term = document.getElementById('buscarProductoAdmin')?.value.toLowerCase() || '';
    const prods = term ? productos.filter(p => p.nombre.toLowerCase().includes(term)) : productos;
    
    document.getElementById('productListAdmin').innerHTML = prods.map(p => `
        <div style="padding: 10px; border: 1px solid var(--accent); margin-bottom: 5px; display: flex; justify-content: space-between;">
            <div><strong>${p.nombre}</strong> - Stock: ${p.stock} - $${calcularPrecio(p,1).toLocaleString('es-AR')}</div>
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
    } else {
        toast('❌ Contraseña incorrecta', 'error');
    }
}

// ============================================
// ACTUALIZAR PREVIEW DE TOP DINÁMICO
// ============================================
function actualizarPreviewDinamico() {
    const slider = document.getElementById('topRange');
    const exacto = document.getElementById('topExacto');
    
    if (!slider || !exacto) return;
    
    if (document.activeElement === slider) {
        exacto.value = slider.value;
    } else if (document.activeElement === exacto) {
        slider.value = exacto.value;
    }
    
    const topValue = parseInt(slider.value);
    
    const productosConStockMinimo = productos.filter(p => p.stock >= (config.stockMinimo || 0));
    const productosOrdenados = [...productosConStockMinimo].sort((a, b) => 
        (b.venta_diaria || 0) - (a.venta_diaria || 0)
    );
    
    const productosVisibles = productosOrdenados.slice(0, topValue);
    
    const ultimoProducto = productosVisibles[productosVisibles.length - 1];
    const ventaMinima = ultimoProducto?.venta_diaria || 0;
    
    const porcentaje = productosConStockMinimo.length > 0 
        ? ((productosVisibles.length / productosConStockMinimo.length) * 100).toFixed(1)
        : 0;
    
    const preview = document.getElementById('statsDinamicas');
    if (preview) {
        preview.innerHTML = `
            <div style="display: grid; gap: 8px;">
                <div>📦 Con stock ≥ ${config.stockMinimo}: <strong>${productosConStockMinimo.length}</strong> productos</div>
                <div>🎯 Mostrando TOP <strong style="color: var(--primary); font-size: 1.2rem;">${topValue}</strong></div>
                <div>📊 Representa el <strong>${porcentaje}%</strong> de los visibles</div>
                <div>📉 Venta mínima en este top: <strong>${ventaMinima.toFixed(1)}</strong> unidades/día</div>
                <div style="border-top: 1px dashed #ccc; margin: 5px 0;"></div>
                <div style="color: var(--success);">
                    ✅ PRODUCTOS VISIBLES: <strong>${productosVisibles.length}</strong>
                </div>
            </div>
        `;
    }
    
    const topValorDisplay = document.getElementById('topValorDisplay');
    if (topValorDisplay) {
        topValorDisplay.textContent = topValue;
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 Inicializando tienda...');
    
    actualizarFiltros();
    renderProductos();
    actualizarCarrito();
    renderProductosAdmin();
    renderMargenes();
    renderOfertas();
    renderOfertasDestacadas(); // 👈 Agregada para asegurar
    actualizarContadorFiltros();
    
    document.getElementById('margenGeneral').value = config.margenGeneral;
    document.getElementById('descuentoCantidad').value = config.descuentoCantidad;
    
    // Configurar sliders de top dinámico
    const topRange = document.getElementById('topRange');
    const topExacto = document.getElementById('topExacto');
    if (topRange && topExacto) {
        topRange.value = config.topDinamico || 100;
        topExacto.value = config.topDinamico || 100;
        topRange.addEventListener('input', actualizarPreviewDinamico);
        topExacto.addEventListener('input', actualizarPreviewDinamico);
        actualizarPreviewDinamico();
    }
    
    // ============================================
    // FUNCIÓN PARA ACTUALIZAR PREVIEW DE STOCK
    // ============================================
    function actualizarPreviewStock() {
        const stockMinimo = parseInt(document.getElementById('stockMinimoExacto')?.value) || 0;
        const stockCritico = parseInt(document.getElementById('stockCriticoExacto')?.value) || 5;
        const stockBajo = parseInt(document.getElementById('stockBajoExacto')?.value) || 20;
        
        const totalProductos = productos.length;
        const conStockMinimo = productos.filter(p => p.stock >= stockMinimo).length;
        const conStockCritico = productos.filter(p => p.stock > 0 && p.stock <= stockCritico).length;
        const conStockBajo = productos.filter(p => p.stock > stockCritico && p.stock <= stockBajo).length;
        const stockNormal = productos.filter(p => p.stock > stockBajo).length;
        
        const preview = document.getElementById('previewStockFiltro');
        if (preview) {
            preview.innerHTML = `
                <div style="display: grid; gap: 8px;">
                    <div>📦 Total productos: <strong>${totalProductos}</strong></div>
                    <div>✅ Stock ≥ ${stockMinimo}: <strong style="color: var(--success);">${conStockMinimo}</strong></div>
                    <div style="border-top: 1px dashed #ccc; margin: 5px 0;"></div>
                    <div>🔴 Stock crítico (≤${stockCritico}): <strong>${conStockCritico}</strong></div>
                    <div>🟡 Stock bajo (${stockCritico+1}-${stockBajo}): <strong>${conStockBajo}</strong></div>
                    <div>🟢 Stock normal (>${stockBajo}): <strong>${stockNormal}</strong></div>
                    <div style="border-top: 1px dashed #ccc; margin: 5px 0;"></div>
                    <div style="color: var(--gray);">
                        📊 ${((conStockMinimo/totalProductos)*100).toFixed(1)}% del catálogo visible
                    </div>
                </div>
            `;
        }
    }

    // Configurar sliders de stock
    ['stockMinimoRange', 'stockCriticoRange', 'stockBajoRange'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', actualizarPreviewStock);
    });
    
    ['stockMinimoExacto', 'stockCriticoExacto', 'stockBajoExacto'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', actualizarPreviewStock);
    });
    
    actualizarPreviewStock();
    
    setupAutocompleteOfertas();
    
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => {
            filtros.busqueda = e.target.value;
            renderProductos();
        }, 300);
    });
    
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
    
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(`${this.dataset.tab}Tab`).classList.add('active');
        });
    });
    
    const filtersToggleBtn = document.getElementById('filtersToggleBtn');
    const filtersModal = document.getElementById('filtersModal');
    const closeFiltersBtn = document.getElementById('closeFiltersBtn');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    
    if (filtersToggleBtn) {
        filtersToggleBtn.addEventListener('click', () => {
            filtersModal.classList.add('show');
        });
    }
    
    if (closeFiltersBtn) {
        closeFiltersBtn.addEventListener('click', () => {
            filtersModal.classList.remove('show');
        });
    }
    
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', () => {
            filtros.seccion = document.getElementById('seccionFilter').value;
            filtros.familia = document.getElementById('familiaFilter').value;
            filtros.subfamilia = document.getElementById('subfamiliaFilter').value;
            
            if (document.getElementById('seccionFilterDesktop')) {
                document.getElementById('seccionFilterDesktop').value = filtros.seccion;
            }
            if (document.getElementById('familiaFilterDesktop')) {
                document.getElementById('familiaFilterDesktop').value = filtros.familia;
            }
            if (document.getElementById('subfamiliaFilterDesktop')) {
                document.getElementById('subfamiliaFilterDesktop').value = filtros.subfamilia;
            }
            
            actualizarFiltros();
            renderProductos();
            actualizarContadorFiltros();
            filtersModal.classList.remove('show');
        });
    }
    
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
    
    document.getElementById('dropZone').addEventListener('click', () => {
        document.getElementById('excelFile').click();
    });
    
    document.getElementById('excelFile').addEventListener('change', importarExcel);
    document.getElementById('importBtn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('excelFile').click();
    });
    
    document.getElementById('exportBtn').addEventListener('click', exportarProductos);
    document.getElementById('addProductBtn').addEventListener('click', agregarProductoManual);
    document.getElementById('deleteAllBtn').addEventListener('click', eliminarTodosProductos);
    document.getElementById('buscarProductoAdmin').addEventListener('input', renderProductosAdmin);
    
    document.getElementById('lastUpdate').textContent = new Date().toLocaleDateString('es-AR');
    
    window.addEventListener('scroll', () => {
        document.getElementById('cartSidebar').classList.remove('open');
    });
    
    console.log('✅ Tienda inicializada correctamente');
});