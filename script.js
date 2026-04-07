// ============================================
// GAME TRACKER PREMIUM - STABLE VERSION
// ============================================

let supabaseClient = null;
let gamesData = [];
let currentCoverUrl = null;
let deleteId = null;
let genreChart, completionChart, ratingChart;

// Helper Functions
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function vibrate() {
    if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(30);
}

function showNotification(msg, type) {
    const notif = document.createElement('div');
    notif.className = `fixed bottom-24 left-4 right-4 md:left-auto md:right-8 z-50 p-3 rounded-xl text-white text-sm ${type === 'success' ? 'bg-emerald-500' : 'bg-red-500'} shadow-xl`;
    notif.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-2"></i>${msg}`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

function getSmartPlaceholder(title) {
    if (!title) title = 'G';
    const colors = ['8b5cf6', 'ec4899', '06b6d4', 'f97316', '10b981'];
    const color = colors[title.length % colors.length];
    return `https://placehold.co/400x600/${color}/ffffff?text=${encodeURIComponent(title.substring(0,2).toUpperCase())}`;
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

function getStatusBadge(status) {
    const badges = {
        playing: { class: 'playing', icon: 'fa-play-circle', label: 'Playing' },
        backlog: { class: 'backlog', icon: 'fa-book', label: 'Backlog' },
        completed: { class: 'completed', icon: 'fa-trophy', label: 'Completed' }
    };
    const b = badges[status] || badges.backlog;
    return `<span class="status-badge ${b.class}"><i class="fas ${b.icon}"></i> ${b.label}</span>`;
}

function renderGameCard(game) {
    const coverUrl = game.cover_url || getSmartPlaceholder(game.title);
    const progress = game.progress || 0;
    const rating = game.rating || 0;
    const hours = game.hours_played || 0;
    
    return `
        <div class="game-card" data-id="${game.id}" data-game='${JSON.stringify(game)}'>
            <div class="game-cover">
                <img src="${coverUrl}" alt="${escapeHtml(game.title)}" loading="lazy" onerror="this.src='${getSmartPlaceholder(game.title)}'">
                <div class="cover-overlay"></div>
                <div class="progress-overlay"><div class="progress-fill" style="width:${progress}%"></div></div>
            </div>
            <div class="card-content">
                <div class="game-title">${escapeHtml(game.title)} <small>${escapeHtml(game.platform) || '-'}</small></div>
                <div class="rating-stars">${renderStars(rating)} <span>${hours}h</span></div>
                <div class="game-meta"><span class="tag">${escapeHtml(game.genre) || 'General'}</span></div>
                <div class="card-actions">
                    <button class="edit-game" data-id="${game.id}"><i class="fas fa-edit"></i> Edit</button>
                    <button class="delete-game" data-id="${game.id}"><i class="fas fa-trash-alt"></i> Delete</button>
                </div>
            </div>
        </div>
    `;
}

function renderGroupedGames(filtered) {
    const groups = {
        playing: { title: '🎮 Currently Playing', icon: 'fa-play-circle', games: [] },
        backlog: { title: '📚 Backlog', icon: 'fa-book', games: [] },
        completed: { title: '🏆 Completed', icon: 'fa-trophy', games: [] }
    };
    filtered.forEach(g => { if (groups[g.status]) groups[g.status].games.push(g); });
    
    let html = '';
    const order = ['playing', 'backlog', 'completed'];
    for (const status of order) {
        const group = groups[status];
        if (group.games.length === 0) continue;
        html += `<div class="mb-8"><div class="flex items-center gap-2 mb-4"><i class="fas ${group.icon} text-purple-500"></i><h2 class="text-lg font-semibold">${group.title}</h2><span class="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700">${group.games.length}</span></div><div class="games-grid">${group.games.map(g => renderGameCard(g)).join('')}</div></div>`;
    }
    return html;
}

function showSkeletons() {
    const grid = document.getElementById('gamesGrid');
    if (!grid) return;
    grid.innerHTML = Array(6).fill(0).map(() => `
        <div class="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
            <div class="skeleton skeleton-cover"></div>
            <div class="p-3"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>
        </div>
    `).join('');
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
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-gamepad"></i><h3>No Games Found</h3><p>Add your first game to get started!</p></div>`;
        return;
    }
    
    showSkeletons();
    setTimeout(() => {
        let html;
        if (statusFilter) {
            html = `<div class="games-grid">${filtered.map(g => renderGameCard(g)).join('')}</div>`;
        } else {
            html = renderGroupedGames(filtered);
        }
        grid.innerHTML = html;
        attachEvents();
    }, 100);
}

function attachEvents() {
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.edit-game') && !e.target.closest('.delete-game')) {
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

async function openGameDetail(id, title) {
    const modal = document.getElementById('detailModal');
    const heroDiv = document.getElementById('detailHero');
    const contentDiv = document.getElementById('detailContent');
    modal.style.display = 'flex';
    heroDiv.innerHTML = '<div class="flex items-center justify-center h-full"><div class="loading-spinner"></div></div>';
    contentDiv.innerHTML = '';
    
    try {
        const res = await fetch(`https://api.rawg.io/api/games/${id}?key=${window.RAWG_API_KEY}`);
        const details = await res.json();
        heroDiv.style.backgroundImage = `url(${details.background_image || getSmartPlaceholder(title)})`;
        heroDiv.innerHTML = '';
        contentDiv.innerHTML = `
            <h2 class="text-xl font-bold mb-2">${escapeHtml(details.name)}</h2>
            <div class="flex flex-wrap gap-4 py-3 border-y border-gray-200 dark:border-gray-700 my-3">
                <div><i class="fas fa-calendar"></i> ${details.released || 'TBA'}</div>
                <div><i class="fas fa-star text-amber-500"></i> ${details.rating}/5</div>
                ${details.metacritic ? `<div><i class="fas fa-chart-line"></i> Metascore: ${details.metacritic}</div>` : ''}
            </div>
            <div class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">${details.description_raw || 'No description available.'}</div>
            <div class="mt-4 flex flex-wrap gap-2">
                ${details.website ? `<a href="${details.website}" target="_blank" class="inline-block px-4 py-2 bg-purple-600 text-white rounded-full text-sm"><i class="fas fa-globe"></i> Website</a>` : ''}
                ${details.reddit_url ? `<a href="${details.reddit_url}" target="_blank" class="inline-block px-4 py-2 bg-orange-600 text-white rounded-full text-sm"><i class="fab fa-reddit"></i> Reddit</a>` : ''}
            </div>
        `;
    } catch(e) { heroDiv.innerHTML = ''; contentDiv.innerHTML = '<p class="text-center py-8">Failed to load details</p>'; }
}

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
        if (currentCoverUrl) {
            document.getElementById('coverPreview').src = currentCoverUrl;
            document.getElementById('coverPreviewContainer').style.display = 'block';
        }
        document.getElementById('gameModal').style.display = 'flex';
    }
}

function closeModal() {
    document.getElementById('gameModal').style.display = 'none';
    document.getElementById('gameForm').reset();
    document.getElementById('gameId').value = '';
    document.getElementById('coverPreviewContainer').style.display = 'none';
    currentCoverUrl = null;
}

function updateCharts() {
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#cbd5e1' : '#475569';
    
    const genreCtx = document.getElementById('genreChart')?.getContext('2d');
    if (genreCtx) {
        const genreCount = {};
        gamesData.forEach(g => { if (g.genre) genreCount[g.genre] = (genreCount[g.genre] || 0) + 1; });
        const topGenres = Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
        if (genreChart) genreChart.destroy();
        genreChart = new Chart(genreCtx, {
            type: 'doughnut',
            data: { labels: topGenres.map(g=>g[0]), datasets: [{ data: topGenres.map(g=>g[1]), backgroundColor: ['#8b5cf6','#ec4899','#06b6d4','#f97316','#10b981'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: true, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: textColor } } } }
        });
    }
    
    const completionCtx = document.getElementById('completionChart')?.getContext('2d');
    if (completionCtx) {
        const compData = [gamesData.filter(g=>g.status==='completed').length, gamesData.filter(g=>g.status==='playing').length, gamesData.filter(g=>g.status==='backlog').length];
        if (completionChart) completionChart.destroy();
        completionChart = new Chart(completionCtx, {
            type: 'bar',
            data: { labels: ['Completed','Playing','Backlog'], datasets: [{ label: 'Games', data: compData, backgroundColor: '#8b5cf6', borderRadius: 12 }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { ticks: { color: textColor } } } }
        });
    }
    
    const ratingCtx = document.getElementById('ratingChart')?.getContext('2d');
    if (ratingCtx) {
        const ratingDist = [0,0,0,0,0];
        gamesData.forEach(g => { if(g.rating>=1 && g.rating<=5) ratingDist[Math.floor(g.rating)-1]++; });
        if (ratingChart) ratingChart.destroy();
        ratingChart = new Chart(ratingCtx, {
            type: 'line',
            data: { labels: ['★1','★2','★3','★4','★5'], datasets: [{ label: 'Games', data: ratingDist, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 3, tension: 0.3, fill: true, pointRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { ticks: { color: textColor } } } }
        });
    }
}

function updateDashboard() {
    document.getElementById('totalGames').innerText = gamesData.length;
    document.getElementById('completedGames').innerText = gamesData.filter(g=>g.status==='completed').length;
    document.getElementById('totalHours').innerText = gamesData.reduce((s,g)=>s+(g.hours_played||0),0);
    const avg = gamesData.length ? (gamesData.reduce((s,g)=>s+(g.rating||0),0)/gamesData.length).toFixed(1) : 0;
    document.getElementById('avgRating').innerText = avg;
    updateCharts();
}

function updateFilters() {
    const genres = [...new Set(gamesData.map(g=>g.genre).filter(Boolean))];
    const platforms = [...new Set(gamesData.map(g=>g.platform).filter(Boolean))];
    const genreSelect = document.getElementById('filterGenre');
    const platformSelect = document.getElementById('filterPlatform');
    if (genreSelect) genreSelect.innerHTML = '<option value="">All Genres</option>' + genres.map(g=>`<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    if (platformSelect) platformSelect.innerHTML = '<option value="">All Platforms</option>' + platforms.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
}

async function fetchGames() {
    if (!supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.from('games').select('*').order('created_at', { ascending: false });
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
        if (id) { await supabaseClient.from('games').update(game).eq('id', id); showNotification('Game updated!', 'success'); }
        else { await supabaseClient.from('games').insert([{ ...game, created_at: new Date().toISOString() }]); showNotification('Game added!', 'success'); }
        closeModal();
        fetchGames();
    } catch(e) { showNotification('Failed to save', 'error'); }
}

async function deleteGame() {
    if (!deleteId) return;
    try { await supabaseClient.from('games').delete().eq('id', deleteId); showNotification('Game deleted!', 'success'); fetchGames(); closeDeleteModal(); }
    catch(e) { showNotification('Failed to delete', 'error'); }
}

function closeDeleteModal() { document.getElementById('deleteModal').style.display = 'none'; deleteId = null; }

function switchTab(tab) {
    document.querySelectorAll('.nav-link, .nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => el.classList.add('active'));
    document.getElementById('dashboardSection').classList.toggle('active', tab === 'dashboard');
    document.getElementById('librarySection').classList.toggle('active', tab === 'library');
    document.getElementById('pageTitle').innerText = tab === 'dashboard' ? 'Dashboard' : 'Game Library';
    if (tab === 'library') renderLibrary();
}

// Search from RAWG
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
            resultsDiv.innerHTML = '<div class="p-4 text-center"><div class="loading-spinner"></div> Searching...</div>';
            resultsDiv.style.display = 'block';
            try {
                const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(q)}&key=${window.RAWG_API_KEY}&page_size=6`;
                const res = await fetch(url);
                const data = await res.json();
                if (!data.results?.length) { resultsDiv.innerHTML = '<div class="p-4 text-center">No games found</div>'; return; }
                resultsDiv.innerHTML = data.results.map(g => `
                    <div class="search-result-item p-3 flex gap-3 cursor-pointer hover:bg-purple-600 hover:text-white transition" data-game='${JSON.stringify({ id: g.id, name: g.name, cover: g.background_image, genres: g.genres?.map(ge=>ge.name).join(', '), platforms: g.platforms?.slice(0,2).map(p=>p.platform.name).join(', '), rating: g.rating })}'>
                        <img src="${g.background_image || getSmartPlaceholder(g.name)}" class="w-12 h-12 object-cover rounded-lg">
                        <div><div class="font-semibold">${escapeHtml(g.name)}</div><div class="text-xs opacity-80">${g.genres?.map(ge=>ge.name).slice(0,2).join(', ') || 'No genre'} | ⭐ ${g.rating}</div></div>
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
            } catch(e) { resultsDiv.innerHTML = '<div class="p-4 text-center">Search error</div>'; }
        }, 500);
    });
    document.addEventListener('click', (e) => { if (!input.contains(e.target) && !resultsDiv.contains(e.target)) resultsDiv.style.display = 'none'; });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    setupGameSearch();
    
    document.querySelectorAll('.nav-link, .nav-item').forEach(el => {
        el.addEventListener('click', (e) => { e.preventDefault(); switchTab(el.dataset.tab); vibrate(); });
    });
    
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
    
    document.getElementById('addGameBtn').addEventListener('click', () => {
        document.getElementById('modalTitle').innerText = 'Add New Game';
        document.getElementById('gameForm').reset();
        document.getElementById('gameId').value = '';
        document.getElementById('coverPreviewContainer').style.display = 'none';
        currentCoverUrl = null;
        document.getElementById('gameModal').style.display = 'flex';
    });
    document.getElementById('mobileAddBtn')?.addEventListener('click', () => document.getElementById('addGameBtn').click());
    
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
    
    document.getElementById('searchInput').addEventListener('input', () => renderLibrary());
    document.getElementById('filterGenre').addEventListener('change', renderLibrary);
    document.getElementById('filterPlatform').addEventListener('change', renderLibrary);
    document.getElementById('filterRating').addEventListener('change', renderLibrary);
    document.getElementById('filterStatus').addEventListener('change', renderLibrary);
    
    fetchGames();
    supabaseClient.channel('games').on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => fetchGames()).subscribe();
});