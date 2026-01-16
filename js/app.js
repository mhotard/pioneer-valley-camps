/**
 * Pioneer Valley Kids Camps - Main Application
 */

// State
let allCamps = [];
let filteredCamps = [];
let categories = [];
let regions = {};

// DOM Elements
const searchInput = document.getElementById('search-input');
const ageMinSelect = document.getElementById('age-min');
const ageMaxSelect = document.getElementById('age-max');
const townSelect = document.getElementById('town-select');
const categorySelect = document.getElementById('category-select');
const costMaxSelect = document.getElementById('cost-max');
const weekSelect = document.getElementById('week-select');
const earlyDropoffCheckbox = document.getElementById('has-early-dropoff');
const financialAidCheckbox = document.getElementById('has-financial-aid');
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

        // Update last updated date
        if (campsData.lastUpdated) {
            lastUpdated.textContent = campsData.lastUpdated;
        }

        // Populate filter dropdowns
        populateFilters();

        // Initial render
        applyFilters();

        // Hide loading
        loading.style.display = 'none';

        // Set up event listeners
        setupEventListeners();

    } catch (error) {
        console.error('Failed to load data:', error);
        loading.innerHTML = '<p>Failed to load camp data. Please try refreshing the page.</p>';
    }
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

    [earlyDropoffCheckbox, financialAidCheckbox].forEach(el => {
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

    // Delegate click events for camp cards
    campsGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.camp-title-btn');
        if (btn) {
            const campId = btn.dataset.campId;
            const camp = allCamps.find(c => c.id === campId);
            if (camp) {
                openModal(camp);
            }
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

        // Cost filter
        if (costMax !== null && (!camp.cost?.perWeek || camp.cost.perWeek > costMax)) {
            return false;
        }

        // Week filter - camp must have the selected week available
        if (selectedWeek) {
            const campWeeks = camp.dates?.weeks || [];
            if (!campWeeks.includes(selectedWeek)) {
                return false;
            }
        }

        // Early drop-off filter
        if (needsEarlyDropoff && !hasEarlyDropoff(camp)) {
            return false;
        }

        // Financial aid filter
        if (needsFinancialAid && !camp.cost?.financialAid) {
            return false;
        }

        return true;
    });

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
    applyFilters();
}

function renderCamps() {
    // Update count
    resultsCount.textContent = `${filteredCamps.length} camp${filteredCamps.length !== 1 ? 's' : ''} found`;

    // Show/hide no results
    if (filteredCamps.length === 0) {
        campsGrid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    // Render camp cards
    campsGrid.innerHTML = filteredCamps.map(camp => createCampCard(camp)).join('');
}

function createCampCard(camp) {
    const ageRange = camp.ages?.min || camp.ages?.max
        ? `${camp.ages.min || '?'}-${camp.ages.max || '?'} yrs`
        : 'Ages TBD';

    const cost = camp.cost?.perWeek
        ? `$${camp.cost.perWeek}/week`
        : 'Cost TBD';

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

    return `
        <article class="camp-card">
            <div class="camp-card-header">
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

function openModal(camp) {
    const html = createModalContent(camp);
    modalBody.innerHTML = html;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
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
    if (camp.cost?.perWeek) {
        costHtml += `<li><strong>Cost:</strong> $${camp.cost.perWeek}/week</li>`;
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
        const weeks = camp.dates.weeks.map(w => {
            const start = new Date(w + 'T00:00:00');
            const end = new Date(start);
            end.setDate(end.getDate() + 4); // Mon-Fri
            const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${startStr} - ${endStr}`;
        });
        datesHtml += `<li><strong>2026 Sessions:</strong></li>`;
        datesHtml += `<ul>${weeks.map(w => `<li>${w}</li>`).join('')}</ul>`;
    } else {
        datesHtml += `<li><strong>2026 Sessions:</strong> Check website for dates</li>`;
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

    // Source link
    const sourceUrl = camp.registration?.url || camp.source?.url || '#';

    // Incomplete data warning
    const incompleteHtml = camp.incomplete?.length > 0
        ? `<div class="modal-incomplete">Some information is missing: ${camp.incomplete.join(', ')}. Please verify with the camp directly.</div>`
        : '';

    return `
        <div class="modal-header">
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

function formatDate(dateStr) {
    if (!dateStr) return '';
    // If it looks like YYYY-MM-DD, format it nicely
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    // Otherwise return as-is (supports "February 2026", "Early January", etc.)
    return dateStr;
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
