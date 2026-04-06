// ============================================
// GAME TRACKER WITH AUTO-FILL FROM RAWG API
// ============================================

// Configuration
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_KEY = window.SUPABASE_KEY;
const RAWG_API_KEY = window.RAWG_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Supabase credentials missing!');
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State
let gamesData = [];
let genreChart, completionChart, ratingChart;
let coverCache = new Map();
let searchTimeout = null;
let currentCoverUrl = null;

// ============================================
// RAWG API FUNCTIONS
// ============================================

async function searchGamesFromAPI(query) {
    if (!query || query.length < 2) return [];
    
    try {
        const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&key=${RAWG_API_KEY}&page_size=10`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results) {
            return data.results.map(game => ({
                id: game.id,
                name: game.name,
                cover: game.background_image || null,
                genres: game.genres?.map(g => g.name).join(', ') || '',
                platforms: game.platforms?.map(p => p.platform.name).join(', ') || '',
                rating: game.rating || 0,
                released: game.released || ''
            }));
        }
        return [];
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

async function fetchGameCover(title) {
    if (coverCache.has(title)) {
        return coverCache.get(title);
    }
    
    try {
        const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(title)}&key=${RAWG_API_KEY}&page_size=1`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results && data.results[0] && data.results[0].background_image) {
            const coverUrl = data.results[0].background_image;
            coverCache.set(title, coverUrl);
            return coverUrl;
        }
        
        const fallback = null;
        coverCache.set(title, fallback);
        return fallback;
    } catch (error) {
        console.log('Cover fetch error:', error);
        return null;
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function renderStars(rating) {
    let stars = '';
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    
    for (let i = 1; i <= 5; i++) {
        if (i <= fullStars) {
            stars += '<i class="fas fa-star"></i>';
        } else if (hasHalfStar && i === fullStars + 1) {
            stars += '<i class="fas fa-star-half-alt"></i>';
        } else {
            stars += '<i class="far fa-star"></i>';
        }
    }
    return stars;
}

function showNotification(message, type = 'info') {
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// ============================================
// SEARCH & AUTO-FILL
// ============================================

function setupGameSearch() {
    const searchInput = document.getElementById('gameSearchInput');
    const resultsDiv = document.getElementById('searchResults');
    
    if (!searchInput) return;
    
    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        
        if (searchTimeout) clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            resultsDiv.style.display = 'none';
            return;
        }
        
        searchTimeout = setTimeout(async () => {
            resultsDiv.innerHTML = '<div style="padding:1rem; text-align:center"><i class="fas fa-spinner fa-pulse"></i> Searching...</div>';
            resultsDiv.style.display = 'block';
            
            const results = await searchGamesFromAPI(query);
            
            if (results.length === 0) {
                resultsDiv.innerHTML = '<div style="padding:1rem; text-align:center">No games found</div>';
                return;
            }
            
            resultsDiv.innerHTML = results.map(game => `
                <div class="search-result-item" data-game='${JSON.stringify(game)}'>
                    <img src="${game.cover || 'https://via.placeholder.com/50x50/8b5cf6/ffffff?text=?'}" alt="${escapeHtml(game.name)}">
                    <div class="search-result-info">
                        <h4>${escapeHtml(game.name)}</h4>
                        <p>${game.genres || 'No genre'} | ${game.platforms || 'Unknown'}</p>
                        <p>⭐ ${game.rating}</p>
                    </div>
                </div>
            `).join('');
            
            // Add click handlers
            document.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const gameData = JSON.parse(item.dataset.game);
                    autoFillGameForm(gameData);
                    resultsDiv.style.display = 'none';
                    searchInput.value = '';
                });
            });
        }, 500);
    });
    
    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });
}

function autoFillGameForm(gameData) {
    // Fill title
    document.getElementById('title').value = gameData.name;
    
    // Extract main platform (first one)
    if (gameData.platforms) {
        const platforms = gameData.platforms.split(',');
        document.getElementById('platform').value = platforms[0].trim();
    }
    
    // Fill genre
    if (gameData.genres) {
        document.getElementById('genre').value = gameData.genres;
        
        // Auto-fill tags from genres
        const tags = gameData.genres.split(',').map(g => g.trim().toLowerCase());
        if (gameData.released) {
            tags.push(gameData.released.split('-')[0]); // Add year
        }
        document.getElementById('tags').value = tags.join(', ');
    }
    
    // Auto-fill rating from RAWG rating (rounded to nearest 0.5)
    if (gameData.rating) {
        const roundedRating = Math.round(gameData.rating * 2) / 2;
        document.getElementById('rating').value = Math.min(5, Math.max(1, roundedRating));
    }
    
    // Set cover preview
    if (gameData.cover) {
        currentCoverUrl = gameData.cover;
        const coverPreview = document.getElementById('coverPreview');
        const coverContainer = document.getElementById('coverPreviewContainer');
        coverPreview.src = gameData.cover;
        coverContainer.style.display = 'block';
    }
    
    showNotification(`✅ Game "${gameData.name}" auto-filled!`, 'success');
}

// ============================================
// SUPABASE CRUD
// ============================================

async function fetchGames() {
    try {
        console.log('🔄 Fetching games...');
        const { data, error } = await supabaseClient
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        gamesData = data || [];
        console.log(`✅ Loaded ${gamesData.length} games`);
        renderLibrary();
        updateDashboard();
        updateFilters();
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to load games', 'error');
    }
}

async function saveGame(event) {
    event.preventDefault();
    
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
    
    if (!game.title) {
        showNotification('Title is required!', 'error');
        return;
    }
    
    try {
        if (id) {
            const { error } = await supabaseClient.from('games').update(game).eq('id', id);
            if (error) throw error;
            showNotification('✅ Game updated!', 'success');
        } else {
            const { error } = await supabaseClient.from('games').insert([{ 
                ...game, 
                created_at: new Date().toISOString() 
            }]);
            if (error) throw error;
            showNotification('✅ Game added!', 'success');
        }
        
        closeModal();
        fetchGames();
    } catch (error) {
        console.error(error);
        showNotification('Failed to save game', 'error');
    }
}

async function deleteGame(id) {
    try {
        const { error } = await supabaseClient.from('games').delete().eq('id', id);
        if (error) throw error;
        showNotification('🗑️ Game deleted!', 'success');
        fetchGames();
    } catch (error) {
        showNotification('Failed to delete', 'error');
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================

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
    if (statusFilter) filtered = filtered.filter(g => g.status === statusFilter);

    const grid = document.getElementById('gamesGrid');
    if (!grid) return;
    
    if (!filtered.length) {
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-gamepad" style="font-size:3rem; margin-bottom:1rem"></i><p>✨ No games found. Add your first game!</p></div>`;
        return;
    }
    
    grid.innerHTML = filtered.map(game => `
        <div class="game-card" data-id="${game.id}">
            <div class="game-cover">
                <img src="${game.cover_url || 'https://via.placeholder.com/300x180/8b5cf6/ffffff?text=' + encodeURIComponent(game.title.substring(0,20))}" 
                     alt="${escapeHtml(game.title)}" loading="lazy"
                     onerror="this.src='https://via.placeholder.com/300x180/8b5cf6/ffffff?text=${encodeURIComponent(game.title.substring(0,20))}'">
                <div class="progress-overlay">
                    <div class="progress-fill" style="width:${game.progress || 0}%"></div>
                </div>
            </div>
            <div class="card-content">
                <div class="game-title">
                    ${escapeHtml(game.title)}
                    <small>${escapeHtml(game.platform) || '-'}</small>
                </div>
                <div class="rating-stars">
                    ${renderStars(game.rating || 0)} 
                    <span>⏱️ ${game.hours_played || 0}h</span>
                </div>
                <div class="game-meta">
                    <span class="tag"><i class="fas fa-tag"></i> ${escapeHtml(game.genre) || 'General'}</span>
                    ${game.tags ? game.tags.split(',').map(t => `<span class="tag">#${escapeHtml(t.trim())}</span>`).join('') : ''}
                </div>
                <div style="margin-top: 8px; font-size:0.8rem">
                    <i class="fas ${game.status === 'completed' ? 'fa-trophy' : (game.status === 'playing' ? 'fa-play-circle' : 'fa-book')}"></i> 
                    <span style="text-transform: capitalize;">${game.status || 'backlog'}</span>
                </div>
                <div class="card-actions">
                    <button class="edit-game" data-id="${game.id}"><i class="fas fa-edit"></i> Edit</button>
                    <button class="delete-game" data-id="${game.id}"><i class="fas fa-trash-alt"></i> Delete</button>
                </div>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.edit-game').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(btn.dataset.id);
        });
    });
    
    document.querySelectorAll('.delete-game').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDeleteConfirm(btn.dataset.id);
        });
    });
}

function updateDashboard() {
    const total = gamesData.length;
    const completed = gamesData.filter(g => g.status === 'completed').length;
    const totalHours = gamesData.reduce((sum, g) => sum + (g.hours_played || 0), 0);
    const avgRating = total > 0 ? (gamesData.reduce((sum, g) => sum + (g.rating || 0), 0) / total).toFixed(1) : 0;
    
    document.getElementById('totalGames').innerText = total;
    document.getElementById('completedGames').innerText = completed;
    document.getElementById('totalHours').innerText = totalHours;
    document.getElementById('avgRating').innerText = avgRating;
    
    updateCharts();
}

function updateCharts() {
    const genreCount = {};
    gamesData.forEach(g => {
        if (g.genre) genreCount[g.genre] = (genreCount[g.genre] || 0) + 1;
    });
    const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    const genreCtx = document.getElementById('genreChart')?.getContext('2d');
    if (genreCtx) {
        if (genreChart) genreChart.destroy();
        genreChart = new Chart(genreCtx, {
            type: 'doughnut',
            data: {
                labels: topGenres.map(g => g[0]),
                datasets: [{
                    data: topGenres.map(g => g[1]),
                    backgroundColor: ['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#10b981']
                }]
            },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
        });
    }
    
    const completionCtx = document.getElementById('completionChart')?.getContext('2d');
    if (completionCtx) {
        const completionData = [
            gamesData.filter(g => g.status === 'completed').length,
            gamesData.filter(g => g.status === 'playing').length,
            gamesData.filter(g => g.status === 'backlog').length
        ];
        if (completionChart) completionChart.destroy();
        completionChart = new Chart(completionCtx, {
            type: 'bar',
            data: {
                labels: ['🏆 Completed', '🎮 Playing', '📚 Backlog'],
                datasets: [{ label: 'Games', data: completionData, backgroundColor: '#8b5cf6' }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
    
    const ratingCtx = document.getElementById('ratingChart')?.getContext('2d');
    if (ratingCtx) {
        const ratingDist = [0, 0, 0, 0, 0];
        gamesData.forEach(g => {
            if (g.rating >= 1 && g.rating <= 5) ratingDist[Math.floor(g.rating) - 1]++;
        });
        if (ratingChart) ratingChart.destroy();
        ratingChart = new Chart(ratingCtx, {
            type: 'line',
            data: {
                labels: ['★1', '★2', '★3', '★4', '★5'],
                datasets: [{ label: 'Games Count', data: ratingDist, borderColor: '#f59e0b', tension: 0.3, fill: true }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

function updateFilters() {
    const genres = [...new Set(gamesData.map(g => g.genre).filter(Boolean))];
    const platforms = [...new Set(gamesData.map(g => g.platform).filter(Boolean))];
    
    const genreSelect = document.getElementById('filterGenre');
    const platformSelect = document.getElementById('filterPlatform');
    
    if (genreSelect) {
        genreSelect.innerHTML = '<option value="">🎮 All Genres</option>' + 
            genres.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    }
    
    if (platformSelect) {
        platformSelect.innerHTML = '<option value="">💻 All Platforms</option>' + 
            platforms.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    }
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function openEditModal(id) {
    const game = gamesData.find(g => g.id == id);
    if (game) {
        document.getElementById('modalTitle').innerText = '✏️ Edit Game';
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
            const coverPreview = document.getElementById('coverPreview');
            const coverContainer = document.getElementById('coverPreviewContainer');
            coverPreview.src = currentCoverUrl;
            coverContainer.style.display = 'block';
        } else {
            document.getElementById('coverPreviewContainer').style.display = 'none';
        }
        
        document.getElementById('gameModal').style.display = 'flex';
    }
}

let deleteId = null;

function showDeleteConfirm(id) {
    deleteId = id;
    document.getElementById('deleteModal').style.display = 'flex';
}

function confirmDelete() {
    if (deleteId) {
        deleteGame(deleteId);
        closeDeleteModal();
    }
}

function closeModal() {
    document.getElementById('gameModal').style.display = 'none';
    document.getElementById('gameForm').reset();
    document.getElementById('gameId').value = '';
    document.getElementById('coverPreviewContainer').style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('gameSearchInput').value = '';
    currentCoverUrl = null;
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    deleteId = null;
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Game Tracker with Auto-Fill Started');
    console.log('🎨 RAWG API Key:', RAWG_API_KEY ? '✅ Loaded' : '❌ Missing');
    
    // Setup search
    setupGameSearch();
    
    // Tab switching
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const tab = link.dataset.tab;
            document.getElementById('dashboardSection').classList.toggle('active', tab === 'dashboard');
            document.getElementById('librarySection').classList.toggle('active', tab === 'library');
            document.getElementById('pageTitle').innerText = tab === 'dashboard' ? '📊 Dashboard' : '🎮 Game Library';
            
            if (tab === 'library') renderLibrary();
        });
    });
    
    // Dark mode
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        const saved = localStorage.getItem('darkMode') === 'true';
        darkModeToggle.checked = saved;
        if (saved) document.body.classList.add('dark-mode');
        darkModeToggle.addEventListener('change', () => {
            document.body.classList.toggle('dark-mode', darkModeToggle.checked);
            localStorage.setItem('darkMode', darkModeToggle.checked);
            updateCharts();
        });
    }
    
    // Add game button
    document.getElementById('addGameBtn').addEventListener('click', () => {
        document.getElementById('modalTitle').innerText = '🎮 Add New Game';
        document.getElementById('gameForm').reset();
        document.getElementById('gameId').value = '';
        document.getElementById('progress').value = 0;
        document.getElementById('rating').value = 3;
        document.getElementById('hours_played').value = 0;
        document.getElementById('status').value = 'backlog';
        document.getElementById('coverPreviewContainer').style.display = 'none';
        document.getElementById('searchResults').style.display = 'none';
        currentCoverUrl = null;
        document.getElementById('gameModal').style.display = 'flex';
    });
    
    // Close modals
    document.querySelectorAll('.close-modal, .modal').forEach(el => {
        el.addEventListener('click', function(e) {
            if (e.target === this || e.target.classList.contains('close-modal')) {
                closeModal();
                closeDeleteModal();
            }
        });
    });
    
    // Buttons
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
    document.getElementById('gameForm').addEventListener('submit', saveGame);
    
    // Filters
    document.getElementById('searchInput').addEventListener('input', () => renderLibrary());
    document.getElementById('filterGenre').addEventListener('change', renderLibrary);
    document.getElementById('filterPlatform').addEventListener('change', renderLibrary);
    document.getElementById('filterRating').addEventListener('change', renderLibrary);
    document.getElementById('filterStatus').addEventListener('change', renderLibrary);
    
    // Initial fetch
    fetchGames();
    
    // Realtime subscription
    supabaseClient.channel('games-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => fetchGames())
        .subscribe();
    
    console.log('✅ App Ready with Auto-Fill Feature!');
});