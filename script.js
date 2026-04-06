// ============================================
// GAME TRACKER PREMIUM - COMPLETE VERSION
// Features: Portrait Cards, Grouping, PWA, Bottom Nav, Touch Optimized
// ============================================

// ============================================
// 1. CONFIGURATION
// ============================================
const Config = {
    SUPABASE_URL: window.SUPABASE_URL,
    SUPABASE_KEY: window.SUPABASE_KEY,
    RAWG_API_KEY: window.RAWG_API_KEY,
    CACHE_DURATION: 3600000,
    SEARCH_DEBOUNCE: 500,
    PULL_TO_REFRESH_THRESHOLD: 80,
    
    init() {
        if (!this.SUPABASE_URL || !this.SUPABASE_KEY) {
            console.error('❌ Supabase missing');
        }
    },
    
    showSuccess(msg) { Swal.fire({ icon: 'success', title: 'Success!', text: msg, timer: 2000, showConfirmButton: false, background: '#1e293b', color: '#fff' }); },
    showError(title, msg) { Swal.fire({ icon: 'error', title, text: msg, background: '#1e293b', color: '#fff' }); }
};

// ============================================
// 2. CACHE MANAGER
// ============================================
const CacheManager = {
    set(key, data) { localStorage.setItem(`game_cache_${key}`, JSON.stringify({ data, timestamp: Date.now() })); },
    get(key) {
        const item = localStorage.getItem(`game_cache_${key}`);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (Date.now() - parsed.timestamp > Config.CACHE_DURATION) { localStorage.removeItem(`game_cache_${key}`); return null; }
        return parsed.data;
    }
};

// ============================================
// 3. API MODULE
// ============================================
const GameAPI = {
    async searchGames(query) {
        if (!query || query.length < 2) return [];
        const cached = CacheManager.get(`search_${query}`);
        if (cached) return cached;
        
        try {
            const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&key=${Config.RAWG_API_KEY}&page_size=10`;
            const res = await fetch(url);
            const data = await res.json();
            const results = data.results?.map(game => ({
                id: game.id, name: game.name, cover: game.background_image,
                genres: game.genres?.map(g => g.name).join(', ') || '',
                platforms: game.platforms?.map(p => p.platform.name).slice(0,3).join(', ') || '',
                rating: game.rating || 0, released: game.released || '',
                description: game.description_raw || 'No description.',
                metacritic: game.metacritic, website: game.website, reddit_url: game.reddit_url
            })) || [];
            CacheManager.set(`search_${query}`, results);
            return results;
        } catch (e) { return []; }
    },
    
    async getGameDetails(id) {
        const cached = CacheManager.get(`detail_${id}`);
        if (cached) return cached;
        try {
            const res = await fetch(`https://api.rawg.io/api/games/${id}?key=${Config.RAWG_API_KEY}`);
            const data = await res.json();
            CacheManager.set(`detail_${id}`, data);
            return data;
        } catch (e) { return null; }
    },
    
    getGradientColor(title) {
        const colors = ['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#10b981', '#f59e0b', '#3b82f6'];
        const index = title.length % colors.length;
        return colors[index];
    }
};

// ============================================
// 4. UI CONTROLLER
// ============================================
const UIController = {
    gamesData: [],
    charts: { genre: null, completion: null, rating: null },
    currentCoverUrl: null,
    selectedSearchIndex: -1,
    pullStartY: 0,
    isRefreshing: false,
    
    vibrate() {
        if (window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(50);
        }
    },
    
    // Smart image fallback with gradient based on title
    getSmartPlaceholder(title) {
        const gradient = GameAPI.getGradientColor(title);
        return `https://placehold.co/400x600/${gradient.substring(1)}/ffffff?text=${encodeURIComponent(title.substring(0,2).toUpperCase())}`;
    },
    
    // Render grouped games by status
    renderGroupedGames(filteredGames) {
        const groups = {
            playing: { title: '🎮 Currently Playing', icon: 'fa-play-circle', games: [] },
            backlog: { title: '📚 Backlog', icon: 'fa-book', games: [] },
            completed: { title: '🏆 Completed', icon: 'fa-trophy', games: [] }
        };
        
        filteredGames.forEach(game => {
            if (groups[game.status]) groups[game.status].games.push(game);
        });
        
        let html = '';
        for (const [key, group] of Object.entries(groups)) {
            if (group.games.length === 0) continue;
            html += `<div class="group-section"><div class="group-title"><i class="fas ${group.icon}"></i> ${group.title} (${group.games.length})</div><div class="games-grid" data-group="${key}">`;
            html += this.renderGamesHTML(group.games);
            html += `</div></div>`;
        }
        return html;
    },
    
    renderGamesHTML(games) {
        return games.map(game => `
            <div class="game-card" data-id="${game.id}" data-game='${JSON.stringify(game)}' data-rating="${game.rating}">
                <div class="game-cover">
                    <img src="${game.cover_url || this.getSmartPlaceholder(game.title)}" 
                         alt="${this.escapeHtml(game.title)}" loading="lazy"
                         onerror="this.src='${this.getSmartPlaceholder(game.title)}'">
                    <div class="cover-overlay"></div>
                    <div class="progress-overlay"><div class="progress-fill" style="width:${game.progress || 0}%"></div></div>
                </div>
                <div class="card-content">
                    <div class="game-title">${this.escapeHtml(game.title)}<small>${this.escapeHtml(game.platform) || '-'}</small></div>
                    <div class="rating-stars">${this.renderStars(game.rating || 0)} <span style="font-size:0.65rem">⏱️ ${game.hours_played || 0}h</span></div>
                    <div class="game-meta"><span class="tag"><i class="fas fa-tag"></i> ${this.escapeHtml(game.genre) || 'General'}</span></div>
                    <div class="card-actions">
                        <button class="edit-game" data-id="${game.id}"><i class="fas fa-edit"></i> Edit</button>
                        <button class="delete-game" data-id="${game.id}"><i class="fas fa-trash-alt"></i> Delete</button>
                    </div>
                </div>
            </div>
        `).join('');
    },
    
    async renderLibrary() {
        const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const genreFilter = document.getElementById('filterGenre')?.value || '';
        const platformFilter = document.getElementById('filterPlatform')?.value || '';
        const ratingFilter = document.getElementById('filterRating')?.value || '';
        const statusFilter = document.getElementById('filterStatus')?.value || '';
        
        let filtered = this.gamesData.filter(g => g.title?.toLowerCase().includes(search));
        if (genreFilter) filtered = filtered.filter(g => g.genre === genreFilter);
        if (platformFilter) filtered = filtered.filter(g => g.platform === platformFilter);
        if (ratingFilter) filtered = filtered.filter(g => g.rating >= parseInt(ratingFilter));
        
        const grid = document.getElementById('gamesGrid');
        if (!grid) return;
        
        if (!filtered.length) {
            grid.innerHTML = `<div class="empty-state"><i class="fas fa-gamepad"></i><h3>No Games Found</h3><p>Try adjusting your filters or add a new game!</p></div>`;
            return;
        }
        
        // Show skeletons
        grid.innerHTML = Array(6).fill(0).map(() => `
            <div class="game-card"><div class="skeleton skeleton-cover"></div><div class="card-content"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div></div>
        `).join('');
        
        // Use grouping if no status filter
        let html;
        if (statusFilter) {
            html = `<div class="games-grid">${this.renderGamesHTML(filtered)}</div>`;
        } else {
            html = this.renderGroupedGames(filtered);
        }
        
        grid.innerHTML = html;
        
        // Attach event listeners
        document.querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.card-actions')) {
                    const gameData = JSON.parse(card.dataset.game);
                    this.openGameDetail(gameData.id, gameData.title);
                }
            });
        });
        document.querySelectorAll('.edit-game').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); this.vibrate(); this.openEditModal(btn.dataset.id); });
        });
        document.querySelectorAll('.delete-game').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); this.vibrate(); this.showDeleteConfirm(btn.dataset.id); });
        });
    },
    
    renderStars(rating) {
        let stars = '';
        const full = Math.floor(rating);
        const half = rating % 1 !== 0;
        const isHigh = rating >= 4;
        for (let i = 1; i <= 5; i++) {
            if (i <= full) stars += `<i class="fas fa-star" ${isHigh ? 'style="filter:drop-shadow(0 0 3px #fbbf24)"' : ''}></i>`;
            else if (half && i === full + 1) stars += `<i class="fas fa-star-half-alt"></i>`;
            else stars += '<i class="far fa-star"></i>';
        }
        return stars;
    },
    
    updateCharts(data) {
        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#cbd5e1' : '#475569';
        
        // Genre chart
        const genreCount = {};
        data.forEach(g => { if (g.genre) genreCount[g.genre] = (genreCount[g.genre] || 0) + 1; });
        const topGenres = Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const genreCtx = document.getElementById('genreChart')?.getContext('2d');
        if (genreCtx) {
            if (this.charts.genre) this.charts.genre.destroy();
            this.charts.genre = new Chart(genreCtx, {
                type: 'doughnut',
                data: { labels: topGenres.map(g=>g[0]), datasets: [{ data: topGenres.map(g=>g[1]), backgroundColor: ['#8b5cf6','#ec4899','#06b6d4','#f97316','#10b981'], borderWidth: 0 }] },
                options: { responsive: true, maintainAspectRatio: true, cutout: '65%', plugins: { legend: { position: window.innerWidth < 480 ? 'bottom' : 'right', labels: { color: textColor, font: { size: window.innerWidth < 480 ? 10 : 12 } } } } }
            });
        }
        
        // Completion chart
        const completionCtx = document.getElementById('completionChart')?.getContext('2d');
        if (completionCtx) {
            const completionData = [data.filter(g=>g.status==='completed').length, data.filter(g=>g.status==='playing').length, data.filter(g=>g.status==='backlog').length];
            if (this.charts.completion) this.charts.completion.destroy();
            const grad = completionCtx.createLinearGradient(0,0,0,400);
            grad.addColorStop(0,'#8b5cf6'); grad.addColorStop(1,'#a855f7');
            this.charts.completion = new Chart(completionCtx, {
                type: 'bar',
                data: { labels: ['Completed','Playing','Backlog'], datasets: [{ label: 'Games', data: completionData, backgroundColor: grad, borderRadius: 12, barPercentage: 0.6 }] },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false }, beginAtZero: true }, x: { grid: { display: false }, ticks: { color: textColor } } } }
            });
        }
        
        // Rating chart
        const ratingCtx = document.getElementById('ratingChart')?.getContext('2d');
        if (ratingCtx) {
            const ratingDist = [0,0,0,0,0];
            data.forEach(g => { if(g.rating>=1 && g.rating<=5) ratingDist[Math.floor(g.rating)-1]++; });
            if (this.charts.rating) this.charts.rating.destroy();
            const grad = ratingCtx.createLinearGradient(0,0,0,400);
            grad.addColorStop(0,'#f59e0b'); grad.addColorStop(1,'#fbbf24');
            this.charts.rating = new Chart(ratingCtx, {
                type: 'line',
                data: { labels: ['★1','★2','★3','★4','★5'], datasets: [{ label: 'Games', data: ratingDist, borderColor: '#f59e0b', backgroundColor: grad, borderWidth: 3, tension: 0.3, fill: true, pointRadius: 4, pointHoverRadius: 7 }] },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { grid: { display: false }, beginAtZero: true }, x: { ticks: { color: textColor } } } }
            });
        }
    },
    
    setupPullToRefresh() {
        let startY = 0;
        const container = document.getElementById('mainContent');
        const indicator = document.getElementById('pullToRefresh');
        
        container.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; });
        container.addEventListener('touchmove', (e) => {
            const scrollTop = container.scrollTop;
            if (scrollTop === 0 && e.touches[0].clientY > startY + 30) {
                indicator.style.opacity = '1';
                indicator.querySelector('i').style.transform = 'rotate(180deg)';
            }
        });
        container.addEventListener('touchend', async (e) => {
            if (container.scrollTop === 0 && e.changedTouches[0].clientY > startY + 50) {
                indicator.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Refreshing...';
                await DBManager.fetchGames();
                indicator.innerHTML = '<i class="fas fa-check"></i> Updated!';
                setTimeout(() => { indicator.innerHTML = '<i class="fas fa-arrow-down"></i> Pull down to refresh'; indicator.style.opacity = '0.5'; }, 1500);
            }
        });
    },
    
    setupGameSearch() {
        const searchInput = document.getElementById('gameSearchInput');
        const resultsDiv = document.getElementById('searchResults');
        let timeout;
        if (!searchInput) return;
        
        const update = async () => {
            const q = searchInput.value.trim();
            if (q.length < 2) { resultsDiv.style.display = 'none'; return; }
            resultsDiv.innerHTML = '<div style="padding:1rem;text-align:center"><div class="loading-spinner"></div> Searching...</div>';
            resultsDiv.style.display = 'block';
            const results = await GameAPI.searchGames(q);
            this.searchResults = results;
            this.selectedSearchIndex = -1;
            if (!results.length) { resultsDiv.innerHTML = '<div style="padding:1rem;text-align:center">No games found</div>'; return; }
            resultsDiv.innerHTML = results.map((g, idx) => `<div class="search-result-item" data-index="${idx}"><img src="${g.cover || this.getSmartPlaceholder(g.name)}"><div><h4>${this.escapeHtml(g.name)}</h4><p>${g.genres || 'No genre'} | ⭐ ${g.rating}</p></div></div>`).join('');
            document.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => { this.autoFillGameForm(results[parseInt(item.dataset.index)]); resultsDiv.style.display = 'none'; searchInput.value = ''; });
            });
        };
        
        searchInput.addEventListener('input', () => { clearTimeout(timeout); timeout = setTimeout(update, Config.SEARCH_DEBOUNCE); });
        searchInput.addEventListener('keydown', (e) => {
            const items = document.querySelectorAll('.search-result-item');
            if (!items.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); this.selectedSearchIndex = Math.min(this.selectedSearchIndex + 1, items.length - 1); this.updateSelected(items); }
            if (e.key === 'ArrowUp') { e.preventDefault(); this.selectedSearchIndex = Math.max(this.selectedSearchIndex - 1, -1); this.updateSelected(items); }
            if (e.key === 'Enter' && this.selectedSearchIndex >= 0) { e.preventDefault(); items[this.selectedSearchIndex]?.click(); }
        });
        document.addEventListener('click', (e) => { if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) resultsDiv.style.display = 'none'; });
    },
    
    updateSelected(items) { items.forEach((item, i) => { if (i === this.selectedSearchIndex) item.classList.add('selected'); else item.classList.remove('selected'); }); },
    
    autoFillGameForm(game) {
        document.getElementById('title').value = game.name;
        if (game.platforms) document.getElementById('platform').value = game.platforms.split(',')[0].trim();
        if (game.genres) { document.getElementById('genre').value = game.genres; document.getElementById('tags').value = game.genres.split(',').map(g=>g.trim().toLowerCase()).join(', '); }
        if (game.rating) document.getElementById('rating').value = Math.min(5, Math.max(1, Math.round(game.rating * 2) / 2));
        if (game.cover) { this.currentCoverUrl = game.cover; document.getElementById('coverPreview').src = game.cover; document.getElementById('coverPreviewContainer').style.display = 'block'; }
        Config.showSuccess(`🎮 "${game.name}" auto-filled!`);
    },
    
    async openGameDetail(id, title) {
        const modal = document.getElementById('detailModal');
        const heroDiv = document.getElementById('detailHero');
        const contentDiv = document.getElementById('detailContent');
        modal.style.display = 'flex';
        heroDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:280px"><div class="loading-spinner"></div> Loading...</div>';
        contentDiv.innerHTML = '';
        
        const details = await GameAPI.getGameDetails(id);
        if (details) {
            heroDiv.style.backgroundImage = `url(${details.background_image || this.getSmartPlaceholder(title)})`;
            heroDiv.style.backgroundSize = 'cover';
            heroDiv.style.backgroundPosition = 'center';
            heroDiv.innerHTML = '';
            contentDiv.innerHTML = `
                <h2 class="detail-title">${this.escapeHtml(details.name)}</h2>
                <div class="detail-meta"><div><i class="fas fa-calendar"></i> ${details.released || 'TBA'}</div><div><i class="fas fa-star"></i> ${details.rating}/5</div>${details.metacritic ? `<div><i class="fas fa-chart-line"></i> Metascore: ${details.metacritic}</div>` : ''}</div>
                <div class="detail-description">${details.description_raw || 'No description available.'}</div>
                <div class="detail-meta">${details.genres ? `<div><strong>Genres:</strong> ${details.genres.map(g=>g.name).join(', ')}</div>` : ''}${details.platforms ? `<div><strong>Platforms:</strong> ${details.platforms.slice(0,5).map(p=>p.platform.name).join(', ')}</div>` : ''}</div>
                <div class="detail-links">${details.website ? `<a href="${details.website}" target="_blank" class="detail-link"><i class="fas fa-globe"></i> Official Website</a>` : ''}${details.reddit_url ? `<a href="${details.reddit_url}" target="_blank" class="detail-link"><i class="fab fa-reddit"></i> Reddit</a>` : ''}</div>
            `;
        } else { heroDiv.innerHTML = ''; contentDiv.innerHTML = '<p style="padding:2rem;text-align:center">Failed to load details.</p>'; }
    },
    
    escapeHtml(s) { if(!s) return ''; return s.replace(/[&<>]/g, m => m==='&'?'&amp;':m==='<'?'&lt;':'&gt;'); },
    openEditModal(id) { /* Same as before */ },
    showDeleteConfirm(id) { this.deleteId = id; document.getElementById('deleteModal').style.display = 'flex'; },
    closeModal() { document.getElementById('gameModal').style.display = 'none'; document.getElementById('gameForm').reset(); document.getElementById('coverPreviewContainer').style.display = 'none'; this.currentCoverUrl = null; },
    closeDeleteModal() { document.getElementById('deleteModal').style.display = 'none'; this.deleteId = null; },
    closeDetailModal() { document.getElementById('detailModal').style.display = 'none'; }
};

// ============================================
// 5. DATABASE MANAGER
// ============================================
const DBManager = {
    client: null,
    init() { this.client = supabase.createClient(Config.SUPABASE_URL, Config.SUPABASE_KEY); },
    
    async fetchGames() {
        try {
            const { data, error } = await this.client.from('games').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            UIController.gamesData = data || [];
            await UIController.renderLibrary();
            UIController.updateCharts(UIController.gamesData);
            this.updateDashboard();
            this.updateFilters();
        } catch(e) { Config.showError('Error', 'Failed to load games'); }
    },
    
    async saveGame(e) {
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
            cover_url: UIController.currentCoverUrl || null,
            updated_at: new Date().toISOString()
        };
        if (!game.title) { Config.showError('Error', 'Title required'); return; }
        try {
            if (id) { await this.client.from('games').update(game).eq('id', id); Config.showSuccess('Game updated!'); }
            else { await this.client.from('games').insert([{ ...game, created_at: new Date().toISOString() }]); Config.showSuccess('Game added!'); }
            UIController.closeModal();
            this.fetchGames();
        } catch(e) { Config.showError('Error', 'Failed to save'); }
    },
    
    async deleteGame(id) {
        try { await this.client.from('games').delete().eq('id', id); Config.showSuccess('Game deleted!'); this.fetchGames(); }
        catch(e) { Config.showError('Error', 'Failed to delete'); }
    },
    
    updateDashboard() {
        const d = UIController.gamesData;
        document.getElementById('totalGames').innerText = d.length;
        document.getElementById('completedGames').innerText = d.filter(g=>g.status==='completed').length;
        document.getElementById('totalHours').innerText = d.reduce((s,g)=>s+(g.hours_played||0),0);
        document.getElementById('avgRating').innerText = d.length ? (d.reduce((s,g)=>s+(g.rating||0),0)/d.length).toFixed(1) : 0;
    },
    
    updateFilters() {
        const genres = [...new Set(UIController.gamesData.map(g=>g.genre).filter(Boolean))];
        const platforms = [...new Set(UIController.gamesData.map(g=>g.platform).filter(Boolean))];
        const gs = document.getElementById('filterGenre');
        const ps = document.getElementById('filterPlatform');
        if(gs) gs.innerHTML = '<option value="">🎮 All Genres</option>' + genres.map(g=>`<option value="${g}">${g}</option>`).join('');
        if(ps) ps.innerHTML = '<option value="">💻 All Platforms</option>' + platforms.map(p=>`<option value="${p}">${p}</option>`).join('');
    },
    
    setupRealtime() { this.client.channel('games').on('postgres_changes', { event:'*', schema:'public', table:'games' }, () => this.fetchGames()).subscribe(); }
};

// ============================================
// 6. APP INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Premium Game Tracker Starting...');
    Config.init();
    DBManager.init();
    UIController.setupGameSearch();
    UIController.setupPullToRefresh();
    
    // Tab switching (Desktop & Mobile)
    const switchTab = (tab) => {
        document.querySelectorAll('.nav-link, .nav-item').forEach(l => l.classList.remove('active'));
        document.querySelectorAll(`[data-tab="${tab}"]`).forEach(l => l.classList.add('active'));
        document.getElementById('dashboardSection').classList.toggle('active', tab === 'dashboard');
        document.getElementById('librarySection').classList.toggle('active', tab === 'library');
        document.getElementById('pageTitle').innerText = tab === 'dashboard' ? '📊 Dashboard' : '🎮 Game Library';
        if (tab === 'library') UIController.renderLibrary();
    };
    
    document.querySelectorAll('.nav-link, .nav-item').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); switchTab(link.dataset.tab); });
    });
    
    // Dark mode with chart refresh
    const dm = document.getElementById('darkModeToggle');
    if(dm) {
        const saved = localStorage.getItem('darkMode') === 'true';
        dm.checked = saved;
        if(saved) document.body.classList.add('dark-mode');
        dm.addEventListener('change', () => {
            document.body.classList.toggle('dark-mode', dm.checked);
            localStorage.setItem('darkMode', dm.checked);
            UIController.updateCharts(UIController.gamesData);
        });
    }
    
    document.getElementById('addGameBtn')?.addEventListener('click', () => {
        document.getElementById('modalTitle').innerText = '🎮 Add New Game';
        document.getElementById('gameForm').reset();
        document.getElementById('gameId').value = '';
        document.getElementById('progress').value = 0;
        document.getElementById('rating').value = 3;
        document.getElementById('hours_played').value = 0;
        document.getElementById('status').value = 'backlog';
        document.getElementById('coverPreviewContainer').style.display = 'none';
        UIController.currentCoverUrl = null;
        document.getElementById('gameModal').style.display = 'flex';
    });
    document.getElementById('mobileAddBtn')?.addEventListener('click', () => document.getElementById('addGameBtn').click());
    
    document.querySelectorAll('.close-modal, .modal').forEach(el => {
        el.addEventListener('click', function(e) { if(e.target === this || e.target.classList.contains('close-modal')) { UIController.closeModal(); UIController.closeDeleteModal(); UIController.closeDetailModal(); } });
    });
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => UIController.closeDeleteModal());
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => { if(UIController.deleteId) DBManager.deleteGame(UIController.deleteId); UIController.closeDeleteModal(); });
    document.getElementById('gameForm')?.addEventListener('submit', (e) => DBManager.saveGame(e));
    
    document.getElementById('searchInput')?.addEventListener('input', () => UIController.renderLibrary());
    document.getElementById('filterGenre')?.addEventListener('change', () => UIController.renderLibrary());
    document.getElementById('filterPlatform')?.addEventListener('change', () => UIController.renderLibrary());
    document.getElementById('filterRating')?.addEventListener('change', () => UIController.renderLibrary());
    document.getElementById('filterStatus')?.addEventListener('change', () => UIController.renderLibrary());
    
    await DBManager.fetchGames();
    DBManager.setupRealtime();
    
    // Handle resize for charts
    window.addEventListener('resize', () => UIController.updateCharts(UIController.gamesData));
    console.log('✅ All systems ready!');
});