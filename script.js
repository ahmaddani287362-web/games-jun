// ============================================
// GAME TRACKER PREMIUM - COMPLETE VERSION
// All Features: Portrait Cards, Grouping, Detail Modal, Pull to Refresh
// ============================================

// Configuration
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_KEY = window.SUPABASE_KEY;
const RAWG_API_KEY = window.RAWG_API_KEY;

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State
let gamesData = [];
let currentCoverUrl = null;
let deleteId = null;
let genreChart, completionChart, ratingChart;
let pullStartY = 0;

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function vibrate() {
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(30);
    }
}

function showNotification(msg, type) {
    let notif = document.getElementById('notification');
    if (!notif) {
        notif = document.createElement('div');
        notif.id = 'notification';
        notif.style.cssText = 'position:fixed; bottom:30px; right:30px; padding:12px 24px; border-radius:12px; color:white; z-index:10000; display:none';
        document.body.appendChild(notif);
    }
    notif.textContent = msg;
    notif.style.background = type === 'success' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)';
    notif.style.display = 'block';
    setTimeout(() => { notif.style.display = 'none'; }, 3000);
}

function getGradientColor(title) {
    const colors = ['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#10b981', '#f59e0b'];
    const index = title.length % colors.length;
    return colors[index];
}

function getSmartPlaceholder(title) {
    const color = getGradientColor(title);
    return `https://placehold.co/400x600/${color.substring(1)}/ffffff?text=${encodeURIComponent(title.substring(0,2).toUpperCase())}`;
}

function renderStars(rating) {
    let stars = '';
    const full = Math.floor(rating);
    const half = rating % 1 !== 0;
    for (let i = 1; i <= 5; i++) {
        if (i <= full) stars += '<i class="fas fa-star"></i>';
        else if (half && i === full + 1) stars += '<i class="fas fa-star-half-alt"></i>';
        else stars += '<i class="far fa-star"></i>';
    }
    return stars;
}

// ============================================
// SKELETON LOADING
// ============================================

function showSkeletons() {
    const grid = document.getElementById('gamesGrid');
    if (!grid) return;
    grid.innerHTML = Array(6).fill(0).map(() => `
        <div class="game-card">
            <div class="skeleton skeleton-cover"></div>
            <div class="card-content">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text" style="width:60%"></div>
            </div>
        </div>
    `).join('');
}

// ============================================
// RAWG API
// ============================================

async function searchGamesAPI(query) {
    if (!query || query.length < 2) return [];
    try {
        const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&key=${RAWG_API_KEY}&page_size=8`;
        const res = await fetch(url);
        const data = await res.json();
        return data.results?.map(g => ({
            id: g.id, name: g.name, cover: g.background_image,
            genres: g.genres?.map(ge => ge.name).join(', ') || '',
            platforms: g.platforms?.map(p => p.platform.name).slice(0,2).join(', ') || '',
            rating: g.rating || 0
        })) || [];
    } catch(e) { return []; }
}

async function getGameDetails(id) {
    try {
        const res = await fetch(`https://api.rawg.io/api/games/${id}?key=${RAWG_API_KEY}`);
        return await res.json();
    } catch(e) { return null; }
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderGroupedGames(filtered) {
    const groups = {
        playing: { title: '🎮 Currently Playing', icon: 'fa-play-circle', games: [] },
        backlog: { title: '📚 Backlog', icon: 'fa-book', games: [] },
        completed: { title: '🏆 Completed', icon: 'fa-trophy', games: [] }
    };
    filtered.forEach(g => { if (groups[g.status]) groups[g.status].games.push(g); });
    
    let html = '';
    for (const [key, group] of Object.entries(groups)) {
        if (group.games.length === 0) continue;
        html += `<div class="group-section"><div class="group-title"><i class="fas ${group.icon}"></i> ${group.title} (${group.games.length})</div><div class="games-grid">`;
        html += group.games.map(game => `
            <div class="game-card" data-id="${game.id}" data-game='${JSON.stringify(game)}'>
                <div class="game-cover">
                    <img src="${game.cover_url || getSmartPlaceholder(game.title)}" alt="${escapeHtml(game.title)}" loading="lazy" onerror="this.src='${getSmartPlaceholder(game.title)}'">
                    <div class="cover-overlay"></div>
                    <div class="progress-overlay"><div class="progress-fill" style="width:${game.progress || 0}%"></div></div>
                </div>
                <div class="card-content">
                    <div class="game-title">${escapeHtml(game.title)}<small>${escapeHtml(game.platform) || '-'}</small></div>
                    <div class="rating-stars">${renderStars(game.rating || 0)} <span style="font-size:0.65rem">⏱️ ${game.hours_played || 0}h</span></div>
                    <div class="game-meta"><span class="tag">${escapeHtml(game.genre) || 'General'}</span></div>
                    <div class="card-actions">
                        <button class="edit-game" data-id="${game.id}"><i class="fas fa-edit"></i> Edit</button>
                        <button class="delete-game" data-id="${game.id}"><i class="fas fa-trash-alt"></i> Delete</button>
                    </div>
                </div>
            </div>
        `).join('');
        html += `</div></div>`;
    }
    return html;
}

async function renderLibrary() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const genreFilter = document.getElementById('filterGenre')?.value || '';
    const platformFilter = document.getElementById('filterPlatform')?.value || '';
    const ratingFilter = document.getElementById('filterRating')?.value || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';

    let filtered = gamesData.filter(g => g.title?.toLowerCase().includes(search));
    if (genreFilter) filtered = filtered.filter(g => g.genre === genreFilter);
    if (platformFilter) filtered = filtered.filter(g => g.platform === platformFilter);
    if (ratingFilter) filtered = filtered.filter(g => g.rating >= parseInt(ratingFilter));
    
    const grid = document.getElementById('gamesGrid');
    if (!grid) return;
    
    if (!filtered.length) {
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-gamepad"></i><h3>No Games Found</h3><p>Try adjusting your filters or add a new game!</p></div>`;
        return;
    }
    
    showSkeletons();
    
    let html;
    if (statusFilter) {
        html = `<div class="games-grid">${filtered.map(game => `
            <div class="game-card" data-id="${game.id}" data-game='${JSON.stringify(game)}'>
                <div class="game-cover"><img src="${game.cover_url || getSmartPlaceholder(game.title)}" loading="lazy" onerror="this.src='${getSmartPlaceholder(game.title)}'"><div class="progress-overlay"><div class="progress-fill" style="width:${game.progress}%"></div></div></div>
                <div class="card-content"><div class="game-title">${escapeHtml(game.title)}<small>${escapeHtml(game.platform) || '-'}</small></div>
                <div class="rating-stars">${renderStars(game.rating)} <span>⏱️ ${game.hours_played}h</span></div>
                <div class="game-meta"><span class="tag">${escapeHtml(game.genre) || 'General'}</span></div>
                <div class="card-actions"><button class="edit-game" data-id="${game.id}"><i class="fas fa-edit"></i> Edit</button><button class="delete-game" data-id="${game.id}"><i class="fas fa-trash-alt"></i> Delete</button></div></div></div>
        `).join('')}</div>`;
    } else {
        html = renderGroupedGames(filtered);
    }
    
    grid.innerHTML = html;
    
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.card-actions')) {
                const gameData = JSON.parse(card.dataset.game);
                openGameDetail(gameData.id, gameData.title);
            }
        });
    });
    document.querySelectorAll('.edit-game').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); vibrate(); openEditModal(btn.dataset.id); });
    });
    document.querySelectorAll('.delete-game').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); vibrate(); deleteId = btn.dataset.id; document.getElementById('deleteModal').style.display = 'flex'; });
    });
}

// ============================================
// CHARTS WITH DARK MODE SYNC
// ============================================

function updateCharts() {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#cbd5e1' : '#475569';
    
    // Genre Chart
    const genreCount = {};
    gamesData.forEach(g => { if (g.genre) genreCount[g.genre] = (genreCount[g.genre] || 0) + 1; });
    const topGenres = Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const genreCtx = document.getElementById('genreChart')?.getContext('2d');
    if (genreCtx) {
        if (genreChart) genreChart.destroy();
        genreChart = new Chart(genreCtx, {
            type: 'doughnut',
            data: { labels: topGenres.map(g=>g[0]), datasets: [{ data: topGenres.map(g=>g[1]), backgroundColor: ['#8b5cf6','#ec4899','#06b6d4','#f97316','#10b981'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: true, cutout: '65%', plugins: { legend: { position: window.innerWidth < 480 ? 'bottom' : 'right', labels: { color: textColor, font: { size: window.innerWidth < 480 ? 10 : 12 } } } } }
        });
    }
    
    // Completion Chart
    const completionCtx = document.getElementById('completionChart')?.getContext('2d');
    if (completionCtx) {
        const compData = [gamesData.filter(g=>g.status==='completed').length, gamesData.filter(g=>g.status==='playing').length, gamesData.filter(g=>g.status==='backlog').length];
        if (completionChart) completionChart.destroy();
        completionChart = new Chart(completionCtx, {
            type: 'bar',
            data: { labels: ['Completed','Playing','Backlog'], datasets: [{ label: 'Games', data: compData, backgroundColor: '#8b5cf6', borderRadius: 12 }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false }, beginAtZero: true }, x: { ticks: { color: textColor } } } }
        });
    }
    
    // Rating Chart
    const ratingCtx = document.getElementById('ratingChart')?.getContext('2d');
    if (ratingCtx) {
        const ratingDist = [0,0,0,0,0];
        gamesData.forEach(g => { if(g.rating>=1 && g.rating<=5) ratingDist[Math.floor(g.rating)-1]++; });
        if (ratingChart) ratingChart.destroy();
        ratingChart = new Chart(ratingCtx, {
            type: 'line',
            data: { labels: ['★1','★2','★3','★4','★5'], datasets: [{ label: 'Games', data: ratingDist, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 3, tension: 0.3, fill: true, pointRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false }, beginAtZero: true }, x: { ticks: { color: textColor } } } }
        });
    }
}

function updateDashboard() {
    document.getElementById('totalGames').innerText = gamesData.length;
    document.getElementById('completedGames').innerText = gamesData.filter(g=>g.status==='completed').length;
    document.getElementById('totalHours').innerText = gamesData.reduce((s,g)=>s+(g.hours_played||0),0);
    document.getElementById('avgRating').innerText = gamesData.length ? (gamesData.reduce((s,g)=>s+(g.rating||0),0)/gamesData.length).toFixed(1) : 0;
    updateCharts();
}

function updateFilters() {
    const genres = [...new Set(gamesData.map(g=>g.genre).filter(Boolean))];
    const platforms = [...new Set(gamesData.map(g=>g.platform).filter(Boolean))];
    document.getElementById('filterGenre').innerHTML = '<option value="">All Genres</option>' + genres.map(g=>`<option value="${g}">${g}</option>`).join('');
    document.getElementById('filterPlatform').innerHTML = '<option value="">All Platforms</option>' + platforms.map(p=>`<option value="${p}">${p}</option>`).join('');
}

// ============================================
// DETAIL MODAL
// ============================================

async function openGameDetail(id, title) {
    const modal = document.getElementById('detailModal');
    const heroDiv = document.getElementById('detailHero');
    const contentDiv = document.getElementById('detailContent');
    modal.style.display = 'flex';
    heroDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:240px"><div class="loading-spinner"></div></div>';
    contentDiv.innerHTML = '';
    
    const details = await getGameDetails(id);
    if (details) {
        heroDiv.style.backgroundImage = `url(${details.background_image || getSmartPlaceholder(title)})`;
        heroDiv.style.backgroundSize = 'cover';
        heroDiv.style.backgroundPosition = 'center';
        heroDiv.innerHTML = '';
        contentDiv.innerHTML = `
            <h2 class="detail-title">${escapeHtml(details.name)}</h2>
            <div class="detail-meta">
                <div><i class="fas fa-calendar"></i> ${details.released || 'TBA'}</div>
                <div><i class="fas fa-star"></i> ${details.rating}/5</div>
                ${details.metacritic ? `<div><i class="fas fa-chart-line"></i> Metascore: ${details.metacritic}</div>` : ''}
            </div>
            <div class="detail-description">${details.description_raw || 'No description available.'}</div>
            <div class="detail-meta">
                ${details.genres ? `<div><strong>Genres:</strong> ${details.genres.map(g=>g.name).join(', ')}</div>` : ''}
                ${details.platforms ? `<div><strong>Platforms:</strong> ${details.platforms.slice(0,5).map(p=>p.platform.name).join(', ')}</div>` : ''}
            </div>
            <div class="detail-links">
                ${details.website ? `<a href="${details.website}" target="_blank" class="detail-link"><i class="fas fa-globe"></i> Official Website</a>` : ''}
                ${details.reddit_url ? `<a href="${details.reddit_url}" target="_blank" class="detail-link"><i class="fab fa-reddit"></i> Reddit</a>` : ''}
            </div>
        `;
    } else {
        heroDiv.innerHTML = '';
        contentDiv.innerHTML = '<p style="padding:2rem;text-align:center">Failed to load details.</p>';
    }
}

// ============================================
// CRUD FUNCTIONS
// ============================================

async function fetchGames() {
    try {
        const { data, error } = await supabase.from('games').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        gamesData = data || [];
        renderLibrary();
        updateDashboard();
        updateFilters();
    } catch(e) { showNotification('Failed to load games', 'error'); }
}

async function saveGame(e) {
    e.preventDefault();
    const id = document.getElementById('gameId')?.value;
    const game = {
        title: document.getElementById('title')?.value,
        platform: document.getElementById('platform')?.value || null,
        genre: document.getElementById('genre')?.value || null,
        tags: document.getElementById('tags')?.value || null,
        progress: parseInt(document.getElementById('progress')?.value || 0),
        rating: parseFloat(document.getElementById('rating')?.value || 3),
        hours_played: parseFloat(document.getElementById('hours_played')?.value || 0),
        status: document.getElementById('status')?.value,
        cover_url: currentCoverUrl || null,
        updated_at: new Date().toISOString()
    };
    if (!game.title) { showNotification('Title required!', 'error'); return; }
    try {
        if (id) { await supabase.from('games').update(game).eq('id', id); showNotification('Game updated!', 'success'); }
        else { await supabase.from('games').insert([{ ...game, created_at: new Date().toISOString() }]); showNotification('Game added!', 'success'); }
        closeModal();
        fetchGames();
    } catch(e) { showNotification('Failed to save', 'error'); }
}

async function deleteGame() {
    if (!deleteId) return;
    try { await supabase.from('games').delete().eq('id', deleteId); showNotification('Game deleted!', 'success'); fetchGames(); closeDeleteModal(); }
    catch(e) { showNotification('Failed to delete', 'error'); }
}

// ============================================
// SEARCH AUTO-FILL
// ============================================

let searchTimeout;
function setupGameSearch() {
    const input = document.getElementById('gameSearchInput');
    const resultsDiv = document.getElementById('searchResults');
    if (!input) return;
    
    input.addEventListener('input', async () => {
        clearTimeout(searchTimeout);
        const q = input.value.trim();
        if (q.length < 2) { resultsDiv.style.display = 'none'; return; }
        searchTimeout = setTimeout(async () => {
            resultsDiv.innerHTML = '<div style="padding:1rem;text-align:center"><div class="loading-spinner"></div> Searching...</div>';
            resultsDiv.style.display = 'block';
            const results = await searchGamesAPI(q);
            if (!results.length) { resultsDiv.innerHTML = '<div style="padding:1rem;text-align:center">No games found</div>'; return; }
            resultsDiv.innerHTML = results.map(g => `
                <div class="search-result-item" data-game='${JSON.stringify(g)}'>
                    <img src="${g.cover || getSmartPlaceholder(g.name)}">
                    <div><h4>${escapeHtml(g.name)}</h4><p>${g.genres || 'No genre'} | ⭐ ${g.rating}</p></div>
                </div>
            `).join('');
            document.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const data = JSON.parse(item.dataset.game);
                    document.getElementById('title').value = data.name;
                    if (data.platforms) document.getElementById('platform').value = data.platforms.split(',')[0];
                    if (data.genres) { document.getElementById('genre').value = data.genres; document.getElementById('tags').value = data.genres.split(',').map(t=>t.trim().toLowerCase()).join(', '); }
                    if (data.rating) document.getElementById('rating').value = Math.round(data.rating * 2) / 2;
                    if (data.cover) { currentCoverUrl = data.cover; document.getElementById('coverPreview').src = data.cover; document.getElementById('coverPreviewContainer').style.display = 'block'; }
                    resultsDiv.style.display = 'none';
                    input.value = '';
                    showNotification(`"${data.name}" auto-filled!`, 'success');
                });
            });
        }, 500);
    });
    document.addEventListener('click', (e) => { if (!input.contains(e.target) && !resultsDiv.contains(e.target)) resultsDiv.style.display = 'none'; });
}

// ============================================
// PULL TO REFRESH
// ============================================

function setupPullToRefresh() {
    const container = document.getElementById('mainContent');
    const indicator = document.getElementById('pullToRefresh');
    let startY = 0;
    container.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; });
    container.addEventListener('touchmove', (e) => {
        if (container.scrollTop === 0 && e.touches[0].clientY > startY + 30) {
            indicator.style.opacity = '1';
            indicator.querySelector('i').style.transform = 'rotate(180deg)';
        }
    });
    container.addEventListener('touchend', async (e) => {
        if (container.scrollTop === 0 && e.changedTouches[0].clientY > startY + 50) {
            indicator.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Refreshing...';
            await fetchGames();
            indicator.innerHTML = '<i class="fas fa-check"></i> Updated!';
            setTimeout(() => { indicator.innerHTML = '<i class="fas fa-arrow-down"></i> Pull down to refresh'; indicator.style.opacity = '0.5'; }, 1500);
        }
    });
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function openEditModal(id) {
    const game = gamesData.find(g => g.id == id);
    if (game) {
        document.getElementById('modalTitle').innerText = 'Edit Game';
        document.getElementById('gameId').value = game.id;
        document.getElementById('title').value = game.title;
        document.getElementById('platform').value = game.platform || '';
        document.getElementById('genre').value = game.genre || '';
        document.getElementById('tags').value = game.tags || '';
        document.getElementById('progress').value = game.progress;
        document.getElementById('rating').value = game.rating;
        document.getElementById('hours_played').value = game.hours_played || 0;
        document.getElementById('status').value = game.status;
        currentCoverUrl = game.cover_url;
        if (currentCoverUrl) { document.getElementById('coverPreview').src = currentCoverUrl; document.getElementById('coverPreviewContainer').style.display = 'block'; }
        document.getElementById('gameModal').style.display = 'flex';
    }
}

function closeModal() {
    document.getElementById('gameModal').style.display = 'none';
    document.getElementById('gameForm').reset();
    document.getElementById('gameId').value = '';
    document.getElementById('coverPreviewContainer').style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
    currentCoverUrl = null;
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    deleteId = null;
}

function switchTab(tab) {
    document.querySelectorAll('.nav-link, .nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => el.classList.add('active'));
    document.getElementById('dashboardSection').classList.toggle('active', tab === 'dashboard');
    document.getElementById('librarySection').classList.toggle('active', tab === 'library');
    document.getElementById('pageTitle').innerText = tab === 'dashboard' ? 'Dashboard' : 'Game Library';
    if (tab === 'library') renderLibrary();
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Game Tracker Premium Starting...');
    
    setupGameSearch();
    setupPullToRefresh();
    
    // Tab switching
    document.querySelectorAll('.nav-link, .nav-item').forEach(el => {
        el.addEventListener('click', (e) => { e.preventDefault(); switchTab(el.dataset.tab); vibrate(); });
    });
    
    // Dark mode with chart sync
    const darkToggle = document.getElementById('darkModeToggle');
    if (darkToggle) {
        const saved = localStorage.getItem('darkMode') === 'true';
        darkToggle.checked = saved;
        if (saved) document.body.classList.add('dark-mode');
        darkToggle.addEventListener('change', () => {
            document.body.classList.toggle('dark-mode', darkToggle.checked);
            localStorage.setItem('darkMode', darkToggle.checked);
            updateCharts();
        });
    }
    
    // Add game buttons
    document.getElementById('addGameBtn').addEventListener('click', () => {
        document.getElementById('modalTitle').innerText = 'Add New Game';
        document.getElementById('gameForm').reset();
        document.getElementById('gameId').value = '';
        document.getElementById('progress').value = 0;
        document.getElementById('rating').value = 3;
        document.getElementById('hours_played').value = 0;
        document.getElementById('status').value = 'backlog';
        document.getElementById('coverPreviewContainer').style.display = 'none';
        currentCoverUrl = null;
        document.getElementById('gameModal').style.display = 'flex';
    });
    document.getElementById('mobileAddBtn')?.addEventListener('click', () => document.getElementById('addGameBtn').click());
    
    // Close modals
    document.querySelectorAll('.close-modal, .modal').forEach(el => {
        el.addEventListener('click', function(e) {
            if (e.target === this || e.target.classList.contains('close-modal')) {
                closeModal();
                closeDeleteModal();
                document.getElementById('detailModal').style.display = 'none';
            }
        });
    });
    
    document.getElementById('confirmDeleteBtn').addEventListener('click', deleteGame);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('gameForm').addEventListener('submit', saveGame);
    
    // Filters
    document.getElementById('searchInput').addEventListener('input', () => renderLibrary());
    document.getElementById('filterGenre').addEventListener('change', renderLibrary);
    document.getElementById('filterPlatform').addEventListener('change', renderLibrary);
    document.getElementById('filterRating').addEventListener('change', renderLibrary);
    document.getElementById('filterStatus').addEventListener('change', renderLibrary);
    
    // Initial load
    fetchGames();
    
    // Realtime subscription
    supabase.channel('games').on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => fetchGames()).subscribe();
    
    // Handle resize for charts
    window.addEventListener('resize', () => updateCharts());
    
    console.log('✅ Ready!');
});