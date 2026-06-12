/**
 * Pioneer Valley Kids Camps - Main Application
 */

// State
let allCamps = [];
let filteredCamps = [];
let categories = [];
let regions = {};
let currentView = 'grid'; // 'grid' or 'list' (table)
let currentSort = { column: 'name', direction: 'asc' };

// DOM Elements
const searchInput = document.getElementById('search-input');
const viewGridBtn = document.getElementById('view-grid');
const viewListBtn = document.getElementById('view-list');
const viewPlannerBtn = document.getElementById('view-planner');
const ageMinSelect = document.getElementById('age-min');
const ageMaxSelect = document.getElementById('age-max');
const townSelect = document.getElementById('town-select');
const categorySelect = document.getElementById('category-select');
const costMaxSelect = document.getElementById('cost-max');
const weekSelect = document.getElementById('week-select');
const earlyDropoffCheckbox = document.getElementById('has-early-dropoff');
const financialAidCheckbox = document.getElementById('has-financial-aid');
const latePickupCheckbox = document.getElementById('has-late-pickup');
const clearFiltersBtn = document.getElementById('clear-filters');
const clearFiltersAltBtn = document.getElementById('clear-filters-alt');
const resultsCount = document.getElementById('results-count');
const campsGrid = document.getElementById('camps-grid');
const noResults = document.getElementById('no-results');
const loading = document.getElementById('loading');
const lastUpdated = document.getElementById('last-updated');
const suggestBtn = document.getElementById('suggest-btn');
const suggestForm = document.getElementById('suggest-form');
const footerSuggest = document.getElementById('footer-suggest');
const modal = document.getElementById('camp-modal');
const modalBody = document.getElementById('modal-body');
const modalClose = document.querySelector('.modal-close');
const modalBackdrop = document.querySelector('.modal-backdrop');

// URL <-> filter state, so searches are bookmarkable and shareable
const FILTER_PARAMS = [
    ['q', searchInput, 'value'],
    ['agemin', ageMinSelect, 'value'],
    ['agemax', ageMaxSelect, 'value'],
    ['town', townSelect, 'value'],
    ['category', categorySelect, 'value'],
    ['cost', costMaxSelect, 'value'],
    ['week', weekSelect, 'value'],
    ['early', earlyDropoffCheckbox, 'checked'],
    ['aid', financialAidCheckbox, 'checked'],
    ['late', latePickupCheckbox, 'checked']
];

function updateURL() {
    const params = new URLSearchParams();
    for (const [key, el, prop] of FILTER_PARAMS) {
        const val = el[prop];
        if (val === true) {
            params.set(key, '1');
        } else if (typeof val === 'string' && val.trim()) {
            params.set(key, val.trim());
        }
    }
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
}

function applyFiltersFromURL() {
    const params = new URLSearchParams(location.search);
    for (const [key, el, prop] of FILTER_PARAMS) {
        if (!params.has(key)) continue;
        if (prop === 'checked') {
            el.checked = params.get(key) === '1';
        } else {
            el.value = params.get(key);
        }
    }
}

// Initialize
async function init() {
    try {
        // Load data files in parallel
        const [campsData, categoriesData, regionsData] = await Promise.all([
            fetch('data/camps.json').then(r => r.json()),
            fetch('data/categories.json').then(r => r.json()),
            fetch('data/regions.json').then(r => r.json())
        ]);

        allCamps = campsData.camps || [];
        categories = categoriesData.categories || [];
        regions = regionsData;

        // Cap multi-week session expansion at the season's last real week
        allCamps.forEach(camp => {
            (camp.dates?.weeks || []).forEach(w => {
                const monday = mondayOfWeek(w);
                if (!seasonLastMonday || monday > seasonLastMonday) {
                    seasonLastMonday = monday;
                }
            });
        });
        if (seasonLastMonday) {
            seasonYear = parseInt(seasonLastMonday.slice(0, 4));
        }

        // Update last updated date
        if (campsData.lastUpdated) {
            lastUpdated.textContent = campsData.lastUpdated;
        }

        // Restore saved planner state (stars + assignments)
        loadPlannerState();

        // Capture a shared plan link before updateURL() strips the param
        const planParam = new URLSearchParams(location.search).get('plan');
        const planImported = planParam ? importPlanFromParam(planParam) : false;

        // Populate filter dropdowns
        populateFilters();

        // Restore any filters encoded in the URL, then render
        applyFiltersFromURL();
        applyFilters();

        // Hide loading
        loading.style.display = 'none';

        // Set up event listeners
        setupEventListeners();
        updatePlannerChip();

        // A shared plan lands directly on the planner view
        if (planImported) {
            setView('planner');
        }

        // Deep link: #camp-id opens that camp's modal
        const linkedCamp = allCamps.find(c => c.id === location.hash.slice(1));
        if (linkedCamp) {
            openModal(linkedCamp);
        }

    } catch (error) {
        console.error('Failed to load data:', error);
        loading.innerHTML = '<p>Failed to load camp data. Please try refreshing the page.</p>';
    }
}

// Date helpers (avoid new Date('YYYY-MM-DD') which parses as UTC)
function parseISODate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function toISODate(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Normalize any session start date to the Monday of its camp week.
// Sunday starts (overnight camps) belong to the week beginning the next day.
function mondayOfWeek(dateStr) {
    const date = parseISODate(dateStr);
    const day = date.getDay(); // 0 = Sunday
    date.setDate(date.getDate() + (day === 0 ? 1 : 1 - day));
    return toISODate(date);
}

function addWeeksToMonday(monday, n) {
    const date = parseISODate(monday);
    date.setDate(date.getDate() + 7 * n);
    return toISODate(date);
}

// Last Monday of the season across all raw session starts; expansion of
// multi-week sessions never invents weeks beyond this. Set in init().
let seasonLastMonday = null;
let seasonYear = new Date().getFullYear();

// All weeks a camp actually runs: each session start covers
// dates.weeksPerSession consecutive weeks (default 1).
function campCoveredWeeks(camp) {
    const starts = (camp.dates?.weeks || []).map(mondayOfWeek);
    const covered = new Set(starts);
    const span = camp.dates?.weeksPerSession || 1;
    if (span > 1) {
        starts.forEach(start => {
            for (let i = 1; i < span; i++) {
                const monday = addWeeksToMonday(start, i);
                if (!seasonLastMonday || monday <= seasonLastMonday) {
                    covered.add(monday);
                }
            }
        });
    }
    return covered;
}

// Every camp week in the data, as sorted Monday dates
function allSummerWeeks() {
    const weeks = new Set();
    allCamps.forEach(camp => {
        campCoveredWeeks(camp).forEach(w => weeks.add(w));
    });
    return Array.from(weeks).sort();
}

function formatWeekShort(monday) {
    return parseISODate(monday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "Jun 22-Jun 26" (Mon-Fri) label for a week
function weekRangeLabel(monday) {
    const end = parseISODate(monday);
    end.setDate(end.getDate() + 4);
    return `${formatWeekShort(monday)}-${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// ----- Summer Planner state (starred camps + week assignments) -----
// All reads/writes go through loadPlannerState/savePlannerState so the
// storage backend can be swapped later without touching render logic.
const PLANNER_KEY = 'pvcamps-planner-v1';
let plannerState = { starred: [], assignments: {} };

function campRunsWeek(campId, weekMonday) {
    const camp = allCamps.find(c => c.id === campId);
    return !!camp && campCoveredWeeks(camp).has(weekMonday);
}

function loadPlannerState() {
    try {
        const raw = JSON.parse(localStorage.getItem(PLANNER_KEY));
        if (!raw || !Array.isArray(raw.starred)) return;
        const validIds = new Set(allCamps.map(c => c.id));
        plannerState.starred = raw.starred.filter(id => validIds.has(id));
        plannerState.assignments = {};
        for (const [week, ids] of Object.entries(raw.assignments || {})) {
            const camps = (Array.isArray(ids) ? ids : [ids]).filter(id =>
                plannerState.starred.includes(id) && campRunsWeek(id, week));
            if (camps.length > 0) {
                plannerState.assignments[week] = camps;
            }
        }
    } catch (e) {
        plannerState = { starred: [], assignments: {} };
    }
}

function savePlannerState() {
    plannerState.updated = new Date().toISOString();
    try {
        localStorage.setItem(PLANNER_KEY, JSON.stringify(plannerState));
    } catch (e) {
        // Private browsing or full storage: planner still works for the session
    }
}

function isStarred(campId) {
    return plannerState.starred.includes(campId);
}

function toggleStar(campId) {
    if (isStarred(campId)) {
        plannerState.starred = plannerState.starred.filter(id => id !== campId);
        for (const [week, ids] of Object.entries(plannerState.assignments)) {
            const rest = ids.filter(id => id !== campId);
            if (rest.length > 0) {
                plannerState.assignments[week] = rest;
            } else {
                delete plannerState.assignments[week];
            }
        }
    } else {
        plannerState.starred.push(campId);
    }
    savePlannerState();
    refreshStarButtons(campId);
    updatePlannerChip();
}

// Sync every star button for this camp without a full re-render
function refreshStarButtons(campId) {
    const starred = isStarred(campId);
    document.querySelectorAll(`.star-btn[data-star-id="${campId}"]`).forEach(btn => {
        btn.setAttribute('aria-pressed', String(starred));
        btn.classList.toggle('starred', starred);
    });
}

function updatePlannerChip() {
    const chip = document.getElementById('planner-count');
    if (!chip) return;
    const count = plannerState.starred.length;
    chip.textContent = count > 0 ? count : '';
    chip.style.display = count > 0 ? '' : 'none';
}

function createStarButton(camp) {
    const starred = isStarred(camp.id);
    return `<button class="star-btn${starred ? ' starred' : ''}" data-star-id="${camp.id}"
        aria-pressed="${starred}" aria-label="Save to Summer Planner" title="Save to Summer Planner">★</button>`;
}

function populateFilters() {
    // Populate towns from actual camp data
    const townsInData = new Set();
    allCamps.forEach(camp => {
        if (camp.location?.town) {
            townsInData.add(camp.location.town);
        }
    });
    Array.from(townsInData).sort().forEach(town => {
        const option = document.createElement('option');
        option.value = town;
        option.textContent = town;
        townSelect.appendChild(option);
    });

    // Populate weeks from actual camp data, normalized to Mondays
    allSummerWeeks().forEach(monday => {
        const option = document.createElement('option');
        option.value = monday;
        option.textContent = weekRangeLabel(monday);
        weekSelect.appendChild(option);
    });

    // Populate categories
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        categorySelect.appendChild(option);
    });
}

function setupEventListeners() {
    // Search with debounce
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFilters, 300);
    });

    // Filter changes
    [ageMinSelect, ageMaxSelect, townSelect, categorySelect, costMaxSelect, weekSelect].forEach(el => {
        el.addEventListener('change', applyFilters);
    });

    [earlyDropoffCheckbox, financialAidCheckbox, latePickupCheckbox].forEach(el => {
        el.addEventListener('change', applyFilters);
    });

    // Clear filters
    clearFiltersBtn.addEventListener('click', clearFilters);
    clearFiltersAltBtn?.addEventListener('click', clearFilters);

    // Suggest form toggle
    suggestBtn.addEventListener('click', (e) => {
        e.preventDefault();
        suggestForm.style.display = suggestForm.style.display === 'none' ? 'block' : 'none';
        if (suggestForm.style.display === 'block') {
            suggestForm.scrollIntoView({ behavior: 'smooth' });
        }
    });

    footerSuggest?.addEventListener('click', (e) => {
        e.preventDefault();
        suggestForm.style.display = 'block';
        suggestForm.scrollIntoView({ behavior: 'smooth' });
    });

    // Modal events
    modalClose.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
            closeModal();
        }
    });

    // View toggle
    viewGridBtn?.addEventListener('click', () => setView('grid'));
    viewListBtn?.addEventListener('click', () => setView('list'));
    viewPlannerBtn?.addEventListener('click', () => setView('planner'));

    // Planner interactions (assignment cells, unstar, camp links, actions)
    document.getElementById('planner-body')?.addEventListener('click', (e) => {
        const cell = e.target.closest('.cell-btn');
        if (cell) {
            toggleAssignment(cell.dataset.week, cell.dataset.camp);
            return;
        }
        const unstar = e.target.closest('.unstar-btn');
        if (unstar) {
            toggleStar(unstar.dataset.starId);
            renderPlanner();
            return;
        }
        const title = e.target.closest('.camp-title-btn');
        if (title) {
            const camp = allCamps.find(c => c.id === title.dataset.campId);
            if (camp) {
                openModal(camp);
            }
            return;
        }
        if (e.target.closest('#planner-browse')) {
            setView('grid');
            return;
        }
        const copyBtn = e.target.closest('#copy-plan, #copy-table');
        if (copyBtn) {
            const label = copyBtn.textContent;
            const text = copyBtn.id === 'copy-table' ? buildPlanTable() : buildPlanLink();
            copyTextToClipboard(text).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    if (copyBtn.isConnected) copyBtn.textContent = label;
                }, 2000);
            });
            return;
        }
        if (e.target.closest('#clear-plan')) {
            if (confirm('Clear all week assignments? Saved camps stay saved.')) {
                plannerState.assignments = {};
                savePlannerState();
                renderPlanner();
            }
        }
    });

    // Table sort headers
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });

    // Delegate click events for camp cards (star first, so it never opens the modal)
    campsGrid.addEventListener('click', (e) => {
        const star = e.target.closest('.star-btn');
        if (star) {
            toggleStar(star.dataset.starId);
            return;
        }
        const btn = e.target.closest('.camp-title-btn');
        if (btn) {
            const campId = btn.dataset.campId;
            const camp = allCamps.find(c => c.id === campId);
            if (camp) {
                openModal(camp);
            }
        }
    });

    // Delegate click events for table rows
    document.getElementById('camps-table-body')?.addEventListener('click', (e) => {
        const star = e.target.closest('.star-btn');
        if (star) {
            toggleStar(star.dataset.starId);
            return;
        }
        const row = e.target.closest('tr[data-camp-id]');
        if (row) {
            const camp = allCamps.find(c => c.id === row.dataset.campId);
            if (camp) {
                openModal(camp);
            }
        }
    });

    // Star button inside the modal header
    modalBody.addEventListener('click', (e) => {
        const star = e.target.closest('.star-btn');
        if (star) {
            toggleStar(star.dataset.starId);
        }
    });
}

// Helper functions for extended care detection
function hasEarlyDropoff(camp) {
    const extendedCare = camp.dates?.extendedCare || '';
    const hours = camp.dates?.hours || '';
    const combined = (extendedCare + ' ' + hours).toLowerCase();

    // Look for AM times and check if any are before 8:30am
    const amTimes = combined.match(/(\d{1,2}):?(\d{2})?\s*am/gi) || [];
    for (const match of amTimes) {
        const timeMatch = match.match(/(\d{1,2}):?(\d{2})?/);
        if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            // Consider anything before 8:30am as early drop-off
            if (hour < 8 || (hour === 8 && minute < 30)) return true;
        }
    }

    return false;
}

function hasLatePickup(camp) {
    const combined = ((camp.dates?.hours || '') + ' ' + (camp.dates?.extendedCare || '')).toLowerCase();
    const pmTimes = combined.match(/(\d{1,2})(?::(\d{2}))?\s*pm/gi) || [];
    for (const match of pmTimes) {
        const timeMatch = match.match(/(\d{1,2})(?::(\d{2}))?/);
        if (timeMatch) {
            const hour = parseInt(timeMatch[1]);
            // In 12-hour PM: hours 4-11 = 4pm–11pm (late pickup); 12 = noon (skip); 1-3 = 1pm–3pm (not late)
            if (hour >= 4 && hour <= 11) return true;
        }
    }
    return false;
}

function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const ageMin = ageMinSelect.value ? parseInt(ageMinSelect.value) : null;
    const ageMax = ageMaxSelect.value ? parseInt(ageMaxSelect.value) : null;
    const town = townSelect.value;
    const category = categorySelect.value;
    const costMax = costMaxSelect.value ? parseInt(costMaxSelect.value) : null;
    const selectedWeek = weekSelect.value;
    const needsEarlyDropoff = earlyDropoffCheckbox.checked;
    const needsFinancialAid = financialAidCheckbox.checked;
    const needsLatePickup = latePickupCheckbox.checked;

    filteredCamps = allCamps.filter(camp => {
        // Search term
        if (searchTerm) {
            const searchable = [
                camp.name,
                camp.organization,
                camp.description,
                camp.location?.town
            ].filter(Boolean).join(' ').toLowerCase();

            if (!searchable.includes(searchTerm)) {
                return false;
            }
        }

        // Age filter - camp must accept children in the selected age range
        if (ageMin !== null && camp.ages?.max && camp.ages.max < ageMin) {
            return false;
        }
        if (ageMax !== null && camp.ages?.min && camp.ages.min > ageMax) {
            return false;
        }

        // Town filter
        if (town && camp.location?.town !== town) {
            return false;
        }

        // Category filter
        if (category && (!camp.category || !camp.category.includes(category))) {
            return false;
        }

        // Cost filter (0 = free, which passes any cap; unknown cost is excluded)
        if (costMax !== null && (camp.cost?.perWeek == null || camp.cost.perWeek > costMax)) {
            return false;
        }

        // Week filter - camp must run during the selected week (Monday-
        // normalized, multi-week sessions cover all their weeks)
        if (selectedWeek && !campCoveredWeeks(camp).has(selectedWeek)) {
            return false;
        }

        // Early drop-off filter
        if (needsEarlyDropoff && !hasEarlyDropoff(camp)) {
            return false;
        }

        // Financial aid filter
        if (needsFinancialAid && !camp.cost?.financialAid) {
            return false;
        }

        // Late pickup filter
        if (needsLatePickup && !hasLatePickup(camp)) {
            return false;
        }

        return true;
    });

    updateURL();
    renderCamps();
}

function clearFilters() {
    searchInput.value = '';
    ageMinSelect.value = '';
    ageMaxSelect.value = '';
    townSelect.value = '';
    categorySelect.value = '';
    costMaxSelect.value = '';
    weekSelect.value = '';
    earlyDropoffCheckbox.checked = false;
    financialAidCheckbox.checked = false;
    latePickupCheckbox.checked = false;
    applyFilters();
}

function setView(view) {
    if (currentView === view) return;
    currentView = view;

    viewGridBtn.classList.toggle('active', view === 'grid');
    viewListBtn.classList.toggle('active', view === 'list');
    viewPlannerBtn?.classList.toggle('active', view === 'planner');

    renderCamps();
}

function renderCamps() {
    if (currentView === 'planner') {
        document.body.className = 'view-planner';
        renderPlanner();
        return;
    }

    // Update count
    resultsCount.textContent = `${filteredCamps.length} camp${filteredCamps.length !== 1 ? 's' : ''} found`;

    document.body.className = currentView === 'list' ? 'view-table' : 'view-grid';

    const tableBody = document.getElementById('camps-table-body');

    // Show/hide no results
    if (filteredCamps.length === 0) {
        campsGrid.innerHTML = '';
        if (tableBody) tableBody.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    // Sort before rendering
    sortCamps();

    if (currentView === 'grid') {
        campsGrid.innerHTML = filteredCamps.map(camp => createCampCard(camp)).join('');
    } else if (tableBody) {
        tableBody.innerHTML = filteredCamps.map(camp => createCampRow(camp)).join('');
    }
}

function createCampRow(camp) {
    const ageRange = camp.ages?.min || camp.ages?.max
        ? `${camp.ages.min || '?'}-${camp.ages.max || '?'} yrs`
        : 'TBD';

    const cost = formatCost(camp.cost?.perWeek, '') || 'TBD';

    const location = camp.location?.town || 'TBD';
    const weekCount = camp.dates?.weeks?.length || 0;

    return `
        <tr data-camp-id="${camp.id}">
            <td class="star-col">${createStarButton(camp)}</td>
            <td><strong>${escapeHtml(camp.name)}</strong><br><span style="font-size: 0.85em; color: var(--text-secondary);">${escapeHtml(camp.organization)}</span></td>
            <td>${cost}</td>
            <td>${ageRange}</td>
            <td>${escapeHtml(location)}</td>
            <td>${weekCount} week${weekCount !== 1 ? 's' : ''}</td>
        </tr>
    `;
}

function sortCamps() {
    filteredCamps.sort((a, b) => {
        let valA, valB;

        switch (currentSort.column) {
            case 'name':
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
                break;
            case 'cost':
                valA = a.cost?.perWeek ?? 9999;
                valB = b.cost?.perWeek ?? 9999;
                break;
            case 'ages':
                valA = a.ages?.min || 99;
                valB = b.ages?.min || 99;
                break;
            case 'town':
                valA = (a.location?.town || 'z').toLowerCase();
                valB = (b.location?.town || 'z').toLowerCase();
                break;
            default:
                return 0;
        }

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    updateSortHeaders();
}

function updateSortHeaders() {
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.dataset.sort === currentSort.column) {
            th.classList.add(currentSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });
}

function handleSort(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    renderCamps();
}

function createCampCard(camp) {
    const ageRange = camp.ages?.min || camp.ages?.max
        ? `${camp.ages.min || '?'}-${camp.ages.max || '?'} yrs`
        : 'Ages TBD';

    const cost = formatCost(camp.cost?.perWeek) || 'Cost TBD';

    const location = camp.location?.town || 'Location TBD';

    const categoryTags = (camp.category || []).slice(0, 2).map(catId => {
        const cat = categories.find(c => c.id === catId);
        return cat ? `<span class="camp-tag category">${cat.name}</span>` : '';
    }).join('');

    const badges = [];
    if (hasEarlyDropoff(camp)) {
        badges.push('<span class="badge badge-early">Early drop-off</span>');
    }
    if (camp.cost?.financialAid) {
        badges.push('<span class="badge badge-aid">Financial aid</span>');
    }

    // List view has simplified content handled by CSS, but shared structure
    return `
        <article class="camp-card">
            <div class="camp-card-header">
                ${createStarButton(camp)}
                <h3><button class="camp-title-btn" data-camp-id="${camp.id}">${escapeHtml(camp.name)}</button></h3>
                ${camp.organization ? `<p class="camp-organization">${escapeHtml(camp.organization)}</p>` : ''}
            </div>
            <div class="camp-card-body">
                <div class="camp-meta">
                    <span class="camp-meta-item"><strong>${ageRange}</strong></span>
                    <span class="camp-meta-item"><strong>${cost}</strong></span>
                    <span class="camp-meta-item">${escapeHtml(location)}</span>
                </div>
                ${camp.description ? `<p class="camp-description">${escapeHtml(camp.description)}</p>` : ''}
                <div class="camp-tags">
                    ${categoryTags}
                </div>
                ${badges.length > 0 ? `<div class="camp-badges">${badges.join('')}</div>` : ''}
            </div>
        </article>
    `;
}

// ----- Summer Planner view -----

// Share link format: ?plan=2026-06-22:camp-a,2026-06-29:camp-b (week repeats for multi-camp weeks)
function buildPlanLink() {
    const parts = [];
    Object.keys(plannerState.assignments).sort().forEach(week => {
        plannerState.assignments[week].forEach(id => parts.push(`${week}:${id}`));
    });
    return `${location.origin}${location.pathname}?plan=${parts.join(',')}`;
}

function importPlanFromParam(planParam) {
    const imported = {};
    const campIds = new Set();
    planParam.split(',').forEach(entry => {
        const [week, campId] = entry.split(':');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(week || '') || !campId) return;
        if (!campRunsWeek(campId, week)) return;
        const ids = imported[week] = imported[week] || [];
        if (!ids.includes(campId)) {
            ids.push(campId);
            campIds.add(campId);
        }
    });
    if (Object.keys(imported).length === 0) return false;

    const hasLocalPlan = Object.keys(plannerState.assignments).length > 0;
    if (hasLocalPlan && !confirm('Replace your saved summer plan with this shared one?')) {
        return false;
    }
    plannerState.assignments = imported;
    campIds.forEach(id => {
        if (!isStarred(id)) {
            plannerState.starred.push(id);
        }
    });
    savePlannerState();
    return true;
}

function toggleAssignment(week, campId) {
    const ids = plannerState.assignments[week] || [];
    const next = ids.includes(campId)
        ? ids.filter(id => id !== campId)
        : [...ids, campId];
    if (next.length > 0) {
        plannerState.assignments[week] = next;
    } else {
        delete plannerState.assignments[week];
    }
    savePlannerState();
    renderPlanner();
}

function renderPlanner() {
    const container = document.getElementById('planner-body');
    if (!container) return;

    const starredCamps = plannerState.starred
        .map(id => allCamps.find(c => c.id === id))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

    if (starredCamps.length === 0) {
        container.innerHTML = `
            <div class="planner-empty">
                <h2>Plan your summer</h2>
                <p>Star camps while browsing (the ★ on any camp) and they show up here in a
                week-by-week grid, so you can see which weeks are covered and what the
                summer will cost.</p>
                <button id="planner-browse" class="btn-primary">Browse camps</button>
            </div>`;
        return;
    }

    const weeks = allSummerWeeks();
    const withDates = starredCamps.filter(c => c.dates?.weeks?.length > 0);
    const noDates = starredCamps.filter(c => !(c.dates?.weeks?.length > 0));

    let html = plannerSummaryHtml(weeks);
    if (withDates.length > 0) {
        html += plannerGridHtml(withDates, weeks);
    } else {
        html += `<p class="planner-note">None of your saved camps have published 2026 session
            dates yet. Open each camp below for its website link.</p>`;
    }
    if (noDates.length > 0) {
        html += plannerNoDatesHtml(noDates);
    }
    const hasPlan = Object.keys(plannerState.assignments).length > 0;
    html += `
        <div class="planner-actions">
            ${hasPlan ? `
            <button id="copy-plan" class="btn-primary">Copy plan link</button>
            <button id="copy-table" class="btn-secondary">Copy for spreadsheet</button>` : ''}
            <button id="clear-plan" class="btn-secondary">Clear plan</button>
        </div>`;
    container.innerHTML = html;
}

function plannerSummaryHtml(weeks) {
    const cells = weeks.map(week => {
        const names = (plannerState.assignments[week] || [])
            .map(id => allCamps.find(c => c.id === id)?.name)
            .filter(Boolean);
        let label = '<span class="summary-none">&mdash;</span>';
        if (names.length > 2) {
            label = `<span class="summary-camp">${names.length} camps</span>`;
        } else if (names.length > 0) {
            label = names.map(n => `<span class="summary-camp">${escapeHtml(n)}</span>`).join('');
        }
        return `
            <div class="summary-week${names.length > 0 ? ' covered' : ''}">
                <div class="summary-date">${formatWeekShort(week)}</div>
                ${label}
            </div>`;
    }).join('');

    const covered = weeks.filter(w => (plannerState.assignments[w] || []).length > 0).length;

    return `
        <div class="planner-summary" aria-live="polite">
            <div class="summary-strip">${cells}</div>
            <p class="summary-totals"><strong>${covered} of ${weeks.length} weeks covered.</strong> Estimated cost: ${planTotals().text}.</p>
        </div>`;
}

function planTotals() {
    let cost = 0;
    let tbd = 0;
    Object.values(plannerState.assignments).forEach(ids => ids.forEach(id => {
        const camp = allCamps.find(c => c.id === id);
        if (camp?.cost?.perWeek != null) {
            cost += camp.cost.perWeek;
        } else {
            tbd++;
        }
    }));
    let text = `$${cost.toLocaleString()}`;
    if (tbd > 0) {
        text += ` plus ${tbd} camp week${tbd !== 1 ? 's' : ''} TBD`;
    }
    return { cost, tbd, text };
}

// Tab-separated plan table that pastes cleanly into Excel / Google Sheets.
// One row per week (uncovered weeks included, so coverage gaps are visible
// when families compare plans side by side). No costs: shared tables are
// for coordinating schedules, not budgets.
function buildPlanTable() {
    const lines = [['Week', 'Camp', 'Town'].join('\t')];
    allSummerWeeks().forEach(week => {
        const label = weekRangeLabel(week);
        const ids = plannerState.assignments[week] || [];
        if (ids.length === 0) {
            lines.push([label, '', ''].join('\t'));
            return;
        }
        ids.forEach(id => {
            const camp = allCamps.find(c => c.id === id);
            if (camp) {
                lines.push([label, camp.name, camp.location?.town || ''].join('\t'));
            }
        });
    });
    return lines.join('\n');
}

function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (e) { /* fall through to prompt */ }
    ta.remove();
    if (!ok) {
        prompt('Copy this:', text);
    }
}

function plannerGridHtml(camps, weeks) {
    const head = `<tr>
        <th scope="col" class="planner-camp-col">Camp</th>
        ${weeks.map(w => `<th scope="col">${formatWeekShort(w)}</th>`).join('')}
    </tr>`;

    const rows = camps.map(camp => {
        const campWeeks = campCoveredWeeks(camp);
        const cells = weeks.map(week => {
            if (!campWeeks.has(week)) {
                return '<td class="cell-na"></td>';
            }
            const assigned = (plannerState.assignments[week] || []).includes(camp.id);
            return `
                <td class="${assigned ? 'cell-assigned' : 'cell-avail'}">
                    <button class="cell-btn" data-week="${week}" data-camp="${camp.id}"
                        aria-pressed="${assigned}"
                        aria-label="${assigned ? 'Remove' : 'Add'} ${escapeAttr(camp.name)}, week of ${formatWeekShort(week)}">${assigned ? '&check;' : '+'}</button>
                </td>`;
        }).join('');

        const meta = [
            camp.location?.town,
            formatCost(camp.cost?.perWeek, '/wk') || 'Cost TBD',
            camp.dates?.sessionLength
        ].filter(Boolean).map(v => escapeHtml(String(v))).join(' &middot; ');

        return `<tr>
            <th scope="row" class="planner-camp-col">
                <button class="camp-title-btn" data-camp-id="${camp.id}">${escapeHtml(camp.name)}</button>
                <span class="planner-camp-meta">${meta}</span>
                <button class="unstar-btn" data-star-id="${camp.id}">Remove</button>
            </th>
            ${cells}
        </tr>`;
    }).join('');

    return `
        <div class="planner-grid-wrap">
            <table class="planner-grid">
                <thead>${head}</thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function plannerNoDatesHtml(camps) {
    const items = camps.map(camp => `
        <li>
            <button class="camp-title-btn" data-camp-id="${camp.id}">${escapeHtml(camp.name)}</button>
            <span class="planner-camp-meta">${escapeHtml(camp.location?.town || '')} &middot; Check website for 2026 dates</span>
            <button class="unstar-btn" data-star-id="${camp.id}">Remove</button>
        </li>`).join('');
    return `
        <div class="planner-no-dates">
            <h3>Dates unknown</h3>
            <p>These saved camps have not published week-by-week dates yet, so they can't be
            placed on the grid. Verify dates on their websites.</p>
            <ul>${items}</ul>
        </div>`;
}

function openModal(camp) {
    const html = createModalContent(camp);
    modalBody.innerHTML = html;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    history.replaceState(null, '', location.pathname + location.search + '#' + camp.id);
}

function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    if (location.hash) {
        history.replaceState(null, '', location.pathname + location.search);
    }
}

function createModalContent(camp) {
    const ageRange = camp.ages?.min || camp.ages?.max
        ? `Ages ${camp.ages.min || '?'} to ${camp.ages.max || '?'}`
        : 'Ages not specified';

    const categoryTags = (camp.category || []).map(catId => {
        const cat = categories.find(c => c.id === catId);
        return cat ? `<span class="camp-tag category">${cat.name}</span>` : '';
    }).join('');

    // Build hours section
    let hoursHtml = '';
    if (camp.dates?.hours) {
        hoursHtml += `<li><strong>Regular hours:</strong> ${escapeHtml(camp.dates.hours)}</li>`;
    }

    // Parse extended care into early/late
    const extendedCare = camp.dates?.extendedCare;
    if (extendedCare) {
        if (hasEarlyDropoff(camp)) {
            hoursHtml += `<li><strong>Early drop-off:</strong> Available</li>`;
        }
        hoursHtml += `<li><em>${escapeHtml(extendedCare)}</em></li>`;
    }

    // Build cost section
    let costHtml = '';
    if (camp.cost?.perWeek != null) {
        costHtml += `<li><strong>Cost:</strong> ${formatCost(camp.cost.perWeek)}</li>`;
    }
    if (camp.cost?.notes) {
        costHtml += `<li>${escapeHtml(camp.cost.notes)}</li>`;
    }
    if (camp.cost?.financialAid) {
        costHtml += `<li><strong>Financial aid:</strong> Available</li>`;
    }

    // Build dates section
    let datesHtml = '';
    if (camp.dates?.weeks?.length > 0) {
        const sessionSpan = camp.dates?.weeksPerSession || 1;
        const weeks = camp.dates.weeks.map(w => {
            const start = parseISODate(w);
            const end = new Date(start);
            // Sunday starts run Sun-Sat (overnight camps); weekday starts run
            // through Friday; multi-week sessions extend by whole weeks
            const day = start.getDay();
            end.setDate(end.getDate() + (day === 0 ? 6 : Math.max(5 - day, 0)) + (sessionSpan - 1) * 7);
            const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${startStr} - ${endStr}`;
        });
        datesHtml += `<li><strong>${seasonYear} Sessions:</strong></li>`;
        datesHtml += `<ul>${weeks.map(w => `<li>${w}</li>`).join('')}</ul>`;
    } else {
        datesHtml += `<li><strong>${seasonYear} Sessions:</strong> Check website for dates</li>`;
    }
    if (camp.dates?.sessionLength) {
        datesHtml += `<li><strong>Session length:</strong> ${escapeHtml(camp.dates.sessionLength)}</li>`;
    }

    // Build registration section
    let regHtml = '';
    if (camp.registration?.opens) {
        const opensFormatted = formatDate(camp.registration.opens);
        regHtml += `<li><strong>Registration opens:</strong> ${opensFormatted}</li>`;
    }
    if (camp.registration?.deadline) {
        const deadlineFormatted = formatDate(camp.registration.deadline);
        regHtml += `<li><strong>Deadline:</strong> ${deadlineFormatted}</li>`;
    }

    // Location
    let locationHtml = camp.location?.town || '';
    if (camp.location?.address) {
        locationHtml += ` - ${camp.location.address}`;
    }

    // Source link (only allow http/https, escape for the href attribute)
    const rawUrl = camp.registration?.url || camp.source?.url || '';
    const sourceUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl.replace(/"/g, '&quot;') : '#';

    // Incomplete data warning
    const incompleteHtml = camp.incomplete?.length > 0
        ? `<div class="modal-incomplete">Some information is missing: ${camp.incomplete.join(', ')}. Please verify with the camp directly.</div>`
        : '';

    return `
        <div class="modal-header">
            ${createStarButton(camp)}
            <h2>${escapeHtml(camp.name)}</h2>
            ${camp.organization ? `<p class="organization">${escapeHtml(camp.organization)}</p>` : ''}
        </div>

        <div class="modal-section">
            <p>${escapeHtml(camp.description || 'No description available.')}</p>
        </div>

        <div class="modal-grid">
            <div class="modal-section">
                <h3>Age Range</h3>
                <p>${ageRange}</p>
            </div>
            <div class="modal-section">
                <h3>Location</h3>
                <p>${escapeHtml(locationHtml) || 'Not specified'}</p>
            </div>
        </div>

        ${hoursHtml ? `
        <div class="modal-section">
            <h3>Hours & Extended Care</h3>
            <ul>${hoursHtml}</ul>
        </div>
        ` : ''}

        ${costHtml ? `
        <div class="modal-section">
            <h3>Cost & Financial Aid</h3>
            <ul>${costHtml}</ul>
        </div>
        ` : ''}

                <div class="modal-section">
            <h3>Dates</h3>
            <ul>${datesHtml}</ul>
        </div>

        ${regHtml ? `
        <div class="modal-section">
            <h3>Registration</h3>
            <ul>${regHtml}</ul>
        </div>
        ` : ''}

        ${categoryTags ? `
        <div class="modal-section">
            <h3>Categories</h3>
            <div class="modal-tags">${categoryTags}</div>
        </div>
        ` : ''}

        ${incompleteHtml}

        <a href="${sourceUrl}" target="_blank" rel="noopener" class="modal-link">
            Visit Camp Website &rarr;
        </a>

        ${camp.source?.lastVerified ? `
        <p style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-secondary);">
            Last verified: ${camp.source.lastVerified}
        </p>
        ` : ''}
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// For interpolation inside double-quoted HTML attributes
function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
}

// Known cost -> "$350/week" or "Free"; unknown (null) -> null so callers show TBD
function formatCost(perWeek, suffix = '/week') {
    if (perWeek == null) return null;
    return perWeek === 0 ? 'Free' : `$${perWeek}${suffix}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    // If it looks like YYYY-MM-DD, format it nicely
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return parseISODate(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    // Otherwise return as-is (supports "February 2026", "Early January", etc.)
    return dateStr;
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
