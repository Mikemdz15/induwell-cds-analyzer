// URLs y Configuración
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1vx2vFpU7S4bczecFccsUkQjB0ohoY2LpvgZxsImYcNk/export?format=xlsx";

// Variables globales del estado de la aplicación
let currentWorkbook = null;

let appData = {
    weekName: "Semana --",
    weeks: [], // Nombres de las hojas de semana disponibles
    selectedWeekName: "", // Nombre de la semana seleccionada
    dates: [], // Fechas formateadas
    rawDates: [], // Objetos Date u originales
    skus: [], // Datos de SKUs parseados
    filteredSkus: [], // SKUs después de filtros y búsqueda
    triageAlerts: [], // Alertas de riesgo compiladas
    selectedDayIndex: 6, // 0 = Viernes, 1 = Sábado, 2 = Lunes, 3 = Martes, 4 = Miércoles, 5 = Jueves, 6 = Resumen Semanal
    selectedSubsidiary: "ALPHALAB", // "ALPHALAB", "VELALUZ"
    searchQuery: "",
    sortKey: "", // Columna activa por la que se ordena la matriz
    sortDirection: "asc", // "asc" o "desc"
    deviationsSortKey: "", // Columna activa por la que se ordena la tabla de desviaciones
    deviationsSortDirection: "desc", // "asc" o "desc"
    kpis: {
        otifSemanal: 0,
        prodSemanal: 0,
        alertasActivas: 0,
        skusMonitoreados: 0
    },
    alphalabInventory: [],
    alphalabInventoryKPIs: {
        totalValue: 0,
        totalSkus: 0,
        totalTarimas: 0,
        totalNoDisponible: 0,
        totalNoDisponibleValue: 0,
        totalDisponible: 0,
        obsoletosValue: 0,
        prodTerminadoValue: 0
    },
    currentSubTab: "planeacion",
    inventorySearchQuery: "",
    inventorySortKey: "no",
    inventorySortDirection: "asc",
    inventorySubsidiaryFilter: "ALPHALAB"
};

// Supabase Connection Settings (Se actualiza directamente desde el chat)
const SUPABASE_URL = "https://zynldgktvltehmqfynqo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5bmxkZ2t0dmx0ZWhtcWZ5bnFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjE4MDEsImV4cCI6MjA5NzczNzgwMX0.r_zvKYa3cBC3FaJgDVaohd9O0mPC3vgGiLig0OAsWUk";

// Supabase Client, Logged User and Companies Cache
let supabaseClient = null;
let loggedInUser = null;
let systemCompanies = ["ALPHALAB", "VELALUZ"];

// Nombres de los días en la planeación (Viernes a Jueves, Domingo no laboral)
const PLAN_DAY_NAMES = ["Viernes", "Sábado", "Lunes", "Martes", "Miércoles", "Jueves"];

// Instancia de los gráficos de Chart.js
let trendChart = null;
let volumeChart = null;

// Mapa de precios de venta (cargado desde la hoja 'Informacion')
let productPrices = {};
let productPzasPorCaja = {};

// Inicialización de la aplicación
document.addEventListener("DOMContentLoaded", () => {
    if (window.location.protocol === "file:") {
        showFileProtocolWarning();
        return;
    }
    initSupabase();
    initUI();
    loadGeminiKey();
    checkAuthState();
    
    // Loop de actualización automática: recarga la página cada 30 minutos (1800000 ms)
    setInterval(() => {
        console.log("Iniciando recarga automática de página (cada 30 min)...");
        const url = new URL(window.location.href);
        url.searchParams.set("refresh_t", Date.now().toString());
        window.location.href = url.toString();
    }, 30 * 60 * 1000);
});

// Inicializar eventos de la interfaz de usuario
function initUI() {
    // Formulario de login
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }
    
    // Botón Logout
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }
    

    // Botones de Admin Panel
    const adminPanelBtn = document.getElementById("admin-panel-btn");
    if (adminPanelBtn) {
        adminPanelBtn.addEventListener("click", openAdminPanel);
    }
    
    const closeAdminModalBtn = document.getElementById("close-admin-modal-btn");
    if (closeAdminModalBtn) {
        closeAdminModalBtn.addEventListener("click", closeAdminPanel);
    }
    
    // Tabs de Admin Modal
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const tabId = e.target.dataset.tab;
            switchAdminTab(tabId);
        });
    });
    
    // Formularios del Admin panel
    const adminCreateUserForm = document.getElementById("admin-create-user-form");
    if (adminCreateUserForm) {
        adminCreateUserForm.addEventListener("submit", handleCreateUser);
    }
    
    const adminCreateCompanyForm = document.getElementById("admin-create-company-form");
    if (adminCreateCompanyForm) {
        adminCreateCompanyForm.addEventListener("submit", handleCreateCompany);
    }

    // Barra de búsqueda
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.trim().toLowerCase();
            appData.searchQuery = query;
            sessionStorage.setItem("sop_search_query", query);
            applyFilters();
        });
    }

    // Pestañas de Alphalab (Planeación vs Inventario)
    const tabPlaneacion = document.getElementById("tab-sop-planeacion");
    if (tabPlaneacion) {
        tabPlaneacion.addEventListener("click", () => {
            switchAlphalabTab("planeacion");
        });
    }

    const tabInventario = document.getElementById("tab-inventario-actual");
    if (tabInventario) {
        tabInventario.addEventListener("click", () => {
            switchAlphalabTab("inventario");
        });
    }

    // Buscador de Inventario Actual
    const invSearchInput = document.getElementById("inv-search-input");
    if (invSearchInput) {
        invSearchInput.addEventListener("input", (e) => {
            appData.inventorySearchQuery = e.target.value.trim().toLowerCase();
            renderAlphalabInventory();
        });
    }

    // Botón de actualización
    const refreshBtn = document.getElementById("refresh-btn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            loadDashboardData();
        });
    }

    // API Key de Gemini
    const saveKeyBtn = document.getElementById("save-key-btn");
    const apiKeyInput = document.getElementById("api-key-input");
    if (saveKeyBtn && apiKeyInput) {
        saveKeyBtn.addEventListener("click", () => {
            const key = apiKeyInput.value.trim();
            localStorage.setItem("gemini_api_key", key);
            showNotification("Llave API guardada con éxito", "success");
            toggleApiSettings(false);
        });
    }

    // Alternar colapsado de API Settings
    const apiHeader = document.getElementById("api-settings-header");
    if (apiHeader) {
        apiHeader.addEventListener("click", () => {
            const body = document.getElementById("api-settings-body");
            const keyInput = document.getElementById("api-key-input");
            if (body) {
                const isCollapsed = body.style.display === "none";
                body.style.display = isCollapsed ? "block" : "none";
                document.getElementById("api-settings-arrow").innerHTML = isCollapsed ? "&#9652;" : "&#9662;";
                if (keyInput) {
                    keyInput.disabled = !isCollapsed;
                }
            }
        });
    }

    // Formulario de consultas personalizadas a la IA
    const queryForm = document.getElementById("custom-query-form");
    if (queryForm) {
        queryForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const input = document.getElementById("query-input");
            const query = input.value.trim();
            if (query) {
                sendUserMessage(query);
                input.value = "";
            }
        });
    }

    // Acciones rápidas de IA
    const btnDiagClinico = document.getElementById("btn-diag-clinico");
    if (btnDiagClinico) {
        btnDiagClinico.addEventListener("click", () => triggerAIEngine("diagnostico_completo"));
    }

    const btnTriageDiario = document.getElementById("btn-triage-diario");
    if (btnTriageDiario) {
        btnTriageDiario.addEventListener("click", () => triggerAIEngine("triage_emergencia"));
    }

    const btnResumenSemanal = document.getElementById("btn-resumen-semanal");
    if (btnResumenSemanal) {
        btnResumenSemanal.addEventListener("click", () => triggerAIEngine("wrapup_semanal"));
    }

    // Toggle de la barra lateral (Colapsable)
    const sidebarToggle = document.getElementById("sidebar-toggle");
    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
            const container = document.querySelector(".app-container");
            if (container) {
                container.classList.toggle("sidebar-collapsed");
                const isCollapsed = container.classList.contains("sidebar-collapsed");
                localStorage.setItem("sidebar_collapsed", isCollapsed);
            }
        });
    }

    // Restaurar estado de la barra lateral al cargar
    if (localStorage.getItem("sidebar_collapsed") === "true") {
        const container = document.querySelector(".app-container");
        if (container) {
            container.classList.add("sidebar-collapsed");
        }
    }
    
    // Logout en el launcher
    const launcherLogoutBtn = document.getElementById("workspace-logout-btn");
    if (launcherLogoutBtn) {
        launcherLogoutBtn.addEventListener("click", handleLogout);
    }
    
    // Agregar empresa desde el launcher (abre el panel admin directamente)
    const launcherAddCompBtn = document.getElementById("workspace-add-company-btn");
    if (launcherAddCompBtn) {
        launcherAddCompBtn.addEventListener("click", () => {
            openAdminPanel();
            switchAdminTab("tab-empresas");
        });
    }
    
    // Desactivar campos del panel admin al inicio para evitar autofill
    disableAdminInputs(true);

    // Botones de Exportar Excel
    const exportTriageBtn = document.getElementById("export-triage-btn");
    if (exportTriageBtn) {
        exportTriageBtn.addEventListener("click", exportTriageToExcel);
    }
    
    const exportMatrixBtn = document.getElementById("export-matrix-btn");
    if (exportMatrixBtn) {
        exportMatrixBtn.addEventListener("click", exportMatrixToExcel);
    }

    // Botón de Limpiar Filtro
    const clearFilterBtn = document.getElementById("clear-filter-btn");
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener("click", () => {
            const searchInput = document.getElementById("search-input");
            if (searchInput) {
                searchInput.value = "";
            }
            appData.searchQuery = "";
            sessionStorage.removeItem("sop_search_query");
            applyFilters();
            showNotification("Filtro de búsqueda limpiado", "info");
        });
    }

    // Delegación de eventos para la ordenación de las cabeceras de la tabla
    const tableHeaderRow = document.getElementById("table-header-row");
    if (tableHeaderRow) {
        tableHeaderRow.addEventListener("click", (e) => {
            const th = e.target.closest("th[data-sort-key]");
            if (th) {
                const key = th.dataset.sortKey;
                handleHeaderSort(key);
            }
        });
    }

    // Botón de Exportar Reporte de Desviaciones a Excel
    const exportDeviationsBtn = document.getElementById("export-deviations-btn");
    if (exportDeviationsBtn) {
        exportDeviationsBtn.addEventListener("click", exportDeviationsToExcel);
    }

    // Delegación de eventos para la ordenación de las cabeceras de la tabla de desviaciones
    const abcTableHeader = document.getElementById("abc-table-header");
    if (abcTableHeader) {
        abcTableHeader.addEventListener("click", (e) => {
            const th = e.target.closest("th[data-sort-key]");
            if (th) {
                const key = th.dataset.sortKey;
                handleDeviationsSort(key);
            }
        });
    }

    // Botón de Exportar Inventario a Excel
    const exportInventoryBtn = document.getElementById("export-inventory-btn");
    if (exportInventoryBtn) {
        exportInventoryBtn.addEventListener("click", exportAlphalabInventoryToExcel);
    }

    // Delegación de eventos para la ordenación de las cabeceras del inventario
    const alphalabInventoryHeader = document.getElementById("alphalab-inventory-header");
    if (alphalabInventoryHeader) {
        alphalabInventoryHeader.addEventListener("click", (e) => {
            const th = e.target.closest("th[data-sort-key]");
            if (th) {
                const key = th.dataset.sortKey;
                handleInventorySort(key);
            }
        });
    }

    // Selector de Subsidiaria de Inventarios
    const invSubsidiarySelect = document.getElementById("inv-subsidiary-select");
    if (invSubsidiarySelect) {
        invSubsidiarySelect.addEventListener("change", (e) => {
            appData.inventorySubsidiaryFilter = e.target.value;
            renderAlphalabInventory();
        });
    }

    // Configurar eventos de comentarios
    setupCommentEvents();
}

// Cargar Gemini API Key desde localStorage
function loadGeminiKey() {
    const key = localStorage.getItem("gemini_api_key");
    const apiKeyInput = document.getElementById("api-key-input");
    if (apiKeyInput) {
        if (key) {
            apiKeyInput.value = key;
        }
        apiKeyInput.disabled = true; // Desactivado por defecto si inicia colapsado
    }
    const body = document.getElementById("api-settings-body");
    if (body) {
        body.style.display = "none";
        document.getElementById("api-settings-arrow").innerHTML = "&#9662;";
    }
}

// Alternar panel de configuración de API
function toggleApiSettings(show) {
    const body = document.getElementById("api-settings-body");
    if (body) {
        body.style.display = show ? "block" : "none";
        document.getElementById("api-settings-arrow").innerHTML = show ? "&#9652;" : "&#9662;";
    }
    const keyInput = document.getElementById("api-key-input");
    if (keyInput) {
        keyInput.disabled = !show;
    }
}

// Cargar y procesar datos del Google Sheet
async function loadDashboardData() {
    showLoadingState(true);
    try {
        const response = await fetch(SHEET_URL + "&t=" + Date.now(), { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`Error al descargar el archivo: HTTP ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Cargar archivo usando SheetJS
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellNF: true, cellText: true });
        currentWorkbook = workbook;
        parseInformacionSheet(workbook);
        parseAlphalabInventory(workbook);
        
        // Filtrar las hojas que contienen la planeación de la semana (ej. "sem" o "semana")
        appData.weeks = workbook.SheetNames.filter(name => {
            const lower = name.toLowerCase();
            return lower.includes("sem") || lower.includes("semana") || /sem\s*\d+/i.test(lower);
        });
        
        // Si no se encuentra ninguna, usar todas las hojas
        if (appData.weeks.length === 0) {
            appData.weeks = [...workbook.SheetNames];
        }
        
        // Ordenar las semanas por número de forma descendente (más reciente primero)
        function getWeekNumber(name) {
            const match = name.match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
        }
        appData.weeks.sort((a, b) => getWeekNumber(b) - getWeekNumber(a));
        
        // Seleccionar por defecto la semana más reciente existente o la guardada
        const savedWeek = sessionStorage.getItem("sop_selected_week");
        if (savedWeek && appData.weeks.includes(savedWeek)) {
            appData.selectedWeekName = savedWeek;
        } else if (!appData.selectedWeekName || !appData.weeks.includes(appData.selectedWeekName)) {
            appData.selectedWeekName = appData.weeks[0];
        }
        
        const sheet = workbook.Sheets[appData.selectedWeekName];
        
        // Parsear datos de la hoja seleccionada
        parseSheetData(sheet);
        
        // Inicializar selector de semanas en el header
        renderWeekSelector();
        
        // Inicializar selectores de días
        renderDaySelector();
        
        // Renderizar selector de subsidiarias basado en permisos
        await renderSubsidiarySelector();
        
        // Aplicar filtros y redibujar interfaz
        applyFilters();
        
        // Cargar comentarios de la semana y subsidiaria actual
        await loadComments();
        
        // Inicializar sistema de menciones y notificaciones
        await loadUsersForMentions();
        initNotificationSystem();
        
        // Registrar última actualización
        const now = new Date();
        document.getElementById("last-update-time").textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        showNotification("Datos cargados correctamente", "success");
    } catch (error) {
        console.error("Error al procesar el dashboard:", error);
        showNotification("Error de conexión al Google Sheet. Mostrando datos locales.", "error");
        loadFallbackLocalData();
    } finally {
        showLoadingState(false);
    }
}

// Cargar datos locales de respaldo si falla la descarga
async function loadFallbackLocalData() {
    showLoadingState(true);
    try {
        const response = await fetch("./Proyeccion plan de produccion logistica_Sem 24_2026.xlsx?t=" + Date.now(), { cache: "no-store" });
        if (!response.ok) throw new Error("No local fallback file found");
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        currentWorkbook = workbook;
        parseInformacionSheet(workbook);
        
        appData.weeks = workbook.SheetNames.filter(name => {
            const lower = name.toLowerCase();
            return lower.includes("sem") || lower.includes("semana") || /sem\s*\d+/i.test(lower);
        });
        if (appData.weeks.length === 0) {
            appData.weeks = [...workbook.SheetNames];
        }
        
        // Ordenar las semanas por número de forma descendente (más reciente primero)
        function getWeekNumber(name) {
            const match = name.match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
        }
        appData.weeks.sort((a, b) => getWeekNumber(b) - getWeekNumber(a));
        
        if (!appData.selectedWeekName || !appData.weeks.includes(appData.selectedWeekName)) {
            appData.selectedWeekName = appData.weeks[0];
        }
        
        const sheet = workbook.Sheets[appData.selectedWeekName];
        parseSheetData(sheet);
        renderWeekSelector();
        renderDaySelector();
        await renderSubsidiarySelector();
        applyFilters();
        const now = new Date();
        document.getElementById("last-update-time").textContent = now.toLocaleTimeString() + " (Local)";
        showNotification("Datos cargados desde el archivo local", "warning");
    } catch (e) {
        console.error("Local fallback failed:", e);
        showNotification("No se pudieron cargar los datos.", "error");
    } finally {
        showLoadingState(false);
    }
}

// Auxiliar para leer valores
function getCellValue(sheet, colIndex, rowIndex, defaultVal = 0) {
    const colLetter = XLSX.utils.encode_col(colIndex);
    const cellRef = `${colLetter}${rowIndex}`;
    const cell = sheet[cellRef];
    if (!cell) return defaultVal;
    
    if (cell.v !== undefined && cell.v !== null) {
        if (typeof cell.v === 'number') {
            return cell.v;
        }
        if (typeof cell.v === 'string') {
            const num = parseFloat(cell.v.replace(/[^0-9.-]/g, ''));
            return isNaN(num) ? defaultVal : num;
        }
        return cell.v;
    }
    return defaultVal;
}

// Auxiliar para leer texto
function getCellText(sheet, colIndex, rowIndex, defaultVal = "") {
    const colLetter = XLSX.utils.encode_col(colIndex);
    const cellRef = `${colLetter}${rowIndex}`;
    const cell = sheet[cellRef];
    if (!cell) return defaultVal;
    return cell.w || (cell.v !== undefined ? String(cell.v) : defaultVal);
}

// Procesar la hoja de Informacion de productos y precios
function parseInformacionSheet(workbook) {
    productPrices = {};
    productPzasPorCaja = {};
    if (!workbook) return;
    
    const infoSheetName = Object.keys(workbook.Sheets).find(k => k.toLowerCase() === "informacion");
    if (!infoSheetName) {
        console.warn("Hoja 'Informacion' no encontrada en el libro.");
        return;
    }
    
    const sheet = workbook.Sheets[infoSheetName];
    const ref = sheet['!ref'];
    if (!ref) return;
    const range = XLSX.utils.decode_range(ref);
    const maxRow = range.e.r + 1;
    
    // Las columnas de la hoja 'Informacion' son:
    // A (0): SUBSUDIARIA, B (1): SKU NETO, C (2): SKU INTERNO, D (3): NOMBRE DEL ARTICULO, E (4): Categoria, F (5): Precio de Venta (Pza), G (6): Pzas por caja
    for (let r = 2; r <= maxRow; r++) {
        const sub = getCellText(sheet, 0, r, "").toUpperCase().trim();
        const skuNeto = getCellText(sheet, 1, r, "").trim();
        const skuInterno = getCellText(sheet, 2, r, "").toUpperCase().trim();
        
        // Leer Precio de Venta (por pieza)
        const precioPiezaVal = getCellValue(sheet, 5, r, 0);
        const precioPieza = typeof precioPiezaVal === 'number' ? precioPiezaVal : parseFloat(String(precioPiezaVal).replace(/[^0-9.]/g, '')) || 0;
        
        // Leer Pzas por caja
        const pzasPorCajaVal = getCellValue(sheet, 6, r, 1);
        const pzasPorCaja = (typeof pzasPorCajaVal === 'number' && pzasPorCajaVal > 0) ? pzasPorCajaVal : (parseFloat(String(pzasPorCajaVal).replace(/[^0-9.]/g, '')) || 1);
        
        // Precio por caja = precio de pieza * pzas por caja
        const precioCaja = precioPieza * pzasPorCaja;
        
        if (sub) {
            if (skuInterno) {
                productPrices[`${sub}_${skuInterno}`] = precioCaja;
                productPzasPorCaja[`${sub}_${skuInterno}`] = pzasPorCaja;
            }
            if (skuNeto) {
                const cleanNeto = skuNeto.split('.')[0];
                productPrices[`${sub}_${cleanNeto}`] = precioCaja;
                productPzasPorCaja[`${sub}_${cleanNeto}`] = pzasPorCaja;
            }
        }
    }
    console.log(`Precios cargados para ${Object.keys(productPrices).length} combinaciones de productos.`);
}

// Procesar el contenido de la hoja
function parseSheetData(sheet) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const maxRow = range.e.r + 1;
    
    // Leer nombre de la semana (B1:D1)
    let weekVal = sheet["B1"] ? sheet["B1"].v : null;
    if (!weekVal) weekVal = sheet["C1"] ? sheet["C1"].v : null;
    if (!weekVal) weekVal = sheet["D1"] ? sheet["D1"].v : null;
    appData.weekName = weekVal ? String(weekVal) : "Semana Activa";
    
    const navWeek = document.getElementById("nav-week");
    if (navWeek) {
        navWeek.textContent = appData.weekName;
    }
    
    // Parsear fechas
    appData.dates = [];
    appData.rawDates = [];
    const dayCols = [4, 16, 28, 40, 52, 64];
    
    dayCols.forEach((colIdx) => {
        const cellVal = getCellValue(sheet, colIdx, 1, null);
        appData.rawDates.push(cellVal);
        
        let dateStr = "N/A";
        if (cellVal instanceof Date) {
            const options = { day: '2-digit', month: 'short' };
            dateStr = cellVal.toLocaleDateString('es-ES', options).replace('.', '');
        } else if (cellVal) {
            dateStr = String(cellVal);
        }
        appData.dates.push(dateStr);
    });

    // Parsear SKUs
    appData.skus = [];
    
    for (let r = 3; r <= maxRow; r++) {
        const subsidiary = getCellText(sheet, 0, r, null);
        if (!subsidiary) {
            continue;
        }
        
        const formattedSub = subsidiary.toUpperCase().trim();
        if (formattedSub === "" || formattedSub === "EMPRESA" || formattedSub.includes("---")) {
            continue;
        }
        
        // Autoregistrar si es necesario
        registerCompanyIfNeeded(formattedSub);
        
        // Si no es admin, filtrar por empresas asignadas
        if (loggedInUser && loggedInUser.role !== "admin") {
            const userCompanies = loggedInUser.companies || [];
            if (!userCompanies.includes(formattedSub)) {
                continue;
            }
        }
        
        const sku_neto = getCellText(sheet, 1, r, "");
        const sku_interno = getCellText(sheet, 2, r, "");
        const name = getCellText(sheet, 3, r, "");
        
        const skuDays = [];
        
        for (let d = 0; d < 6; d++) {
            const startCol = 4 + d * 12;
            
            const initial_inv = getCellValue(sheet, startCol, r, 0);
            const requested_ov = getCellValue(sheet, startCol + 1, r, 0);
            const shipped_prev_week = getCellValue(sheet, startCol + 2, r, 0);
            const shipped_curr_week = getCellValue(sheet, startCol + 3, r, 0);
            const adjustments = getCellValue(sheet, startCol + 4, r, 0);
            // Calcular OTIF dinámicamente: 100% si no hay demanda solicitada
            const otif = requested_ov > 0 ? (shipped_curr_week / requested_ov) : 1.0;
            const prod_plan = getCellValue(sheet, startCol + 6, r, 0);
            const prod_real = getCellValue(sheet, startCol + 7, r, 0);
            // Calcular cumplimiento de producción dinámicamente: 100% si no hay plan de producción
            const prod_compliance = prod_plan > 0 ? (prod_real / prod_plan) : 1.0;
            // Calcular inventarios finales dinámicamente según la lógica de transacciones de la cadena de suministro
            const final_inv_real = initial_inv - shipped_curr_week - shipped_prev_week + prod_real - adjustments;
            const final_inv_theoretical = initial_inv - requested_ov + prod_plan - adjustments;
            const var_vs_plan = getCellValue(sheet, startCol + 1, r, 0); // mantener variable original para var_vs_plan si existiera, o se recalcula si es necesario
            
            skuDays.push({
                day_index: d,
                initial_inv,
                requested_ov,
                shipped_prev_week,
                shipped_curr_week,
                adjustments,
                otif,
                prod_plan,
                prod_real,
                prod_compliance,
                final_inv_theoretical,
                final_inv_real,
                var_vs_plan
            });
        }
        
        // Columna 77 (índice 76) es 'Categoria' en el Google Sheet
        const rawCategory = getCellText(sheet, 76, r, "General").trim();
        const category = rawCategory === "None" || rawCategory === "" ? "General" : rawCategory;
        
        const cleanNetoLookup = sku_neto.trim().split('.')[0];
        const lookupKeyInt = `${formattedSub}_${sku_interno.toUpperCase().trim()}`;
        const lookupKeyNet = `${formattedSub}_${cleanNetoLookup}`;
        const price = productPrices[lookupKeyInt] !== undefined 
            ? productPrices[lookupKeyInt] 
            : (productPrices[lookupKeyNet] !== undefined ? productPrices[lookupKeyNet] : 0);
        
        appData.skus.push({
            subsidiary: formattedSub,
            sku_neto,
            sku_interno,
            name,
            category: category,
            price: price,
            days: skuDays
        });
    }
    
    appData.kpis.skusMonitoreados = appData.skus.length;
    
    // Compilar alertas de Triage operativo
    compileTriageAlerts();
}

// Detectar qué días tienen datos confirmados reales
function getCompletedDays(skus) {
    const completed = [false, false, false, false, false, false];
    let latestCompletedDay = -1;
    for (let d = 0; d < 6; d++) {
        const hasRealData = skus.some(sku => {
            const day = sku.days[d];
            return (day.shipped_curr_week > 0) || 
                   (day.prod_real > 0) || 
                   (day.shipped_prev_week > 0) || 
                   (day.final_inv_real !== day.initial_inv && day.final_inv_real !== 0);
        });
        if (hasRealData) {
            latestCompletedDay = d;
        }
    }
    for (let d = 0; d <= latestCompletedDay; d++) {
        completed[d] = true;
    }
    return completed;
}

// Proyectar inventarios teóricos día a día acumulativamente para los días futuros
function projectSkuInventories(sku, completedDays) {
    const projections = [];
    let currentInv = sku.days[0].initial_inv;
    
    for (let d = 0; d < 6; d++) {
        const day = sku.days[d];
        let startingInv = currentInv;
        
        if (completedDays[d]) {
            // El día ya tiene datos reales consolidados
            currentInv = day.final_inv_real;
            const deficit = day.final_inv_real < 0 ? Math.abs(day.final_inv_real) : 0;
            projections.push({
                day_index: d,
                starting_inv: startingInv,
                ending_inv: day.final_inv_real,
                is_real: true,
                requested_ov: day.requested_ov,
                prod_plan: day.prod_plan,
                deficit: deficit
            });
        } else {
            // El día es futuro. Proyectamos usando la fórmula:
            // Final = Inicial - Solicitado + Plan_Prod
            const endingInv = startingInv - day.requested_ov + day.prod_plan;
            currentInv = endingInv; // Propagación para el siguiente día
            
            const deficit = endingInv < 0 ? Math.abs(endingInv) : 0;
            projections.push({
                day_index: d,
                starting_inv: startingInv,
                ending_inv: endingInv,
                is_real: false,
                requested_ov: day.requested_ov,
                prod_plan: day.prod_plan,
                deficit: deficit
            });
        }
    }
    return projections;
}

// Compilar alertas de quiebre dinámicas
function compileTriageAlerts() {
    appData.triageAlerts = [];
    
    const completedDaysAlphalab = getCompletedDays(appData.skus.filter(s => s.subsidiary === "ALPHALAB"));
    const completedDaysVelaluz = getCompletedDays(appData.skus.filter(s => s.subsidiary === "VELALUZ"));
    
    appData.skus.forEach(sku => {
        const completedDays = sku.subsidiary === "ALPHALAB" ? completedDaysAlphalab : completedDaysVelaluz;
        const projections = projectSkuInventories(sku, completedDays);
        const riskDays = projections.filter(p => p.deficit > 0);
        
        if (riskDays.length > 0) {
            appData.triageAlerts.push({
                sku: sku.sku_interno,
                sku_neto: sku.sku_neto,
                name: sku.name,
                subsidiary: sku.subsidiary,
                riskDays: riskDays.map(rd => {
                    const dayName = PLAN_DAY_NAMES[rd.day_index];
                    const dateStr = appData.dates[rd.day_index];
                    const isReal = rd.is_real;
                    let message = "";
                    if (isReal) {
                        message = `Quiebre real registrado en SKU ${sku.sku_interno} (${sku.name}). Faltante de ${Math.round(rd.deficit).toLocaleString('es-MX')} unidades en ${dayName} ${dateStr}.`;
                    } else {
                        message = `Riesgo de quiebre en SKU ${sku.sku_interno} (${sku.name}). Faltante de ${Math.round(rd.deficit).toLocaleString('es-MX')} unidades en ${dayName} ${dateStr}. Producir en 1er turno (6:30am - 3:30pm) para embarcar en 2do turno (antes de las 10:00pm).`;
                    }
                    return {
                        dayIndex: rd.day_index,
                        dayName: dayName,
                        dateStr: dateStr,
                        starting_inv: rd.starting_inv,
                        requested: rd.requested_ov,
                        prod_plan: rd.prod_plan,
                        ending_inv: rd.ending_inv,
                        deficit: rd.deficit,
                        isReal: isReal,
                        message: message
                    };
                })
            });
        }
    });
    
    let totalAlerts = 0;
    appData.triageAlerts.forEach(alert => {
        totalAlerts += alert.riskDays.length;
    });
    appData.kpis.alertasActivas = totalAlerts;
}

// Generar selector de días interactivo
function renderDaySelector() {
    const container = document.getElementById("day-selector-container");
    if (!container) return;
    
    container.innerHTML = "";
    
    PLAN_DAY_NAMES.forEach((dayName, idx) => {
        const dateStr = appData.dates[idx] || "";
        const btn = document.createElement("button");
        btn.className = `day-btn ${appData.selectedDayIndex === idx ? 'active' : ''}`;
        btn.innerHTML = `
            <span class="day-name">${dayName}</span>
            <span class="day-date">${dateStr}</span>
        `;
        btn.addEventListener("click", () => {
            selectDay(idx);
        });
        container.appendChild(btn);
    });
    
    const summaryBtn = document.createElement("button");
    summaryBtn.className = `day-btn ${appData.selectedDayIndex === 6 ? 'active' : ''}`;
    summaryBtn.innerHTML = `
        <span class="day-name" style="color: var(--neon-cyan);">Resumen</span>
        <span class="day-date">Semanal</span>
    `;
    summaryBtn.addEventListener("click", () => {
        selectDay(6);
    });
    container.appendChild(summaryBtn);
}

// Seleccionar día
function selectDay(dayIndex) {
    appData.selectedDayIndex = dayIndex;
    sessionStorage.setItem("sop_selected_day_index", dayIndex);
    
    const buttons = document.querySelectorAll("#day-selector-container .day-btn");
    buttons.forEach((btn, idx) => {
        if (idx === dayIndex) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    
    applyFilters();
}

// Generar selector de semanas dinámico
function renderWeekSelector() {
    const selector = document.getElementById("week-selector");
    if (!selector) return;
    
    selector.innerHTML = "";
    
    if (appData.weeks.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Sin semanas";
        selector.appendChild(option);
        return;
    }
    
    appData.weeks.forEach(weekName => {
        const option = document.createElement("option");
        option.value = weekName;
        option.textContent = weekName;
        option.selected = (weekName === appData.selectedWeekName);
        selector.appendChild(option);
    });
    
    // Event listener para cambiar de semana
    selector.onchange = (e) => {
        const selectedWeek = e.target.value;
        changeWeek(selectedWeek);
    };
}

// Cambiar de semana y recargar datos en memoria
function changeWeek(weekName) {
    if (!currentWorkbook) return;
    
    appData.selectedWeekName = weekName;
    sessionStorage.setItem("sop_selected_week", weekName);
    const sheet = currentWorkbook.Sheets[weekName];
    if (sheet) {
        showLoadingState(true);
        setTimeout(() => {
            try {
                const prevDayIndex = appData.selectedDayIndex;
                
                parseSheetData(sheet);
                renderDaySelector();
                
                // Mantener el día o resumen seleccionado
                appData.selectedDayIndex = prevDayIndex;
                selectDay(appData.selectedDayIndex);
                
                // Cargar comentarios correspondientes a la nueva semana
                loadComments();
                
                showNotification(`Visualizando: ${weekName}`, "success");
            } catch (err) {
                console.error("Error al cambiar de semana:", err);
                showNotification("Error al cargar los datos de esta semana.", "error");
            } finally {
                showLoadingState(false);
            }
        }, 50);
    }
}

// Aplicar filtros de búsqueda y subsidiarias
function applyFilters() {
    appData.filteredSkus = appData.skus.filter(sku => {
        if (appData.selectedSubsidiary !== "TODAS" && sku.subsidiary !== appData.selectedSubsidiary) {
            return false;
        }
        
        if (appData.searchQuery) {
            const matchesSkuNeto = sku.sku_neto.toLowerCase().includes(appData.searchQuery);
            const matchesSkuInt = sku.sku_interno.toLowerCase().includes(appData.searchQuery);
            const matchesName = sku.name.toLowerCase().includes(appData.searchQuery);
            if (!matchesSkuNeto && !matchesSkuInt && !matchesName) {
                return false;
            }
        }
        
        return true;
    });

    // Ordenar dinámicamente si hay una columna seleccionada
    if (appData.sortKey) {
        const isSummary = appData.selectedDayIndex === 6;
        appData.filteredSkus.sort((a, b) => {
            const valA = getSkuSortValue(a, appData.sortKey, isSummary, appData.selectedDayIndex);
            const valB = getSkuSortValue(b, appData.sortKey, isSummary, appData.selectedDayIndex);
            
            if (typeof valA === "string" && typeof valB === "string") {
                return appData.sortDirection === "asc"
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            } else {
                // Ordenación numérica, manejando nulos o no numéricos
                const aNum = valA === null || isNaN(valA) ? -Infinity : valA;
                const bNum = valB === null || isNaN(valB) ? -Infinity : valB;
                
                if (aNum === bNum) return 0;
                return appData.sortDirection === "asc"
                    ? aNum - bNum
                    : bNum - aNum;
            }
        });
    }
    
    recalculateWeeklyKPIs();
    calculateABCClassification();
    renderABCOperations();
    renderGridTable();
    renderTriageAlertsPanel();
    renderCharts();

    // Controlar visibilidad de pestañas de Alphalab
    const alphalabTabs = document.getElementById("alphalab-tabs-container");
    if (alphalabTabs) {
        if (appData.selectedSubsidiary === "ALPHALAB") {
            alphalabTabs.style.display = "block";
            switchAlphalabTab(appData.currentSubTab);
        } else {
            alphalabTabs.style.display = "none";
            switchAlphalabTab("planeacion");
        }
    }
}

// Recalcular indicadores y renderizar medidores circulares + sparklines
function recalculateWeeklyKPIs() {
    let totalRequested = 0;
    let totalShippedCurr = 0;
    let totalProdPlan = 0;
    let totalProdReal = 0;
    
    // Calcular siempre el acumulado semanal para el modelo de IA y el selector de semana
    let weeklyReq = 0;
    let weeklyShip = 0;
    let weeklyPlan = 0;
    let weeklyReal = 0;
    appData.filteredSkus.forEach(sku => {
        let skuPlan = 0;
        let skuReal = 0;
        sku.days.forEach(day => {
            skuPlan += day.prod_plan;
            skuReal += day.prod_real;
        });
        weeklyPlan += skuPlan;
        // Total weekly production sum per SKU (uncapped)
        weeklyReal += skuReal;
        
        sku.days.forEach(day => {
            weeklyReq += day.requested_ov;
            weeklyShip += day.shipped_curr_week;
        });
    });
    // Calcular OTIF Semanal dinámicamente: 100% si no hay demanda solicitada
    appData.kpis.otifSemanal = weeklyReq > 0 ? (weeklyShip / weeklyReq) * 100 : 100;
    // Calcular cumplimiento de producción semanal dinámicamente: 100% si no hay plan de producción semanal
    appData.kpis.prodSemanal = weeklyPlan > 0 ? (weeklyReal / weeklyPlan) * 100 : 100;

    // Tendencias diarias para sparklines
    const otifTrends = [0, 0, 0, 0, 0, 0];
    const prodTrends = [0, 0, 0, 0, 0, 0];
    
    for (let d = 0; d < 6; d++) {
        let reqDay = 0;
        let shipDay = 0;
        let planDay = 0;
        let realDay = 0;
        
        appData.filteredSkus.forEach(sku => {
            const day = sku.days[d];
            reqDay += day.requested_ov;
            shipDay += day.shipped_curr_week;
            planDay += day.prod_plan;
            // Uncapped daily production sum
            realDay += day.prod_real;
        });
        
        otifTrends[d] = reqDay > 0 ? (shipDay / reqDay) * 100 : 100;
        prodTrends[d] = planDay > 0 ? (realDay / planDay) * 100 : 100;
    }
    
    const isSummary = appData.selectedDayIndex === 6;
    
    if (!isSummary) {
        // Calcular para el día seleccionado
        const dayIdx = appData.selectedDayIndex;
        const dayName = PLAN_DAY_NAMES[dayIdx];
        const dateStr = appData.dates[dayIdx] || "";
        
        appData.filteredSkus.forEach(sku => {
            const day = sku.days[dayIdx];
            totalRequested += day.requested_ov;
            totalShippedCurr += day.shipped_curr_week;
            totalProdPlan += day.prod_plan;
            // Uncapped daily production sum
            totalProdReal += day.prod_real;
        });
        
        const otifDayVal = totalRequested > 0 ? (totalShippedCurr / totalRequested) * 100 : 100;
        const prodDayVal = totalProdPlan > 0 ? (totalProdReal / totalProdPlan) * 100 : 100;
        
        // Actualizar Medidores Circulares (Gauges)
        updateCircularGauge("otif-fill-ring", "otif-gauge-val", otifDayVal);
        updateCircularGauge("prod-fill-ring", "prod-gauge-val", prodDayVal);

        // Actualizar Gauges de Tarjetas (KPIs de abajo)
        updateCircularGauge("kpi-otif-gauge-fill", "kpi-otif-gauge-val", otifDayVal);
        updateCircularGauge("kpi-prod-gauge-fill", "kpi-prod-gauge-val", prodDayVal);
        
        // Cambiar etiquetas a diario
        document.getElementById("otif-gauge-label").textContent = "OTIF del Día";
        document.getElementById("otif-gauge-desc").textContent = `Desempeño de entregas el ${dayName} ${dateStr}`;
        document.getElementById("prod-gauge-label").textContent = "Cumpl. Diario";
        document.getElementById("prod-gauge-desc").textContent = `Eficacia real de producción el ${dayName} ${dateStr}`;
        
        document.getElementById("kpi-otif-title").textContent = `OTIF - ${dayName}`;
        document.getElementById("kpi-otif-desc").textContent = `Desempeño diario de entregas`;
        document.getElementById("kpi-otif-val").innerHTML = `${otifDayVal.toFixed(1)}% <span class="target-val">/ 100%</span>`;
        document.getElementById("kpi-otif-pieces").textContent = `${totalShippedCurr.toLocaleString('es-MX')} de ${totalRequested.toLocaleString('es-MX')} cajas`;
        
        document.getElementById("kpi-prod-title").textContent = `Cumpl. Prod - ${dayName}`;
        document.getElementById("kpi-prod-desc").textContent = `Cumplimiento de planta diario`;
        document.getElementById("kpi-prod-val").innerHTML = `${prodDayVal.toFixed(1)}% <span class="target-val">/ 100%</span>`;
        document.getElementById("kpi-prod-pieces").textContent = `${totalProdReal.toLocaleString('es-MX')} de ${totalProdPlan.toLocaleString('es-MX')} cajas`;
        
        document.getElementById("hero-title").textContent = `Diagnóstico Diario: ${dayName} ${dateStr}`;
        document.getElementById("hero-desc").textContent = `Análisis focalizado de la planeación y abasto para el día ${dayName}. Cambia al Resumen Semanal para ver el acumulado general.`;
    } else {
        // Calcular para toda la semana (ya calculado en el acumulado global)
        const otifWeekVal = appData.kpis.otifSemanal;
        const prodWeekVal = appData.kpis.prodSemanal;
        totalRequested = weeklyReq;
        totalShippedCurr = weeklyShip;
        totalProdPlan = weeklyPlan;
        totalProdReal = weeklyReal;
        
        // Actualizar Medidores Circulares (Gauges)
        updateCircularGauge("otif-fill-ring", "otif-gauge-val", otifWeekVal);
        updateCircularGauge("prod-fill-ring", "prod-gauge-val", prodWeekVal);

        // Actualizar Gauges de Tarjetas (KPIs de abajo)
        updateCircularGauge("kpi-otif-gauge-fill", "kpi-otif-gauge-val", otifWeekVal);
        updateCircularGauge("kpi-prod-gauge-fill", "kpi-prod-gauge-val", prodWeekVal);
        
        // Cambiar etiquetas a semanal
        document.getElementById("otif-gauge-label").textContent = "OTIF Acumulado";
        document.getElementById("otif-gauge-desc").textContent = "Órdenes de venta a tiempo y en full";
        document.getElementById("prod-gauge-label").textContent = "Cumpl. Producción";
        document.getElementById("prod-gauge-desc").textContent = "Avance real vs plan en plantas";
        
        document.getElementById("kpi-otif-title").textContent = "Nivel de Servicio (OTIF)";
        document.getElementById("kpi-otif-desc").textContent = "Desviación acumulada semana corriente";
        document.getElementById("kpi-otif-val").innerHTML = `${otifWeekVal.toFixed(1)}% <span class="target-val">/ 100%</span>`;
        document.getElementById("kpi-otif-pieces").textContent = `${totalShippedCurr.toLocaleString('es-MX')} de ${totalRequested.toLocaleString('es-MX')} cajas`;
        
        document.getElementById("kpi-prod-title").textContent = "Eficacia de Planta";
        document.getElementById("kpi-prod-desc").textContent = "Entrega física real vs plan semanal";
        document.getElementById("kpi-prod-val").innerHTML = `${prodWeekVal.toFixed(1)}% <span class="target-val">/ 100%</span>`;
        document.getElementById("kpi-prod-pieces").textContent = `${totalProdReal.toLocaleString('es-MX')} de ${totalProdPlan.toLocaleString('es-MX')} cajas`;
        
        document.getElementById("hero-title").textContent = "Gestión y Triage de Desviaciones S&OP";
        document.getElementById("hero-desc").textContent = "Monitoreo quirúrgico de nivel de servicio OTIF y cumplimiento del plan de producción diaria para Alphalab y Velaluz.";
    }
    
    let filteredAlertsCount = 0;
    let skusWithAlerts = 0;
    appData.triageAlerts.forEach(alert => {
        if (appData.selectedSubsidiary === "TODAS" || alert.subsidiary === appData.selectedSubsidiary) {
            filteredAlertsCount += alert.riskDays.length;
            if (alert.riskDays && alert.riskDays.length > 0) {
                skusWithAlerts++;
            }
        }
    });
    appData.kpis.alertasActivas = filteredAlertsCount;
    document.getElementById("kpi-risks-val").textContent = filteredAlertsCount;
    document.getElementById("kpi-skus-val").innerHTML = `${appData.filteredSkus.length} <span class="target-val">monitoreados</span>`;

    // Calcular porcentajes de salud para Alertas y SKUs
    const totalSkusCount = appData.filteredSkus.length;
    const safeSkusCount = Math.max(0, totalSkusCount - skusWithAlerts);
    const healthPct = totalSkusCount > 0 ? (safeSkusCount / totalSkusCount) * 100 : 100;

    updateCircularGauge("kpi-risks-gauge-fill", "kpi-risks-gauge-val", healthPct);
    updateCircularGauge("kpi-skus-gauge-fill", "kpi-skus-gauge-val", 100);

    // ----------------------------------------------------------------------
    // Calcular Valores Financieros de Ventas S&OP
    // ----------------------------------------------------------------------
    let finSolicitado = 0;
    let finEmbarcado = 0;
    let finPorAtender = 0;

    if (!isSummary) {
        // Calcular para el día seleccionado
        const dayIdx = appData.selectedDayIndex;
        appData.filteredSkus.forEach(sku => {
            const day = sku.days[dayIdx];
            const price = sku.price || 0;
            finSolicitado += day.requested_ov * price;
            finEmbarcado += day.shipped_curr_week * price;
            finPorAtender += Math.max(0, day.requested_ov - day.shipped_curr_week) * price;
        });
    } else {
        // Calcular para toda la semana (a nivel consolidado semanal por SKU)
        appData.filteredSkus.forEach(sku => {
            const price = sku.price || 0;
            let skuWeeklyReq = 0;
            let skuWeeklyShip = 0;
            
            sku.days.forEach(day => {
                skuWeeklyReq += day.requested_ov;
                skuWeeklyShip += day.shipped_curr_week;
            });
            
            finSolicitado += skuWeeklyReq * price;
            finEmbarcado += skuWeeklyShip * price;
            // A nivel semanal, solo hay "por atender" si el acumulado semanal solicitado supera lo entregado
            finPorAtender += Math.max(0, skuWeeklyReq - skuWeeklyShip) * price;
        });
    }

    // Actualizar elementos DOM de la tarjeta financiera
    const finSolicitadoEl = document.getElementById("kpi-fin-solicitado");
    const finEmbarcadoEl = document.getElementById("kpi-fin-embarcado");
    const finPorAtenderEl = document.getElementById("kpi-fin-por-atender");
    const finDescEl = document.querySelector(".financial-gauge .gauge-desc");

    if (finSolicitadoEl) {
        finSolicitadoEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(finSolicitado);
    }
    if (finEmbarcadoEl) {
        finEmbarcadoEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(finEmbarcado);
    }
    if (finPorAtenderEl) {
        finPorAtenderEl.textContent = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(finPorAtender);
    }
    if (finDescEl) {
        finDescEl.textContent = isSummary ? "Resumen semanal en dinero" : "Resumen diario en dinero";
    }

    // Calcular acumulados anuales (YTD) a partir de semana 22
    const ytd = calculateYTDMetrics();
    
    // Actualizar OTIF YTD en la interfaz
    const otifYtdText = `YTD Anual: ${ytd.otifAnual.toFixed(1)}%`;
    const otifYtdEl1 = document.getElementById("otif-ytd-val");
    const otifYtdEl2 = document.getElementById("kpi-otif-ytd");
    
    if (otifYtdEl1) {
        otifYtdEl1.textContent = otifYtdText;
        otifYtdEl1.className = `gauge-ytd ${ytd.otifAnual < 70 ? 'warning-ytd' : 'success-ytd'}`;
    }
    if (otifYtdEl2) {
        otifYtdEl2.textContent = otifYtdText;
        otifYtdEl2.className = `kpi-ytd ${ytd.otifAnual < 70 ? 'warning-ytd' : 'success-ytd'}`;
    }
    
    // Actualizar Cumplimiento Producción YTD en la interfaz
    const prodYtdText = `YTD Anual: ${ytd.prodAnual.toFixed(1)}%`;
    const prodYtdEl1 = document.getElementById("prod-ytd-val");
    const prodYtdEl2 = document.getElementById("kpi-prod-ytd");
    
    if (prodYtdEl1) {
        prodYtdEl1.textContent = prodYtdText;
        prodYtdEl1.className = `gauge-ytd ${ytd.prodAnual < 70 ? 'warning-ytd' : 'success-ytd'}`;
    }
    if (prodYtdEl2) {
        prodYtdEl2.textContent = prodYtdText;
        prodYtdEl2.className = `kpi-ytd ${ytd.prodAnual < 70 ? 'warning-ytd' : 'success-ytd'}`;
    }
}

// Calcular y actualizar el trazo del círculo SVG
function updateCircularGauge(idRing, idText, pctVal) {
    const ring = document.getElementById(idRing);
    const text = document.getElementById(idText);
    if (!ring || !text) return;

    const pct = Math.min(Math.max(pctVal, 0), 100);
    
    // Obtener radio del círculo o usar 27.5 por defecto (gauges grandes)
    const r = parseFloat(ring.getAttribute("r")) || 27.5;
    const circumference = 2 * Math.PI * r;
    
    // Asignar strokeDasharray dinámicamente si no está en CSS
    ring.style.strokeDasharray = circumference;
    
    const offset = circumference - (circumference * pct / 100);
    ring.style.strokeDashoffset = offset;
    text.textContent = pct.toFixed(0) + "%";

    // Asignar color dinámico según el umbral del 70%
    const strokeColor = pct < 70 ? "#ffe082" : "#2ebd59";
    ring.style.setProperty("stroke", strokeColor, "important");
}

// Calcular acumulados anuales (YTD) a partir de semana 22
function calculateYTDMetrics() {
    let ytdRequested = 0;
    let ytdShipped = 0;
    let ytdProdPlan = 0;
    let ytdProdReal = 0;
    
    if (!currentWorkbook || !appData.weeks) {
        return { otifAnual: 0, prodAnual: 0 };
    }
    
    appData.weeks.forEach(weekName => {
        const sheet = currentWorkbook.Sheets[weekName];
        if (!sheet || !sheet['!ref']) return;
        
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const maxRow = range.e.r + 1;
        
        for (let r = 3; r <= maxRow; r++) {
            const subsidiary = getCellText(sheet, 0, r, null);
            if (!subsidiary) continue;
            
            const formattedSub = subsidiary.toUpperCase().trim();
            if (formattedSub === "" || formattedSub === "EMPRESA" || formattedSub.includes("---")) {
                continue;
            }
            
            // Filtrar por sociedad seleccionada
            if (appData.selectedSubsidiary !== "TODAS" && formattedSub !== appData.selectedSubsidiary) {
                continue;
            }
            
            // Si no es admin, filtrar por permisos del usuario
            if (loggedInUser && loggedInUser.role !== "admin") {
                const userCompanies = loggedInUser.companies || [];
                if (!userCompanies.includes(formattedSub)) {
                    continue;
                }
            }
            
            // Calcular sumas de producción semanal a nivel de SKU
            let skuPlan = 0;
            let skuReal = 0;
            
            for (let d = 0; d < 6; d++) {
                const startCol = 4 + d * 12;
                
                const requested_ov = getCellValue(sheet, startCol + 1, r, 0);
                const shipped_curr_week = getCellValue(sheet, startCol + 3, r, 0);
                const prod_plan = getCellValue(sheet, startCol + 6, r, 0);
                const prod_real = getCellValue(sheet, startCol + 7, r, 0);
                
                ytdRequested += requested_ov;
                ytdShipped += shipped_curr_week;
                skuPlan += prod_plan;
                skuReal += prod_real;
            }
            
            ytdProdPlan += skuPlan;
            ytdProdReal += skuReal;
        }
    });
    
    const otifAnual = ytdRequested > 0 ? (ytdShipped / ytdRequested) * 100 : 100;
    const prodAnual = ytdProdPlan > 0 ? (ytdProdReal / ytdProdPlan) * 100 : 100;
    
    return { otifAnual, prodAnual };
}

// Dibujar sparkline dinámico de SVG
function drawSparkline(svgId, values) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    
    const width = 90;
    const height = 30;
    const step = width / (values.length - 1);
    
    let d = "";
    values.forEach((val, idx) => {
        const x = idx * step;
        // Mapear valor 0-100 a altura del SVG. Deja margen arriba y abajo
        const y = height - (Math.min(Math.max(val, 0), 100) * (height - 5) / 100);
        if (idx === 0) {
            d += `M${x},${y}`;
        } else {
            // Curva suave o lineal
            d += ` L${x},${y}`;
        }
    });
    
    let path = svg.querySelector("path");
    if (!path) {
        path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        svg.appendChild(path);
    }
    path.setAttribute("d", d);
}

// Renderizar alertas en el panel de Triage
function renderTriageAlertsPanel() {
    const listContainer = document.getElementById("triage-list");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    const filteredAlerts = appData.triageAlerts.filter(alert => {
        return appData.selectedSubsidiary === "TODAS" || alert.subsidiary === appData.selectedSubsidiary;
    });
    
    // Consolidar todos los días de riesgo en un solo arreglo plano
    let totalRiskRows = [];
    filteredAlerts.forEach(alert => {
        alert.riskDays.forEach(rd => {
            totalRiskRows.push({
                sku: alert.sku,
                sku_neto: alert.sku_neto,
                name: alert.name,
                subsidiary: alert.subsidiary,
                ...rd
            });
        });
    });
    
    if (totalRiskRows.length === 0) {
        listContainer.innerHTML = `
            <div style="color: var(--neon-green); font-size: 11.5px; padding: 12px; text-align: center; font-weight: 600; background-color: rgba(30, 142, 62, 0.03); border: 1px dashed rgba(30, 142, 62, 0.2); border-radius: 6px;">
                 ✓ Flujo de inventario en equilibrio. No se detectan riesgos de quiebre en los días futuros para esta selección.
            </div>
        `;
        return;
    }
    
    // Ordenar las filas por índice de día (Viernes a Jueves)
    totalRiskRows.sort((a, b) => a.dayIndex - b.dayIndex);
    
    let rowsHtml = "";
    totalRiskRows.forEach(rd => {
        const actionText = rd.isReal 
            ? `<span style="color: #c5221f; font-weight: 600;">Quiebre Real</span>`
            : `<strong style="color: #c5221f;">Turno 1:</strong> Producir en 1er turno para embarcar en 2do.`;
        
        rowsHtml += `
            <tr>
                <td>
                    <span class="badge-subsidiary ${rd.subsidiary}">${rd.subsidiary}</span><br>
                    <strong class="sku-cell" style="font-size: 10px; cursor: pointer;" onclick="focusOnSku('${rd.sku}')">${rd.sku}</strong>
                </td>
                <td style="white-space: normal; font-weight: 500; color: var(--text-primary); max-width: 180px;">
                    ${rd.name}
                    <span style="font-size: 9px; color: var(--text-secondary); display: block; margin-top: 1px;">Neto: ${rd.sku_neto}</span>
                </td>
                <td style="font-weight: 600;">
                    ${rd.dayName}<br>
                    <span style="font-size: 9px; color: var(--text-secondary); font-weight: normal;">(${rd.dateStr})</span>
                </td>
                <td class="num-val">${Math.round(rd.starting_inv).toLocaleString('es-MX')}</td>
                <td class="num-val" style="color: var(--text-secondary);">${Math.round(rd.requested).toLocaleString('es-MX')}</td>
                <td class="num-val" style="color: #1e8e3e; font-weight: 600;">+${Math.round(rd.prod_plan).toLocaleString('es-MX')}</td>
                <td><span class="deficit-val">-${Math.round(rd.deficit).toLocaleString('es-MX')}</span></td>
                <td class="action-text">${actionText}</td>
                <td style="text-align: center;">
                    <button class="btn-triage-focus" onclick="focusOnSku('${rd.sku}')" style="padding: 3px 6px; font-size: 9px; margin: 0 auto;">
                        <i data-lucide="search" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle;"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    
    listContainer.innerHTML = `
        <div class="triage-table-scroll-wrapper">
            <table class="triage-consolidated-table">
                <thead>
                    <tr>
                        <th style="width: 10%;">Empresa / SKU</th>
                        <th style="width: 25%;">Artículo</th>
                        <th style="width: 10%;">Día</th>
                        <th style="width: 8%; text-align: right;">Inv. Inicial</th>
                        <th style="width: 8%; text-align: right;">Demanda OV</th>
                        <th style="width: 8%; text-align: right;">Plan Prod</th>
                        <th style="width: 8%; text-align: center;">Saldo Proy</th>
                        <th style="width: 20%;">Acción Operativa</th>
                        <th style="width: 3%; text-align: center;">Foco</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
    
    // Re-iniciar iconos lucide si es necesario
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Buscar y enfocar un SKU
window.focusOnSku = function(skuCode) {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.value = skuCode;
        appData.searchQuery = skuCode.toLowerCase();
        sessionStorage.setItem("sop_search_query", skuCode.toLowerCase());
        applyFilters();
    }
};

// Generar el HTML de las cabeceras con indicadores de ordenación
function getHeaderHtml(key, text, extraClass = "", extraStyle = "") {
    let indicator = '<span class="sort-indicator" style="opacity:0.25; margin-left:4px; font-size:9px;">↕</span>';
    if (appData.sortKey === key) {
        indicator = appData.sortDirection === "asc"
            ? '<span class="sort-indicator" style="color:var(--neon-cyan); margin-left:4px; font-size:9px;">▲</span>'
            : '<span class="sort-indicator" style="color:var(--neon-cyan); margin-left:4px; font-size:9px;">▼</span>';
    }
    const classes = extraClass ? `${extraClass} sortable-header` : 'sortable-header';
    const style = extraStyle ? `cursor:pointer; user-select:none; ${extraStyle}` : 'cursor:pointer; user-select:none;';
    return `<th class="${classes}" style="${style}" data-sort-key="${key}">${text}${indicator}</th>`;
}

// Obtener el valor para ordenar un SKU basado en la columna seleccionada
function getSkuSortValue(sku, key, isSummary, dayIndex) {
    if (key === 'sku_interno') return sku.sku_interno;
    if (key === 'name') return sku.name.toLowerCase();
    
    if (isSummary) {
        const initialInv = sku.days[0].initial_inv;
        let requestedTotal = 0;
        let shippedPrevTotal = 0;
        let shippedCurrTotal = 0;
        let adjustmentsTotal = 0;
        let prodPlanTotal = 0;
        let prodRealTotal = 0;
        let daysWithRisks = 0;
        
        sku.days.forEach(day => {
            requestedTotal += day.requested_ov;
            shippedPrevTotal += day.shipped_prev_week;
            shippedCurrTotal += day.shipped_curr_week;
            adjustmentsTotal += day.adjustments;
            prodPlanTotal += day.prod_plan;
            prodRealTotal += day.prod_real;
            if (day.final_inv_theoretical < 0) {
                daysWithRisks++;
            }
        });
        
        if (key === 'initial_inv') return initialInv;
        if (key === 'requested_ov') return requestedTotal;
        if (key === 'shipped_prev_week') return shippedPrevTotal;
        if (key === 'shipped_curr_week') return shippedCurrTotal;
        if (key === 'adjustments') return adjustmentsTotal;
        if (key === 'otif') return requestedTotal > 0 ? (shippedCurrTotal / requestedTotal) : 1.0;
        if (key === 'prod_plan') return prodPlanTotal;
        if (key === 'prod_real') return prodRealTotal;
        if (key === 'prod_compliance') return prodPlanTotal > 0 ? (prodRealTotal / prodPlanTotal) : 1.0;
        if (key === 'final_inv_theoretical') return initialInv - requestedTotal + prodPlanTotal - adjustmentsTotal;
        if (key === 'final_inv_real') return initialInv - shippedCurrTotal - shippedPrevTotal + prodRealTotal - adjustmentsTotal;
        if (key === 'var_vs_plan') return daysWithRisks;
    } else {
        const day = sku.days[dayIndex];
        if (!day) return 0;
        if (key === 'initial_inv') return day.initial_inv;
        if (key === 'requested_ov') return day.requested_ov;
        if (key === 'shipped_prev_week') return day.shipped_prev_week;
        if (key === 'shipped_curr_week') return day.shipped_curr_week;
        if (key === 'adjustments') return day.adjustments;
        if (key === 'otif') return day.requested_ov > 0 ? day.otif : 1.0;
        if (key === 'prod_plan') return day.prod_plan;
        if (key === 'prod_real') return day.prod_real;
        if (key === 'prod_compliance') return day.prod_plan > 0 ? day.prod_compliance : 1.0;
        if (key === 'final_inv_theoretical') return day.final_inv_theoretical;
        if (key === 'final_inv_real') return day.final_inv_real;
        if (key === 'var_vs_plan') {
            if (day.final_inv_real < 0) return 2;
            if (day.final_inv_theoretical < 0) return 1;
            return 0;
        }
    }
    return 0;
}

// Manejar el evento de clic en la cabecera de la tabla para cambiar la ordenación
function handleHeaderSort(key) {
    if (appData.sortKey === key) {
        appData.sortDirection = appData.sortDirection === "asc" ? "desc" : "asc";
    } else {
        appData.sortKey = key;
        const ascKeys = ["sku_interno", "name"];
        appData.sortDirection = ascKeys.includes(key) ? "asc" : "desc";
    }
    applyFilters();
}

// Manejar ordenamiento de la tabla de desviaciones
function handleDeviationsSort(key) {
    if (appData.deviationsSortKey === key) {
        appData.deviationsSortDirection = appData.deviationsSortDirection === "asc" ? "desc" : "asc";
    } else {
        appData.deviationsSortKey = key;
        const textKeys = ["sku_interno", "name", "estatus"];
        appData.deviationsSortDirection = textKeys.includes(key) ? "asc" : "desc";
    }
    renderABCOperations();
}

// Obtener valor para ordenar en la tabla de desviaciones
function getDeviationsSortValue(sku, key) {
    const activeWeek = appData.selectedWeekName;
    const activeReq = sku.weeklyDemands[activeWeek] || 0;
    const pzasPorCaja = sku.pzasPorCaja || 1;
    const price = sku.price || 0;
    
    switch (key) {
        case "sku_interno":
            return sku.sku_interno;
        case "name":
            return sku.name;
        case "pzasPorCaja":
            return pzasPorCaja;
        case "histCajas":
            return sku.historicalAverage;
        case "histPzas":
            return sku.historicalAverage * pzasPorCaja;
        case "histDinero":
            return sku.historicalAverage * price;
        case "actCajas":
            return activeReq;
        case "actPzas":
            return activeReq * pzasPorCaja;
        case "actDinero":
            return activeReq * price;
        case "varPct":
            return sku.historicalAverage > 0 ? ((activeReq - sku.historicalAverage) / sku.historicalAverage) * 100 : 0;
        case "estatus":
            return sku.historicalAverage > 0 ? ((activeReq - sku.historicalAverage) / sku.historicalAverage) * 100 : 0;
        default:
            return 0;
    }
}

// Renderizar la tabla principal
function renderGridTable() {
    const tableHeader = document.getElementById("table-header-row");
    const tableBody = document.getElementById("table-body");
    const descText = document.getElementById("table-description-text");
    
    if (!tableHeader || !tableBody) return;
    
    tableHeader.innerHTML = "";
    tableBody.innerHTML = "";
    
    if (appData.filteredSkus.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="15" style="text-align: center; padding: 30px; color: var(--text-secondary);">No se encontraron SKUs que coincidan con la búsqueda.</td></tr>`;
        return;
    }
    
    const isSummary = appData.selectedDayIndex === 6;
    
    if (descText) {
        if (isSummary) {
            descText.textContent = "Resumen semanal consolidado por SKU. Muestra totales acumulados y nivel de servicio global de la semana entera.";
        } else {
            descText.textContent = `Mostrando las 12 columnas operativas de inventarios, despachos y producciones del día ${PLAN_DAY_NAMES[appData.selectedDayIndex]} (${appData.dates[appData.selectedDayIndex]}).`;
        }
    }
    
    if (!isSummary) {
        tableHeader.innerHTML = `
            ${getHeaderHtml("sku_interno", "Subsidiaria / SKU", "sticky-col", "min-width: 130px;")}
            ${getHeaderHtml("name", "Nombre Artículo", "sticky-col", "min-width: 240px;")}
            ${getHeaderHtml("initial_inv", "Inv. Inicial", "num-val")}
            ${getHeaderHtml("requested_ov", "Solicitado OV", "num-val")}
            ${getHeaderHtml("shipped_prev_week", "Emb. Sem. Ant", "num-val")}
            ${getHeaderHtml("shipped_curr_week", "Emb. Sem. Corr", "num-val")}
            ${getHeaderHtml("adjustments", "Ajustes PT", "num-val")}
            ${getHeaderHtml("otif", "OTIF Diario", "num-val", "text-align: center;")}
            ${getHeaderHtml("prod_plan", "Plan Prod", "num-val")}
            ${getHeaderHtml("prod_real", "Real Prod", "num-val")}
            ${getHeaderHtml("prod_compliance", "Cumpl. Prod", "num-val", "text-align: center;")}
            ${getHeaderHtml("final_inv_theoretical", "Inv. Final Teo", "num-val")}
            ${getHeaderHtml("final_inv_real", "Inv. Final Real", "num-val")}
            ${getHeaderHtml("var_vs_plan", "Estatus", "num-val", "text-align: center;")}
            <th style="text-align: center; min-width: 110px;">Comentarios</th>
        `;
        
        appData.filteredSkus.forEach(sku => {
            const day = sku.days[appData.selectedDayIndex];
            const tr = document.createElement("tr");
            
            let otifClass = "cell-neutral";
            if (day.requested_ov > 0) {
                otifClass = day.otif >= 1 ? "cell-success" : (day.otif > 0 ? "cell-warning" : "cell-danger");
            }
            const otifPct = (day.otif * 100).toFixed(0) + "%";
            
            let complianceClass = "cell-neutral";
            if (day.prod_plan > 0) {
                complianceClass = day.prod_compliance >= 1 ? "cell-success" : (day.prod_compliance > 0 ? "cell-warning" : "cell-danger");
            }
            const compliancePct = (day.prod_compliance * 100).toFixed(0) + "%";
            
            const isTheoreticalNegative = day.final_inv_theoretical < 0;
            const isRealNegative = day.final_inv_real < 0;
            
            let dailyStatusClass = "cell-success";
            let dailyStatusText = "Sin riesgo";
            if (day.final_inv_real < 0) {
                dailyStatusClass = "cell-danger";
                dailyStatusText = "Quiebre Real";
            } else if (day.final_inv_theoretical < 0) {
                dailyStatusClass = "cell-warning";
                dailyStatusText = "Riesgo Quiebre";
            }
            
            const commentCount = skuCommentCounts[sku.sku_interno] || 0;
            const badgeHtml = commentCount > 0 ? `<span style="background: var(--neon-cyan); color: white; border-radius: 10px; padding: 1.5px 5px; font-size: 9px; font-weight: 700; margin-left: 4px;">${commentCount}</span>` : '';
            
            tr.innerHTML = `
                <td class="sticky-col sku-class-${sku.class ? sku.class.toLowerCase() : 'c'}">
                    <span class="sku-sub ${sku.subsidiary === 'ALPHALAB' ? 'sub-alphalab' : 'sub-velaluz'}">${sku.subsidiary}</span><br>
                    <span class="sku-cell">${sku.sku_interno}</span>
                </td>
                <td class="sticky-col" style="white-space: normal; min-width: 240px;">
                    ${sku.name}<br>
                    <span style="font-size: 10px; color: var(--text-secondary);">Neto: ${sku.sku_neto}</span>
                </td>
                <td class="num-val">${day.initial_inv.toLocaleString()}</td>
                <td class="num-val" style="font-weight: 600;">${day.requested_ov.toLocaleString()}</td>
                <td class="num-val" style="color: var(--text-secondary);">${day.shipped_prev_week > 0 ? day.shipped_prev_week.toLocaleString() : '-'}</td>
                <td class="num-val" style="font-weight: 600; color: var(--neon-cyan);">${day.shipped_curr_week > 0 ? day.shipped_curr_week.toLocaleString() : '-'}</td>
                <td class="num-val" style="color: var(--neon-red);">${day.adjustments > 0 ? '-' + day.adjustments.toLocaleString() : '-'}</td>
                <td class="num-val" style="text-align: center;">
                    <span class="cell-badge ${otifClass}">${otifPct}</span>
                </td>
                <td class="num-val" style="color: var(--text-secondary);">${day.prod_plan > 0 ? day.prod_plan.toLocaleString() : '-'}</td>
                <td class="num-val" style="font-weight: 600; color: var(--neon-green);">${day.prod_real > 0 ? day.prod_real.toLocaleString() : '-'}</td>
                <td class="num-val" style="text-align: center;">
                    <span class="cell-badge ${complianceClass}">${compliancePct}</span>
                </td>
                <td class="num-val ${isTheoreticalNegative ? 'cell-danger' : ''}" style="font-weight: 700;">
                    ${Math.round(day.final_inv_theoretical).toLocaleString()}
                </td>
                <td class="num-val ${isRealNegative ? 'cell-danger' : ''}" style="font-weight: 700;">
                    ${Math.round(day.final_inv_real).toLocaleString()}
                </td>
                <td class="num-val" style="text-align: center;">
                    <span class="cell-badge ${dailyStatusClass}" style="cursor:pointer" onclick="focusOnSku('${sku.sku_interno}')">${dailyStatusText}</span>
                </td>
                <td class="num-val" style="text-align: center; vertical-align: middle;">
                    <button class="btn-comment-sku" onclick="openSkuChat('${sku.sku_interno}', \`${sku.name.replace(/`/g, '\\`').replace(/'/g, "\\'")}\`, '${sku.subsidiary}')" title="Chat de Colaboración SKU">
                        <i data-lucide="message-square" style="width: 14px; height: 14px;"></i>
                        ${badgeHtml}
                    </button>
                </td>
            `;
            
            tableBody.appendChild(tr);
        });

    } else {
        tableHeader.innerHTML = `
            ${getHeaderHtml("sku_interno", "Subsidiaria / SKU", "sticky-col", "min-width: 130px;")}
            ${getHeaderHtml("name", "Nombre Artículo", "sticky-col", "min-width: 240px;")}
            ${getHeaderHtml("initial_inv", "Inv. Inicial Sem", "num-val")}
            ${getHeaderHtml("requested_ov", "Total Solicitado", "num-val")}
            ${getHeaderHtml("shipped_prev_week", "Total Emb. Sem Ant.", "num-val")}
            ${getHeaderHtml("shipped_curr_week", "Total Emb. Sem Corr.", "num-val")}
            ${getHeaderHtml("adjustments", "Total Ajustes PT", "num-val")}
            ${getHeaderHtml("otif", "OTIF Semanal", "num-val", "text-align: center;")}
            ${getHeaderHtml("prod_plan", "Total Plan Prod", "num-val")}
            ${getHeaderHtml("prod_real", "Total Real Prod", "num-val")}
            ${getHeaderHtml("prod_compliance", "Cumpl. Prod", "num-val", "text-align: center;")}
            ${getHeaderHtml("final_inv_theoretical", "Inv. Final Teorico", "num-val")}
            ${getHeaderHtml("final_inv_real", "Inv. Final Real", "num-val")}
            ${getHeaderHtml("var_vs_plan", "Estatus", "num-val", "text-align: center;")}
            <th style="text-align: center; min-width: 110px;">Comentarios</th>
        `;
        
        appData.filteredSkus.forEach(sku => {
            const initialInv = sku.days[0].initial_inv;
            
            let requestedTotal = 0;
            let shippedPrevTotal = 0;
            let shippedCurrTotal = 0;
            let adjustmentsTotal = 0;
            let prodPlanTotal = 0;
            let prodRealTotal = 0;
            let daysWithRisks = 0;
            
            sku.days.forEach(day => {
                requestedTotal += day.requested_ov;
                shippedPrevTotal += day.shipped_prev_week;
                shippedCurrTotal += day.shipped_curr_week;
                adjustmentsTotal += day.adjustments;
                prodPlanTotal += day.prod_plan;
                prodRealTotal += day.prod_real;
                if (day.final_inv_theoretical < 0) {
                    daysWithRisks++;
                }
            });
            
            const weeklyOtif = requestedTotal > 0 ? (shippedCurrTotal / requestedTotal) : 1.0;
            const weeklyCompliance = prodPlanTotal > 0 ? (prodRealTotal / prodPlanTotal) : 1.0;
            
            // Fórmulas dinámicas semanales:
            const finalInvTheoretical = initialInv - requestedTotal + prodPlanTotal - adjustmentsTotal;
            const finalInvReal = initialInv - shippedCurrTotal - shippedPrevTotal + prodRealTotal - adjustmentsTotal;
            
            const tr = document.createElement("tr");
            
            let otifClass = "cell-neutral";
            if (requestedTotal > 0) {
                otifClass = weeklyOtif >= 1 ? "cell-success" : (weeklyOtif > 0 ? "cell-warning" : "cell-danger");
            }
            
            let complianceClass = "cell-neutral";
            if (prodPlanTotal > 0) {
                complianceClass = weeklyCompliance >= 1 ? "cell-success" : (weeklyCompliance > 0 ? "cell-warning" : "cell-danger");
            }
            
            const commentCount = skuCommentCounts[sku.sku_interno] || 0;
            const badgeHtml = commentCount > 0 ? `<span style="background: var(--neon-cyan); color: white; border-radius: 10px; padding: 1.5px 5px; font-size: 9px; font-weight: 700; margin-left: 4px;">${commentCount}</span>` : '';
            
            tr.innerHTML = `
                <td class="sticky-col sku-class-${sku.class ? sku.class.toLowerCase() : 'c'}">
                    <span class="sku-sub ${sku.subsidiary === 'ALPHALAB' ? 'sub-alphalab' : 'sub-velaluz'}">${sku.subsidiary}</span><br>
                    <span class="sku-cell">${sku.sku_interno}</span>
                </td>
                <td class="sticky-col" style="white-space: normal; min-width: 240px;">
                    ${sku.name}<br>
                    <span style="font-size: 10px; color: var(--text-secondary);">Neto: ${sku.sku_neto}</span>
                </td>
                <td class="num-val">${initialInv.toLocaleString()}</td>
                <td class="num-val" style="font-weight: 600;">${requestedTotal.toLocaleString()}</td>
                <td class="num-val" style="color: var(--text-secondary);">${shippedPrevTotal > 0 ? shippedPrevTotal.toLocaleString() : '-'}</td>
                <td class="num-val" style="font-weight: 600; color: var(--neon-cyan);">${shippedCurrTotal > 0 ? shippedCurrTotal.toLocaleString() : '-'}</td>
                <td class="num-val" style="color: var(--neon-red);">${adjustmentsTotal > 0 ? '-' + adjustmentsTotal.toLocaleString() : '-'}</td>
                <td class="num-val" style="text-align: center;">
                    <span class="cell-badge ${otifClass}">${(weeklyOtif * 100).toFixed(0)}%</span>
                </td>
                <td class="num-val" style="color: var(--text-secondary);">${prodPlanTotal > 0 ? prodPlanTotal.toLocaleString() : '-'}</td>
                <td class="num-val" style="font-weight: 600; color: var(--neon-green);">${prodRealTotal > 0 ? prodRealTotal.toLocaleString() : '-'}</td>
                <td class="num-val" style="text-align: center;">
                    <span class="cell-badge ${complianceClass}">${(weeklyCompliance * 100).toFixed(0)}%</span>
                </td>
                <td class="num-val ${finalInvTheoretical < 0 ? 'cell-danger' : ''}" style="font-weight: 700;">${Math.round(finalInvTheoretical).toLocaleString()}</td>
                <td class="num-val ${finalInvReal < 0 ? 'cell-danger' : ''}" style="font-weight: 700;">${Math.round(finalInvReal).toLocaleString()}</td>
                <td class="num-val" style="text-align: center;">
                    ${daysWithRisks > 0 
                        ? `<span class="cell-badge cell-danger" style="cursor:pointer" onclick="focusOnSku('${sku.sku_interno}')">${daysWithRisks} d con quiebre</span>`
                        : `<span class="cell-badge cell-success" style="cursor:pointer" onclick="focusOnSku('${sku.sku_interno}')">Sin riesgo</span>`
                    }
                </td>
                <td class="num-val" style="text-align: center; vertical-align: middle;">
                    <button class="btn-comment-sku" onclick="openSkuChat('${sku.sku_interno}', \`${sku.name.replace(/`/g, '\\`').replace(/'/g, "\\'")}\`, '${sku.subsidiary}')" title="Chat de Colaboración SKU">
                        <i data-lucide="message-square" style="width: 14px; height: 14px;"></i>
                        ${badgeHtml}
                    </button>
                </td>
            `;
            
            tableBody.appendChild(tr);
        });
    }
    
    // Re-iniciar iconos lucide si es necesario
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Renderizar gráficos con Chart.js
function renderCharts() {
    const trendCtx = document.getElementById("trend-chart");
    const volCtx = document.getElementById("volume-chart");
    
    if (!trendCtx || !volCtx) return;
    
    // 1. Obtener categorías únicas dinámicamente de los skus filtrados
    const categoriesSet = new Set();
    appData.filteredSkus.forEach(sku => {
        if (sku.category) {
            categoriesSet.add(sku.category);
        }
    });
    const categories = Array.from(categoriesSet).sort();
    
    if (categories.length === 0) {
        categories.push("General");
    }
    
    const categoryPlans = [];
    const categoryReals = [];
    const categoryCappedReals = [];
    const categoryVars = [];
    
    categories.forEach(cat => {
        let planSum = 0;
        let realSum = 0;
        let cappedSum = 0;
        
        appData.filteredSkus.forEach(sku => {
            const skuCat = sku.category || "General";
            if (skuCat === cat) {
                let skuPlan = 0;
                let skuReal = 0;
                sku.days.forEach(day => {
                    skuPlan += day.prod_plan;
                    skuReal += day.prod_real;
                });
                planSum += skuPlan;
                realSum += skuReal;
                // Total weekly production sum per SKU (uncapped)
                cappedSum += skuReal;
            }
        });
        
        categoryPlans.push(planSum);
        categoryReals.push(realSum);
        categoryCappedReals.push(cappedSum);
        categoryVars.push(realSum - planSum);
    });
    
    // Actualizar títulos e información en la UI para la Gráfica 1
    const trendTitle = document.getElementById("trend-chart-title");
    const trendDesc = document.getElementById("trend-chart-desc");
    if (trendTitle) trendTitle.textContent = "Gráfica 1: Cumplimiento de Producción Semanal por Categoría";
    if (trendDesc) trendDesc.textContent = "Comparativa del volumen de producción planificado contra el real y la variación neta por categoría para la semana activa.";
    
    if (trendChart) trendChart.destroy();
    
    // Gráfico de barra para categorías (Plan, Real, Variación)
    trendChart = new Chart(trendCtx, {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [
                {
                    label: 'Plan Producción (Semanal)',
                    data: categoryPlans,
                    backgroundColor: '#38513d', // Verde Bosque
                    borderRadius: 8,
                    barPercentage: 0.8,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Producción Real (Semanal)',
                    data: categoryReals,
                    backgroundColor: '#ff6636', // Naranja Coral
                    borderRadius: 8,
                    barPercentage: 0.8,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Variación (Real - Plan)',
                    data: categoryVars,
                    backgroundColor: '#9aa39c', // Gris Arena / Muted
                    borderRadius: 8,
                    barPercentage: 0.8,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#5f6368', font: { family: 'Inter', size: 10, weight: '500' }, boxWidth: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const plan = categoryPlans[index] || 0;
                            const real = categoryReals[index] || 0;
                            const capped = categoryCappedReals[index] || 0;
                            
                            // Tooltips display S&OP compliance percentage (capped)
                            const pctCumplimiento = plan > 0 ? (capped / plan) * 100 : 0;
                            const pctVariacion = pctCumplimiento - 100;
                            
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += Math.round(context.parsed.y).toLocaleString('es-MX') + ' cajas';
                            }
                            
                            return [
                                label,
                                `   Cumplimiento: ${pctCumplimiento.toFixed(1)}%`,
                                `   Variación: ${pctVariacion >= 0 ? '+' : ''}${pctVariacion.toFixed(1)}%`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: '#f1f3f4' },
                    ticks: { 
                        color: '#5f6368', 
                        font: { family: 'Inter', size: 9 },
                        callback: function(value) {
                            return value.toLocaleString('es-MX');
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#5f6368', font: { family: 'Inter', size: 10, weight: '500' } }
                }
            }
        }
    });
    
    // 2. Gráfica 2: Embarques planeados (Solicitado OV) vs Reales acumulados de la semana por categoría
    const categoryOVs = [];
    const categoryShippeds = [];
    const categoryShipVars = [];
    
    categories.forEach(cat => {
        let ovSum = 0;
        let shipSum = 0;
        
        appData.filteredSkus.forEach(sku => {
            const skuCat = sku.category || "General";
            if (skuCat === cat) {
                sku.days.forEach(day => {
                    ovSum += day.requested_ov;
                    shipSum += day.shipped_curr_week;
                });
            }
        });
        
        categoryOVs.push(ovSum);
        categoryShippeds.push(shipSum);
        categoryShipVars.push(shipSum - ovSum);
    });
    
    // Actualizar títulos e información en la UI para la Gráfica 2
    const volTitle = document.getElementById("volume-chart-title");
    const volDesc = document.getElementById("volume-chart-desc");
    if (volTitle) {
        volTitle.textContent = `Gráfica 2: Desempeño de Embarques Semanal por Categoría — ${appData.selectedSubsidiary}`;
    }
    if (volDesc) {
        volDesc.textContent = `Comparativa del volumen solicitado (OV) contra el real embarcado y su porcentaje de cumplimiento por categoría para la empresa seleccionada.`;
    }
    
    if (volumeChart) volumeChart.destroy();
    
    // Gráfico de barras agrupadas para embarques por categoría
    volumeChart = new Chart(volCtx, {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [
                {
                    label: 'Solicitado OV (Semanal)',
                    data: categoryOVs,
                    backgroundColor: '#dcd6d2', // Gris Arena Claro
                    borderColor: '#c8c2be',
                    borderWidth: 1,
                    borderRadius: 8,
                    barPercentage: 0.8,
                    categoryPercentage: 0.8
                },
                {
                    label: 'Embarcado Real (Semanal)',
                    data: categoryShippeds,
                    backgroundColor: '#38513d', // Verde Bosque
                    borderRadius: 8,
                    barPercentage: 0.8,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#5f6368', font: { family: 'Inter', size: 10, weight: '500' }, boxWidth: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const plan = categoryOVs[index] || 0;
                            const real = categoryShippeds[index] || 0;
                            
                            const pctCumplimiento = plan > 0 ? (real / plan) * 100 : 0;
                            const pctVariacion = plan > 0 ? ((real - plan) / plan) * 100 : 0;
                            
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += Math.round(context.parsed.y).toLocaleString('es-MX') + ' cajas';
                            }
                            
                            return [
                                label,
                                `   Cumplimiento: ${pctCumplimiento.toFixed(1)}%`,
                                `   Variación: ${pctVariacion >= 0 ? '+' : ''}${pctVariacion.toFixed(1)}%`
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: '#f1f3f4' },
                    ticks: { 
                        color: '#5f6368', 
                        font: { family: 'Inter', size: 9 },
                        callback: function(value) {
                            return value.toLocaleString('es-MX');
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#5f6368', font: { family: 'Inter', size: 10, weight: '500' } }
                }
            }
        }
    });
}

// Controlar estado cargando
function showLoadingState(isLoading) {
    const tableBody = document.getElementById("table-body");
    if (!tableBody) return;
    
    if (isLoading) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="15">
                    <div class="center-spinner">
                        <div class="spinner"></div>
                        <span style="font-size: 11px; font-weight: 500;">Estableciendo conexión y leyendo matriz de planeación en vivo...</span>
                    </div>
                </td>
            </tr>
        `;
    }
}

// Notificaciones flotantes
function showNotification(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = "toast-msg";
    
    if (type === "success") {
        toast.style.backgroundColor = "#1e8e3e";
        toast.style.color = "#ffffff";
    } else if (type === "warning") {
        toast.style.backgroundColor = "#f9ab00";
        toast.style.color = "#202124";
    } else {
        toast.style.backgroundColor = "#d93025";
        toast.style.color = "#ffffff";
    }
    
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3500);
}

// -------------------------------------------------------------
// INTEGRACIÓN CON GEMINI AI
// -------------------------------------------------------------

function sendUserMessage(text) {
    appendMessage(text, "user");
    callGeminiAPI(text);
}

function appendMessage(text, sender) {
    const feed = document.getElementById("chat-feed");
    if (!feed) return;
    
    const emptyMsg = feed.querySelector(".chat-empty-state");
    if (emptyMsg) emptyMsg.remove();
    
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${sender}`;
    
    const senderName = sender === "user" ? "Planner S&OP" : "Analista Clínico S&OP";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    
    if (sender === "ai") {
        bubble.innerHTML = parseMarkdownSimple(text);
    } else {
        bubble.textContent = text;
    }
    
    msgDiv.innerHTML = `<span class="message-sender">${senderName}</span>`;
    msgDiv.appendChild(bubble);
    feed.appendChild(msgDiv);
    feed.scrollTop = feed.scrollHeight;
}

function parseMarkdownSimple(markdown) {
    let html = markdown
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    html = html.replace(/^&gt;\s+(.*)$/gim, '<blockquote>$1</blockquote>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/^\s*-\s+(.*)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    html = html.replace(/\n/g, '<br>');
    
    return html;
}

async function triggerAIEngine(actionType) {
    let promptText = "";
    if (actionType === "diagnostico_completo") {
        promptText = "Dame un Diagnóstico Clínico S&OP completo de la semana activa. Analiza la situación general de Alphalab y Velaluz.";
    } else if (actionType === "triage_emergencia") {
        promptText = "Ejecuta el Triage Operativo (Riesgo Inminente) de los días futuros. Indícame con precisión quirúrgica los quiebres de inventario teorico esperados y las órdenes de producción requeridas por turno.";
    } else if (actionType === "wrapup_semanal") {
        promptText = "Haz el Wrap-Up Semanal (Visión Overall). Evalúa el acumulado, indicando si los días críticos fueron compensados al cierre y estima el nivel de servicio general final.";
    }
    
    appendMessage(promptText, "user");
    await callGeminiAPI(promptText, actionType);
}

function compileModelContext() {
    let context = `INFORMACIÓN ACTUAL DE LA PLANEACIÓN DE S&OP:\n`;
    context += `Semana activa: ${appData.weekName}\n`;
    context += `Días de planeación (Viernes a Jueves): ${appData.dates.join(', ')}\n\n`;
    
    context += `KPIs GENERALES ACUMULADOS (Filtrados):\n`;
    context += `- OTIF Semanal Acumulado: ${appData.kpis.otifSemanal.toFixed(1)}%\n`;
    context += `- Cumplimiento de Producción Semanal: ${appData.kpis.prodSemanal.toFixed(1)}%\n`;
    context += `- Número de SKUs Monitoreados: ${appData.kpis.skusMonitoreados}\n`;
    context += `- Alertas de Riesgo de Quiebre Detectadas: ${appData.kpis.alertasActivas}\n\n`;
    
    context += `ALERTAS DE TRIAGE OPERATIVO (QUIEBRES TEÓRICOS FUTUROS DETECTADOS):\n`;
    if (appData.triageAlerts.length === 0) {
        context += `- Sin alertas de quiebre. Todos los inventarios finales teóricos se proyectan positivos.\n`;
    } else {
        let alertIndex = 1;
        appData.triageAlerts.forEach(alert => {
            alert.riskDays.forEach(rd => {
                context += `${alertIndex++}. [${alert.subsidiary}] SKU: ${alert.sku} (${alert.name}) | Día: ${rd.dayName} (${rd.dateStr}) | Faltante: ${rd.deficit} unidades | Solicitado: ${rd.requested} | Plan Prod: ${rd.prod_plan} | Alerta: ${rd.message}\n`;
            });
        });
    }
    context += `\n`;

    context += `SKUS CON BAJO DESEMPEÑO / DESVIACIONES:\n`;
    let count = 0;
    appData.skus.forEach(sku => {
        let hasDeviations = false;
        let details = [];
        sku.days.forEach(day => {
            const dayName = PLAN_DAY_NAMES[day.day_index];
            if (day.requested_ov > 0 && day.otif < 1) {
                hasDeviations = true;
                details.push(`Día ${dayName}: OTIF del ${(day.otif * 100).toFixed(0)}% (Solicitado: ${day.requested_ov}, Embarcado Semana Corriente: ${day.shipped_curr_week})`);
            }
            if (day.shipped_prev_week > 0) {
                hasDeviations = true;
                details.push(`Día ${dayName}: Arrastra rezago de semana anterior (Embarcado Sem. Ant: ${day.shipped_prev_week})`);
            }
            if (day.prod_plan > 0 && day.prod_compliance < 1) {
                hasDeviations = true;
                details.push(`Día ${dayName}: Producción al ${(day.prod_compliance * 100).toFixed(0)}% (Plan: ${day.prod_plan}, Real: ${day.prod_real})`);
            }
            if (day.adjustments > 0) {
                hasDeviations = true;
                details.push(`Día ${dayName}: Pérdida de inventario por daño/otros de ${day.adjustments} unidades`);
            }
        });
        
        if (hasDeviations && count < 10) {
            context += `- [${sku.subsidiary}] SKU ${sku.sku_interno} - ${sku.name}:\n  * ` + details.join('\n  * ') + `\n`;
            count++;
        }
    });
    
    return context;
}

async function callGeminiAPI(userPrompt, actionType = "") {
    const key = localStorage.getItem("gemini_api_key");
    if (!key) {
        appendMessage("⚠️ Error: No has configurado tu Gemini API Key. Por favor abre el panel de configuración de la API arriba e introduce tu clave para poder chatear con el Analista Clínico.", "ai");
        toggleApiSettings(true);
        return;
    }
    
    const feed = document.getElementById("chat-feed");
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message ai";
    loadingDiv.id = "gemini-loading";
    loadingDiv.innerHTML = `
        <span class="message-sender">Analista Clínico S&OP</span>
        <div class="message-bubble" style="display: flex; align-items: center; gap: 8px;">
            <div class="spinner" style="width: 14px; height: 14px; margin-bottom: 0;"></div>
            <span>Efectuando diagnóstico quirúrgico de datos...</span>
        </div>
    `;
    feed.appendChild(loadingDiv);
    feed.scrollTop = feed.scrollHeight;
    
    try {
        const dataContext = compileModelContext();
        
        const systemInstruction = `
Eres el Analista Clínico de Cadena de Suministro de Grupo Induwell, dedicado a la supervisión operativa de las subsidiarias Alphalab y Velaluz. Tu misión es garantizar el máximo nivel de servicio mediante el monitoreo estricto del indicador OTIF (On-Time, In-Full) diario y semanal. No haces resúmenes superficiales; ejecutas un análisis quirúrgico de los datos del "Dashboard de Planeación Semanal" para detectar riesgos de desabasto, evaluar el desempeño de producción y emitir recomendaciones operativas inmediatas basadas en Data Storytelling.

[Comprensión del Entorno y Reglas de Negocio]
Debes interpretar la matriz de datos bajo los siguientes ejes operativos inamovibles:
1. Calendario Operativo: La semana de planeación opera estrictamente de Viernes a Jueves (6 días de operación, el Domingo es inhábil y no se planea).
2. Ciclo de Inventario: El Inventario Final Real del día actual es matemáticamente el Inventario Inicial del Día inmediato siguiente. Comprendes que movimientos excepcionales ("PT para producción dañado u otras partidas") restan directamente a la disponibilidad.
3. Gestión de Desviaciones (OTIF): El plan óptimo de embarque ("Solicitado OV") debe coincidir exactamente con lo "Embarcado real semana corriente". Cualquier brecha aquí es una desviación crítica del servicio que debes reportar. Lo "Embarcado real semana anterior" es rezago y debe tratarse como alerta de atraso.
4. Ventanas de Ejecución (Turnos): Las acciones correctivas que propongas deben respetar los horarios de las plantas. El primer turno (6:30 am a 3:30 pm) es tu ventana de reacción para exigir producción de emergencia. El segundo turno (3:30 pm a 10:00 pm) es la ventana límite para ejecutar los embarques salvados.

[Protocolo de Diagnóstico y Evaluación Clínico]
Cada vez que el equipo de CDS actualice el documento y se active tu análisis, debes estructurar tu respuesta en tres niveles (puedes enfatizar más en el nivel solicitado por el usuario, pero mantén el rigor):
- Nivel 1: Triage Operativo (Riesgo Inminente): Escanea todos los SKUs buscando valores negativos en el "Inventario Final Teórico" de los días futuros. Si encuentras un negativo, emite una orden de acción correctiva precisa. Ejemplo: "Riesgo de quiebre en SKU [X]. Se requiere producir [Y] unidades en el 1er turno del [Día] para asegurar el embarque correspondiente en el 2do turno antes de las 10:00 pm."
- Nivel 2: Diagnóstico Diario (Daily Huddle): Evalúa la salud de los días ya transcurridos/cerrados. Calcula la fricción entre el "Plan Prod del día" y el "Real Prod del día" (% de cumplimiento). Informa el OTIF Diario del SKU de forma aislada, señalando si las variaciones fueron por falta de inventario, bajas por daño, o incumplimiento en piso de producción.
- Nivel 3: Wrap-Up Semanal (Visión Overall): Al acercarse el jueves, evalúa el acumulado. Entiende que un día de mala planeación puede ser absorbido si el global de la semana rescata el volumen. Provee un porcentaje de cumplimiento general (Overall) de la semana corriente, destacando los eventos clave o ajustes que permitieron el éxito de la operación.

[Tono y Estilo]
Tu lenguaje debe ser en español, ejecutivo, directo, objetivo y clínico. Elimina la palabrería y los saludos extensos. Ve directamente a las métricas, los hallazgos atípicos, los cuellos de botella y las recomendaciones de nivelación de la producción. Eres el respaldo analítico de la Dirección de Operaciones, por lo que tus conclusiones deben estar fundamentadas 100% en los números del dashboard.
`;

        const fullPrompt = `
SISTEMA Y DATOS OPERATIVOS DEL DASHBOARD DE PLANEACIÓN:
=========================================
${dataContext}
=========================================

CONSULTA DEL USUARIO / INSTRUCCIÓN ACTUAL:
${userPrompt}
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: fullPrompt }]
                }],
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                },
                generationConfig: {
                    temperature: 0.15,
                    maxOutputTokens: 2048
                }
            })
        });

        const loader = document.getElementById("gemini-loading");
        if (loader) loader.remove();

        if (!response.ok) {
            const errorJson = await response.json();
            throw new Error(errorJson.error?.message || `Error HTTP ${response.status}`);
        }

        const resJson = await response.json();
        const responseText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (responseText) {
            appendMessage(responseText, "ai");
        } else {
            appendMessage("⚠️ No se recibió una respuesta legible del modelo de IA.", "ai");
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
        const loader = document.getElementById("gemini-loading");
        if (loader) loader.remove();
        appendMessage(`⚠️ Error al comunicarse con Gemini: ${error.message}. Verifica tu API Key.`, "ai");
    }
}

// Mostrar advertencia si se abre vía file://
function showFileProtocolWarning() {
    document.body.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #050811; z-index: 999999; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; color: white; font-family: 'Plus Jakarta Sans', sans-serif; background-image: radial-gradient(circle at 50% 30%, rgba(255, 59, 48, 0.1) 0%, transparent 60%);">
            <div style="background: linear-gradient(135deg, rgba(16, 24, 48, 0.6) 0%, rgba(8, 12, 24, 0.9) 100%); border: 1px solid rgba(255, 59, 48, 0.2); border-radius: 16px; padding: 32px; max-width: 620px; box-shadow: 0 0 40px rgba(255, 59, 48, 0.15); backdrop-filter: blur(20px);">
                <div style="width: 60px; height: 60px; background: rgba(255, 59, 48, 0.1); border: 1px solid rgba(255, 59, 48, 0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; box-shadow: 0 0 15px rgba(255, 59, 48, 0.2);">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <h2 style="color: white; margin-bottom: 12px; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; text-transform: uppercase;">⚠️ Servidor Local Requerido (Bloqueo CORS)</h2>
                <p style="font-size: 13.5px; line-height: 1.6; margin-bottom: 24px; color: #9aa1b8;">
                    Has abierto el dashboard haciendo doble clic en el archivo HTML (protocolo <code>file://</code>). 
                    Por seguridad, los navegadores bloquean la descarga de datos externos en este modo.
                </p>
                <div style="background: rgba(4, 6, 12, 0.5); padding: 20px; border-radius: 10px; text-align: left; font-size: 13px; font-family: 'JetBrains Mono', monospace; border: 1px solid rgba(255,255,255,0.03); margin-bottom: 24px; color: #00d2ff; line-height: 1.6; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);">
                    <strong style="color: white; font-family: sans-serif; font-size: 12px; display: block; margin-bottom: 8px;">CÓMO SOLUCIONAR ESTO EN 2 PASOS:</strong>
                    1. Ve a la carpeta del proyecto y haz doble clic sobre el archivo <code style="color: #00ff66; font-weight: bold;">IniciarServidor.bat</code>.<br>
                    (Esto iniciará el servidor de comandos de Windows de forma directa).<br><br>
                    2. Abre tu navegador de internet en la dirección:<br>
                    <a href="http://localhost:8080" style="color: #00ff66; text-decoration: underline; font-weight: bold; font-size: 14px;">http://localhost:8080</a>
                </div>
                <p style="font-size: 11px; color: #525a70; line-height: 1.4;">
                    El servidor local es ligero, no requiere instalación de programas de terceros, y asegura que la sincronización con tu Google Sheet funcione en tiempo real y sin bloqueos.
                </p>
            </div>
        </div>
    `;
}

// Inicializar cliente de Supabase
function initSupabase() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        } catch (e) {
            console.error("Error al inicializar Supabase:", e);
        }
    }
}

// Verificar si el usuario está autenticado
function checkAuthState() {
    const sessionUser = sessionStorage.getItem("sop_logged_in_user");
    const activeCompany = sessionStorage.getItem("sop_active_company");
    const authOverlay = document.getElementById("auth-overlay");
    const loginContainer = document.getElementById("login-container");
    const workspaceContainer = document.getElementById("workspace-container");
    const appContainer = document.querySelector(".app-container");
    
    if (sessionUser) {
        try {
            loggedInUser = JSON.parse(sessionUser);
            
            // Configurar datos de usuario en navbar con su rol
            const roleLabels = {
                admin: "Director CDS",
                gerente: "Gerente CDS",
                user: "Gerente CDS",
                operador: "Gerente CDS",
                visor: "Visor"
            };
            const displayRole = roleLabels[loggedInUser.role] || loggedInUser.role;
            document.getElementById("user-display-name").textContent = `${loggedInUser.username} (${displayRole})`;
            
            // Mostrar botón admin si es administrador (Director CDS)
            const adminBtn = document.getElementById("admin-panel-btn");
            if (adminBtn) {
                adminBtn.style.display = loggedInUser.role === "admin" ? "inline-flex" : "none";
            }

            // Ocultar botón de sincronización para el rol Visor (sólo Director y Gerente pueden sincronizar)
            const refreshBtn = document.getElementById("refresh-btn");
            if (refreshBtn) {
                refreshBtn.style.display = loggedInUser.role === "visor" ? "none" : "inline-flex";
            }

            // Ocultar la barra lateral de IA y el botón toggle para el rol Visor (sólo lectura y descarga)
            const sidebar = document.querySelector(".sidebar");
            const sidebarToggle = document.getElementById("sidebar-toggle");
            if (sidebar && sidebarToggle) {
                if (loggedInUser.role === "visor") {
                    sidebar.style.display = "none";
                    sidebarToggle.style.display = "none";
                    document.querySelector(".app-container")?.classList.remove("sidebar-collapsed");
                } else {
                    sidebar.style.display = "flex";
                    sidebarToggle.style.display = "flex";
                }
            }

            // Desactivar campos de login para evitar autofill del navegador
            const usernameInput = document.getElementById("login-username");
            const passwordInput = document.getElementById("login-password");
            if (usernameInput) usernameInput.disabled = true;
            if (passwordInput) passwordInput.disabled = true;
            
            if (!activeCompany) {
                // ETAPA 2: Mostrar el selector de espacios de trabajo
                if (authOverlay) authOverlay.style.display = "flex";
                if (loginContainer) loginContainer.style.display = "none";
                if (workspaceContainer) workspaceContainer.style.display = "flex";
                if (appContainer) appContainer.style.display = "none";
                
                renderWorkspaceSelector();
            } else {
                // ETAPA 3: Mostrar el dashboard de la empresa seleccionada
                appData.selectedSubsidiary = activeCompany;
                if (authOverlay) authOverlay.style.display = "none";
                if (appContainer) appContainer.style.display = "flex";
                
                // Restaurar week, day index y search query
                const savedWeek = sessionStorage.getItem("sop_selected_week");
                if (savedWeek) {
                    appData.selectedWeekName = savedWeek;
                }
                const savedDayIndex = sessionStorage.getItem("sop_selected_day_index");
                if (savedDayIndex !== null) {
                    appData.selectedDayIndex = parseInt(savedDayIndex, 10);
                }
                const savedSearchQuery = sessionStorage.getItem("sop_search_query");
                if (savedSearchQuery) {
                    appData.searchQuery = savedSearchQuery;
                    const searchInput = document.getElementById("search-input");
                    if (searchInput) searchInput.value = savedSearchQuery;
                }
                
                // Cargar datos
                loadDashboardData();
            }
        } catch (e) {
            console.error("Error al parsear sesión:", e);
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    loggedInUser = null;
    sessionStorage.removeItem("sop_logged_in_user");
    sessionStorage.removeItem("sop_active_company");
    sessionStorage.removeItem("sop_selected_week");
    sessionStorage.removeItem("sop_selected_day_index");
    sessionStorage.removeItem("sop_search_query");
    
    // Activar y limpiar campos de login
    const usernameInput = document.getElementById("login-username");
    const passwordInput = document.getElementById("login-password");
    if (usernameInput) {
        usernameInput.disabled = false;
        usernameInput.value = "";
    }
    if (passwordInput) {
        passwordInput.disabled = false;
        passwordInput.value = "";
    }

    const authOverlay = document.getElementById("auth-overlay");
    const loginContainer = document.getElementById("login-container");
    const workspaceContainer = document.getElementById("workspace-container");
    const appContainer = document.querySelector(".app-container");
    
    if (authOverlay) authOverlay.style.display = "flex";
    if (loginContainer) loginContainer.style.display = "flex";
    if (workspaceContainer) workspaceContainer.style.display = "none";
    if (appContainer) appContainer.style.display = "none";
}

// Iniciar sesión
async function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById("login-username").value.trim();
    const passwordInput = document.getElementById("login-password").value.trim();
    const errorMsg = document.getElementById("login-error-msg");
    
    if (errorMsg) errorMsg.style.display = "none";
    
    if (!supabaseClient) {
        showNotification("Supabase no está configurado. Por favor, introduce la URL y Anon Key del servidor abajo.", "error");
        toggleSupabaseSetup(true);
        return;
    }
    
    showLoadingState(true);
    try {
        const { data, error } = await supabaseClient
            .from("usuarios")
            .select("*")
            .eq("username", usernameInput)
            .eq("password", passwordInput);
            
        if (error) throw error;
        
        if (data && data.length > 0) {
            const user = data[0];
            sessionStorage.setItem("sop_logged_in_user", JSON.stringify(user));
            showNotification(`¡Bienvenido, ${user.username}!`, "success");
            checkAuthState();
        } else {
            if (errorMsg) {
                errorMsg.textContent = "Usuario o contraseña incorrectos.";
                errorMsg.style.display = "block";
            }
        }
    } catch (err) {
        console.error("Error de login en Supabase:", err);
        if (errorMsg) {
            errorMsg.textContent = "Error al conectar con el servidor de base de datos.";
            errorMsg.style.display = "block";
        }
        showNotification("Error de conexión con Supabase.", "error");
    } finally {
        showLoadingState(false);
    }
}

// Cerrar sesión
function handleLogout() {
    if (notificationPollInterval) {
        clearInterval(notificationPollInterval);
        notificationPollInterval = null;
    }
    const bellWrapper = document.getElementById("notifications-bell-wrapper");
    if (bellWrapper) bellWrapper.style.display = "none";
    
    sessionStorage.removeItem("sop_logged_in_user");
    showNotification("Sesión cerrada correctamente", "info");
    showLoginScreen();
}



// Generar dinámicamente el selector de subsidiarias basado en los permisos del usuario
async function renderSubsidiarySelector() {
    const container = document.getElementById("subsidiary-segment-control");
    if (!container || !loggedInUser) return;
    
    container.innerHTML = "";
    
    // Cargar empresas autorizadas
    let userCompanies = loggedInUser.companies || [];
    
    // Si el usuario es administrador, puede acceder a todas las empresas registradas en Supabase
    if (loggedInUser.role === "admin" && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from("empresas").select("name");
            if (!error && data) {
                systemCompanies = data.map(d => d.name);
            }
        } catch (e) {
            console.error("Error al cargar catálogo de empresas para admin:", e);
        }
        userCompanies = [...systemCompanies];
    }
    
    userCompanies = [...new Set(userCompanies)];
    
    if (userCompanies.length === 0) {
        container.innerHTML = `<span style="font-size: 11px; color: var(--neon-red); padding: 8px;">Sin empresas autorizadas</span>`;
        return;
    }
    
    // Asegurar que la subsidiaria seleccionada esté en las autorizadas del usuario
    if (!userCompanies.includes(appData.selectedSubsidiary)) {
        appData.selectedSubsidiary = userCompanies.includes("ALPHALAB") ? "ALPHALAB" : userCompanies[0];
    }
    
    userCompanies.forEach(company => {
        const btn = document.createElement("button");
        btn.className = `segment-btn ${appData.selectedSubsidiary === company ? 'active' : ''}`;
        btn.dataset.filterSub = company;
        btn.textContent = company.charAt(0) + company.slice(1).toLowerCase();
        btn.addEventListener("click", (e) => {
            document.querySelectorAll("#subsidiary-segment-control .segment-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            appData.selectedSubsidiary = company;
            applyFilters();
            loadComments();
        });
        container.appendChild(btn);
    });
}

// Autoregistrar una empresa si se detecta en el Excel y no está en Supabase
async function registerCompanyIfNeeded(companyName) {
    if (!companyName || !supabaseClient || !loggedInUser || loggedInUser.role !== "admin") return;
    
    const formattedName = companyName.toUpperCase().trim();
    if (formattedName === "" || formattedName === "EMPRESA" || formattedName.includes("---")) return;
    
    if (!systemCompanies.includes(formattedName)) {
        systemCompanies.push(formattedName);
        try {
            const { data, error } = await supabaseClient
                .from("empresas")
                .select("name")
                .eq("name", formattedName);
                
            if (!error && (!data || data.length === 0)) {
                await supabaseClient.from("empresas").insert([{ name: formattedName }]);
                console.log(`Empresa autoregistrada en Supabase: ${formattedName}`);
                // Si estamos en el panel admin, refrescar
                const modal = document.getElementById("admin-panel-modal");
                if (modal && modal.style.display === "flex") {
                    loadAdminData();
                }
            }
        } catch (e) {
            console.error(`Error al autoregistrar empresa ${formattedName}:`, e);
        }
    }
}

// Desactivar o activar campos de admin panel para evitar autofill
function disableAdminInputs(disable) {
    const adminUsername = document.getElementById("admin-new-username");
    const adminPassword = document.getElementById("admin-new-password");
    const adminCompany = document.getElementById("admin-new-company");
    if (adminUsername) adminUsername.disabled = disable;
    if (adminPassword) adminPassword.disabled = disable;
    if (adminCompany) adminCompany.disabled = disable;
}

// Panel de Administración (Supabase)
function openAdminPanel() {
    const modal = document.getElementById("admin-panel-modal");
    if (modal) {
        modal.style.display = "flex";
        disableAdminInputs(false);
        switchAdminTab("tab-usuarios");
        loadAdminData();
    }
}

function closeAdminPanel() {
    const modal = document.getElementById("admin-panel-modal");
    if (modal) {
        modal.style.display = "none";
        disableAdminInputs(true);
    }
}

function switchAdminTab(tabId) {
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    document.querySelectorAll(".admin-tab-content").forEach(content => {
        content.style.display = content.id === tabId ? "block" : "none";
    });
}

async function loadAdminData() {
    if (!supabaseClient) return;
    
    try {
        // 1. Cargar empresas
        const { data: companiesData, error: compError } = await supabaseClient
            .from("empresas")
            .select("*")
            .order("name", { ascending: true });
            
        if (compError) throw compError;
        
        systemCompanies = companiesData.map(c => c.name);
        renderAdminCompanies(companiesData);
        renderAdminCompanyCheckboxes(companiesData);
        
        // 2. Cargar usuarios
        const { data: usersData, error: userError } = await supabaseClient
            .from("usuarios")
            .select("*")
            .order("username", { ascending: true });
            
        if (userError) throw userError;
        
        renderAdminUsers(usersData);
    } catch (err) {
        console.error("Error al cargar datos de admin de Supabase:", err);
        showNotification("Error al cargar usuarios y empresas de Supabase", "error");
    }
}

function renderAdminCompanyCheckboxes(companies) {
    const container = document.getElementById("admin-company-checkboxes");
    if (!container) return;
    container.innerHTML = "";
    
    companies.forEach(company => {
        const label = document.createElement("label");
        label.className = "checkbox-item";
        label.innerHTML = `
            <input type="checkbox" name="admin-company" value="${company.name}">
            <span>${company.name}</span>
        `;
        container.appendChild(label);
    });
}

function renderAdminCompanies(companies) {
    const tbody = document.getElementById("admin-companies-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    companies.forEach(company => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight:600; color:var(--text-primary);">${company.name}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAdminUsers(users) {
    const tbody = document.getElementById("admin-users-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    users.forEach(user => {
        const tr = document.createElement("tr");
        const companyPills = (user.companies || [])
            .map(c => `<span class="company-pill">${c}</span>`)
            .join("");
            
        let roleLabel = "Gerente CDS";
        let badgeClass = user.role;
        if (user.role === 'admin') {
            roleLabel = 'Director CDS';
            badgeClass = 'admin';
        } else if (user.role === 'visor') {
            roleLabel = 'Visor';
            badgeClass = 'visor';
        } else {
            roleLabel = 'Gerente CDS';
            badgeClass = 'gerente';
        }
            
        tr.innerHTML = `
            <td style="font-weight:600; color:var(--text-primary);">${user.username}</td>
            <td><span class="role-badge ${badgeClass}">${roleLabel}</span></td>
            <td>${companyPills || '<span style="color:var(--text-muted); font-style:italic;">Ninguna</span>'}</td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-outline reset-pw-btn" style="padding:4px 8px; font-size:11px;" data-username="${user.username}">Clave</button>
                    <button class="btn btn-outline delete-user-btn" style="padding:4px 8px; font-size:11px; border-color:var(--neon-red); color:var(--neon-red);" data-username="${user.username}">Eliminar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    document.querySelectorAll(".reset-pw-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const username = e.currentTarget.dataset.username;
            resetUserPassword(username);
        });
    });
    
    document.querySelectorAll(".delete-user-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const username = e.currentTarget.dataset.username;
            deleteUser(username);
        });
    });
}

async function handleCreateUser(e) {
    e.preventDefault();
    if (!supabaseClient) return;
    
    const usernameInput = document.getElementById("admin-new-username").value.trim();
    const passwordInput = document.getElementById("admin-new-password").value.trim();
    const roleInput = document.getElementById("admin-new-role").value;
    
    const checkedBoxes = document.querySelectorAll("input[name='admin-company']:checked");
    const companies = Array.from(checkedBoxes).map(cb => cb.value);
    
    if (passwordInput.length < 6) {
        showNotification("La contraseña debe tener al menos 6 caracteres", "warning");
        return;
    }
    
    showLoadingState(true);
    try {
        const { error } = await supabaseClient
            .from("usuarios")
            .insert([{ username: usernameInput, password: passwordInput, role: roleInput, companies }]);
            
        if (error) throw error;
        
        showNotification(`Usuario '${usernameInput}' creado con éxito`, "success");
        document.getElementById("admin-create-user-form").reset();
        loadAdminData();
    } catch (err) {
        console.error("Error al crear usuario:", err);
        showNotification("Error: El usuario ya existe o hubo problemas con la red", "error");
    } finally {
        showLoadingState(false);
    }
}

async function handleCreateCompany(e) {
    e.preventDefault();
    if (!supabaseClient) return;
    
    const companyInput = document.getElementById("admin-new-company").value.toUpperCase().trim();
    if (companyInput === "") return;
    
    showLoadingState(true);
    try {
        const { error } = await supabaseClient
            .from("empresas")
            .insert([{ name: companyInput }]);
            
        if (error) throw error;
        
        showNotification(`Empresa '${companyInput}' registrada con éxito`, "success");
        document.getElementById("admin-create-company-form").reset();
        loadAdminData();
    } catch (err) {
        console.error("Error al crear empresa:", err);
        showNotification("Error: La empresa ya está registrada", "error");
    } finally {
        showLoadingState(false);
    }
}

async function resetUserPassword(username) {
    if (!supabaseClient) return;
    
    const newPassword = prompt(`Introduce la nueva contraseña para el usuario '${username}':`);
    if (newPassword === null) return;
    
    const cleanPw = newPassword.trim();
    if (cleanPw.length < 6) {
        showNotification("La contraseña debe tener al menos 6 caracteres", "warning");
        return;
    }
    
    showLoadingState(true);
    try {
        const { error } = await supabaseClient
            .from("usuarios")
            .update({ password: cleanPw })
            .eq("username", username);
            
        if (error) throw error;
        
        showNotification(`Contraseña de '${username}' restablecida con éxito`, "success");
        
        // Si el usuario logueado es el que se editó, actualizar sesión
        if (loggedInUser && loggedInUser.username === username) {
            loggedInUser.password = cleanPw;
            sessionStorage.setItem("sop_logged_in_user", JSON.stringify(loggedInUser));
        }
    } catch (err) {
        console.error("Error al restablecer contraseña:", err);
        showNotification("Error al cambiar contraseña", "error");
    } finally {
        showLoadingState(false);
    }
}

async function deleteUser(username) {
    if (!supabaseClient) return;
    
    if (loggedInUser && loggedInUser.username === username) {
        showNotification("No puedes eliminar a tu propio usuario activo", "warning");
        return;
    }
    
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente al usuario '${username}'?`)) {
        return;
    }
    
    showLoadingState(true);
    try {
        const { error } = await supabaseClient
            .from("usuarios")
            .delete()
            .eq("username", username);
            
        if (error) throw error;
        
        showNotification(`Usuario '${username}' eliminado`, "success");
        loadAdminData();
    } catch (err) {
        console.error("Error al eliminar usuario:", err);
        showNotification("Error al eliminar usuario", "error");
    } finally {
        showLoadingState(false);
    }
}

// Mostrar el selector de espacios de trabajo
async function renderWorkspaceSelector() {
    const container = document.getElementById("workspace-cards-list");
    if (!container || !loggedInUser) return;
    
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-secondary); font-size:12px;">Cargando sociedades autorizadas...</div>`;
    
    // Obtener las empresas autorizadas
    let userCompanies = loggedInUser.companies || [];
    
    // Si el administrador entra, obtener catálogo de Supabase
    if (loggedInUser.role === "admin" && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from("empresas").select("name");
            if (!error && data) {
                systemCompanies = data.map(d => d.name);
            }
        } catch (e) {
            console.error("Error al cargar empresas para launcher:", e);
        }
        userCompanies = [...systemCompanies];
    }
    
    userCompanies = [...new Set(userCompanies)];
    container.innerHTML = "";
    
    if (userCompanies.length === 0) {
        container.innerHTML = `
            <div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:13px;">
                ⚠️ No tienes empresas autorizadas. Contacta al administrador.
            </div>
        `;
        return;
    }
    
    userCompanies.forEach(company => {
        let displayName = company;
        if (company === "ALPHALAB") {
            displayName = "Grupo Alphalab";
        } else if (company === "VELALUZ") {
            displayName = "Velaluz Veladoras y Parafinas de México";
        } else {
            displayName = "Grupo " + company.charAt(0) + company.slice(1).toLowerCase();
        }
        
        const card = document.createElement("div");
        card.className = "workspace-card";
        card.innerHTML = `
            <div class="workspace-card-icon">
                <i data-lucide="building-2"></i>
            </div>
            <div class="workspace-card-info">
                <h3>${displayName}</h3>
                <p>Ingresar al panel de control</p>
            </div>
            <div class="workspace-card-arrow">
                <i data-lucide="chevron-right"></i>
            </div>
        `;
        card.addEventListener("click", () => {
            selectWorkspace(company);
        });
        container.appendChild(card);
    });
    
    // Mostrar botón de crear empresa en launcher solo a admins
    const addCompBtn = document.getElementById("workspace-add-company-btn");
    if (addCompBtn) {
        addCompBtn.style.display = loggedInUser.role === "admin" ? "inline-flex" : "none";
    }
    
    // Re-iniciar iconos Lucide
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Seleccionar espacio de trabajo e ingresar al dashboard
function selectWorkspace(companyName) {
    sessionStorage.removeItem("sop_selected_week");
    sessionStorage.removeItem("sop_selected_day_index");
    sessionStorage.removeItem("sop_search_query");
    sessionStorage.setItem("sop_active_company", companyName);
    appData.selectedSubsidiary = companyName;
    checkAuthState();
}

// Exportar Triage Operativo a Excel con formato
function exportTriageToExcel() {
    const filteredAlerts = appData.triageAlerts.filter(alert => {
        return appData.selectedSubsidiary === "TODAS" || alert.subsidiary === appData.selectedSubsidiary;
    });
    
    let totalRiskRows = [];
    filteredAlerts.forEach(alert => {
        alert.riskDays.forEach(rd => {
            totalRiskRows.push({
                sku: alert.sku,
                sku_neto: alert.sku_neto,
                name: alert.name,
                subsidiary: alert.subsidiary,
                ...rd
            });
        });
    });
    
    if (totalRiskRows.length === 0) {
        showNotification("No hay datos de triage operativo para exportar en esta sociedad", "warning");
        return;
    }
    
    // Ordenar las filas por índice de día (Viernes a Jueves)
    totalRiskRows.sort((a, b) => a.dayIndex - b.dayIndex);
    
    // Metadatos
    const dateStrToday = new Date().toLocaleDateString('es-MX', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });
    
    const rows = [
        ["REPORTE S&OP - TRIAGE OPERATIVO (ALERTAS DE RIESGO DE QUIEBRE)"],
        ["Sociedad:", appData.selectedSubsidiary],
        ["Semana:", appData.selectedWeekName],
        ["Fecha de exportación:", dateStrToday],
        [], // Fila en blanco
        [
            "Empresa", 
            "SKU Interno", 
            "Nombre Artículo", 
            "SKU Neto", 
            "Día", 
            "Fecha", 
            "Inv. Inicial", 
            "Demanda OV", 
            "Plan Prod", 
            "Saldo Proy (Déficit)", 
            "Acción Operativa"
        ]
    ];
    
    totalRiskRows.forEach(rd => {
        const actionText = rd.isReal 
            ? "Quiebre Real" 
            : "Turno 1: Producir en 1er turno para embarcar en 2do.";
            
        rows.push([
            rd.subsidiary,
            rd.sku,
            rd.name,
            rd.sku_neto,
            rd.dayName,
            rd.dateStr,
            Math.round(rd.starting_inv),
            Math.round(rd.requested),
            Math.round(rd.prod_plan),
            -Math.round(rd.deficit), // saldo proyectado negativo
            actionText
        ]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    // Estilos de formato numérico de SheetJS
    const dataStartRow = 6;
    const dataEndRow = rows.length - 1;
    
    for (let r = dataStartRow; r <= dataEndRow; r++) {
        // Formato para columnas numéricas: 
        // 6: Inv. Inicial, 7: Demanda OV, 8: Plan Prod, 9: Saldo Proy (Déficit)
        const colsToFormat = [6, 7, 8, 9];
        colsToFormat.forEach(colIndex => {
            const cellAddress = XLSX.utils.encode_cell({ r: r, c: colIndex });
            if (ws[cellAddress]) {
                ws[cellAddress].t = 'n';
                ws[cellAddress].z = '#,##0';
            }
        });
    }
    
    // Configurar anchos de columnas
    ws['!cols'] = [
        { wch: 12 }, // Empresa
        { wch: 12 }, // SKU Interno
        { wch: 32 }, // Nombre Artículo
        { wch: 12 }, // SKU Neto
        { wch: 12 }, // Día
        { wch: 12 }, // Fecha
        { wch: 14 }, // Inv. Inicial
        { wch: 14 }, // Demanda OV
        { wch: 14 }, // Plan Prod
        { wch: 20 }, // Saldo Proy
        { wch: 45 }  // Acción Operativa
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Triage Operativo");
    
    const filename = `Triage_Operativo_${appData.selectedSubsidiary}_${appData.selectedWeekName.replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, filename);
    showNotification("Triage exportado correctamente", "success");
}

// Exportar la Matriz de Planeación Semanal a Excel con formato diario/semanal
function exportMatrixToExcel() {
    if (appData.filteredSkus.length === 0) {
        showNotification("No hay datos de planeación para exportar", "warning");
        return;
    }
    
    const isSummary = appData.selectedDayIndex === 6;
    const dayName = isSummary ? "Semanal" : PLAN_DAY_NAMES[appData.selectedDayIndex];
    const dateStrToday = new Date().toLocaleDateString('es-MX', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });
    
    const rows = [
        [`MATRIZ DE PLANEACIÓN S&OP - VISTA ${dayName.toUpperCase()}`],
        ["Sociedad:", appData.selectedSubsidiary],
        ["Semana:", appData.selectedWeekName],
        isSummary ? ["Detalle:", "Resumen semanal consolidado"] : ["Día:", `${dayName} (${appData.dates[appData.selectedDayIndex]})`],
        ["Fecha de exportación:", dateStrToday],
        [], // Fila en blanco
    ];
    
    let headers = [];
    if (!isSummary) {
        headers = [
            "Empresa",
            "SKU Interno",
            "Nombre Artículo",
            "SKU Neto",
            "Inv. Inicial",
            "Solicitado OV",
            "Emb. Sem. Ant",
            "Emb. Sem. Corr",
            "Ajustes PT",
            "OTIF Diario",
            "Plan Prod",
            "Real Prod",
            "Cumpl. Prod",
            "Inv. Final Teo",
            "Inv. Final Real",
            "Estatus"
        ];
    } else {
        headers = [
            "Empresa",
            "SKU Interno",
            "Nombre Artículo",
            "SKU Neto",
            "Inv. Inicial Sem",
            "Total Solicitado",
            "Total Emb. Sem Ant.",
            "Total Emb. Sem Corr.",
            "Total Ajustes PT",
            "OTIF Semanal",
            "Total Plan Prod",
            "Total Real Prod",
            "Cumpl. Prod",
            "Inv. Final Teorico",
            "Inv. Final Real",
            "Estatus"
        ];
    }
    rows.push(headers);
    
    appData.filteredSkus.forEach(sku => {
        if (!isSummary) {
            const day = sku.days[appData.selectedDayIndex];
            let dailyStatusText = "Sin riesgo";
            if (day.final_inv_real < 0) {
                dailyStatusText = "Quiebre Real";
            } else if (day.final_inv_theoretical < 0) {
                dailyStatusText = "Riesgo Quiebre";
            }
            rows.push([
                sku.subsidiary,
                sku.sku_interno,
                sku.name,
                sku.sku_neto,
                day.initial_inv,
                day.requested_ov,
                day.shipped_prev_week,
                day.shipped_curr_week,
                day.adjustments,
                day.otif, // decimal representation
                day.prod_plan,
                day.prod_real,
                day.prod_compliance, // decimal representation
                Math.round(day.final_inv_theoretical),
                Math.round(day.final_inv_real),
                dailyStatusText
            ]);
        } else {
            const initialInv = sku.days[0].initial_inv;
            
            let requestedTotal = 0;
            let shippedPrevTotal = 0;
            let shippedCurrTotal = 0;
            let adjustmentsTotal = 0;
            let prodPlanTotal = 0;
            let prodRealTotal = 0;
            let daysWithRisks = 0;
            
            sku.days.forEach(day => {
                requestedTotal += day.requested_ov;
                shippedPrevTotal += day.shipped_prev_week;
                shippedCurrTotal += day.shipped_curr_week;
                adjustmentsTotal += day.adjustments;
                prodPlanTotal += day.prod_plan;
                prodRealTotal += day.prod_real;
                if (day.final_inv_theoretical < 0) {
                    daysWithRisks++;
                }
            });
            
            const weeklyOtif = requestedTotal > 0 ? (shippedCurrTotal / requestedTotal) : 1.0;
            const weeklyCompliance = prodPlanTotal > 0 ? (prodRealTotal / prodPlanTotal) : 1.0;
            
            // Fórmulas dinámicas semanales:
            const finalInvTheoretical = initialInv - requestedTotal + prodPlanTotal - adjustmentsTotal;
            const finalInvReal = initialInv - shippedCurrTotal - shippedPrevTotal + prodRealTotal - adjustmentsTotal;
            
            const riskText = daysWithRisks > 0 ? `${daysWithRisks} d con quiebre` : "Sin riesgo";
            
            rows.push([
                sku.subsidiary,
                sku.sku_interno,
                sku.name,
                sku.sku_neto,
                initialInv,
                requestedTotal,
                shippedPrevTotal,
                shippedCurrTotal,
                adjustmentsTotal,
                weeklyOtif,
                prodPlanTotal,
                prodRealTotal,
                weeklyCompliance,
                Math.round(finalInvTheoretical),
                Math.round(finalInvReal),
                riskText
            ]);
        }
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    const dataStartRow = 6;
    const dataEndRow = rows.length - 1;
    
    for (let r = dataStartRow; r <= dataEndRow; r++) {
        if (!isSummary) {
            // Formatos para columnas numéricas diarias:
            const colsInt = [4, 5, 6, 7, 8, 10, 11, 13, 14];
            colsInt.forEach(colIndex => {
                const cellAddress = XLSX.utils.encode_cell({ r: r, c: colIndex });
                if (ws[cellAddress]) {
                    ws[cellAddress].t = 'n';
                    ws[cellAddress].z = '#,##0';
                }
            });
            
            // Formatos para porcentajes:
            const colsPct = [9, 12];
            colsPct.forEach(colIndex => {
                const cellAddress = XLSX.utils.encode_cell({ r: r, c: colIndex });
                if (ws[cellAddress]) {
                    ws[cellAddress].t = 'n';
                    ws[cellAddress].z = '0%';
                }
            });
        } else {
            // Formatos para columnas numéricas semanales:
            const colsInt = [4, 5, 6, 7, 8, 10, 11, 13, 14];
            colsInt.forEach(colIndex => {
                const cellAddress = XLSX.utils.encode_cell({ r: r, c: colIndex });
                if (ws[cellAddress]) {
                    ws[cellAddress].t = 'n';
                    ws[cellAddress].z = '#,##0';
                }
            });
            
            // Formatos para porcentajes semanales:
            const colsPct = [9, 12];
            colsPct.forEach(colIndex => {
                const cellAddress = XLSX.utils.encode_cell({ r: r, c: colIndex });
                if (ws[cellAddress]) {
                    ws[cellAddress].t = 'n';
                    ws[cellAddress].z = '0%';
                }
            });
        }
    }
    
    // Configurar anchos de columnas
    if (!isSummary) {
        ws['!cols'] = [
            { wch: 12 }, // Empresa
            { wch: 12 }, // SKU Interno
            { wch: 32 }, // Nombre Artículo
            { wch: 12 }, // SKU Neto
            { wch: 14 }, // Inv. Inicial
            { wch: 14 }, // Solicitado OV
            { wch: 14 }, // Emb. Sem. Ant
            { wch: 14 }, // Emb. Sem. Corr
            { wch: 14 }, // Ajustes PT
            { wch: 12 }, // OTIF Diario
            { wch: 14 }, // Plan Prod
            { wch: 14 }, // Real Prod
            { wch: 12 }, // Cumpl. Prod
            { wch: 16 }, // Inv. Final Teo
            { wch: 16 }, // Inv. Final Real
            { wch: 18 }  // Estatus
        ];
    } else {
        ws['!cols'] = [
            { wch: 12 }, // Empresa
            { wch: 12 }, // SKU Interno
            { wch: 32 }, // Nombre Artículo
            { wch: 12 }, // SKU Neto
            { wch: 16 }, // Inv. Inicial Sem
            { wch: 16 }, // Total Solicitado
            { wch: 18 }, // Total Emb. Sem Ant.
            { wch: 18 }, // Total Emb. Sem Corr.
            { wch: 16 }, // Total Ajustes PT
            { wch: 14 }, // OTIF Semanal
            { wch: 16 }, // Total Plan Prod
            { wch: 16 }, // Total Real Prod
            { wch: 14 }, // Cumpl. Prod
            { wch: 16 }, // Inv. Final Teorico
            { wch: 16 }, // Inv. Final Real
            { wch: 16 }  // Riesgos
        ];
    }
    
    const sheetName = isSummary ? "Resumen Semanal" : dayName;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    const dayLabel = isSummary ? "Semanal" : dayName;
    const filename = `Matriz_Planeacion_${appData.selectedSubsidiary}_${appData.selectedWeekName.replace(/\s+/g, '_')}_${dayLabel}.xlsx`;
    XLSX.writeFile(wb, filename);
    showNotification("Matriz de planeación exportada correctamente", "success");
}

// Exportar Reporte de Desviaciones a Excel
function exportDeviationsToExcel() {
    if (!appData.abcClassification || !appData.abcClassification.skuList || appData.abcClassification.skuList.length === 0) {
        showNotification("No hay datos de desviaciones para exportar", "warning");
        return;
    }
    
    const dateStrToday = new Date().toLocaleDateString('es-MX', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });
    
    const rows = [
        ["REPORTE DE DESVIACIONES DE VENTA Y PROMEDIOS HISTÓRICOS"],
        ["Sociedad:", appData.selectedSubsidiary],
        ["Semana Activa:", appData.selectedWeekName],
        ["Fecha de exportación:", dateStrToday],
        [], // Fila en blanco
    ];
    
    const headers = [
        "SKU Interno",
        "Nombre Artículo",
        "Pzas por Caja",
        "Hist. Prom. (Cajas)",
        "Hist. Prom. (Pzas)",
        "Hist. Prom. (Dinero)",
        "Ped. Sem. Activa (Cajas)",
        "Ped. Sem. Activa (Pzas)",
        "Venta Sem. Activa ($)",
        "Variación %",
        "Estatus"
    ];
    
    rows.push(headers);
    
    const activeWeek = appData.selectedWeekName;
    const { skuList } = appData.abcClassification;
    const filteredSkuList = skuList.filter(sku => !sku.sku_interno.toUpperCase().startsWith("TIN"));
    
    // Utilizar la misma ordenación que esté activa en la vista
    let sortedList = [...filteredSkuList];
    if (appData.deviationsSortKey) {
        sortedList.sort((a, b) => {
            let valA = getDeviationsSortValue(a, appData.deviationsSortKey);
            let valB = getDeviationsSortValue(b, appData.deviationsSortKey);
            
            if (typeof valA === "string" && typeof valB === "string") {
                return appData.deviationsSortDirection === "asc"
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            } else {
                const aNum = valA === null || isNaN(valA) ? -Infinity : valA;
                const bNum = valB === null || isNaN(valB) ? -Infinity : valB;
                if (aNum === bNum) return 0;
                return appData.deviationsSortDirection === "asc"
                    ? aNum - bNum
                    : bNum - aNum;
            }
        });
    }
    
    let totalHistCajas = 0;
    let totalHistPzas = 0;
    let totalHistDinero = 0;
    let totalActCajas = 0;
    let totalActPzas = 0;
    let totalActDinero = 0;
    
    sortedList.forEach(sku => {
        const activeReq = sku.weeklyDemands[activeWeek] || 0;
        const pzasPorCaja = sku.pzasPorCaja || 1;
        const price = sku.price || 0;
        
        const histCajas = sku.historicalAverage;
        const histPzas = sku.historicalAverage * pzasPorCaja;
        const histDinero = sku.historicalAverage * price;
        const actCajas = activeReq;
        const actPzas = activeReq * pzasPorCaja;
        const actDinero = activeReq * price;
        
        totalHistCajas += histCajas;
        totalHistPzas += histPzas;
        totalHistDinero += histDinero;
        totalActCajas += actCajas;
        totalActPzas += actPzas;
        totalActDinero += actDinero;
        
        const varPct = sku.historicalAverage > 0 ? ((activeReq - sku.historicalAverage) / sku.historicalAverage) : 0;
        const isAlert = varPct * 100 < -30;
        const statusText = isAlert ? "DESVIACIÓN" : "Sin desviación";
        
        rows.push([
            sku.sku_interno,
            sku.name,
            pzasPorCaja,
            histCajas,
            Math.round(histPzas),
            histDinero,
            actCajas,
            Math.round(actPzas),
            actDinero,
            varPct, // Guardar como valor decimal para formatearlo como porcentaje en Excel
            statusText
        ]);
    });
    
    // Totales
    const totalVarPct = totalHistCajas > 0 ? ((totalActCajas - totalHistCajas) / totalHistCajas) : 0;
    const totalStatusText = totalVarPct * 100 < -30 ? "DESVIACIÓN" : "Sin desviación";
    
    rows.push([
        "TOTALES",
        "",
        "",
        totalHistCajas,
        Math.round(totalHistPzas),
        totalHistDinero,
        totalActCajas,
        Math.round(totalActPzas),
        totalActDinero,
        totalVarPct,
        totalStatusText
    ]);
    
    // Construir libro de Excel
    const sheetName = "Desviaciones";
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    // Formatear las columnas numéricas y de porcentaje en Excel
    const range = XLSX.utils.decode_range(ws['!ref']);
    const startDataRow = 5; // Fila 6 (0-indexed es 5) es donde empiezan las cabeceras
    const maxRow = range.e.r;
    
    for (let r = startDataRow + 1; r <= maxRow; r++) {
        // Columna C (2): Pzas por Caja
        const cellC = ws[XLSX.utils.encode_cell({ r, c: 2 })];
        if (cellC && cellC.v !== "") {
            cellC.t = 'n';
            if (cellC.v === "-") {
                cellC.t = 's';
            } else {
                cellC.z = '#,##0';
            }
        }
        
        // Columna D (3): Hist. Prom. (Cajas)
        const cellD = ws[XLSX.utils.encode_cell({ r, c: 3 })];
        if (cellD && cellD.v !== "") {
            cellD.t = 'n';
            cellD.z = '#,##0.0';
        }
        
        // Columna E (4): Hist. Prom. (Pzas)
        const cellE = ws[XLSX.utils.encode_cell({ r, c: 4 })];
        if (cellE && cellE.v !== "") {
            cellE.t = 'n';
            cellE.z = '#,##0';
        }
        
        // Columna F (5): Hist. Prom. ($)
        const cellF = ws[XLSX.utils.encode_cell({ r, c: 5 })];
        if (cellF && cellF.v !== "") {
            cellF.t = 'n';
            cellF.z = '$#,##0.00';
        }
        
        // Columna G (6): Ped. Sem. Activa (Cajas)
        const cellG = ws[XLSX.utils.encode_cell({ r, c: 6 })];
        if (cellG && cellG.v !== "") {
            cellG.t = 'n';
            cellG.z = '#,##0';
        }
        
        // Columna H (7): Ped. Sem. Activa (Pzas)
        const cellH = ws[XLSX.utils.encode_cell({ r, c: 7 })];
        if (cellH && cellH.v !== "") {
            cellH.t = 'n';
            cellH.z = '#,##0';
        }
        
        // Columna I (8): Venta Sem. Activa ($)
        const cellI = ws[XLSX.utils.encode_cell({ r, c: 8 })];
        if (cellI && cellI.v !== "") {
            cellI.t = 'n';
            cellI.z = '$#,##0.00';
        }
        
        // Columna J (9): Variación %
        const cellJ = ws[XLSX.utils.encode_cell({ r, c: 9 })];
        if (cellJ && cellJ.v !== "") {
            cellJ.t = 'n';
            cellJ.z = '0.0%';
        }
    }
    
    // Autoajustar anchos de columnas
    ws['!cols'] = [
        { wch: 15 }, // SKU
        { wch: 35 }, // Artículo
        { wch: 12 }, // Pzas/Caja
        { wch: 18 }, // Hist. Prom (Cajas)
        { wch: 18 }, // Hist. Prom (Pzas)
        { wch: 18 }, // Hist. Prom ($)
        { wch: 22 }, // Ped Activa (Cajas)
        { wch: 22 }, // Ped Activa (Pzas)
        { wch: 22 }, // Venta Activa ($)
        { wch: 12 }, // Var %
        { wch: 15 }  // Estatus
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    const fileName = `CDS_Desviaciones_Venta_${appData.selectedSubsidiary}_${appData.selectedWeekName.replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showNotification(`Reporte de Desviaciones exportado con éxito`, "success");
}

// ==========================================================================
// FUNCIONES DE CONTROL DE COMENTARIOS S&OP (HILO DE MULTICOMENTARIOS)
// ==========================================================================

// Configurar listeners de interacción para los comentarios
function setupCommentEvents() {
    ['kpi', 'triage', 'matrix'].forEach(section => {
        const textEl = document.getElementById(`comment-${section}-text`);
        const addBtn = document.getElementById(`add-comment-${section}-btn`);
        
        if (textEl && addBtn) {
            // Habilitar menciones @
            enableMentionsAutocomplete(textEl);

            // Evento al escribir: marcar como modificado/sucio
            textEl.addEventListener('input', () => {
                const statusEl = document.getElementById(`comment-${section}-status`);
                const statusText = statusEl ? statusEl.querySelector('.comment-status-text') : null;
                if (statusEl) {
                    statusEl.className = "comment-status dirty";
                    if (statusText) statusText.textContent = "Borrador activo";
                }
            });
            
            // Evento al hacer clic en guardar
            addBtn.addEventListener('click', () => {
                const commentText = textEl.value.trim();
                if (commentText === "") return;
                addComment(section, commentText);
            });
        }
    });
    
    // Inicializar eventos de chat SKU
    setupSkuCommentEvents();
}

// Cargar comentarios correspondientes al filtro seleccionado
async function loadComments() {
    const week = appData.selectedWeekName;
    const subsidiary = appData.selectedSubsidiary;
    
    if (!week || !subsidiary) return;
    
    const sections = ['kpi', 'triage', 'matrix'];
    const isVisor = loggedInUser && loggedInUser.role === 'visor';
    
    // 1. Mostrar estado de carga inicial en la interfaz
    sections.forEach(sec => {
        const listEl = document.getElementById(`comments-${sec}-list`);
        const statusEl = document.getElementById(`comment-${sec}-status`);
        const statusText = statusEl ? statusEl.querySelector('.comment-status-text') : null;
        const inputArea = document.getElementById(`comment-${sec}-input-area`);
        const textEl = document.getElementById(`comment-${sec}-text`);
        
        if (textEl) {
            textEl.disabled = true;
            textEl.value = "";
        }
        if (statusEl) {
            statusEl.className = "comment-status saving";
            if (statusText) statusText.textContent = "Cargando...";
        }
        if (listEl) {
            listEl.innerHTML = `<div class="comments-empty-state" style="border-style: none;">Cargando comentarios...</div>`;
        }
    });

    let dbComments = { kpi: [], triage: [], matrix: [] };
    let loadedFromDb = false;

    // 2. Intentar descargar de Supabase si está disponible
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('comentarios_sop')
                .select('id, section, comment, user_owner, created_at')
                .eq('subsidiary', subsidiary)
                .eq('week', week);
            
            if (!error && data) {
                data.forEach(row => {
                    if (dbComments[row.section]) {
                        dbComments[row.section].push(row);
                    }
                });
                loadedFromDb = true;
            } else if (error) {
                console.warn("No se pudieron obtener comentarios de Supabase, usando localstorage fallback:", error);
            }
        } catch (e) {
            console.error("Error al conectar con Supabase para cargar comentarios:", e);
        }
    }

    // 3. Renderizar cada sección con su respectiva información
    sections.forEach(sec => {
        const listEl = document.getElementById(`comments-${sec}-list`);
        const statusEl = document.getElementById(`comment-${sec}-status`);
        const statusText = statusEl ? statusEl.querySelector('.comment-status-text') : null;
        const inputArea = document.getElementById(`comment-${sec}-input-area`);
        const textEl = document.getElementById(`comment-${sec}-text`);
        
        let commentsList = [];
        let isLocalFallback = false;

        if (loadedFromDb) {
            commentsList = dbComments[sec] || [];
        } else {
            // Cargar de localStorage
            const localKey = `sop_comments_${subsidiary}_${week}_${sec}`;
            const localDataStr = localStorage.getItem(localKey);
            if (localDataStr) {
                try {
                    commentsList = JSON.parse(localDataStr);
                    if (!Array.isArray(commentsList)) commentsList = [];
                    isLocalFallback = true;
                } catch(e) {
                    console.warn("Error parseando comentarios de localStorage:", e);
                }
            }
        }

        // Ordenar por fecha cronológica ascendente
        commentsList.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        if (listEl) {
            listEl.innerHTML = "";
            if (commentsList.length === 0) {
                listEl.innerHTML = `<div class="comments-empty-state">No hay comentarios registrados para esta sección en esta semana.</div>`;
            } else {
                commentsList.forEach(comment => {
                    const item = document.createElement("div");
                    item.className = "comment-item";
                    item.id = `comment-item-${comment.id}`;
                    
                    const dateObj = new Date(comment.created_at);
                    const formattedDate = isNaN(dateObj.getTime()) 
                        ? "Fecha reciente" 
                        : dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) + " " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    const isOwner = loggedInUser && (loggedInUser.username === comment.user_owner || loggedInUser.role === 'admin');
                    
                    let actionsHtml = "";
                    if (isOwner && !isVisor) {
                        actionsHtml = `
                            <div class="comment-item-actions">
                                <button class="comment-action-link edit-link" data-comment-id="${comment.id}">Editar</button>
                                <button class="comment-action-link delete delete-link" data-comment-id="${comment.id}">Eliminar</button>
                            </div>
                        `;
                    }

                    item.innerHTML = `
                        <div class="comment-item-header">
                            <div class="comment-item-meta">
                                <span class="comment-item-author">${comment.user_owner}</span>
                                <span class="comment-item-time">${formattedDate}</span>
                            </div>
                            ${actionsHtml}
                        </div>
                        <div class="comment-item-body" id="comment-body-${comment.id}">${comment.comment}</div>
                    `;
                    
                    // Enlazar botones
                    const editBtn = item.querySelector(".edit-link");
                    const deleteBtn = item.querySelector(".delete-link");
                    
                    if (editBtn) {
                        editBtn.addEventListener("click", () => {
                            toggleInlineEdit(comment.id, sec);
                        });
                    }
                    
                    if (deleteBtn) {
                        deleteBtn.addEventListener("click", () => {
                            if (confirm("¿Estás seguro de que deseas eliminar este comentario?")) {
                                deleteComment(comment.id, sec);
                            }
                        });
                    }

                    listEl.appendChild(item);
                });
                
                // Hacer scroll al final de la lista para ver el último comentario
                setTimeout(() => {
                    listEl.scrollTop = listEl.scrollHeight;
                }, 50);
            }
        }

        // Configurar el área de entrada
        if (textEl) {
            textEl.value = "";
            textEl.disabled = false;
            textEl.readOnly = false;
        }

        if (inputArea) {
            inputArea.style.display = isVisor ? "none" : "flex";
        }

        // Configurar estatus
        if (statusEl) {
            statusEl.className = "comment-status saved";
            const finalStatusText = isVisor ? "Solo lectura" : (loadedFromDb ? "Sincronizado" : "Borradores locales");
            if (statusText) statusText.textContent = finalStatusText;
        }
    });
    
    // Cargar contadores de comentarios de todos los SKU
    await loadSkuCommentCounts();
}

// Agregar nuevo comentario
async function addComment(section, commentText) {
    const week = appData.selectedWeekName;
    const subsidiary = appData.selectedSubsidiary;
    const textEl = document.getElementById(`comment-${section}-text`);
    const statusEl = document.getElementById(`comment-${section}-status`);
    const statusText = statusEl ? statusEl.querySelector('.comment-status-text') : null;
    const addBtn = document.getElementById(`add-comment-${section}-btn`);

    if (!week || !subsidiary || !textEl) return;

    // 1. Mostrar estado "Guardando..."
    if (statusEl) {
        statusEl.className = "comment-status saving";
        if (statusText) statusText.textContent = "Guardando...";
    }
    if (addBtn) addBtn.disabled = true;

    const username = loggedInUser ? loggedInUser.username : 'desconocido';
    const newCommentId = Date.now(); // ID temporal para fallback local
    const createdAtIso = new Date().toISOString();

    // 2. Guardar en localStorage de inmediato
    const localKey = `sop_comments_${subsidiary}_${week}_${section}`;
    let localComments = [];
    try {
        const existingLocal = localStorage.getItem(localKey);
        if (existingLocal) {
            localComments = JSON.parse(existingLocal);
            if (!Array.isArray(localComments)) localComments = [];
        }
    } catch (e) {
        console.warn("Error leyendo comments de localStorage:", e);
    }
    
    const newCommentObj = {
        id: newCommentId,
        subsidiary,
        week,
        section,
        comment: commentText,
        user_owner: username,
        created_at: createdAtIso
    };
    localComments.push(newCommentObj);
    localStorage.setItem(localKey, JSON.stringify(localComments));

    let savedInDb = false;

    // 3. Guardar en Supabase
    if (supabaseClient) {
        try {
            const { error: insertError } = await supabaseClient
                .from('comentarios_sop')
                .insert([{ 
                    subsidiary, 
                    week, 
                    section, 
                    comment: commentText, 
                    user_owner: username 
                }]);
            
            if (insertError) throw insertError;
            savedInDb = true;
        } catch (e) {
            console.error("Error al guardar comentario en Supabase:", e);
        }
    }

    // 4. Actualizar estado y recargar
    textEl.value = "";
    if (addBtn) addBtn.disabled = false;

    if (statusEl) {
        statusEl.className = "comment-status saved";
        if (statusText) statusText.textContent = savedInDb ? "Sincronizado" : "Borradores locales";
    }

    await loadComments();
    
    // Escanear y registrar menciones
    await handleCommentMentions(commentText, section, null);

    showNotification(
        savedInDb ? "Comentario publicado correctamente" : "Comentario guardado localmente (Offline)", 
        "success"
    );
}

// Activar la edición inline de un comentario de la lista
function toggleInlineEdit(commentId, section) {
    const bodyEl = document.getElementById(`comment-body-${commentId}`);
    if (!bodyEl) return;
    
    // Evitar múltiples áreas de edición
    if (bodyEl.querySelector('.comment-item-edit-area')) return;

    const currentText = bodyEl.textContent;
    bodyEl.innerHTML = `
        <div class="comment-item-edit-area">
            <textarea class="comment-item-edit-textarea" id="edit-textarea-${commentId}">${currentText}</textarea>
            <div class="comment-item-edit-buttons">
                <button class="btn btn-outline cancel-edit-btn" style="padding: 4px 8px; font-size: 11px; height: 26px;">Cancelar</button>
                <button class="comment-save-btn save-edit-btn" style="padding: 4px 10px; font-size: 11px; height: 26px;">Guardar</button>
            </div>
        </div>
    `;
    
    const cancelBtn = bodyEl.querySelector(".cancel-edit-btn");
    const saveBtn = bodyEl.querySelector(".save-edit-btn");
    const textarea = bodyEl.querySelector(".comment-item-edit-textarea");
    
    if (textarea) {
        textarea.focus();
        enableMentionsAutocomplete(textarea);
    }
    
    cancelBtn.addEventListener("click", () => {
        bodyEl.innerHTML = currentText;
    });
    
    saveBtn.addEventListener("click", () => {
        const newText = textarea.value.trim();
        if (newText === "") return;
        updateComment(commentId, newText, section);
    });
}

// Actualizar un comentario modificado
async function updateComment(commentId, newText, section) {
    const week = appData.selectedWeekName;
    const subsidiary = appData.selectedSubsidiary;
    const statusEl = document.getElementById(`comment-${section}-status`);
    const statusText = statusEl ? statusEl.querySelector('.comment-status-text') : null;

    if (!week || !subsidiary) return;

    if (statusEl) {
        statusEl.className = "comment-status saving";
        if (statusText) statusText.textContent = "Actualizando...";
    }

    // 1. Guardar en localStorage
    const localKey = `sop_comments_${subsidiary}_${week}_${section}`;
    let localComments = [];
    try {
        const existingLocal = localStorage.getItem(localKey);
        if (existingLocal) {
            localComments = JSON.parse(existingLocal);
        }
    } catch(e) {}
    
    let updatedLocal = false;
    localComments = localComments.map(c => {
        if (String(c.id) === String(commentId)) {
            c.comment = newText;
            c.updated_at = new Date().toISOString();
            updatedLocal = true;
        }
        return c;
    });
    
    if (updatedLocal) {
        localStorage.setItem(localKey, JSON.stringify(localComments));
    }

    let updatedInDb = false;

    // 2. Guardar en Supabase
    if (supabaseClient) {
        try {
            const queryId = isNaN(commentId) ? commentId : parseInt(commentId, 10);
            const { error: updateError } = await supabaseClient
                .from('comentarios_sop')
                .update({ 
                    comment: newText,
                    created_at: new Date().toISOString()
                })
                .eq('id', queryId);

            if (updateError) throw updateError;
            updatedInDb = true;
        } catch (e) {
            console.error("Error al actualizar comentario en Supabase:", e);
        }
    }

    if (statusEl) {
        statusEl.className = "comment-status saved";
        if (statusText) statusText.textContent = updatedInDb ? "Sincronizado" : "Borradores locales";
    }

    await loadComments();
    showNotification("Comentario actualizado correctamente", "success");
}

// Eliminar un comentario
async function deleteComment(commentId, section) {
    const week = appData.selectedWeekName;
    const subsidiary = appData.selectedSubsidiary;
    const statusEl = document.getElementById(`comment-${section}-status`);
    const statusText = statusEl ? statusEl.querySelector('.comment-status-text') : null;

    if (!week || !subsidiary) return;

    if (statusEl) {
        statusEl.className = "comment-status saving";
        if (statusText) statusText.textContent = "Eliminando...";
    }

    // 1. Eliminar de localStorage
    const localKey = `sop_comments_${subsidiary}_${week}_${section}`;
    let localComments = [];
    try {
        const existingLocal = localStorage.getItem(localKey);
        if (existingLocal) {
            localComments = JSON.parse(existingLocal);
        }
    } catch(e) {}
    
    localComments = localComments.filter(c => String(c.id) !== String(commentId));
    localStorage.setItem(localKey, JSON.stringify(localComments));

    let deletedInDb = false;

    // 2. Eliminar de Supabase
    if (supabaseClient) {
        try {
            const queryId = isNaN(commentId) ? commentId : parseInt(commentId, 10);
            const { error: deleteError } = await supabaseClient
                .from('comentarios_sop')
                .delete()
                .eq('id', queryId);

            if (deleteError) throw deleteError;
            deletedInDb = true;
        } catch (e) {
            console.error("Error al eliminar comentario de Supabase:", e);
        }
    }

    if (statusEl) {
        statusEl.className = "comment-status saved";
        if (statusText) statusText.textContent = deletedInDb ? "Sincronizado" : "Borradores locales";
    }

    await loadComments();
    showNotification("Comentario eliminado correctamente", "success");
}

// ==========================================================================
// CAPACIDAD: CHAT DE COLABORACIÓN Y COMENTARIOS POR SKU
// ==========================================================================

let activeSkuChat = { sku: null, name: null, subsidiary: null };
let skuCommentCounts = {};
let selectedSkuChatFile = null;

// Variables de menciones y notificaciones
let allUsersCached = [];
let mentionActiveTextarea = null;
let mentionSearchQuery = "";
let mentionStartIndex = -1;
let mentionSelectedIndex = 0;
let notificationPollInterval = null;

// Configurar eventos para el chat del SKU
function setupSkuCommentEvents() {
    const modal = document.getElementById("sku-comments-modal");
    const closeBtn = document.getElementById("close-sku-comments-btn");
    const attachBtn = document.getElementById("sku-chat-attach-btn");
    const fileInput = document.getElementById("sku-chat-file-input");
    const removeImgBtn = document.getElementById("remove-sku-chat-image-btn");
    const sendBtn = document.getElementById("sku-chat-send-btn");
    const chatInput = document.getElementById("sku-chat-input");

    if (closeBtn && modal) {
        closeBtn.addEventListener("click", () => {
            modal.style.display = "none";
            clearSkuChatInputs();
        });
    }

    if (attachBtn && fileInput) {
        attachBtn.addEventListener("click", () => {
            fileInput.click();
        });
    }

    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                selectedSkuChatFile = file;
                const previewContainer = document.getElementById("sku-chat-image-preview-container");
                const previewImg = document.getElementById("sku-chat-image-preview");
                const previewName = document.getElementById("sku-chat-image-name");

                if (previewContainer && previewImg && previewName) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        previewImg.src = event.target.result;
                        previewName.textContent = file.name;
                        previewContainer.style.display = "flex";
                    };
                    reader.readAsDataURL(file);
                }
            }
        });
    }

    if (removeImgBtn) {
        removeImgBtn.addEventListener("click", () => {
            clearSkuChatImageSelection();
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener("click", () => {
            sendSkuComment();
        });
    }

    if (chatInput) {
        enableMentionsAutocomplete(chatInput);
        chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                const dropdown = document.getElementById("mention-suggestions-dropdown");
                if (dropdown && dropdown.style.display !== "none") {
                    // Si el menú de menciones está abierto, no enviar mensaje con Enter
                    return;
                }
                e.preventDefault();
                sendSkuComment();
            }
        });
    }
}

// Limpiar la imagen seleccionada y su vista previa
function clearSkuChatImageSelection() {
    selectedSkuChatFile = null;
    const fileInput = document.getElementById("sku-chat-file-input");
    if (fileInput) fileInput.value = "";
    
    const previewContainer = document.getElementById("sku-chat-image-preview-container");
    const previewImg = document.getElementById("sku-chat-image-preview");
    if (previewContainer) previewContainer.style.display = "none";
    if (previewImg) previewImg.src = "";
}

// Limpiar todos los campos de entrada del chat
function clearSkuChatInputs() {
    const chatInput = document.getElementById("sku-chat-input");
    if (chatInput) {
        chatInput.value = "";
        chatInput.style.height = "36px";
    }
    clearSkuChatImageSelection();
}

// Abrir el modal del chat para un SKU específico
async function openSkuChat(sku, name, subsidiary) {
    activeSkuChat = { sku, name, subsidiary };
    
    const modal = document.getElementById("sku-comments-modal");
    const titleEl = document.getElementById("sku-comments-title");
    const subtitleEl = document.getElementById("sku-comments-subtitle");
    
    if (titleEl) titleEl.textContent = `Chat de SKU: ${sku}`;
    if (subtitleEl) subtitleEl.textContent = `${name} (${subsidiary})`;
    
    if (modal) {
        modal.style.display = "flex";
    }
    
    clearSkuChatInputs();
    await loadSkuChatHistory(sku, subsidiary);
}

// Cargar el historial completo de comentarios del SKU
async function loadSkuChatHistory(sku, subsidiary) {
    const listEl = document.getElementById("sku-chat-messages");
    if (!listEl) return;
    
    listEl.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px;">Cargando historial de chat...</div>`;
    
    let comments = [];
    let loadedFromDb = false;
    
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('comentarios_sku')
                .select('*')
                .eq('sku', sku)
                .eq('subsidiary', subsidiary)
                .order('created_at', { ascending: true });
                
            if (!error && data) {
                comments = data;
                loadedFromDb = true;
            } else if (error) {
                console.warn("Error fetching SKU comments from Supabase, using localStorage:", error);
            }
        } catch (e) {
            console.error("Error connecting to Supabase for SKU comments:", e);
        }
    }
    
    if (!loadedFromDb) {
        const localKey = `sop_sku_comments_${subsidiary}_${sku}`;
        try {
            const dataStr = localStorage.getItem(localKey);
            if (dataStr) {
                comments = JSON.parse(dataStr);
                if (!Array.isArray(comments)) comments = [];
            }
        } catch(e) {
            console.error("Error reading SKU comments from localStorage:", e);
        }
    }
    
    // Ordenar cronológicamente ascendente
    comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    listEl.innerHTML = "";
    if (comments.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 40px 20px; font-style: italic;">No hay comentarios registrados para este artículo.<br>Sé el primero en agregar una nota u observación.</div>`;
        return;
    }
    
    comments.forEach(comment => {
        const item = document.createElement("div");
        item.className = "sku-chat-bubble";
        
        const dateObj = new Date(comment.created_at);
        const formattedDate = isNaN(dateObj.getTime())
            ? "Reciente"
            : dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) + " " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
        let imageHtml = "";
        if (comment.image_url) {
            imageHtml = `
                <div class="sku-chat-image-attachment" onclick="window.open('${comment.image_url}', '_blank')">
                    <img src="${comment.image_url}" alt="Adjunto de SKU">
                </div>
            `;
        }
        
        const isOwner = loggedInUser && (loggedInUser.username === comment.user_owner || loggedInUser.role === 'admin');
        let actionsHtml = "";
        if (isOwner) {
            actionsHtml = `
                <div style="display: flex; gap: 8px;">
                    <button class="edit-sku-comment-btn" style="background:none; border:none; padding:0; font-size:10px; color:var(--text-secondary); cursor:pointer; font-weight: 500;">Editar</button>
                    <button class="delete-sku-comment-btn" style="background:none; border:none; padding:0; font-size:10px; color:var(--neon-red); cursor:pointer; font-weight: 500;">Eliminar</button>
                </div>
            `;
        }
        
        item.innerHTML = `
            <div class="sku-chat-meta-header">
                <div class="sku-chat-author-info">
                    <span class="sku-chat-author-name">${comment.user_owner}</span>
                    <span class="cell-badge cell-neutral sku-chat-week-badge">${comment.week}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="sku-chat-timestamp">${formattedDate}</span>
                    ${actionsHtml}
                </div>
            </div>
            <div class="sku-chat-comment-text" id="sku-comment-body-${comment.id}">${comment.comment}</div>
            ${imageHtml}
        `;
        
        const editBtn = item.querySelector(".edit-sku-comment-btn");
        const deleteBtn = item.querySelector(".delete-sku-comment-btn");
        
        if (editBtn) {
            editBtn.addEventListener("click", () => {
                toggleSkuInlineEdit(comment.id);
            });
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener("click", () => {
                if (confirm("¿Estás seguro de que deseas eliminar este comentario?")) {
                    deleteSkuComment(comment.id);
                }
            });
        }
        
        listEl.appendChild(item);
    });
    
    // Auto scroll al fondo
    setTimeout(() => {
        listEl.scrollTop = listEl.scrollHeight;
    }, 50);
}

// Enviar un nuevo comentario de SKU
async function sendSkuComment() {
    const chatInput = document.getElementById("sku-chat-input");
    const sendBtn = document.getElementById("sku-chat-send-btn");
    
    if (!chatInput || !sendBtn) return;
    
    const text = chatInput.value.trim();
    if (text === "" && !selectedSkuChatFile) return;
    
    const { sku, name, subsidiary } = activeSkuChat;
    if (!sku || !subsidiary) return;
    
    sendBtn.disabled = true;
    chatInput.disabled = true;
    
    const username = loggedInUser ? loggedInUser.username : 'desconocido';
    const week = appData.selectedWeekName || 'Semana N/A';
    const createdAt = new Date().toISOString();
    
    showNotification("Enviando comentario...", "info");
    
    let uploadedUrl = null;
    if (selectedSkuChatFile) {
        uploadedUrl = await uploadSkuChatImage(selectedSkuChatFile, sku, subsidiary);
    }
    
    const newCommentObj = {
        sku,
        subsidiary,
        week,
        comment: text,
        user_owner: username,
        created_at: createdAt,
        image_url: uploadedUrl
    };
    
    let savedInDb = false;
    
    // Guardar en Supabase
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('comentarios_sku')
                .insert([{
                    sku,
                    subsidiary,
                    week,
                    comment: text,
                    user_owner: username,
                    image_url: uploadedUrl
                }]);
                
            if (!error) {
                savedInDb = true;
            } else {
                console.error("Error inserting SKU comment to Supabase:", error);
            }
        } catch(e) {
            console.error("Database connection exception for SKU comment:", e);
        }
    }
    
    // Guardar copia local de respaldo
    const localKey = `sop_sku_comments_${subsidiary}_${sku}`;
    try {
        let localComments = [];
        const existing = localStorage.getItem(localKey);
        if (existing) {
            localComments = JSON.parse(existing);
            if (!Array.isArray(localComments)) localComments = [];
        }
        localComments.push({
            ...newCommentObj,
            id: Date.now()
        });
        localStorage.setItem(localKey, JSON.stringify(localComments));
    } catch(e) {
        console.warn("Failed to write SKU comment backup to localStorage:", e);
    }
    
    // Actualizar conteo localmente
    skuCommentCounts[sku] = (skuCommentCounts[sku] || 0) + 1;
    
    // Limpiar entrada
    clearSkuChatInputs();
    
    chatInput.disabled = false;
    sendBtn.disabled = false;
    
    await loadSkuChatHistory(sku, subsidiary);
    
    // Escanear y registrar menciones
    await handleCommentMentions(text, 'sku', sku);
    
    // Refrescar tabla para actualizar insignias
    renderGridTable();
    
    showNotification(
        savedInDb ? "Comentario publicado correctamente" : "Comentario guardado localmente (Offline)", 
        "success"
    );
}

// Subir imagen del chat a Supabase Storage con fallback base64
async function uploadSkuChatImage(file, sku, subsidiary) {
    if (!supabaseClient) {
        // Fallback a base64
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${sku}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        const filePath = `${subsidiary}/${fileName}`;

        const { data, error } = await supabaseClient
            .storage
            .from('sku_comments_images')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.warn("Supabase storage upload error, using base64 fallback:", error);
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
        }

        // Obtener URL pública
        const { data: publicUrlData } = supabaseClient
            .storage
            .from('sku_comments_images')
            .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
    } catch (e) {
        console.error("Storage upload exception, using base64 fallback:", e);
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }
}

// Cargar contadores de comentarios de todos los SKU
async function loadSkuCommentCounts() {
    const subsidiary = appData.selectedSubsidiary;
    if (!subsidiary) return;

    skuCommentCounts = {};

    // 1. Intentar cargar de Supabase
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('comentarios_sku')
                .select('sku')
                .eq('subsidiary', subsidiary);
            
            if (!error && data) {
                data.forEach(row => {
                    skuCommentCounts[row.sku] = (skuCommentCounts[row.sku] || 0) + 1;
                });
                return;
            }
        } catch(e) {
            console.error("Error loading SKU comment counts from Supabase:", e);
        }
    }

    // 2. Fallback: buscar en localStorage
    try {
        const prefix = `sop_sku_comments_${subsidiary}_`;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                const sku = key.substring(prefix.length);
                const dataStr = localStorage.getItem(key);
                if (dataStr) {
                    const comments = JSON.parse(dataStr);
                    if (Array.isArray(comments)) {
                        skuCommentCounts[sku] = comments.length;
                    }
                }
            }
        }
    } catch(e) {
        console.warn("Error scanning localStorage for SKU comment counts:", e);
    }
}

// Activar edición inline de un comentario de SKU
function toggleSkuInlineEdit(commentId) {
    const bodyEl = document.getElementById(`sku-comment-body-${commentId}`);
    if (!bodyEl) return;
    
    if (bodyEl.querySelector('.comment-item-edit-area')) return;
    
    const currentText = bodyEl.textContent;
    bodyEl.innerHTML = `
        <div class="comment-item-edit-area" style="margin-top: 6px;">
            <textarea class="comment-item-edit-textarea" id="sku-edit-textarea-${commentId}" style="width:100%; min-height:40px; font-size:12px; padding:6px; border:1px solid var(--border-color); border-radius:4px; font-family:var(--font-sans); outline:none;">${currentText}</textarea>
            <div class="comment-item-edit-buttons" style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                <button class="btn btn-outline cancel-edit-btn" style="padding: 2px 6px; font-size: 10px; height: 22px; line-height:1;">Cancelar</button>
                <button class="comment-save-btn save-edit-btn" style="padding: 2px 8px; font-size: 10px; height: 22px; line-height:1; background-color: var(--neon-cyan); border-color: var(--neon-cyan); color: white; border-radius: 4px; border: none; cursor:pointer;">Guardar</button>
            </div>
        </div>
    `;
    
    const cancelBtn = bodyEl.querySelector(".cancel-edit-btn");
    const saveBtn = bodyEl.querySelector(".save-edit-btn");
    const textarea = bodyEl.querySelector(".comment-item-edit-textarea");
    
    if (textarea) {
        textarea.focus();
        enableMentionsAutocomplete(textarea);
    }
    
    cancelBtn.addEventListener("click", () => {
        bodyEl.innerHTML = currentText;
    });
    
    saveBtn.addEventListener("click", () => {
        const newText = textarea.value.trim();
        if (newText === "") return;
        updateSkuComment(commentId, newText);
    });
}

// Actualizar comentario modificado de SKU
async function updateSkuComment(commentId, newText) {
    const { sku, subsidiary } = activeSkuChat;
    if (!sku || !subsidiary) return;
    
    let updatedInDb = false;
    
    // 1. Guardar en Supabase
    if (supabaseClient) {
        try {
            const queryId = isNaN(commentId) ? commentId : parseInt(commentId, 10);
            const { error } = await supabaseClient
                .from('comentarios_sku')
                .update({ comment: newText })
                .eq('id', queryId);
                
            if (!error) {
                updatedInDb = true;
            } else {
                console.error("Error updating SKU comment in Supabase:", error);
            }
        } catch (e) {
            console.error("Database error updating SKU comment:", e);
        }
    }
    
    // 2. Guardar en localStorage
    const localKey = `sop_sku_comments_${subsidiary}_${sku}`;
    try {
        let localComments = [];
        const existing = localStorage.getItem(localKey);
        if (existing) {
            localComments = JSON.parse(existing);
        }
        
        let updatedLocal = false;
        localComments = localComments.map(c => {
            if (String(c.id) === String(commentId)) {
                c.comment = newText;
                updatedLocal = true;
            }
            return c;
        });
        
        if (updatedLocal) {
            localStorage.setItem(localKey, JSON.stringify(localComments));
        }
    } catch(e) {
        console.warn("Failed to update SKU comment in localStorage:", e);
    }
    
    await loadSkuChatHistory(sku, subsidiary);
    showNotification("Comentario de SKU actualizado", "success");
}

// Eliminar un comentario de SKU
async function deleteSkuComment(commentId) {
    const { sku, subsidiary } = activeSkuChat;
    if (!sku || !subsidiary) return;
    
    let deletedInDb = false;
    
    // 1. Eliminar de Supabase
    if (supabaseClient) {
        try {
            const queryId = isNaN(commentId) ? commentId : parseInt(commentId, 10);
            const { error } = await supabaseClient
                .from('comentarios_sku')
                .delete()
                .eq('id', queryId);
                
            if (!error) {
                deletedInDb = true;
            } else {
                console.error("Error deleting SKU comment from Supabase:", error);
            }
        } catch(e) {
            console.error("Database error deleting SKU comment:", e);
        }
    }
    
    // 2. Eliminar de localStorage
    const localKey = `sop_sku_comments_${subsidiary}_${sku}`;
    try {
        let localComments = [];
        const existing = localStorage.getItem(localKey);
        if (existing) {
            localComments = JSON.parse(existing);
        }
        
        const beforeLen = localComments.length;
        localComments = localComments.filter(c => String(c.id) !== String(commentId));
        
        if (localComments.length !== beforeLen) {
            localStorage.setItem(localKey, JSON.stringify(localComments));
        }
    } catch(e) {
        console.warn("Failed to delete SKU comment from localStorage:", e);
    }
    
    // Actualizar conteo localmente
    skuCommentCounts[sku] = Math.max(0, (skuCommentCounts[sku] || 1) - 1);
    
    await loadSkuChatHistory(sku, subsidiary);
    
    // Refrescar tabla para actualizar insignias
    renderGridTable();
    
    showNotification("Comentario de SKU eliminado", "success");
}

// Cargar lista completa de usuarios para menciones
async function loadUsersForMentions() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('usuarios')
            .select('username, role, companies');
        if (!error && data) {
            allUsersCached = data;
        }
    } catch(e) {
        console.error("Error al cargar usuarios para menciones:", e);
    }
}

// Habilitar autocompletado de menciones @ en un textarea
function enableMentionsAutocomplete(textarea) {
    if (!textarea) return;
    
    // Evitar doble vinculación
    if (textarea.dataset.mentionsEnabled) return;
    textarea.dataset.mentionsEnabled = "true";
    
    textarea.addEventListener("input", (e) => {
        const text = textarea.value;
        const selectionEnd = textarea.selectionEnd;
        
        const textBeforeCursor = text.substring(0, selectionEnd);
        const lastSpace = Math.max(textBeforeCursor.lastIndexOf(" "), textBeforeCursor.lastIndexOf("\n"));
        const currentWord = textBeforeCursor.substring(lastSpace + 1);
        
        if (currentWord.startsWith("@")) {
            mentionActiveTextarea = textarea;
            mentionStartIndex = lastSpace + 1;
            mentionSearchQuery = currentWord.substring(1);
            showMentionDropdown(textarea, mentionSearchQuery);
        } else {
            hideMentionDropdown();
        }
    });
    
    textarea.addEventListener("keydown", (e) => {
        const dropdown = document.getElementById("mention-suggestions-dropdown");
        if (!dropdown || dropdown.style.display === "none") return;
        
        const items = dropdown.querySelectorAll(".mention-item");
        if (items.length === 0) return;
        
        if (e.key === "ArrowDown") {
            e.preventDefault();
            mentionSelectedIndex = (mentionSelectedIndex + 1) % items.length;
            updateMentionSelection(items);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            mentionSelectedIndex = (mentionSelectedIndex - 1 + items.length) % items.length;
            updateMentionSelection(items);
        } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertSelectedMention(items[mentionSelectedIndex].dataset.username);
        } else if (e.key === "Escape") {
            e.preventDefault();
            hideMentionDropdown();
        }
    });
    
    textarea.addEventListener("blur", () => {
        setTimeout(() => {
            hideMentionDropdown();
        }, 200);
    });
}

// Mostrar el menú flotante con las sugerencias de menciones
function showMentionDropdown(textarea, query) {
    const dropdown = document.getElementById("mention-suggestions-dropdown");
    if (!dropdown) return;
    
    const company = appData.selectedSubsidiary;
    if (!company) return;
    
    // Filtrar usuarios de la empresa actual (o administradores)
    const filteredUsers = allUsersCached.filter(u => {
        const matchesCompany = u.companies && (u.companies.includes(company) || u.role === 'admin');
        const matchesQuery = u.username.toLowerCase().includes(query.toLowerCase());
        const isSelf = loggedInUser && u.username === loggedInUser.username;
        return matchesCompany && matchesQuery && !isSelf;
    });
    
    if (filteredUsers.length === 0) {
        dropdown.style.display = "none";
        return;
    }
    
    mentionSelectedIndex = 0;
    dropdown.innerHTML = "";
    
    filteredUsers.forEach((user, index) => {
        const item = document.createElement("div");
        item.className = `mention-item ${index === 0 ? 'active' : ''}`;
        item.dataset.username = user.username;
        
        const roleLabels = {
            admin: "Director",
            gerente: "Gerente",
            user: "Operador",
            visor: "Visor"
        };
        const roleText = roleLabels[user.role] || user.role;
        
        item.innerHTML = `
            <span style="font-weight: 600;">@${user.username}</span>
            <span class="mention-role-badge" style="background-color: ${user.role === 'admin' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(26, 115, 232, 0.1)'}; color: ${user.role === 'admin' ? 'var(--ai-purple)' : 'var(--neon-cyan)'};">${roleText}</span>
        `;
        
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            insertSelectedMention(user.username);
        });
        
        dropdown.appendChild(item);
    });
    
    const rect = textarea.getBoundingClientRect();
    dropdown.style.left = `${rect.left + window.scrollX}px`;
    dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.display = "flex";
}

// Actualizar el elemento de mención activo en la lista
function updateMentionSelection(items) {
    items.forEach((item, index) => {
        if (index === mentionSelectedIndex) {
            item.classList.add("active");
            item.scrollIntoView({ block: "nearest" });
        } else {
            item.classList.remove("active");
        }
    });
}

// Insertar la mención seleccionada en el textarea
function insertSelectedMention(username) {
    if (!mentionActiveTextarea) return;
    
    const textarea = mentionActiveTextarea;
    const text = textarea.value;
    const selectionEnd = textarea.selectionEnd;
    
    const before = text.substring(0, mentionStartIndex);
    const after = text.substring(selectionEnd);
    
    const mentionString = `@${username} `;
    textarea.value = before + mentionString + after;
    
    textarea.focus();
    const newCursorPos = mentionStartIndex + mentionString.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    
    // Redimensionar si es un auto-expanding textarea
    if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.style.height = "";
        textarea.style.height = textarea.scrollHeight + "px";
    }
    
    hideMentionDropdown();
}

// Ocultar el dropdown de menciones
function hideMentionDropdown() {
    const dropdown = document.getElementById("mention-suggestions-dropdown");
    if (dropdown) {
        dropdown.style.display = "none";
    }
    mentionActiveTextarea = null;
}

// Escanear el texto de un comentario y generar registros de notificación
async function handleCommentMentions(commentText, section, sku) {
    const mentionRegex = /@([a-zA-Z0-9.\-_]+)/g;
    let match;
    const mentionedUsers = [];
    
    while ((match = mentionRegex.exec(commentText)) !== null) {
        const username = match[1];
        if (!mentionedUsers.includes(username)) {
            mentionedUsers.push(username);
        }
    }
    
    if (mentionedUsers.length === 0) return;
    
    const sender = loggedInUser ? loggedInUser.username : 'desconocido';
    const subsidiary = appData.selectedSubsidiary;
    const week = appData.selectedWeekName || 'Semana N/A';
    
    for (const recipient of mentionedUsers) {
        // Confirmar que el usuario sea válido
        const userExists = allUsersCached.some(u => u.username === recipient);
        if (!userExists) continue;
        
        const notificationObj = {
            user_recipient: recipient,
            user_sender: sender,
            sku: sku || null,
            subsidiary: subsidiary,
            week: week,
            comment_text: commentText,
            is_read: false,
            section: section
        };
        
        // 1. Guardar en Supabase
        if (supabaseClient) {
            try {
                await supabaseClient
                    .from('notificaciones')
                    .insert([notificationObj]);
            } catch(e) {
                console.error("Error al guardar notificación en Supabase:", e);
            }
        }
        
        // 2. Guardar copia local de respaldo
        const localKey = `sop_notifications_${recipient}`;
        try {
            let localNotifications = [];
            const existing = localStorage.getItem(localKey);
            if (existing) {
                localNotifications = JSON.parse(existing);
            }
            localNotifications.unshift({
                ...notificationObj,
                id: Date.now() + Math.floor(Math.random() * 1000),
                created_at: new Date().toISOString()
            });
            localStorage.setItem(localKey, JSON.stringify(localNotifications));
        } catch(e) {
            console.warn("Error al guardar respaldo local de notificación:", e);
        }
    }
}

// Inicializar el sistema de notificaciones (Campanita)
function initNotificationSystem() {
    if (!loggedInUser) return;
    
    const bellWrapper = document.getElementById("notifications-bell-wrapper");
    const bellBtn = document.getElementById("notifications-bell-btn");
    const dropdown = document.getElementById("notifications-dropdown");
    const markAllBtn = document.getElementById("mark-all-read-btn");
    
    if (bellWrapper) bellWrapper.style.display = "block";
    
    if (bellBtn && dropdown) {
        bellBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = dropdown.style.display === "none";
            dropdown.style.display = isHidden ? "flex" : "none";
            if (isHidden) {
                loadNotifications();
            }
        };
    }
    
    document.addEventListener("click", (e) => {
        if (dropdown && !dropdown.contains(e.target) && bellBtn && !bellBtn.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });
    
    if (markAllBtn) {
        markAllBtn.onclick = (e) => {
            e.stopPropagation();
            markAllNotificationsRead();
        };
    }
    
    loadNotifications();
    
    if (notificationPollInterval) clearInterval(notificationPollInterval);
    notificationPollInterval = setInterval(loadNotifications, 30000);
}

// Cargar y mostrar notificaciones del usuario activo
async function loadNotifications() {
    if (!loggedInUser) return;
    
    const badge = document.getElementById("notifications-badge");
    const list = document.getElementById("notifications-list");
    if (!list) return;
    
    let notifications = [];
    let loadedFromDb = false;
    
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('notificaciones')
                .select('*')
                .eq('user_recipient', loggedInUser.username)
                .order('created_at', { ascending: false });
            if (!error && data) {
                notifications = data;
                loadedFromDb = true;
            }
        } catch(e) {
            console.error("Error al cargar notificaciones de Supabase:", e);
        }
    }
    
    if (!loadedFromDb) {
        const localKey = `sop_notifications_${loggedInUser.username}`;
        try {
            const existing = localStorage.getItem(localKey);
            if (existing) {
                notifications = JSON.parse(existing);
            }
        } catch(e) {
            console.error("Error al leer notificaciones locales:", e);
        }
    }
    
    notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    const unreadCount = notifications.filter(n => !n.is_read).length;
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
        }
    }
    
    list.innerHTML = "";
    if (notifications.length === 0) {
        list.innerHTML = `<div class="notification-empty-state">No tienes menciones.</div>`;
        return;
    }
    
    notifications.forEach(n => {
        const item = document.createElement("div");
        item.className = `notification-item ${n.is_read ? '' : 'unread'}`;
        
        const dateObj = new Date(n.created_at);
        const timeText = isNaN(dateObj.getTime())
            ? "Reciente"
            : dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
        const sectionLabel = n.section === 'sku' ? 'Chat SKU' : n.section.toUpperCase();
        const refText = n.sku ? `SKU: ${n.sku}` : `Sección: ${sectionLabel}`;
        
        item.innerHTML = `
            <div class="notification-item-header">
                <span class="notification-item-sender">@${n.user_sender}</span>
                <span class="notification-item-time">${timeText}</span>
            </div>
            <div class="notification-item-body" style="font-weight: 500; font-size: 11.5px; margin: 2px 0;">${n.comment_text}</div>
            <div class="notification-item-meta">
                <span class="notification-meta-pill">${n.subsidiary}</span>
                <span class="notification-meta-pill">${n.week}</span>
                <span class="notification-meta-pill" style="background-color: var(--neon-cyan); color: white;">${refText}</span>
            </div>
        `;
        
        item.onclick = async (e) => {
            e.stopPropagation();
            await handleNotificationClick(n);
        };
        
        list.appendChild(item);
    });
}

// Manejar clic en una notificación
async function handleNotificationClick(n) {
    const dropdown = document.getElementById("notifications-dropdown");
    if (dropdown) dropdown.style.display = "none";
    
    // 1. Marcar como leída
    if (supabaseClient) {
        try {
            const queryId = isNaN(n.id) ? n.id : parseInt(n.id, 10);
            await supabaseClient
                .from('notificaciones')
                .update({ is_read: true })
                .eq('id', queryId);
        } catch(e) {
            console.error("Error al marcar notificación como leída:", e);
        }
    }
    
    const localKey = `sop_notifications_${loggedInUser.username}`;
    try {
        let localNotifications = [];
        const existing = localStorage.getItem(localKey);
        if (existing) {
            localNotifications = JSON.parse(existing);
        }
        localNotifications = localNotifications.map(item => {
            if (String(item.id) === String(n.id)) {
                item.is_read = true;
            }
            return item;
        });
        localStorage.setItem(localKey, JSON.stringify(localNotifications));
    } catch(e) {
        console.warn("Error al actualizar notificación local:", e);
    }
    
    await loadNotifications();
    
    // 2. Comprobar permisos para cambiar de empresa
    const isAllowed = loggedInUser.role === 'admin' || (loggedInUser.companies && loggedInUser.companies.includes(n.subsidiary));
    if (!isAllowed) {
        showNotification(`No tienes acceso a la subsidiaria ${n.subsidiary}`, "error");
        return;
    }
    
    let contextChanged = false;
    
    if (appData.selectedSubsidiary !== n.subsidiary) {
        appData.selectedSubsidiary = n.subsidiary;
        sessionStorage.setItem("sop_selected_subsidiary", n.subsidiary);
        contextChanged = true;
    }
    
    if (appData.selectedWeekName !== n.week) {
        appData.selectedWeekName = n.week;
        sessionStorage.setItem("sop_selected_week", n.week);
        contextChanged = true;
    }
    
    if (contextChanged) {
        showNotification("Cargando contexto de la mención...", "info");
        await loadDashboardData();
    }
    
    // 3. Abrir modal de SKU o enfocar sección
    if (n.section === 'sku' && n.sku) {
        openSkuChat(n.sku, "Artículo mencionado", n.subsidiary);
    } else {
        const sectionEl = document.getElementById(`comments-${n.section}-list`);
        if (sectionEl) {
            sectionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sectionEl.style.outline = "2px dashed var(--neon-cyan)";
            setTimeout(() => {
                sectionEl.style.outline = "none";
            }, 3000);
        }
    }
}

// Marcar todas las notificaciones como leídas
async function markAllNotificationsRead() {
    if (!loggedInUser) return;
    
    if (supabaseClient) {
        try {
            await supabaseClient
                .from('notificaciones')
                .update({ is_read: true })
                .eq('user_recipient', loggedInUser.username)
                .eq('is_read', false);
        } catch(e) {
            console.error("Error al marcar todas las notificaciones:", e);
        }
    }
    
    const localKey = `sop_notifications_${loggedInUser.username}`;
    try {
        let localNotifications = [];
        const existing = localStorage.getItem(localKey);
        if (existing) {
            localNotifications = JSON.parse(existing);
        }
        localNotifications = localNotifications.map(item => {
            item.is_read = true;
            return item;
        });
        localStorage.setItem(localKey, JSON.stringify(localNotifications));
    } catch(e) {
        console.warn("Error al marcar todas localmente:", e);
    }
    
    await loadNotifications();
    showNotification("Todas las menciones marcadas como leídas", "success");
}

// ==========================================================================
// NUEVA CAPACIDAD: PRIORIZACIÓN AUTOMÁTICA ABC Y ALERTAS COMERCIALES
// ==========================================================================


// Función para calcular la clasificación ABC por valor de demanda (Pareto)
function calculateABCClassification() {
    if (!currentWorkbook) return;
    
    const weekSheets = currentWorkbook.SheetNames.filter(name => name.startsWith("Sem"));
    if (weekSheets.length === 0) return;
    
    // Ordenar ascendentemente por número de semana (ej: Sem 22, Sem 23, Sem 24...)
    const sortedWeeks = [...weekSheets].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
        return numA - numB;
    });
    
    // Seleccionar las últimas 8 semanas (o todas si hay menos de 8)
    const last8Weeks = sortedWeeks.slice(-8);
    const totalWeeksForAverage = last8Weeks.length;
    
    // Mapa para acumular histórico por SKU
    const skuHistory = {};
    
    last8Weeks.forEach(sheetName => {
        const sheet = currentWorkbook.Sheets[sheetName];
        if (!sheet) return;
        const ref = sheet['!ref'];
        if (!ref) return;
        const range = XLSX.utils.decode_range(ref);
        const maxRow = range.e.r + 1;
        
        for (let r = 3; r <= maxRow; r++) {
            const subsidiary = getCellText(sheet, 0, r, null);
            if (!subsidiary) continue;
            
            const formattedSub = subsidiary.toUpperCase().trim();
            if (formattedSub === "" || formattedSub === "EMPRESA" || formattedSub.includes("---")) {
                continue;
            }
            
            // Filtrar por la subsidiaria actualmente seleccionada en el UI
            if (appData.selectedSubsidiary !== "TODAS" && formattedSub !== appData.selectedSubsidiary) {
                continue;
            }
            
            const sku_neto = getCellText(sheet, 1, r, "");
            const sku_interno = getCellText(sheet, 2, r, "");
            const name = getCellText(sheet, 3, r, "");
            
            let weeklyReq = 0;
            for (let d = 0; d < 6; d++) {
                const startCol = 4 + d * 12;
                weeklyReq += getCellValue(sheet, startCol + 1, r, 0);
            }
            
            const cleanNetoLookup = sku_neto.trim().split('.')[0];
            const lookupKeyInt = `${formattedSub}_${sku_interno.toUpperCase().trim()}`;
            const lookupKeyNet = `${formattedSub}_${cleanNetoLookup}`;
            const price = productPrices[lookupKeyInt] !== undefined 
                ? productPrices[lookupKeyInt] 
                : (productPrices[lookupKeyNet] !== undefined ? productPrices[lookupKeyNet] : 0);
            const pzasPorCaja = productPzasPorCaja[lookupKeyInt] !== undefined
                ? productPzasPorCaja[lookupKeyInt]
                : (productPzasPorCaja[lookupKeyNet] !== undefined ? productPzasPorCaja[lookupKeyNet] : 1);
            
            const key = `${formattedSub}_${sku_interno}`;
            if (!skuHistory[key]) {
                skuHistory[key] = {
                    sku_interno,
                    sku_neto,
                    name,
                    subsidiary: formattedSub,
                    totalRequestedVol: 0,
                    totalRequestedVal: 0,
                    price,
                    pzasPorCaja,
                    weeklyDemands: {}
                };
            }
            skuHistory[key].totalRequestedVol += weeklyReq;
            skuHistory[key].totalRequestedVal += weeklyReq * price;
            skuHistory[key].weeklyDemands[sheetName] = weeklyReq;
        }
    });
    
    const skuList = Object.values(skuHistory);
    
    let grandTotalVal = 0;
    let grandTotalVol = 0;
    skuList.forEach(sku => {
        grandTotalVal += sku.totalRequestedVal;
        grandTotalVol += sku.totalRequestedVol;
    });
    
    // Ordenar de mayor a menor por valor financiero acumulado
    skuList.sort((a, b) => b.totalRequestedVal - a.totalRequestedVal);
    
    let runningVal = 0;
    let cumValPct = 0;
    
    const abcClasses = {
        A: { count: 0, vol: 0, val: 0 },
        B: { count: 0, vol: 0, val: 0 },
        C: { count: 0, vol: 0, val: 0 }
    };
    
    skuList.forEach((sku, idx) => {
        const prevCumPct = cumValPct;
        runningVal += sku.totalRequestedVal;
        cumValPct = grandTotalVal > 0 ? (runningVal / grandTotalVal) : 0;
        
        let cls = "C";
        if (prevCumPct < 0.8) {
            cls = "A";
        } else if (prevCumPct < 0.95) {
            cls = "B";
        }
        
        sku.class = cls;
        sku.historicalAverage = sku.totalRequestedVol / totalWeeksForAverage;
        
        abcClasses[cls].count++;
        abcClasses[cls].vol += sku.totalRequestedVol;
        abcClasses[cls].val += sku.totalRequestedVal;
    });
    
    // Crear un mapa y asignar la clase calculada a cada SKU en appData.skus
    const classMap = {};
    skuList.forEach(s => {
        const key = `${s.subsidiary}_${s.sku_interno}`.toUpperCase();
        classMap[key] = s.class;
    });
    
    appData.skus.forEach(s => {
        const key = `${s.subsidiary}_${s.sku_interno}`.toUpperCase();
        s.class = classMap[key] || "C";
    });
    
    appData.abcClassification = {
        skuList,
        grandTotalVal,
        grandTotalVol,
        abcClasses
    };
}

// Función para pintar la clasificación ABC y la tabla de alertas
function renderABCOperations() {
    const wrapper = document.getElementById("abc-analysis-wrapper");
    if (!wrapper) return;
    
    if (!appData.abcClassification) {
        wrapper.style.display = "none";
        return;
    }
    
    wrapper.style.display = "block";
    
    const { grandTotalVal, grandTotalVol, abcClasses, skuList } = appData.abcClassification;
    
    // Pintar tarjetas de participación
    const classes = ['A', 'B', 'C'];
    classes.forEach(cls => {
        const countEl = document.getElementById(`abc-count-${cls.toLowerCase()}`);
        const volEl = document.getElementById(`abc-vol-${cls.toLowerCase()}`);
        const valEl = document.getElementById(`abc-val-${cls.toLowerCase()}`);
        
        const data = abcClasses[cls];
        if (countEl) countEl.textContent = data.count;
        
        const volShare = grandTotalVol > 0 ? (data.vol / grandTotalVol) * 100 : 0;
        const valShare = grandTotalVal > 0 ? (data.val / grandTotalVal) * 100 : 0;
        
        if (volEl) volEl.textContent = volShare.toFixed(1) + "%";
        if (valEl) valEl.textContent = valShare.toFixed(1) + "%";
    });
    
    // Pintar cabeceras ordenables de la tabla
    const thead = document.getElementById("abc-table-header");
    if (thead) {
        thead.innerHTML = `
            <tr>
                ${getDeviationsHeaderHtml("sku_interno", "SKU")}
                ${getDeviationsHeaderHtml("name", "Artículo")}
                ${getDeviationsHeaderHtml("pzasPorCaja", "Pzas/Caja", "text-align: right;")}
                ${getDeviationsHeaderHtml("histCajas", "Hist. Prom. (Cajas)", "text-align: right;")}
                ${getDeviationsHeaderHtml("histPzas", "Hist. Prom. (Pzas)", "text-align: right;")}
                ${getDeviationsHeaderHtml("histDinero", "Hist. Prom. ($)", "text-align: right;")}
                ${getDeviationsHeaderHtml("actCajas", "Ped. Sem. Activa (Cajas)", "text-align: right;")}
                ${getDeviationsHeaderHtml("actPzas", "Ped. Sem. Activa (Pzas)", "text-align: right;")}
                ${getDeviationsHeaderHtml("actDinero", "Venta Sem. Activa ($)", "text-align: right;")}
                ${getDeviationsHeaderHtml("varPct", "Var %", "text-align: right;")}
                ${getDeviationsHeaderHtml("estatus", "Estatus")}
            </tr>
        `;
    }
    
    // Pintar tabla de desviaciones para todos los SKUs
    const tbody = document.getElementById("abc-alerts-body");
    if (!tbody) return;
    
    const activeWeek = appData.selectedWeekName;
    const filteredSkuList = skuList.filter(sku => !sku.sku_interno.toUpperCase().startsWith("TIN"));
    
    let tableHtml = "";
    let countDeviations = 0;
    
    // Copiar y ordenar lista de SKUs
    let sortedList = [...filteredSkuList];
    if (appData.deviationsSortKey) {
        sortedList.sort((a, b) => {
            let valA = getDeviationsSortValue(a, appData.deviationsSortKey);
            let valB = getDeviationsSortValue(b, appData.deviationsSortKey);
            
            if (typeof valA === "string" && typeof valB === "string") {
                return appData.deviationsSortDirection === "asc"
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            } else {
                const aNum = valA === null || isNaN(valA) ? -Infinity : valA;
                const bNum = valB === null || isNaN(valB) ? -Infinity : valB;
                if (aNum === bNum) return 0;
                return appData.deviationsSortDirection === "asc"
                    ? aNum - bNum
                    : bNum - aNum;
            }
        });
    }
    
    let totalHistCajas = 0;
    let totalHistPzas = 0;
    let totalHistDinero = 0;
    let totalActCajas = 0;
    let totalActPzas = 0;
    let totalActDinero = 0;
    
    sortedList.forEach(sku => {
        const activeReq = sku.weeklyDemands[activeWeek] || 0;
        const varPct = sku.historicalAverage > 0 ? ((activeReq - sku.historicalAverage) / sku.historicalAverage) * 100 : 0;
        const isAlert = varPct < -30;
        
        countDeviations++;
        const varSign = varPct >= 0 ? "+" : "";
        const varColor = isAlert ? "var(--neon-red)" : "var(--neon-green)";
        const pzasPorCaja = sku.pzasPorCaja || 1;
        
        const histCajas = sku.historicalAverage;
        const histPzas = sku.historicalAverage * pzasPorCaja;
        const histDinero = sku.historicalAverage * (sku.price || 0);
        const actCajas = activeReq;
        const actPzas = activeReq * pzasPorCaja;
        const actDinero = activeReq * (sku.price || 0);
        
        totalHistCajas += histCajas;
        totalHistPzas += histPzas;
        totalHistDinero += histDinero;
        totalActCajas += actCajas;
        totalActPzas += actPzas;
        totalActDinero += actDinero;
        
        tableHtml += `
            <tr>
                <td style="font-weight: 600;">${sku.sku_interno}</td>
                <td>${sku.name}</td>
                <td class="num-val">${pzasPorCaja}</td>
                <td class="num-val">${histCajas.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                <td class="num-val">${Math.round(histPzas).toLocaleString('es-MX')}</td>
                <td class="num-val">$${histDinero.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="num-val" style="font-weight: 600;">${actCajas.toLocaleString('es-MX')}</td>
                <td class="num-val" style="font-weight: 600;">${Math.round(actPzas).toLocaleString('es-MX')}</td>
                <td class="num-val" style="font-weight: 600;">$${actDinero.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="num-val" style="color: ${varColor}; font-weight: 600;">${varSign}${varPct.toFixed(1)}%</td>
                <td>
                    ${isAlert 
                        ? `<span class="abc-badge-alert">DESVIACIÓN</span>` 
                        : `<span class="abc-badge-ok">Sin desviación</span>`
                    }
                </td>
            </tr>
        `;
    });
    
    // Agregar fila de totales
    if (countDeviations > 0) {
        const totalVarPct = totalHistCajas > 0 ? ((totalActCajas - totalHistCajas) / totalHistCajas) * 100 : 0;
        const totalVarSign = totalVarPct >= 0 ? "+" : "";
        const totalVarColor = totalVarPct < -30 ? "var(--neon-red)" : "var(--neon-green)";
        const totalIsAlert = totalVarPct < -30;
        
        tableHtml += `
            <tr style="font-weight: 700; border-top: 2px solid var(--border-color); position: sticky; bottom: 0; z-index: 5;">
                <td colspan="2" style="text-align: left; font-weight: 700; background-color: var(--bg-card-hover) !important;">TOTALES</td>
                <td class="num-val" style="background-color: var(--bg-card-hover) !important;">-</td>
                <td class="num-val" style="background-color: var(--bg-card-hover) !important;">${totalHistCajas.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                <td class="num-val" style="background-color: var(--bg-card-hover) !important;">${Math.round(totalHistPzas).toLocaleString('es-MX')}</td>
                <td class="num-val" style="background-color: var(--bg-card-hover) !important;">$${totalHistDinero.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="num-val" style="font-weight: 700; background-color: var(--bg-card-hover) !important;">${totalActCajas.toLocaleString('es-MX')}</td>
                <td class="num-val" style="font-weight: 700; background-color: var(--bg-card-hover) !important;">${Math.round(totalActPzas).toLocaleString('es-MX')}</td>
                <td class="num-val" style="font-weight: 700; background-color: var(--bg-card-hover) !important;">$${totalActDinero.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="num-val" style="color: ${totalVarColor}; font-weight: 700; background-color: var(--bg-card-hover) !important;">${totalVarSign}${totalVarPct.toFixed(1)}%</td>
                <td style="background-color: var(--bg-card-hover) !important;">
                    ${totalIsAlert 
                        ? `<span class="abc-badge-alert">DESVIACIÓN</span>` 
                        : `<span class="abc-badge-ok">Sin desviación</span>`
                    }
                </td>
            </tr>
        `;
    }
    
    if (countDeviations === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--neon-green); font-weight: 600; padding: 12px;">✅ Sin productos para mostrar.</td></tr>`;
    } else {
        tbody.innerHTML = tableHtml;
    }
}

// Función auxiliar para renderizar cabecera de la tabla de desviaciones
function getDeviationsHeaderHtml(key, text, extraStyle = "") {
    let indicator = '<span class="sort-indicator" style="opacity:0.25; margin-left:4px; font-size:9px;">↕</span>';
    if (appData.deviationsSortKey === key) {
        indicator = appData.deviationsSortDirection === "asc"
            ? '<span class="sort-indicator" style="color:var(--neon-cyan); margin-left:4px; font-size:9px;">▲</span>'
            : '<span class="sort-indicator" style="color:var(--neon-cyan); margin-left:4px; font-size:9px;">▼</span>';
    }
    const style = extraStyle ? `cursor:pointer; user-select:none; ${extraStyle}` : 'cursor:pointer; user-select:none;';
    return `<th class="sortable-header" style="${style}" data-sort-key="${key}">${text}${indicator}</th>`;
}

// Analizar la mezcla comercial y desviaciones Clase A utilizando Gemini AI
async function analyzeAbcMixWithGemini() {
    const key = localStorage.getItem("gemini_api_key");
    const container = document.getElementById("abc-ia-text");
    if (!key) {
        if (container) {
            container.innerHTML = `<span style="color: var(--neon-red); font-weight: 600;">⚠️ Error: No has configurado tu Gemini API Key. Por favor abre el panel de configuración de la API arriba e introduce tu clave.</span>`;
        }
        toggleApiSettings(true);
        return;
    }

    if (!container) return;

    // Mostrar estado de carga
    container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; color: var(--ai-purple); padding: 8px 0;">
            <div class="spinner" style="width: 14px; height: 14px; margin-bottom: 0;"></div>
            <span>Efectuando análisis inteligente de mezcla comercial...</span>
        </div>
    `;

    try {
        const activeWeek = appData.selectedWeekName;
        const subsidiary = appData.selectedSubsidiary;
        
        let skuDataForAI = [];
        let totalSkus = 0;
        let totalA = 0;
        let countDeviations = 0;
        
        if (appData.abcClassification && appData.abcClassification.skuList) {
            totalSkus = appData.abcClassification.skuList.length;
            appData.abcClassification.skuList.forEach(sku => {
                if (sku.class === 'A') {
                    totalA++;
                    const activeReq = sku.weeklyDemands[activeWeek] || 0;
                    const isAlert = activeReq < 0.75 * sku.historicalAverage;
                    if (isAlert) {
                        countDeviations++;
                    }
                    const varPct = sku.historicalAverage > 0 ? ((activeReq - sku.historicalAverage) / sku.historicalAverage) * 100 : 0;
                    skuDataForAI.push({
                        sku: sku.sku_interno,
                        articulo: sku.name,
                        promedioHistorico: sku.historicalAverage.toFixed(1),
                        pedidoSemanaActiva: activeReq,
                        variacionPct: varPct.toFixed(1) + "%",
                        desviacionCritica: isAlert ? "SÍ" : "NO"
                    });
                }
            });
        }
        
        const promptText = `
Analiza la mezcla comercial y las desviaciones críticas de demanda para los productos Clase A (los que concentran el 80% del valor de venta) en la semana **${activeWeek}** para la subsidiaria **${subsidiary}**.

RESUMEN EJECUTIVO:
- Total de productos Clase A, B, C: ${totalSkus}
- Productos Clase A: ${totalA}
- Desviaciones críticas detectadas en Clase A: ${countDeviations}

DATOS DE DESVIACIÓN COMERCIAL DE PRODUCTOS CLASE A:
${JSON.stringify(skuDataForAI, null, 2)}

INSTRUCCIONES DE RESPUESTA:
1. Explica brevemente qué significa esta mezcla comercial y el impacto de las desviaciones.
2. Identifica los productos Clase A con mayores variaciones negativas y explica el riesgo para el OTIF o el cumplimiento comercial.
3. Propón 3 acciones correctivas concretas de nivelación de abasto o comerciales (por ejemplo, coordinar con ventas o adelantar producción).
Sé muy conciso, directo, clínico y ejecutivo. No uses introducciones formales o saludos. Responde en español en un formato de lista de viñetas muy claro.
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: promptText }]
                }],
                systemInstruction: {
                    parts: [{ text: "Eres el Director Clínico de Cadena de Suministro en Induwell. Haces análisis ejecutivos breves, objetivos y basados en datos sobre la mezcla comercial de los productos Clase A." }]
                },
                generationConfig: {
                    temperature: 0.15,
                    maxOutputTokens: 1000
                }
            })
        });

        if (!response.ok) {
            const errorJson = await response.json();
            throw new Error(errorJson.error?.message || `Error HTTP ${response.status}`);
        }

        const resJson = await response.json();
        const responseText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (responseText) {
            let htmlContent = responseText
                .replace(/\n/g, "<br>")
                .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
                .replace(/\* /g, "• ");
            container.innerHTML = `<div style="font-size: 11px; line-height: 1.45; color: var(--text-secondary);">${htmlContent}</div>`;
        } else {
            container.innerHTML = `<span style="color: var(--text-muted);">No se recibió una respuesta legible del modelo de IA.</span>`;
        }

    } catch (error) {
        console.error("Gemini ABC Error:", error);
        container.innerHTML = `<span style="color: var(--neon-red);">⚠️ Error al comunicarse con Gemini: ${error.message}. Verifica tu API Key.</span>`;
    }
}

// ==========================================================================
// CAPACIDAD: INVENTARIO ACTUAL DE ALPHALAB (Pestaña Independiente)
// ==========================================================================

function parseAlphalabInventory(workbook) {
    appData.alphalabInventory = [];
    appData.alphalabInventoryKPIs = {
        totalValue: 0,
        totalSkus: 0,
        totalTarimas: 0,
        totalNoDisponible: 0,
        totalNoDisponibleValue: 0,
        totalDisponible: 0,
        obsoletosValue: 0,
        prodTerminadoValue: 0
    };

    if (!workbook) return;

    // Buscar la hoja de inventario que puede llamarse 'INVENTARIOS' o 'Inv ALphalab'
    const sheetName = workbook.SheetNames.find(n => {
        const cleanName = n.toLowerCase().replace(/\s+/g, '');
        return cleanName === 'invalphalab' || cleanName === 'inventarios';
    });
    if (!sheetName) {
        console.warn("No se encontró la hoja de inventario 'INVENTARIOS' o 'Inv ALphalab'");
        return;
    }

    const sheet = workbook.Sheets[sheetName];
    const ref = sheet['!ref'];
    if (!ref) return;
    const range = XLSX.utils.decode_range(ref);
    const maxRow = range.e.r + 1;

    // Detectar mapeo de columnas dinámicamente inspeccionando la fila 1 (cabeceras)
    let colIndices = {
        no: 0,
        subsidiaria: 1,
        clasificacion: 2,
        sku: 3,
        descripcion: 4,
        udm: 5,
        costo_unitario: 6,
        inv_inicial: 7,
        compras: 8,
        consumos: 9,
        tarimas: 10,
        inv_teorico: 11,
        valuacion_total: 12,
        notas_credito: 13,
        notas_credito_val: 14,
        inv_no_disp: 15,
        inv_no_disp_val: 16,
        bodega_espino: 17,
        bodega_espino_val: 18,
        inv_disponible: 19
    };

    let hasSubsidiariaCol = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
        const headerText = getCellText(sheet, c, 1, "").trim().toLowerCase();
        if (!headerText) continue;
        
        if (headerText.includes("no.")) colIndices.no = c;
        else if (headerText.includes("subsidiaria")) {
            colIndices.subsidiaria = c;
            hasSubsidiariaCol = true;
        }
        else if (headerText.includes("clasificaci")) colIndices.clasificacion = c;
        else if (headerText.includes("sku")) colIndices.sku = c;
        else if (headerText.includes("descripci")) colIndices.descripcion = c;
        else if (headerText.includes("udm")) colIndices.udm = c;
        else if (headerText.includes("costo unitario")) colIndices.costo_unitario = c;
        else if (headerText.includes("inicial")) colIndices.inv_inicial = c;
        else if (headerText.includes("compras")) colIndices.compras = c;
        else if (headerText.includes("consumos")) colIndices.consumos = c;
        else if (headerText.includes("tarimas")) colIndices.tarimas = c;
        else if (headerText.includes("teórico") || headerText.includes("teorico")) colIndices.inv_teorico = c;
        else if (headerText.includes("valuación total") || headerText.includes("valuacion total")) colIndices.valuacion_total = c;
        else if (headerText.includes("disponible") && !headerText.includes("no disponible") && !headerText.includes("$")) colIndices.inv_disponible = c;
    }

    for (let r = 2; r <= maxRow; r++) {
        const sku = getCellText(sheet, colIndices.sku, r, "").trim();
        // Si no hay SKU, saltar fila
        if (!sku || sku === "" || sku.toLowerCase() === "sku") continue;

        const no = getCellValue(sheet, colIndices.no, r, "");
        const subsidiaria = hasSubsidiariaCol ? getCellText(sheet, colIndices.subsidiaria, r, "ALPHALAB").trim().toUpperCase() : "ALPHALAB";
        const clasificacion = getCellText(sheet, colIndices.clasificacion, r, "N/A").trim();
        const descripcion = getCellText(sheet, colIndices.descripcion, r, "N/A").trim();
        const udm = getCellText(sheet, colIndices.udm, r, "N/A").trim();
        const costo_unitario = getCellValue(sheet, colIndices.costo_unitario, r, 0);
        const inv_inicial = getCellValue(sheet, colIndices.inv_inicial, r, 0);
        const compras = getCellValue(sheet, colIndices.compras, r, 0);
        const consumos = getCellValue(sheet, colIndices.consumos, r, 0);
        const tarimas = getCellValue(sheet, colIndices.tarimas, r, 0);
        const inv_teorico = getCellValue(sheet, colIndices.inv_teorico, r, 0);
        const valuacion_total = getCellValue(sheet, colIndices.valuacion_total, r, 0);
        const notas_credito = getCellValue(sheet, colIndices.notas_credito, r, 0);
        const notas_credito_val = getCellValue(sheet, colIndices.notas_credito_val, r, 0);
        const inv_no_disp = getCellValue(sheet, colIndices.inv_no_disp, r, 0);
        const inv_no_disp_val = getCellValue(sheet, colIndices.inv_no_disp_val, r, 0);
        const bodega_espino = getCellValue(sheet, colIndices.bodega_espino, r, 0);
        const bodega_espino_val = getCellValue(sheet, colIndices.bodega_espino_val, r, 0);
        const inv_disponible = getCellValue(sheet, colIndices.inv_disponible, r, 0);

        const item = {
            no,
            subsidiaria,
            clasificacion,
            sku,
            descripcion,
            udm,
            costo_unitario: Number(costo_unitario) || 0,
            inv_inicial: Number(inv_inicial) || 0,
            compras: Number(compras) || 0,
            consumos: Number(consumos) || 0,
            tarimas: Number(tarimas) || 0,
            inv_teorico: Number(inv_teorico) || 0,
            valuacion_total: Number(valuacion_total) || 0,
            notas_credito: Number(notas_credito) || 0,
            notas_credito_val: Number(notas_credito_val) || 0,
            inv_no_disp: Number(inv_no_disp) || 0,
            inv_no_disp_val: Number(inv_no_disp_val) || 0,
            bodega_espino: Number(bodega_espino) || 0,
            bodega_espino_val: Number(bodega_espino_val) || 0,
            inv_disponible: Number(inv_disponible) || 0
        };

        appData.alphalabInventory.push(item);
    }
}

// Cambiar pestañas internas de Alphalab
function switchAlphalabTab(tabName) {
    appData.currentSubTab = tabName;
    
    const tabPlaneacion = document.getElementById("tab-sop-planeacion");
    const tabInventario = document.getElementById("tab-inventario-actual");
    const sopDashboardViews = document.getElementById("sop-dashboard-views");
    const invPanel = document.getElementById("alphalab-inventory-panel");
    
    if (!tabPlaneacion || !tabInventario || !sopDashboardViews || !invPanel) return;
    
    if (tabName === "inventario") {
        tabPlaneacion.classList.remove("active");
        tabPlaneacion.style.borderBottomColor = "transparent";
        
        tabInventario.classList.add("active");
        tabInventario.style.borderBottomColor = "var(--neon-cyan)";
        
        sopDashboardViews.style.display = "none";
        invPanel.style.display = "block";
        
        renderAlphalabInventory();
    } else {
        tabInventario.classList.remove("active");
        tabInventario.style.borderBottomColor = "transparent";
        
        tabPlaneacion.classList.add("active");
        tabPlaneacion.style.borderBottomColor = "var(--neon-cyan)";
        
        sopDashboardViews.style.display = "block";
        invPanel.style.display = "none";
    }
}

// Renderizar la tabla y KPIs del Inventario
function renderAlphalabInventory() {
    const query = appData.inventorySearchQuery.trim().toLowerCase();
    const subFilter = appData.inventorySubsidiaryFilter || "ALPHALAB";

    // Filtrar items por subsidiaria
    const filteredBySub = appData.alphalabInventory.filter(item => {
        if (subFilter === "TODAS") return true;
        return item.subsidiaria === subFilter;
    });

    // Filtrar por búsqueda sobre el subconjunto de subsidiarias
    const filtered = filteredBySub.filter(item => {
        return item.sku.toLowerCase().includes(query) || 
               item.descripcion.toLowerCase().includes(query) || 
               item.clasificacion.toLowerCase().includes(query);
    });

    // Calcular KPIs dinámicamente sobre la subsidiaria seleccionada (filteredBySub)
    const kpis = {
        totalValue: 0,
        totalSkus: filteredBySub.length,
        totalTarimas: 0,
        totalNoDisponible: 0,
        totalNoDisponibleValue: 0,
        totalDisponible: 0,
        obsoletosValue: 0,
        prodTerminadoValue: 0
    };

    filteredBySub.forEach(item => {
        kpis.totalValue += item.valuacion_total;
        kpis.totalTarimas += item.tarimas;
        kpis.totalNoDisponible += item.inv_no_disp;
        kpis.totalNoDisponibleValue += item.inv_no_disp_val;
        kpis.totalDisponible += item.inv_disponible;

        const clsLower = item.clasificacion.toLowerCase().trim();
        if (clsLower === "obsoleto") {
            kpis.obsoletosValue += item.valuacion_total;
        } else if (clsLower === "prod. term.") {
            kpis.prodTerminadoValue += item.valuacion_total;
        }
    });

    // Guardar en appData para sincronización
    appData.alphalabInventoryKPIs = kpis;

    // Mostrar KPIs en pantalla (formato moneda sin centavos)
    const kpiVal = document.getElementById("inv-kpi-value");
    const kpiSkus = document.getElementById("inv-kpi-skus");
    const kpiTarimas = document.getElementById("inv-kpi-tarimas");
    const kpiObsoleto = document.getElementById("inv-kpi-obsoleto");
    const kpiProdTerm = document.getElementById("inv-kpi-prod-term");
    const tbody = document.getElementById("alphalab-inventory-body");
    
    if (kpiVal) kpiVal.textContent = kpis.totalValue.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
    if (kpiSkus) kpiSkus.textContent = kpis.totalSkus;
    if (kpiTarimas) kpiTarimas.textContent = Math.round(kpis.totalTarimas).toLocaleString();
    if (kpiObsoleto) kpiObsoleto.textContent = kpis.obsoletosValue.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
    if (kpiProdTerm) kpiProdTerm.textContent = kpis.prodTerminadoValue.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

    // Actualizar Ruedas de Porcentaje
    const totalVal = kpis.totalValue || 1;
    const pctObsoleto = (kpis.obsoletosValue / totalVal) * 100;
    const pctProdTerm = (kpis.prodTerminadoValue / totalVal) * 100;

    const ringObsoleto = document.getElementById("inv-ring-obsoleto");
    const pctTxtObsoleto = document.getElementById("inv-pct-obsoleto");
    if (ringObsoleto && pctTxtObsoleto) {
        const offset = 188.4 - (pctObsoleto / 100) * 188.4;
        ringObsoleto.setAttribute("stroke-dashoffset", offset);
        pctTxtObsoleto.textContent = pctObsoleto.toFixed(1) + "%";
    }

    const ringProdTerm = document.getElementById("inv-ring-prod-term");
    const pctTxtProdTerm = document.getElementById("inv-pct-prod-term");
    if (ringProdTerm && pctTxtProdTerm) {
        const offset = 188.4 - (pctProdTerm / 100) * 188.4;
        ringProdTerm.setAttribute("stroke-dashoffset", offset);
        pctTxtProdTerm.textContent = pctProdTerm.toFixed(1) + "%";
    }

    // Actualizar título de cabecera dinámicamente
    const headerTitle = document.getElementById("inv-header-title");
    if (headerTitle) {
        if (subFilter === "TODAS") {
            headerTitle.textContent = "Control y Valuación del Inventario General (Alphalab & Velaluz)";
        } else if (subFilter === "VELALUZ") {
            headerTitle.textContent = "Control y Valuación del Inventario Velaluz";
        } else {
            headerTitle.textContent = "Control y Valuación del Inventario Alphalab";
        }
    }

    // Actualizar conteos
    const countShowing = document.getElementById("inv-showing-count");
    const countTotal = document.getElementById("inv-total-count");
    if (countShowing) countShowing.textContent = filtered.length;
    if (countTotal) countTotal.textContent = filteredBySub.length;

    if (!tbody) return;
    tbody.innerHTML = "";
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: var(--text-muted); padding: 30px;">No se encontraron artículos con la búsqueda.</td></tr>`;
        return;
    }
    
    filtered.forEach(item => {
        const tr = document.createElement("tr");
        
        tr.innerHTML = `
            <td style="color: var(--text-muted);">${item.no}</td>
            <td><span class="cell-badge" style="background-color: ${item.subsidiaria === 'VELALUZ' ? 'var(--neon-green-glow)' : 'var(--neon-cyan-glow)'}; color: ${item.subsidiaria === 'VELALUZ' ? 'var(--neon-green)' : 'var(--neon-cyan)'}; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${item.subsidiaria}</span></td>
            <td><span class="cell-badge cell-neutral">${item.clasificacion}</span></td>
            <td style="font-weight: 700; color: var(--neon-cyan);">${item.sku}</td>
            <td style="white-space: normal; max-width: 250px;">${item.descripcion}</td>
            <td>${item.udm}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums;">${item.costo_unitario.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums;">${Math.round(item.inv_inicial).toLocaleString()}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums; color: var(--neon-cyan); font-weight: 600;">${Math.round(item.compras).toLocaleString()}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums; color: var(--neon-red);">${Math.round(item.consumos).toLocaleString()}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums; font-weight: 600;">${Math.round(item.tarimas).toLocaleString()}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums;">${Math.round(item.inv_teorico).toLocaleString()}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: var(--text-primary);">${item.valuacion_total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums; color: var(--neon-green); font-weight: 700;">${Math.round(item.inv_disponible).toLocaleString()}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Ordenación del Inventario Alphalab
function handleInventorySort(key) {
    if (appData.inventorySortKey === key) {
        appData.inventorySortDirection = appData.inventorySortDirection === "asc" ? "desc" : "asc";
    } else {
        appData.inventorySortKey = key;
        appData.inventorySortDirection = "asc";
    }

    // Ordenar los datos
    appData.alphalabInventory.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];

        // Manejar tipo
        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return appData.inventorySortDirection === "asc" ? -1 : 1;
        if (valA > valB) return appData.inventorySortDirection === "asc" ? 1 : -1;
        return 0;
    });

    // Actualizar iconos de ordenación
    updateInventorySortIcons();

    // Renderizar la tabla de nuevo
    renderAlphalabInventory();
}

function updateInventorySortIcons() {
    const headers = document.querySelectorAll("#alphalab-inventory-header th[data-sort-key]");
    headers.forEach(th => {
        const key = th.dataset.sortKey;
        const iconSpan = th.querySelector("span");
        if (iconSpan) {
            if (key === appData.inventorySortKey) {
                iconSpan.innerHTML = appData.inventorySortDirection === "asc" ? " ▲" : " ▼";
                iconSpan.style.color = "var(--neon-cyan)";
            } else {
                iconSpan.innerHTML = "";
            }
        }
    });
}

// Exportar Inventario Alphalab a Excel
function exportAlphalabInventoryToExcel() {
    const subFilter = appData.inventorySubsidiaryFilter || "ALPHALAB";
    const filteredBySub = appData.alphalabInventory.filter(item => {
        if (subFilter === "TODAS") return true;
        return item.subsidiaria === subFilter;
    });

    if (filteredBySub.length === 0) {
        showNotification("No hay datos de inventario para exportar", "warning");
        return;
    }

    const dateStrToday = new Date().toLocaleDateString('es-MX', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit' 
    });
    
    const titleSub = subFilter === "TODAS" ? "GENERAL (ALPHALAB & VELALUZ)" : subFilter;
    const rows = [
        [`REPORTE DE INVENTARIO ACTUAL - ${titleSub}`],
        ["Fecha de exportación:", dateStrToday],
        ["Valor Total del Inventario:", appData.alphalabInventoryKPIs.totalValue.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })],
        ["Valor Categoría Obsoletos:", appData.alphalabInventoryKPIs.obsoletosValue.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })],
        ["Valor Producto Terminado:", appData.alphalabInventoryKPIs.prodTerminadoValue.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })],
        ["SKUs en Almacén:", appData.alphalabInventoryKPIs.totalSkus],
        ["Total de Tarimas:", appData.alphalabInventoryKPIs.totalTarimas],
        [], // Fila en blanco
    ];

    const headers = [
        "No.",
        "Empresa",
        "Clasificación",
        "SKU",
        "Descripción",
        "UDM",
        "Costo Unitario",
        "Inventario Inicial",
        "Compras / Entradas",
        "Consumos / Salidas",
        "Tarimas",
        "Inventario Teórico",
        "Valuación Total",
        "Inventario Disponible"
    ];

    rows.push(headers);

    filteredBySub.forEach(item => {
        rows.push([
            item.no,
            item.subsidiaria,
            item.clasificacion,
            item.sku,
            item.descripcion,
            item.udm,
            item.costo_unitario,
            item.inv_inicial,
            item.compras,
            item.consumos,
            item.tarimas,
            item.inv_teorico,
            item.valuacion_total,
            item.inv_disponible
        ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Autoajustar anchos de columnas
    ws['!cols'] = [
        { wch: 8 },  // No.
        { wch: 12 }, // Empresa
        { wch: 18 }, // Clasificación
        { wch: 15 }, // SKU
        { wch: 40 }, // Descripción
        { wch: 8 },  // UDM
        { wch: 15 }, // Costo Unitario
        { wch: 15 }, // Inventario Inicial
        { wch: 18 }, // Compras
        { wch: 18 }, // Consumos
        { wch: 10 }, // Tarimas
        { wch: 18 }, // Inventario Teórico
        { wch: 18 }, // Valuación Total
        { wch: 18 }  // Inventario Disponible
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Inventario");

    const fileSubName = subFilter === "TODAS" ? "General" : (subFilter === "VELALUZ" ? "Velaluz" : "Alphalab");
    const fileName = `Inventario_${fileSubName}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);

    showNotification("Inventario exportado a Excel con éxito", "success");
}

