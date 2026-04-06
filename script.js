// ============================================
// GAME TRACKER - SUPABASE + RAWG API
// ============================================

// Configuration
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_KEY = window.SUPABASE_KEY;
const RAWG_API_KEY = window.RAWG_API_KEY;

// Initialize Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State
let gamesData = [];
let genreChart, completionChart, ratingChart;
let currentCoverUrl = null;
let deleteId = null;

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        return m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;';
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

function showNotification(message, type) {
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
// RAWG API FUNCTIONS
// ============================================

async function searchGamesFromAPI(query) {
    if (!query || query.length < 2) return [];
    try {
        const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&key=${RAWG_API_KEY}&page_size=8`;
        const response = await fetch(url);
        const data = await response.json();
        return data.results?.map(game => ({
            id: game.id,
            name: game.name,
            cover: game.background_image,
            genres: game.genres?.map(g => g.name).join(', ') || '',
            platforms: game.platforms?.map(p => p.platform.name).slice(0, 2).join(', ') || '',
            rating: game.rating || 0
        })) || [];
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderLibrary() {
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
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-gamepad" style="font-size:3rem; margin-bottom:1rem"></i><p>No games found. Add your first game!</p></div>`;
        return;
    }
    
    grid.innerHTML = filtered.map(game => `
        <div class="game-card" data-id="${game.id}" data-game='${JSON.stringify(game)}'>
            <div class="game-cover">
                <img src="${game.cover_url || 'https://placehold.co/400x200/1e1b2e/8b5cf6?text=' + encodeURIComponent(game.title.substring(0,1))}" 
                     alt="${escapeHtml(game.title)}" loading="lazy"
                     onerror="this.src='https://placehold.co/400x200/1e1b2e/8b5cf6?text=${encodeURIComponent(game.title.substring(0,2))}'">
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
                    <span style="font-size:0.7rem">⏱️ ${game.hours_played || 0}h</span>
                </div>
                <div class="game-meta">
                    <span class="tag">${escapeHtml(game.genre) || 'General'}</span>
                    ${game.tags ? game.tags.split(',').slice(0,2).map(t => `<span class="tag">#${escapeHtml(t.trim())}</span>`).join('') : ''}
                </div>
                <div class="card-actions">
                    <button class="edit-game" data-id="${game.id}"><i class="fas fa-edit"></i> Edit</button>
                    <button class="delete-game" data-id="${game.id}"><i class="fas fa-trash-alt"></i> Delete</button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Event listeners
    document.querySelectorAll('.edit-game').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(btn.dataset.id);
        });
    });
    
    document.querySelectorAll('.delete-game').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteId = btn.dataset.id;
            document.getElementById('deleteModal').style.display = 'flex';
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
    // Genre Chart
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
    
    // Completion Chart
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
                labels: ['Completed', 'Playing', 'Backlog'],
                datasets: [{ label: 'Games', data: completionData, backgroundColor: '#8b5cf6', borderRadius: 10 }]
            },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }
    
    // Rating Chart
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
                datasets: [{ label: 'Games', data: ratingDist, borderColor: '#f59e0b', tension: 0.3, fill: true }]
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
        genreSelect.innerHTML = '<option value="">All Genres</option>' + genres.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    }
    if (platformSelect) {
        platformSelect.innerHTML = '<option value="">All Platforms</option>' + platforms.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    }
}

// ============================================
// CRUD FUNCTIONS
// ============================================

async function fetchGames() {
    try {
        const { data, error } = await supabaseClient.from('games').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        gamesData = data || [];
        console.log(`Loaded ${gamesData.length} games`);
        renderLibrary();
        updateDashboard();
        updateFilters();
    } catch (error) {
        console.error('Error fetching games:', error);
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
            await supabaseClient.from('games').update(game).eq('id', id);
            showNotification('Game updated!', 'success');
        } else {
            await supabaseClient.from('games').insert([{ ...game, created_at: new Date().toISOString() }]);
            showNotification('Game added!', 'success');
        }
        closeModal();
        fetchGames();
    } catch (error) {
        console.error('Error saving game:', error);
        showNotification('Failed to save game', 'error');
    }
}

async function deleteGame() {
    if (!deleteId) return;
    try {
        await supabaseClient.from('games').delete().eq('id', deleteId);
        showNotification('Game deleted!', 'success');
        fetchGames();
        closeDeleteModal();
    } catch (error) {
        showNotification('Failed to delete', 'error');
    }
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
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('gameSearchInput').value = '';
    currentCoverUrl = null;
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    deleteId = null;
}

// ============================================
// SEARCH AUTO-FILL
// ============================================

let searchTimeout = null;

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
            resultsDiv.innerHTML = '<div style="padding: 1rem; text-align: center;"><i class="fas fa-spinner fa-pulse"></i> Searching...</div>';
            resultsDiv.style.display = 'block';
            
            const results = await searchGamesFromAPI(query);
            
            if (!results.length) {
                resultsDiv.innerHTML = '<div style="padding: 1rem; text-align: center;">No games found</div>';
                return;
            }
            
            resultsDiv.innerHTML = results.map(game => `
                <div class="search-result-item" data-game='${JSON.stringify(game)}'>
                    <img src="${game.cover || 'https://placehold.co/50x50/8b5cf6/white?text=?'}" alt="${escapeHtml(game.name)}">
                    <div>
                        <h4>${escapeHtml(game.name)}</h4>
                        <p>${game.genres || 'No genre'} | ⭐ ${game.rating}</p>
                    </div>
                </div>
            `).join('');
            
            document.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const gameData = JSON.parse(item.dataset.game);
                    autoFillForm(gameData);
                    resultsDiv.style.display = 'none';
                    searchInput.value = '';
                });
            });
        }, 500);
    });
    
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });
}

function autoFillForm(gameData) {
    document.getElementById('title').value = gameData.name;
    if (gameData.platforms) {
        document.getElementById('platform').value = gameData.platforms.split(',')[0].trim();
    }
    if (gameData.genres) {
        document.getElementById('genre').value = gameData.genres;
        const tags = gameData.genres.split(',').map(g => g.trim().toLowerCase());
        document.getElementById('tags').value = tags.join(', ');
    }
    if (gameData.rating) {
        const rounded = Math.round(gameData.rating * 2) / 2;
        document.getElementById('rating').value = Math.min(5, Math.max(1, rounded));
    }
    if (gameData.cover) {
        currentCoverUrl = gameData.cover;
        document.getElementById('coverPreview').src = gameData.cover;
        document.getElementById('coverPreviewContainer').style.display = 'block';
    }
    showNotification(`Game "${gameData.name}" auto-filled!`, 'success');
}

// ============================================
// TAB NAVIGATION
// ============================================

function switchTab(tab) {
    document.querySelectorAll('.nav-link, .nav-item').forEach(el => {
        el.classList.remove('active');
    });
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => {
        el.classList.add('active');
    });
    
    document.getElementById('dashboardSection').classList.toggle('active', tab === 'dashboard');
    document.getElementById('librarySection').classList.toggle('active', tab === 'library');
    document.getElementById('pageTitle').innerText = tab === 'dashboard' ? 'Dashboard' : 'Game Library';
    
    if (tab === 'library') renderLibrary();
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Game Tracker Starting...');
    
    // Setup search
    setupGameSearch();
    
    // Tab switching
    document.querySelectorAll('.nav-link, .nav-item').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(el.dataset.tab);
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
    
    document.getElementById('mobileAddBtn')?.addEventListener('click', () => {
        document.getElementById('addGameBtn').click();
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
    
    // Delete buttons
    document.getElementById('confirmDeleteBtn').addEventListener('click', deleteGame);
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
    
    // Save form
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
    
    console.log('✅ App Ready');
});