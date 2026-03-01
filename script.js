// ============================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ============================================
const ADMIN_PASSWORD_HASH = 'hash_5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5';
const NUMERO_WHATSAPP = '5492616312850';
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRO5TmA-MgtcLCMPHMiGnxK_vtjDviMIEQJk6o2WmgrCl4XHjxtuI26HJRFLgiQC4VCT0XO1gPoKSfR/pub?output=csv';

let productos = JSON.parse(localStorage.getItem('productosTienda_v2')) || [];
let ultimaActualizacion = localStorage.getItem('ultimaActualizacion') || null;
let carrito = JSON.parse(localStorage.getItem('carritoTienda_v2')) || [];
let config = JSON.parse(localStorage.getItem('configTienda')) || {
    margenGeneral: 30,
    descuentoCantidad: 5,
    margenesSecciones: {},
    margenesFamilias: {},
    margenesSubfamilias: {},
    topDinamico: 100
};
let ofertas = JSON.parse(localStorage.getItem('ofertasTienda')) || [];

let filtros = { seccion: '', familia: '', subfamilia: '', busqueda: '' };

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
// FILTRADO INTELIGENTE POR TOP DINÁMICO
// ============================================
function obtenerProductosVisibles() {
    // 1️⃣ SOLO productos con stock
    let productosConStock = productos.filter(p => p.stock > 0);
    
    // 2️⃣ Ordenar por venta_diaria (de mayor a menor)
    let productosOrdenados = [...productosConStock].sort((a, b) => 
        (b.venta_diaria || 0) - (a.venta_diaria || 0)
    );
    
    // 3️⃣ Obtener el TOP dinámico de la configuración
    const topValue = config.topDinamico || 100;
    
    return productosOrdenados.slice(0, topValue);
}

// ============================================
// CONTROL DE TOP DINÁMICO (SLIDER + VISTA PREVIA)
// ============================================
let timeoutPreview;

function actualizarPreviewDinamico() {
    clearTimeout(timeoutPreview);
    timeoutPreview = setTimeout(() => {
        const slider = document.getElementById('topRange');
        const exacto = document.getElementById('topExacto');
        
        if (!slider || !exacto) return;
        
        if (document.activeElement === slider) {
            exacto.value = slider.value;
        } else if (document.activeElement === exacto) {
            slider.value = exacto.value;
        }
        
        const topValue = parseInt(slider.value);
        
        const productosConStock = productos.filter(p => p.stock > 0);
        const productosOrdenados = [...productosConStock].sort((a, b) => 
            (b.venta_diaria || 0) - (a.venta_diaria || 0)
        );
        
        const productosVisibles = productosOrdenados.slice(0, topValue);
        
        const ultimoProducto = productosVisibles[productosVisibles.length - 1];
        const ventaMinima = ultimoProducto?.venta_diaria || 0;
        
        const porcentaje = productosConStock.length > 0 
            ? ((productosVisibles.length / productosConStock.length) * 100).toFixed(1)
            : 0;
        
        const preview = document.getElementById('statsDinamicas');
        if (preview) {
            preview.innerHTML = `
                <div style="display: grid; gap: 8px;">
                    <div>📦 Total con stock: <strong>${productosConStock.length}</strong> productos</div>
                    <div>🎯 Mostrando TOP <strong style="color: var(--primary); font-size: 1.2rem;">${topValue}</strong></div>
                    <div>📊 Representa el <strong>${porcentaje}%</strong> del catálogo</div>
                    <div>📉 Venta mínima en este top: <strong>${ventaMinima.toFixed(1)}</strong> unidades/día</div>
                    <div style="border-top: 1px dashed #ccc; margin: 5px 0;"></div>
                    <div style="color: var(--success);">
                        ✅ PRODUCTOS VISIBLES: <strong>${productosVisibles.length}</strong>
                    </div>
                    <div style="color: var(--gray); font-size: 0.9rem;">
                        ⚡ Ocultos automáticamente: <strong>${productosConStock.length - productosVisibles.length}</strong> (baja rotación)
                    </div>
                </div>
            `;
        }
        
        const topValorDisplay = document.getElementById('topValorDisplay');
        if (topValorDisplay) {
            topValorDisplay.textContent = topValue;
        }
        
    }, 300);
}

function guardarTopDinamico() {
    const topValue = parseInt(document.getElementById('topRange').value);
    config.topDinamico = topValue;
    guardar();
    renderProductos();
    toast(`✅ Mostrando TOP ${topValue} productos`, 'success');
}

// ============================================
// LÓGICA DE PRECIOS Y OFERTAS
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
// RENDERIZAR OFERTAS DESTACADAS
// ============================================
function renderOfertasDestacadas() {
    const grid = document.getElementById('ofertasDestacadasGrid');
    if (!grid) return;
    
    const productosEnOferta = productos.filter(p => estaEnOferta(p));
    
    if (productosEnOferta.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: var(--gray); grid-column: 1/-1; padding: 20px;">🔥 No hay ofertas activas esta semana</p>';
        return;
    }
    
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
            ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
            : `<div class="image-placeholder">${p.emoji || '📦'}</div>`;
        
        return `
            <div class="oferta-destacada-card" onclick="verProducto('${p.id}')">
                <div class="oferta-destacada-badge">🔥 -${porcentaje}%</div>
                <div class="oferta-destacada-image">
                    ${imgHTML}
                </div>
                <div class="oferta-destacada-info">
                    <div class="oferta-destacada-nombre">${p.nombre}</div>
                    <div class="oferta-destacada-precios">
                        <span class="oferta-destacada-precio-original">$${oferta.precioOriginal.toLocaleString('es-AR')}</span>
                        <span class="oferta-destacada-precio-oferta">$${oferta.precioOferta.toLocaleString('es-AR')}</span>
                    </div>
                    <div class="oferta-destacada-ahorro">💰 Ahorrás $${ahorro.toLocaleString('es-AR')}</div>
                    <button class="oferta-destacada-btn" onclick="event.stopPropagation(); agregarAlCarrito('${p.id}')">
                        🛒 Sumar al pedido
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// FILTROS Y CATEGORÍAS
// ============================================
function obtenerCategorias() {
    const productosVisibles = obtenerProductosVisibles();
    
    // Filtrar valores válidos (que no sean números sueltos o códigos raros)
    const secciones = [...new Set(productosVisibles.map(p => p.seccion).filter(Boolean))]
        .filter(s => s.length > 2 && !/^\d+$/.test(s)); // Ignorar strings de 1-2 caracteres o solo números
    
    const familias = [...new Set(productosVisibles.map(p => p.familia).filter(Boolean))]
        .filter(f => f.length > 2 && !/^\d+$/.test(f));
    
    const subfamilias = [...new Set(productosVisibles.map(p => p.subfamilia).filter(Boolean))]
        .filter(s => s.length > 2 && !/^\d+$/.test(s));
    
    return { secciones, familias, subfamilias };
}

function actualizarFiltros() {
    const { secciones, familias, subfamilias } = obtenerCategorias();
    
    const secSelDesktop = document.getElementById('seccionFilterDesktop');
    const famSelDesktop = document.getElementById('familiaFilterDesktop');
    const subSelDesktop = document.getElementById('subfamiliaFilterDesktop');
    
    if (secSelDesktop) {
        secSelDesktop.innerHTML = '<option value="">Todas</option>' + 
            secciones.map(s => `<option value="${s}" ${s === filtros.seccion ? 'selected' : ''}>${s}</option>`).join('');
    }
    
    if (famSelDesktop) {
        let famFilt = familias;
        if (filtros.seccion) {
            const productosVisibles = obtenerProductosVisibles();
            famFilt = [...new Set(productosVisibles.filter(p => p.seccion === filtros.seccion).map(p => p.familia).filter(Boolean))]
                .filter(f => f.length > 2 && !/^\d+$/.test(f));
        }
        famSelDesktop.innerHTML = '<option value="">Todas</option>' + 
            famFilt.map(f => `<option value="${f}" ${f === filtros.familia ? 'selected' : ''}>${f}</option>`).join('');
    }
    
    if (subSelDesktop) {
        let subFilt = subfamilias;
        if (filtros.familia) {
            const productosVisibles = obtenerProductosVisibles();
            subFilt = [...new Set(productosVisibles.filter(p => p.familia === filtros.familia).map(p => p.subfamilia).filter(Boolean))]
                .filter(s => s.length > 2 && !/^\d+$/.test(s));
        }
        subSelDesktop.innerHTML = '<option value="">Todas</option>' + 
            subFilt.map(s => `<option value="${s}" ${s === filtros.subfamilia ? 'selected' : ''}>${s}</option>`).join('');
    }

    const secSelModal = document.getElementById('seccionFilter');
    const famSelModal = document.getElementById('familiaFilter');
    const subSelModal = document.getElementById('subfamiliaFilter');

    if (secSelModal) {
        secSelModal.innerHTML = '<option value="">Todas</option>' + 
            secciones.map(s => `<option value="${s}" ${s === filtros.seccion ? 'selected' : ''}>${s}</option>`).join('');
    }
    
    if (famSelModal) {
        let famFilt = familias;
        if (filtros.seccion) {
            const productosVisibles = obtenerProductosVisibles();
            famFilt = [...new Set(productosVisibles.filter(p => p.seccion === filtros.seccion).map(p => p.familia).filter(Boolean))]
                .filter(f => f.length > 2 && !/^\d+$/.test(f));
        }
        famSelModal.innerHTML = '<option value="">Todas</option>' + 
            famFilt.map(f => `<option value="${f}" ${f === filtros.familia ? 'selected' : ''}>${f}</option>`).join('');
    }
    
    if (subSelModal) {
        let subFilt = subfamilias;
        if (filtros.familia) {
            const productosVisibles = obtenerProductosVisibles();
            subFilt = [...new Set(productosVisibles.filter(p => p.familia === filtros.familia).map(p => p.subfamilia).filter(Boolean))]
                .filter(s => s.length > 2 && !/^\d+$/.test(s));
        }
        subSelModal.innerHTML = '<option value="">Todas</option>' + 
            subFilt.map(s => `<option value="${s}" ${s === filtros.subfamilia ? 'selected' : ''}>${s}</option>`).join('');
    }
}

function contarFiltrosActivos() {
    let count = 0;
    if (filtros.seccion) count++;
    if (filtros.familia) count++;
    if (filtros.subfamilia) count++;
    return count;
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

function resetFiltros() {
    filtros.seccion = '';
    filtros.familia = '';
    filtros.subfamilia = '';
    
    document.getElementById('seccionFilter').value = '';
    document.getElementById('familiaFilter').value = '';
    document.getElementById('subfamiliaFilter').value = '';
    if (document.getElementById('seccionFilterDesktop')) document.getElementById('seccionFilterDesktop').value = '';
    if (document.getElementById('familiaFilterDesktop')) document.getElementById('familiaFilterDesktop').value = '';
    if (document.getElementById('subfamiliaFilterDesktop')) document.getElementById('subfamiliaFilterDesktop').value = '';
    
    actualizarFiltros();
    renderProductos();
    actualizarContadorFiltros();
    toast('🔄 Filtros limpiados', 'success');
}

function limpiarBusqueda() {
    filtros.busqueda = '';
    document.getElementById('searchInput').value = '';
    renderProductos();
    toast('🔄 Búsqueda limpiada', 'success');
}

function scrollToProducts() {
    const productsSection = document.getElementById('productsGrid');
    if (productsSection) {
        productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ============================================
// RENDERIZADO DE PRODUCTOS
// ============================================
function filtrarProductos() {
    let prods = obtenerProductosVisibles();
    
    if (filtros.seccion) {
        prods = prods.filter(p => p.seccion === filtros.seccion);
    }
    if (filtros.familia) {
        prods = prods.filter(p => p.familia === filtros.familia);
    }
    if (filtros.subfamilia) {
        prods = prods.filter(p => p.subfamilia === filtros.subfamilia);
    }
    
    if (filtros.busqueda.trim()) {
        const term = filtros.busqueda.toLowerCase();
        prods = prods.filter(p => 
            p.nombre.toLowerCase().includes(term) ||
            (p.seccion && p.seccion.toLowerCase().includes(term)) ||
            (p.familia && p.familia.toLowerCase().includes(term)) ||
            (p.subfamilia && p.subfamilia.toLowerCase().includes(term))
        );
    }
    
    return prods;
}

function actualizarBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    let html = '<a href="#" data-action="home">🏠 Inicio</a>';
    
    if (filtros.seccion) html += ' <span>›</span> <a href="#" data-action="seccion">' + filtros.seccion + '</a>';
    if (filtros.familia) html += ' <span>›</span> <a href="#" data-action="familia">' + filtros.familia + '</a>';
    if (filtros.subfamilia) html += ' <span>›</span> <span>' + filtros.subfamilia + '</span>';
    
    bc.innerHTML = html;
    
    bc.querySelectorAll('[data-action]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const action = e.target.dataset.action;
            if (action === 'home') {
                filtros = { seccion: '', familia: '', subfamilia: '', busqueda: filtros.busqueda };
            } else if (action === 'seccion') {
                filtros.familia = '';
                filtros.subfamilia = '';
            } else if (action === 'familia') {
                filtros.subfamilia = '';
            }
            actualizarFiltros();
            renderProductos();
        });
    });
}

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
        const esBusqueda = filtros.busqueda.trim() !== '';
        const hayFiltros = filtros.seccion || filtros.familia || filtros.subfamilia;
        
        let mensaje = '';
        
        if (esBusqueda) {
            mensaje = `
                <div class="no-results">
                    <div class="no-results-icon">🔍</div>
                    <h3>No encontramos resultados</h3>
                    <p>No hay productos que coincidan con: <span class="search-term">"${filtros.busqueda}"</span></p>
                    <button class="clear-search-btn" onclick="limpiarBusqueda()">🔄 Limpiar búsqueda</button>
                </div>
            `;
        } else if (hayFiltros) {
            mensaje = `
                <div class="no-results">
                    <div class="no-results-icon">📂</div>
                    <h3>Sin productos en esta categoría</h3>
                    <p>No hay productos disponibles con los filtros seleccionados</p>
                    <button class="clear-search-btn" onclick="resetFiltros()">🔄 Limpiar filtros</button>
                </div>
            `;
        } else {
            mensaje = `
                <div class="no-results">
                    <div class="no-results-icon">📦</div>
                    <h3>Aún no hay productos</h3>
                    <p>Importá productos desde el panel de administración</p>
                </div>
            `;
        }
        
        grid.innerHTML = mensaje;
        document.getElementById('relatedProducts').style.display = 'none';
        return;
    }
    
    grid.innerHTML = prods.map(p => {
        const p1 = calcularPrecio(p, 1);
        const p3 = calcularPrecio(p, 3);
        const enOf = estaEnOferta(p);
        const pOrig = p.costo * (1 + config.margenGeneral / 100);
        
        const stockBadge = p.stock > 10 
            ? '<span class="stock-badge disponible">✓ Disponible</span>'
            : p.stock > 0 
            ? '<span class="stock-badge poco-stock">⚠ Poco stock</span>'
            : '<span class="stock-badge sin-stock">✕ Sin stock</span>';
        
        const stockClass = p.stock > 10 ? '' : p.stock > 0 ? 'warning' : 'danger';
        let stockText = '';
        if (p.stock === 1) stockText = '⚠ Última unidad';
        else if (p.stock > 1 && p.stock <= 5) stockText = `⚠ Últimas ${p.stock} unidades`;
        if (p.stock <= 0) stockText = '❌ Agotado';

        const imgHTML = validarURL(p.imagen)
            ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="image-placeholder" style="display: none;">${p.emoji || '📦'}</div>`
            : `<div class="image-placeholder">${p.emoji || '📦'}</div>`;
        
        const cats = `
            <div class="product-categories">
                ${p.seccion ? `<span class="product-category">${p.seccion}</span>` : ''}
                ${p.familia ? `<span class="product-category">${p.familia}</span>` : ''}
                ${p.subfamilia ? `<span class="product-category">${p.subfamilia}</span>` : ''}
            </div>
        `;
        
        const precio = enOf
            ? `<div class="product-price oferta-price">$${p1.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>
               <span class="product-price-original">$${pOrig.toLocaleString('es-AR', {minimumFractionDigits: 2})}</span>`
            : `<div class="product-price">$${p1.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>`;
        
        const p3HTML = p3 < p1
            ? `<div class="precio-por-cantidad">🎁 3+ unidades: $${p3.toLocaleString('es-AR', {minimumFractionDigits: 2})} c/u</div>`
            : '';
        
        return `
            <div class="product-card ${enOf ? 'en-oferta' : ''}">
                ${enOf ? '<div class="oferta-badge">🔥 OFERTA</div>' : ''}
                <div class="product-image-container">
                    ${imgHTML}
                    ${stockBadge}
                </div>
                <div class="product-info">
                    ${cats}
                    <h3 class="product-name">${p.nombre}</h3>
                    <div class="price-container">
                        ${precio}
                        ${p3HTML}
                    </div>
                    <div class="product-stock ${stockClass}">${stockText}</div>
                    <button class="add-to-cart-btn" onclick="agregarAlCarrito('${p.id}')" ${p.stock <= 0 ? 'disabled' : ''}>
                        ${p.stock > 0 ? '🛒 Sumar al pedido ' : '✕ Sin stock'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    if (filtros.familia || filtros.subfamilia) {
        mostrarRelacionados(prods[0]);
    } else {
        document.getElementById('relatedProducts').style.display = 'none';
    }
}

function mostrarRelacionados(pRef) {
    if (!pRef) {
        document.getElementById('relatedProducts').style.display = 'none';
        return;
    }
    
    let rel = productos.filter(p => 
        p.id !== pRef.id &&
        p.stock > 0 &&
        (p.familia === pRef.familia || p.subfamilia === pRef.subfamilia)
    ).slice(0, 4);
    
    if (rel.length === 0) {
        document.getElementById('relatedProducts').style.display = 'none';
        return;
    }
    
    const grid = document.getElementById('relatedGrid');
    grid.innerHTML = rel.map(p => {
        const precio = calcularPrecio(p, 1);
        const img = validarURL(p.imagen)
            ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;" onerror="this.outerHTML='<div style=\\'width:100%;height:150px;display:flex;align-items:center;justify-content:center;background:var(--accent);border-radius:8px;font-size:3rem;\\'>${p.emoji || '📦'}</div>';">`
            : `<div style="width:100%;height:150px;display:flex;align-items:center;justify-content:center;background:var(--accent);border-radius:8px;font-size:3rem;">${p.emoji || '📦'}</div>`;
        
        return `
            <div style="cursor: pointer;" onclick="verProducto('${p.id}')">
                ${img}
                <h4 style="margin-top: 10px; font-size: 0.9rem; color: var(--secondary);">${p.nombre}</h4>
                <div style="color: var(--primary); font-weight: 700; margin-top: 5px;">$${precio.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>
                <button class="add-to-cart-btn" style="margin-top: 10px; font-size: 0.9rem; padding: 8px;" onclick="event.stopPropagation(); agregarAlCarrito('${p.id}')">
                    ➕ Agregar
                </button>
            </div>
        `;
    }).join('');
    
    document.getElementById('relatedProducts').style.display = 'block';
}

function verProducto(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    filtros.seccion = p.seccion || '';
    filtros.familia = p.familia || '';
    filtros.subfamilia = p.subfamilia || '';
    actualizarFiltros();
    renderProductos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

function actualizarCarrito() {
    const count = document.getElementById('cartCount');
    const items = document.getElementById('cartItems');
    const total = document.getElementById('cartTotal');
    const savings = document.getElementById('cartSavings');
    
    const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);
    
    let totalDinero = 0;
    carrito.forEach(item => {
        const p = productos.find(x => x.id === item.id);
        if (p) {
            const precioUnit = calcularPrecio(p, item.cantidad);
            totalDinero += precioUnit * item.cantidad;
        }
    });
    
    const montoFormateado = totalDinero > 0 
        ? `$${Math.round(totalDinero).toLocaleString('es-AR')}`
        : '$0';
    
    const cartText = document.getElementById('cartText');
    if (cartText) {
        cartText.textContent = totalItems > 0 
            ? `Carrito (${totalItems}) - ${montoFormateado}`
            : 'Carrito (0)';
    }
    
    const ctaMobile = document.getElementById('ctaMobileText');
    if (ctaMobile) {
        ctaMobile.textContent = totalItems > 0
            ? `Comprar (${totalItems}) - ${montoFormateado}`
            : 'Comprar (0) - $0';
    }
    
    if (carrito.length === 0) {
        items.innerHTML = `
            <div class="empty-cart">
                <div class="empty-cart-icon">🛒</div>
                <p><strong>Todavía no sumaste nada 😉</strong></p>
                <p style="font-size:0.9rem;">Elegí productos y armamos tu pedido</p>
            </div>
        `;
        total.textContent = '$0,00';
        savings.style.display = 'none';
        return;
    }
    
    let totalGen = 0;
    let ahorro = 0;
    
    items.innerHTML = carrito.map(item => {
        const p = productos.find(x => x.id === item.id);
        if (!p) return '';
        
        const pUnit = calcularPrecio(p, item.cantidad);
        const pOrig = calcularPrecio(p, 1);
        const sub = pUnit * item.cantidad;
        
        totalGen += sub;
        if (pUnit < pOrig) ahorro += (pOrig - pUnit) * item.cantidad;
        
        const img = validarURL(item.imagen)
            ? `<div style="width: 70px; height: 70px; border-radius: 8px; overflow: hidden; background: var(--accent); display: flex; align-items: center; justify-content: center;">
                <img src="${item.imagen}" alt="${item.nombre}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'font-size: 2rem;\\'>${item.emoji || '📦'}</span>';">
               </div>`
            : `<div style="width: 70px; height: 70px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 2rem;">${item.emoji || '📦'}</div>`;
        
        const det = item.cantidad >= 3 && pUnit < pOrig
            ? `<div class="cart-item-price-detail">🎁 Precio especial</div>`
            : '';
        
        return `
            <div class="cart-item">
                ${img}
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.nombre}</div>
                    <div class="cart-item-price">$${pUnit.toLocaleString('es-AR', {minimumFractionDigits: 2})} × ${item.cantidad} = $${sub.toLocaleString('es-AR', {minimumFractionDigits: 2})}</div>
                    ${det}
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="actualizarCantidad('${item.id}', -1)">−</button>
                        <span class="qty-display">${item.cantidad}</span>
                        <button class="qty-btn" onclick="actualizarCantidad('${item.id}', 1)">+</button>
                        <button class="remove-btn" onclick="eliminarDelCarrito('${item.id}')">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    total.textContent = `$${totalGen.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
    
    if (ahorro > 0) {
        savings.textContent = `💰 Ahorraste $${ahorro.toLocaleString('es-AR', {minimumFractionDigits: 2})}`;
        savings.style.display = 'block';
    } else {
        savings.style.display = 'none';
    }
}

function generarWhatsApp() {
    if (carrito.length === 0) {
        toast('⚠ Carrito vacío', 'warning');
        return;
    }
    
    let msg = '🛒 *Pedido - Mercadito Virtual*\n\nHola 👋 te paso mi pedido:\n\n';
    let totalGen = 0;
    
    carrito.forEach((item, i) => {
        const p = productos.find(x => x.id === item.id);
        if (!p) return;
        
        const pUnit = calcularPrecio(p, item.cantidad);
        const sub = pUnit * item.cantidad;
        totalGen += sub;
        
        msg += `${i + 1}. ${item.nombre}\n`;
        msg += `   Cantidad: ${item.cantidad}\n`;
        msg += `   Precio: $${pUnit.toLocaleString('es-AR')}\n`;
        msg += `   Subtotal: $${sub.toLocaleString('es-AR')}\n\n`;
    });
    
    msg += `💰 *TOTAL: $${totalGen.toLocaleString('es-AR')}*`;
   
    window.open(`https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================
// FUNCIONES DEL ADMIN: MÁRGENES
// ============================================
function guardarMargenGeneral() {
    const val = parseFloat(document.getElementById('margenGeneral').value);
    if (isNaN(val) || val < 0) {
        toast('⚠ Valor inválido', 'warning');
        return;
    }
    config.margenGeneral = val;
    guardar();
    renderProductos();
    toast('✅ Margen guardado', 'success');
}

function guardarDescuentoCantidad() {
    const val = parseFloat(document.getElementById('descuentoCantidad').value);
    if (isNaN(val) || val < 0) {
        toast('⚠ Valor inválido', 'warning');
        return;
    }
    config.descuentoCantidad = val;
    guardar();
    renderProductos();
    actualizarCarrito();
    toast('✅ Descuento guardado', 'success');
}

function agregarMargenSeccion() {
    const nombreInput = document.getElementById('nuevaSeccionNombre');
    const margenInput = document.getElementById('nuevaSeccionMargen');
    
    const nom = nombreInput.value.trim();
    const marg = parseFloat(margenInput.value);
    
    if (!nom) {
        toast('⚠ Ingresá un nombre', 'warning');
        return;
    }
    if (isNaN(marg) || marg < 0) {
        toast('⚠ Ingresá un margen válido', 'warning');
        return;
    }
    
    config.margenesSecciones[nom.toLowerCase()] = marg;
    guardar();
    renderMargenes();
    renderProductos();
    toast(`✅ Margen para ${nom}`, 'success');
    
    nombreInput.value = '';
    margenInput.value = '';
}

function agregarMargenFamilia() {
    const nombreInput = document.getElementById('nuevaFamiliaNombre');
    const margenInput = document.getElementById('nuevaFamiliaMargen');
    
    const nom = nombreInput.value.trim();
    const marg = parseFloat(margenInput.value);
    
    if (!nom) {
        toast('⚠ Ingresá un nombre', 'warning');
        return;
    }
    if (isNaN(marg) || marg < 0) {
        toast('⚠ Ingresá un margen válido', 'warning');
        return;
    }
    
    config.margenesFamilias[nom.toLowerCase()] = marg;
    guardar();
    renderMargenes();
    renderProductos();
    toast(`✅ Margen para ${nom}`, 'success');
    
    nombreInput.value = '';
    margenInput.value = '';
}

function agregarMargenSubfamilia() {
    const nombreInput = document.getElementById('nuevaSubfamiliaNombre');
    const margenInput = document.getElementById('nuevaSubfamiliaMargen');
    
    const nom = nombreInput.value.trim();
    const marg = parseFloat(margenInput.value);
    
    if (!nom) {
        toast('⚠ Ingresá un nombre', 'warning');
        return;
    }
    if (isNaN(marg) || marg < 0) {
        toast('⚠ Ingresá un margen válido', 'warning');
        return;
    }
    
    config.margenesSubfamilias[nom.toLowerCase()] = marg;
    guardar();
    renderMargenes();
    renderProductos();
    toast(`✅ Margen para ${nom}`, 'success');
    
    nombreInput.value = '';
    margenInput.value = '';
}

function eliminarMargen(tipo, nom) {
    if (!confirm(`¿Eliminar margen ${nom}?`)) return;
    if (tipo === 'seccion') delete config.margenesSecciones[nom];
    else if (tipo === 'familia') delete config.margenesFamilias[nom];
    else if (tipo === 'subfamilia') delete config.margenesSubfamilias[nom];
    guardar();
    renderMargenes();
    renderProductos();
    toast('✅ Eliminado', 'success');
}

function renderMargenes() {
    const sec = document.getElementById('margenesSecciones');
    sec.innerHTML = Object.entries(config.margenesSecciones).map(([n, m]) => `
        <div class="margin-item">
            <div class="margin-item-name">${n.toUpperCase()}</div>
            <div>
                <span style="font-weight: 700; color: var(--primary); margin-right: 10px;">${m}%</span>
                <button class="btn-delete" onclick="eliminarMargen('seccion', '${n}')">🗑️</button>
            </div>
        </div>
    `).join('') || '<p style="color: var(--gray); padding: 10px;">Sin márgenes</p>';
    
    const fam = document.getElementById('margenesFamilias');
    fam.innerHTML = Object.entries(config.margenesFamilias).map(([n, m]) => `
        <div class="margin-item">
            <div class="margin-item-name">${n.toUpperCase()}</div>
            <div>
                <span style="font-weight: 700; color: var(--primary); margin-right: 10px;">${m}%</span>
                <button class="btn-delete" onclick="eliminarMargen('familia', '${n}')">🗑️</button>
            </div>
        </div>
    `).join('') || '<p style="color: var(--gray); padding: 10px;">Sin márgenes</p>';
    
    const sub = document.getElementById('margenesSubfamilias');
    sub.innerHTML = Object.entries(config.margenesSubfamilias).map(([n, m]) => `
        <div class="margin-item">
            <div class="margin-item-name">${n.toUpperCase()}</div>
            <div>
                <span style="font-weight: 700; color: var(--primary); margin-right: 10px;">${m}%</span>
                <button class="btn-delete" onclick="eliminarMargen('subfamilia', '${n}')">🗑️</button>
            </div>
        </div>
    `).join('') || '<p style="color: var(--gray); padding: 10px;">Sin márgenes</p>';
}

// ============================================
// FUNCIONES DEL ADMIN: OFERTAS
// ============================================
let busquedaOfertaTimeout;

function setupAutocompleteOfertas() {
    const input = document.getElementById('buscarProductoOferta');
    const autocompleteContainer = document.getElementById('autocompleteOfertas');
    
    if (!input || !autocompleteContainer) return;
    
    input.addEventListener('input', function() {
        const val = this.value;
        if (val.length < 2) {
            autocompleteContainer.innerHTML = '';
            return;
        }
        
        clearTimeout(busquedaOfertaTimeout);
        busquedaOfertaTimeout = setTimeout(() => {
            const resultados = productos
                .filter(p => p.nombre.toLowerCase().includes(val.toLowerCase()))
                .slice(0, 10);
            
            if (resultados.length === 0) {
                autocompleteContainer.innerHTML = '<div style="padding: 10px; color: var(--gray);">Sin resultados</div>';
                return;
            }
            
            autocompleteContainer.innerHTML = resultados.map(p => {
                const yaOf = estaEnOferta(p);
                return `<div onclick="seleccionarProductoOferta('${p.id}', '${p.nombre.replace(/'/g, "\\'")}')" style="${yaOf ? 'background: #ffe0e0;' : ''}">
                    <strong>${p.nombre}</strong>
                    ${yaOf ? '<small style="color: var(--oferta);">(Ya en oferta)</small>' : ''}
                </div>`;
            }).join('');
        }, 300);
    });
    
    document.addEventListener('click', function(e) {
        if (e.target !== input && !autocompleteContainer.contains(e.target)) {
            autocompleteContainer.innerHTML = '';
        }
    });
}

function seleccionarProductoOferta(id, nombre) {
    const input = document.getElementById('buscarProductoOferta');
    input.value = nombre;
    document.getElementById('autocompleteOfertas').innerHTML = '';
    mostrarProductoParaOfertar(id);
}

function mostrarProductoParaOfertar(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    
    const precioAct = calcularPrecio(p, 1);
    const yaOf = estaEnOferta(p);
    
    const cont = document.getElementById('resultadosBusquedaOferta');
    cont.innerHTML = `
        <div style="padding: 10px; border: 1px solid var(--accent); border-radius: 8px; margin-bottom: 10px; ${yaOf ? 'background: #ffe0e0;' : 'background: white;'}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${p.nombre}</strong>
                    <div style="font-size: 0.85rem; color: var(--gray);">Precio: $${precioAct.toLocaleString('es-AR')}</div>
                    ${yaOf ? '<span style="color: var(--oferta); font-size: 0.8rem;">⚠ Ya en oferta</span>' : ''}
                </div>
                <button class="btn-primary" style="width: auto; padding: 8px 15px;" onclick="crearOferta('${p.id}')" ${yaOf ? 'disabled' : ''}>🔥 Ofertar</button>
            </div>
        </div>
    `;
}

function crearOferta(id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    
    const precioAct = calcularPrecio(p, 1);
    const precioOf = prompt(`${p.nombre}\nPrecio actual: $${precioAct.toLocaleString('es-AR')}\n\nPrecio de oferta:`);
    if (!precioOf) return;
    
    const pOf = parseFloat(precioOf);
    if (isNaN(pOf) || pOf <= 0) {
        toast('⚠ Precio inválido', 'warning');
        return;
    }
    
    const hoy = new Date();
    const dia = hoy.getDay();
    const diasHastaLunes = dia === 0 ? -6 : 1 - dia;
    
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() + diasHastaLunes);
    inicio.setHours(0, 0, 0, 0);
    
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);
    fin.setHours(23, 59, 59, 999);
    
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
    if (!o) return;
    o.activa = false;
    guardar();
    renderOfertas();
    renderOfertasDestacadas();
    renderProductos();
    toast('✅ Oferta desactivada', 'success');
}

function activarOferta(id) {
    const o = ofertas.find(x => x.id === id);
    if (!o) return;
    o.activa = true;
    guardar();
    renderOfertas();
    renderOfertasDestacadas();
    renderProductos();
    toast('✅ Oferta activada', 'success');
}

function eliminarOferta(id) {
    if (!confirm('¿Eliminar oferta?')) return;
    ofertas = ofertas.filter(x => x.id !== id);
    guardar();
    renderOfertas();
    renderOfertasDestacadas();
    renderProductos();
    toast('✅ Eliminada', 'success');
}

function renderOfertas() {
    const cont = document.getElementById('listaOfertas');
    
    if (ofertas.length === 0) {
        cont.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--gray);">Sin ofertas</p>';
    } else {
        const ofsOrden = [...ofertas].sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));
        
        cont.innerHTML = ofsOrden.map(o => {
            const fIni = new Date(o.fechaInicio).toLocaleDateString('es-AR');
            const fFin = new Date(o.fechaFin).toLocaleDateString('es-AR');
            const ahorro = o.precioOriginal - o.precioOferta;
            const porc = ((ahorro / o.precioOriginal) * 100).toFixed(0);
            const enVig = new Date() >= new Date(o.fechaInicio) && new Date() <= new Date(o.fechaFin);
            
            return `
                <div class="oferta-item">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <div><strong>${o.productoNombre}</strong></div>
                        <div>
                            ${o.activa 
                                ? `<button class="btn-delete" style="padding: 5px 10px; font-size: 0.85rem;" onclick="desactivarOferta('${o.id}')">❌</button>`
                                : `<button class="btn-success" style="padding: 5px 10px; font-size: 0.85rem; width: auto;" onclick="activarOferta('${o.id}')">✅</button>`
                            }
                            <button class="btn-delete" style="padding: 5px 10px; font-size: 0.85rem; margin-left: 5px;" onclick="eliminarOferta('${o.id}')">🗑️</button>
                        </div>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--gray); margin-bottom: 10px;">
                        📅 ${fIni} - ${fFin}
                        ${enVig ? '<span style="background: var(--success); color: white; padding: 3px 8px; border-radius: 10px; margin-left: 5px; font-size: 0.7rem;">VIGENTE</span>' : ''}
                        ${!o.activa ? '<span style="background: var(--gray); color: white; padding: 3px 8px; border-radius: 10px; margin-left: 5px; font-size: 0.7rem;">DESACTIVADA</span>' : ''}
                    </div>
                    <div style="display: flex; gap: 15px; align-items: center;">
                        <div>
                            <span style="color: var(--gray); font-size: 0.9rem;">Original:</span>
                            <span style="text-decoration: line-through; color: var(--gray); margin-left: 5px;">$${o.precioOriginal.toLocaleString('es-AR')}</span>
                        </div>
                        <div>
                            <span style="color: var(--oferta); font-weight: 700; font-size: 1.2rem;">$${o.precioOferta.toLocaleString('es-AR')}</span>
                            <span style="color: var(--success); margin-left: 10px; font-weight: 600;">-${porc}%</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    renderOfertasDestacadas();
}

// ============================================
// FUNCIONES DEL ADMIN: IMPORTACIÓN (CORREGIDAS)
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
            
            console.log('Columnas detectadas:', Object.keys(json[0])); // Para debug
            
            const nuevos = [];
            const errores = [];
            
            json.forEach((fila, idx) => {
                try {
                    // Buscar el nombre del producto
                    let nombre = fila.descripcion || fila.Descripcion || fila.nombre || fila.Nombre || fila.PRODUCTO || fila.producto;
                    if (!nombre || nombre.toString().trim() === '') {
                        return; // Omitir filas sin nombre
                    }
                    nombre = nombre.toString().trim();
                    
                    // Buscar el costo
                    let costo = 0;
                    if (fila.costo !== undefined) costo = parseFloat(fila.costo);
                    else if (fila.Costo !== undefined) costo = parseFloat(fila.Costo);
                    else if (fila.PRECIO !== undefined) costo = parseFloat(fila.PRECIO);
                    else if (fila.precio !== undefined) costo = parseFloat(fila.precio);
                    
                    if (isNaN(costo) || costo <= 0) {
                        return; // Omitir filas sin costo válido
                    }
                    
                    // Buscar sección - SOLO de las columnas correctas
                    let seccion = 'OTROS';
                    if (fila['Des. Seccion*'] && fila['Des. Seccion*'].toString().trim() !== '') {
                        seccion = fila['Des. Seccion*'].toString().trim().toUpperCase();
                    } else if (fila['Des.     Seccion*'] && fila['Des.     Seccion*'].toString().trim() !== '') {
                        seccion = fila['Des.     Seccion*'].toString().trim().toUpperCase();
                    } else if (fila.seccion && fila.seccion.toString().trim() !== '') {
                        seccion = fila.seccion.toString().trim().toUpperCase();
                    } else if (fila.Seccion && fila.Seccion.toString().trim() !== '') {
                        seccion = fila.Seccion.toString().trim().toUpperCase();
                    }
                    
                    // Buscar familia - SOLO de las columnas correctas
                    let familia = '';
                    if (fila['Des.Grp. Familia*'] && fila['Des.Grp. Familia*'].toString().trim() !== '') {
                        familia = fila['Des.Grp. Familia*'].toString().trim().toUpperCase();
                    } else if (fila.familia && fila.familia.toString().trim() !== '') {
                        familia = fila.familia.toString().trim().toUpperCase();
                    } else if (fila.Familia && fila.Familia.toString().trim() !== '') {
                        familia = fila.Familia.toString().trim().toUpperCase();
                    }
                    
                    // Buscar subfamilia - SOLO de las columnas correctas
                    let subfamilia = '';
                    if (fila.subfamilia && fila.subfamilia.toString().trim() !== '') {
                        subfamilia = fila.subfamilia.toString().trim().toUpperCase();
                    } else if (fila.Subfamilia && fila.Subfamilia.toString().trim() !== '') {
                        subfamilia = fila.Subfamilia.toString().trim().toUpperCase();
                    }
                    
                    // Buscar stock
                    let stock = 0;
                    if (fila.Stock !== undefined) stock = parseInt(fila.Stock) || 0;
                    else if (fila.stock !== undefined) stock = parseInt(fila.stock) || 0;
                    else if (fila.STOCK !== undefined) stock = parseInt(fila.STOCK) || 0;
                    
                    // Buscar venta_diaria
                    let venta_diaria = 0;
                    if (fila.venta_diaria !== undefined) venta_diaria = parseFloat(fila.venta_diaria) || 0;
                    else if (fila.ventadiaria !== undefined) venta_diaria = parseFloat(fila.ventadiaria) || 0;
                    else if (fila.ventas !== undefined) venta_diaria = parseFloat(fila.ventas) || 0;
                    else if (fila['venta diaria'] !== undefined) venta_diaria = parseFloat(fila['venta diaria']) || 0;
                    
                    // Solo agregar si tenemos lo mínimo necesario
                    if (nombre && costo > 0) {
                        // Calcular precio con margen
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
                    }
                    
                } catch (error) {
                    errores.push(`Fila ${idx + 2}: ${error.message}`);
                }
            });
            
            if (nuevos.length === 0) {
                throw new Error('No se encontraron productos válidos. Revisá que las columnas tengan "descripcion" y "costo"');
            }
            
            const conVentas = nuevos.filter(p => p.venta_diaria > 0).length;
            
            // Agregar los nuevos productos a los existentes
            productos = [...productos, ...nuevos];
            guardar();
            actualizarFiltros();
            renderProductos();
            renderProductosAdmin();
            renderOfertasDestacadas();
            
            // Mostrar preview
            prevCont.innerHTML = `
                <div style="color: var(--success); font-weight: 600; margin-bottom: 15px;">
                    ✅ ${nuevos.length} productos importados correctamente
                    ${errores.length > 0 ? `<br><small style="color: var(--warning);">⚠ ${errores.length} filas omitidas por errores</small>` : ''}
                    ${conVentas > 0 ? `<br><small style="font-weight: normal;">📊 ${conVentas} con datos de venta</small>` : ''}
                </div>
                <div style="max-height: 300px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                        <thead>
                            <tr style="background: var(--secondary); color: white;">
                                <th style="padding: 8px; text-align: left;">Nombre</th>
                                <th style="padding: 8px; text-align: left;">Sección</th>
                                <th style="padding: 8px; text-align: right;">Precio</th>
                                <th style="padding: 8px; text-align: center;">Stock</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nuevos.slice(0, 10).map(p => `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 8px;">${p.nombre}</td>
                                    <td style="padding: 8px;">${p.seccion}</td>
                                    <td style="padding: 8px; text-align: right; color: var(--primary);">$${p.precio.toLocaleString('es-AR')}</td>
                                    <td style="padding: 8px; text-align: center;">${p.stock}</td>
                                </tr>
                            `).join('')}
                            ${nuevos.length > 10 ? `
                                <tr><td colspan="4" style="padding: 10px; text-align: center; color: var(--gray);">... y ${nuevos.length - 10} más</td></tr>
                            ` : ''}
                        </tbody>
                    </table>
                </div>
                ${errores.length > 0 ? `
                    <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 8px;">
                        <strong style="color: #856404;">⚠ Errores:</strong>
                        <ul style="margin-top: 5px; font-size: 0.85rem;">
                            ${errores.slice(0, 5).map(e => `<li>${e}</li>`).join('')}
                            ${errores.length > 5 ? `<li>... y ${errores.length - 5} más</li>` : ''}
                        </ul>
                    </div>
                ` : ''}
            `;
            
            toast(`✅ ${nuevos.length} productos importados`, 'success');
            document.getElementById('excelFile').value = '';
            
        } catch (error) {
            console.error('Error Excel:', error);
            toast('❌ Error al procesar: ' + error.message, 'error');
            prevCont.innerHTML = `<p style="color: var(--primary);">❌ ${error.message}</p>`;
        }
    };
    lector.readAsArrayBuffer(arch);
}

async function cargarDesdeGoogleSheets(silencioso = false) {
    try {
        if (!silencioso) {
            toast('⏳ Cargando productos desde Google Sheets...', 'success');
        }
        
        const response = await fetch(GOOGLE_SHEET_URL);
        if (!response.ok) throw new Error('Error al cargar Google Sheet');
        
        const csvText = await response.text();
        
        // Parsear CSV básico
        const lineas = csvText.split('\n');
        if (lineas.length < 2) throw new Error('Archivo vacío');
        
        const headers = lineas[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        
        const nuevos = [];
        const errores = [];
        
        for (let i = 1; i < lineas.length; i++) {
            try {
                if (!lineas[i].trim()) continue;
                
                // Parsear CSV simple (sin comas dentro de comillas por ahora)
                const valores = lineas[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                
                const fila = {};
                headers.forEach((header, idx) => {
                    fila[header] = valores[idx] || '';
                });
                
                // Buscar nombre
                let nombre = fila.descripcion || fila.Descripcion || fila.nombre || fila.Nombre || fila.PRODUCTO || fila.producto;
                if (!nombre || nombre.trim() === '') continue;
                nombre = nombre.trim();
                
                // Buscar costo
                let costo = 0;
                if (fila.costo) costo = parseFloat(fila.costo);
                else if (fila.Costo) costo = parseFloat(fila.Costo);
                else if (fila.PRECIO) costo = parseFloat(fila.PRECIO);
                else if (fila.precio) costo = parseFloat(fila.precio);
                
                if (isNaN(costo) || costo <= 0) continue;
                
                // Buscar sección - SOLO columnas específicas
                let seccion = 'OTROS';
                if (fila['Des. Seccion*'] && fila['Des. Seccion*'].trim() !== '') {
                    seccion = fila['Des. Seccion*'].trim().toUpperCase();
                } else if (fila['Des.     Seccion*'] && fila['Des.     Seccion*'].trim() !== '') {
                    seccion = fila['Des.     Seccion*'].trim().toUpperCase();
                } else if (fila.seccion && fila.seccion.trim() !== '') {
                    seccion = fila.seccion.trim().toUpperCase();
                } else if (fila.Seccion && fila.Seccion.trim() !== '') {
                    seccion = fila.Seccion.trim().toUpperCase();
                }
                
                // Buscar familia - SOLO columnas específicas
                let familia = '';
                if (fila['Des.Grp. Familia*'] && fila['Des.Grp. Familia*'].trim() !== '') {
                    familia = fila['Des.Grp. Familia*'].trim().toUpperCase();
                } else if (fila.familia && fila.familia.trim() !== '') {
                    familia = fila.familia.trim().toUpperCase();
                } else if (fila.Familia && fila.Familia.trim() !== '') {
                    familia = fila.Familia.trim().toUpperCase();
                }
                
                // Buscar subfamilia - SOLO columnas específicas
                let subfamilia = '';
                if (fila.subfamilia && fila.subfamilia.trim() !== '') {
                    subfamilia = fila.subfamilia.trim().toUpperCase();
                } else if (fila.Subfamilia && fila.Subfamilia.trim() !== '') {
                    subfamilia = fila.Subfamilia.trim().toUpperCase();
                }
                
                // Buscar stock
                let stock = 0;
                if (fila.Stock) stock = parseInt(fila.Stock) || 0;
                else if (fila.stock) stock = parseInt(fila.stock) || 0;
                
                // Buscar venta_diaria
                let venta_diaria = 0;
                if (fila.venta_diaria) venta_diaria = parseFloat(fila.venta_diaria) || 0;
                else if (fila.ventadiaria) venta_diaria = parseFloat(fila.ventadiaria) || 0;
                else if (fila.ventas) venta_diaria = parseFloat(fila.ventas) || 0;
                
                // Calcular precio con margen
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
                
            } catch (error) {
                errores.push(`Fila ${i + 2}: ${error.message}`);
            }
        }
        
        if (nuevos.length === 0) {
            throw new Error('No se encontraron productos válidos en Google Sheets');
        }
        
        const conVentas = nuevos.filter(p => p.venta_diaria > 0).length;
        
        productos = nuevos;
        ultimaActualizacion = new Date().toISOString();
        localStorage.setItem('ultimaActualizacion', ultimaActualizacion);
        guardar();
        actualizarFiltros();
        renderProductos();
        renderProductosAdmin();
        renderOfertasDestacadas();
        
        if (!silencioso) {
            toast(`✅ ${nuevos.length} productos cargados desde Google Sheets`, 'success');
        }
        
    } catch (error) {
        console.error('Error al cargar Google Sheet:', error);
        toast('❌ Error al cargar desde Google Sheets', 'error');
    }
}

async function verificarActualizacion(silencioso = false) {
    const INTERVALO_ACTUALIZACION = 5 * 60 * 1000;
    
    if (productos.length === 0) {
        await cargarDesdeGoogleSheets();
        return;
    }
    
    const ultimaActualizacionDate = ultimaActualizacion ? new Date(ultimaActualizacion) : new Date(0);
    const ahora = new Date();
    const tiempoTranscurrido = ahora - ultimaActualizacionDate;
    
    if (tiempoTranscurrido > INTERVALO_ACTUALIZACION) {
        await cargarDesdeGoogleSheets(silencioso);
    }
}

function exportarProductos() {
    if (productos.length === 0) {
        toast('⚠ Sin productos', 'warning');
        return;
    }
    
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
    
    const fecha = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `productos_${fecha}.xlsx`);
    
    toast('✅ Exportado', 'success');
}

// ============================================
// FUNCIONES DEL ADMIN: GESTIÓN DE PRODUCTOS
// ============================================
function agregarProductoManual() {
    const nom = document.getElementById('productName').value.trim();
    const sec = document.getElementById('productSeccion').value.trim();
    const fam = document.getElementById('productFamilia').value.trim();
    const sub = document.getElementById('productSubfamilia').value.trim();
    const costo = parseFloat(document.getElementById('productCosto').value);
    const stock = parseInt(document.getElementById('productStock').value);
    const emoji = document.getElementById('productEmoji').value.trim();
    const img = document.getElementById('productImage').value.trim();
    
    if (!nom || nom.length < 3) {
        toast('⚠ Nombre muy corto', 'warning');
        return;
    }
    
    if (isNaN(costo) || costo <= 0) {
        toast('⚠ Costo inválido', 'error');
        return;
    }
    
    if (isNaN(stock) || stock < 0) {
        toast('⚠ Stock inválido', 'error');
        return;
    }
    
    if (img && !validarURL(img)) {
        toast('⚠ URL inválida', 'warning');
    }
    
    const precio = costo * (1 + config.margenGeneral / 100);
    
    productos.push({
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        nombre: nom,
        seccion: sec.toUpperCase(),
        familia: fam.toUpperCase(),
        subfamilia: sub ? sub.toUpperCase() : '',
        precio: parseFloat(precio.toFixed(2)),
        costo,
        stock,
        imagen: img,
        emoji: emoji || '📦'
    });
    
    guardar();
    actualizarFiltros();
    renderProductos();
    renderProductosAdmin();
    
    document.getElementById('productName').value = '';
    document.getElementById('productSeccion').value = '';
    document.getElementById('productFamilia').value = '';
    document.getElementById('productSubfamilia').value = '';
    document.getElementById('productCosto').value = '';
    document.getElementById('productStock').value = '';
    document.getElementById('productEmoji').value = '';
    document.getElementById('productImage').value = '';
    
    toast(`✅ ${nom} agregado`, 'success');
}

function eliminarTodosProductos() {
    if (productos.length === 0) {
        toast('⚠ Sin productos', 'warning');
        return;
    }
    
    if (!confirm(`⚠️ ELIMINAR ${productos.length} PRODUCTOS\nEsto NO se puede deshacer.\n¿Continuar?`)) return;
    if (!confirm(`🚨 ÚLTIMA CONFIRMACIÓN\nSe eliminarán ${productos.length} productos.\n¿Estás seguro?`)) return;
    
    const cant = productos.length;
    productos = [];
    carrito = [];
    guardar();
    actualizarFiltros();
    renderProductos();
    renderProductosAdmin();
    actualizarCarrito();
    toast(`✅ ${cant} productos eliminados`, 'success');
}

let busquedaAdminTimeout;
function buscarProductoAdmin() {
    clearTimeout(busquedaAdminTimeout);
    busquedaAdminTimeout = setTimeout(renderProductosAdmin, 300);
}

function renderProductosAdmin() {
    const cont = document.getElementById('productListAdmin');
    const term = document.getElementById('buscarProductoAdmin').value.toLowerCase();
    
    let prods = productos;
    if (term) {
        prods = productos.filter(p => 
            p.nombre.toLowerCase().includes(term) ||
            (p.seccion && p.seccion.toLowerCase().includes(term)) ||
            (p.familia && p.familia.toLowerCase().includes(term))
        );
    }
    
    if (prods.length === 0) {
        cont.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--gray);">Sin productos</p>';
        return;
    }
    
    cont.innerHTML = prods.map(p => `
        <div style="padding: 15px; border: 1px solid var(--accent); border-radius: 8px; margin-bottom: 10px; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <strong>${p.nombre}</strong>
                    <div style="font-size: 0.85rem; color: var(--gray); margin-top: 5px;">
                        ${p.seccion || ''} ${p.familia ? '› ' + p.familia : ''} ${p.subfamilia ? '› ' + p.subfamilia : ''} | Stock: ${p.stock} | $${calcularPrecio(p, 1).toLocaleString('es-AR')}
                    </div>
                </div>
                <button class="btn-delete" onclick="eliminarProducto('${p.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function eliminarProducto(id) {
    if (!confirm('¿Eliminar producto?')) return;
    productos = productos.filter(p => p.id !== id);
    carrito = carrito.filter(c => c.id !== id);
    guardar();
    actualizarFiltros();
    renderProductos();
    renderProductosAdmin();
    actualizarCarrito();
    toast('✅ Eliminado', 'success');
}

// ============================================
// ADMIN: VERIFICACIÓN DE CONTRASEÑA
// ============================================
async function verificarPassword() {
    const pass = document.getElementById('passwordInput').value;
    const passHash = await hashPassword(pass);
    
    if (passHash === ADMIN_PASSWORD_HASH) {
        document.getElementById('passwordModal').classList.remove('show');
        document.getElementById('adminPanel').classList.add('open');
        document.getElementById('passwordInput').value = '';
    } else {
        toast('❌ Contraseña incorrecta', 'error');
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordInput').focus();
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================
let searchTimeout;

document.addEventListener('DOMContentLoaded', () => {
    if (GOOGLE_SHEET_URL) {
        verificarActualizacion();
        setInterval(() => verificarActualizacion(true), 5 * 60 * 1000);
    }
    
    actualizarFiltros();
    renderProductos();
    actualizarCarrito();
    renderProductosAdmin();
    renderMargenes();
    renderOfertas();
    renderOfertasDestacadas();
    actualizarContadorFiltros();
    
    document.getElementById('margenGeneral').value = config.margenGeneral;
    document.getElementById('descuentoCantidad').value = config.descuentoCantidad;
    
    const topRange = document.getElementById('topRange');
    const topExacto = document.getElementById('topExacto');
    if (topRange && topExacto) {
        topRange.value = config.topDinamico || 100;
        topExacto.value = config.topDinamico || 100;
        actualizarPreviewDinamico();
        
        topRange.addEventListener('input', actualizarPreviewDinamico);
        topExacto.addEventListener('input', actualizarPreviewDinamico);
    }
    
    setupAutocompleteOfertas();
    
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        filtros.busqueda = e.target.value;
        searchTimeout = setTimeout(() => renderProductos(), 300);
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
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}Tab`).classList.add('active');
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
            const seccionVal = document.getElementById('seccionFilter').value;
            const familiaVal = document.getElementById('familiaFilter').value;
            const subfamiliaVal = document.getElementById('subfamiliaFilter').value;
            
            filtros.seccion = seccionVal;
            filtros.familia = familiaVal;
            filtros.subfamilia = subfamiliaVal;
            
            if (document.getElementById('seccionFilterDesktop')) document.getElementById('seccionFilterDesktop').value = seccionVal;
            if (document.getElementById('familiaFilterDesktop')) document.getElementById('familiaFilterDesktop').value = familiaVal;
            if (document.getElementById('subfamiliaFilterDesktop')) document.getElementById('subfamiliaFilterDesktop').value = subfamiliaVal;
            
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
    
    document.getElementById('seccionFilter')?.addEventListener('change', (e) => {
        if (document.getElementById('seccionFilterDesktop')) {
            document.getElementById('seccionFilterDesktop').value = e.target.value;
        }
    });
    
    document.getElementById('familiaFilter')?.addEventListener('change', (e) => {
        if (document.getElementById('familiaFilterDesktop')) {
            document.getElementById('familiaFilterDesktop').value = e.target.value;
        }
    });
    
    document.getElementById('subfamiliaFilter')?.addEventListener('change', (e) => {
        if (document.getElementById('subfamiliaFilterDesktop')) {
            document.getElementById('subfamiliaFilterDesktop').value = e.target.value;
        }
    });
    
    document.getElementById('dropZone').addEventListener('click', () => {
        document.getElementById('excelFile').click();
    });
    
    document.getElementById('excelFile').addEventListener('change', importarExcel);
    
    document.getElementById('importBtn').addEventListener('click', (e) => {
        e.preventDefault();
        if (document.getElementById('excelFile').files.length === 0) {
            toast('Seleccioná un archivo', 'warning');
            document.getElementById('excelFile').click();
        } else {
            importarExcel({ target: { files: document.getElementById('excelFile').files } });
        }
    });
    
    document.getElementById('exportBtn').addEventListener('click', exportarProductos);
    document.getElementById('addProductBtn').addEventListener('click', agregarProductoManual);
    document.getElementById('deleteAllBtn').addEventListener('click', eliminarTodosProductos);
    
    document.getElementById('buscarProductoAdmin').addEventListener('input', buscarProductoAdmin);
    
    const hoy = new Date();
    document.getElementById('lastUpdate').textContent = hoy.toLocaleDateString('es-AR');
    
    window.addEventListener('scroll', () => {
        document.getElementById('cartSidebar').classList.remove('open');
    });
});