// ============================================
// WEB GAMES TRACKER - WITH SUPABASE
// ============================================

// Inisialisasi Supabase dengan credentials yang sudah diset di HTML
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_KEY = window.SUPABASE_KEY;

// Cek apakah credentials tersedia
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Supabase credentials not found!');
    alert('Error: Supabase credentials not configured. Please check your environment variables.');
}

// Buat client Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State Management
let currentEditId = null;
let gamesData = [];
let genreChart = null;
let completionChart = null;
let ratingChart = null;

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
// SUPABASE CRUD OPERATIONS
// ============================================

async function fetchGames() {
    try {
        console.log('🔄 Fetching games from Supabase...');
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
        console.error('❌ Error fetching games:', error);
        showNotification('Failed to load games: ' + error.message, 'error');
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
        updated_at: new Date().toISOString()
    };
    
    // Validasi
    if (!game.title) {
        showNotification('Game title is required!', 'error');
        return;
    }
    
    try {
        if (id) {
            // Update game
            const { error } = await supabaseClient
                .from('games')
                .update(game)
                .eq('id', id);
            
            if (error) throw error;
            showNotification('✅ Game updated successfully!', 'success');
        } else {
            // Insert new game
            const { error } = await supabaseClient
                .from('games')
                .insert([{ 
                    ...game, 
                    created_at: new Date().toISOString() 
                }]);
            
            if (error) throw error;
            showNotification('✅ Game added successfully!', 'success');
        }
        
        closeModal();
        fetchGames();
    } catch (error) {
        console.error('Error saving game:', error);
        showNotification('Failed to save game: ' + error.message, 'error');
    }
}

async function deleteGame(id) {
    try {
        const { error } = await supabaseClient
            .from('games')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showNotification('🗑️ Game deleted successfully!', 'success');
        fetchGames();
    } catch (error) {
        console.error('Error deleting game:', error);
        showNotification('Failed to delete game: ' + error.message, 'error');
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
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-gamepad" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <p>✨ No games found. Add your first game!</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filtered.map(game => `
        <div class="game-card" data-id="${game.id}">
            <div class="card-content">
                <div class="game-title">
                    ${escapeHtml(game.title)}
                    <small>${escapeHtml(game.platform) || '-'}</small>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${game.progress || 0}%"></div>
                </div>
                <div class="rating-stars">
                    ${renderStars(game.rating || 0)} 
                    <span>⏱️ ${game.hours_played || 0}h</span>
                </div>
                <div class="game-meta">
                    <span class="tag"><i class="fas fa-tag"></i> ${escapeHtml(game.genre) || 'General'}</span>
                    ${game.tags ? game.tags.split(',').map(t => `<span class="tag">#${escapeHtml(t.trim())}</span>`).join('') : ''}
                </div>
                <div style="margin-top: 8px;">
                    <i class="fas ${getStatusIcon(game.status)}"></i> 
                    <span style="text-transform: capitalize;">${game.status || 'backlog'}</span>
                </div>
                <div class="card-actions">
                    <button class="edit-game" data-id="${game.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="delete-game" data-id="${game.id}">
                        <i class="fas fa-trash-alt"></i> Delete
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Attach event listeners
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

function getStatusIcon(status) {
    switch(status) {
        case 'completed': return 'fa-trophy';
        case 'playing': return 'fa-play-circle';
        default: return 'fa-book';
    }
}

function updateDashboard() {
    const total = gamesData.length;
    const completed = gamesData.filter(g => g.status === 'completed').length;
    const totalHours = gamesData.reduce((sum, g) => sum + (g.hours_played || 0), 0);
    const avgRating = total > 0 ? (gamesData.reduce((sum, g) => sum + (g.rating || 0), 0) / total).toFixed(1) : 0;
    
    // Update stats cards
    const totalGamesEl = document.getElementById('totalGames');
    const completedGamesEl = document.getElementById('completedGames');
    const totalHoursEl = document.getElementById('totalHours');
    const avgRatingEl = document.getElementById('avgRating');
    
    if (totalGamesEl) totalGamesEl.innerText = total;
    if (completedGamesEl) completedGamesEl.innerText = completed;
    if (totalHoursEl) totalHoursEl.innerText = totalHours;
    if (avgRatingEl) avgRatingEl.innerText = avgRating;

    // Update charts
    updateCharts();
}

function updateCharts() {
    // Genre stats untuk chart
    const genreCount = {};
    gamesData.forEach(g => {
        if (g.genre) genreCount[g.genre] = (genreCount[g.genre] || 0) + 1;
    });
    
    const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    // Genre Chart
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
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: getComputedStyle(document.body).getPropertyValue('--text-primary') } }
                }
            }
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
                labels: ['🏆 Completed', '🎮 Playing', '📚 Backlog'],
                datasets: [{
                    label: 'Number of Games',
                    data: completionData,
                    backgroundColor: ['#10b981', '#8b5cf6', '#f59e0b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' }
                }
            }
        });
    }
    
    // Rating Distribution Chart
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
                labels: ['★ 1', '★ 2', '★ 3', '★ 4', '★ 5'],
                datasets: [{
                    label: 'Games Count',
                    data: ratingDist,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' }
                }
            }
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
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    deleteId = null;
}

// ============================================
// EVENT LISTENERS & INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Game Tracker App Started');
    
    // Tab switching
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const tab = link.dataset.tab;
            const dashboardSection = document.getElementById('dashboardSection');
            const librarySection = document.getElementById('librarySection');
            const pageTitle = document.getElementById('pageTitle');
            
            if (dashboardSection) dashboardSection.classList.toggle('active', tab === 'dashboard');
            if (librarySection) librarySection.classList.toggle('active', tab === 'library');
            if (pageTitle) pageTitle.innerText = tab === 'dashboard' ? '📊 Dashboard' : '🎮 Game Library';
            
            if (tab === 'library') renderLibrary();
        });
    });
    
    // Dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        // Load saved preference
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        darkModeToggle.checked = savedDarkMode;
        if (savedDarkMode) document.body.classList.add('dark-mode');
        
        darkModeToggle.addEventListener('change', (e) => {
            document.body.classList.toggle('dark-mode', e.target.checked);
            localStorage.setItem('darkMode', e.target.checked);
            // Refresh charts to update colors
            updateCharts();
        });
    }
    
    // Add game button
    const addGameBtn = document.getElementById('addGameBtn');
    if (addGameBtn) {
        addGameBtn.addEventListener('click', () => {
            document.getElementById('modalTitle').innerText = '🎮 Add New Game';
            document.getElementById('gameForm').reset();
            document.getElementById('gameId').value = '';
            document.getElementById('progress').value = 0;
            document.getElementById('rating').value = 3;
            document.getElementById('hours_played').value = 0;
            document.getElementById('status').value = 'backlog';
            document.getElementById('gameModal').style.display = 'flex';
        });
    }
    
    // Close modals when clicking outside or on close button
    document.querySelectorAll('.close-modal, .modal').forEach(el => {
        el.addEventListener('click', function(e) {
            if (e.target === this || e.target.classList.contains('close-modal')) {
                closeModal();
                closeDeleteModal();
            }
        });
    });
    
    // Cancel delete button
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    
    // Confirm delete button
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', confirmDelete);
    
    // Save game form
    const gameForm = document.getElementById('gameForm');
    if (gameForm) gameForm.addEventListener('submit', saveGame);
    
    // Filters
    const searchInput = document.getElementById('searchInput');
    const filterGenre = document.getElementById('filterGenre');
    const filterPlatform = document.getElementById('filterPlatform');
    const filterRating = document.getElementById('filterRating');
    const filterStatus = document.getElementById('filterStatus');
    
    if (searchInput) searchInput.addEventListener('input', () => renderLibrary());
    if (filterGenre) filterGenre.addEventListener('change', renderLibrary);
    if (filterPlatform) filterPlatform.addEventListener('change', renderLibrary);
    if (filterRating) filterRating.addEventListener('change', renderLibrary);
    if (filterStatus) filterStatus.addEventListener('change', renderLibrary);
    
    // Initial fetch
    fetchGames();
    
    // Setup realtime subscription
    const gamesChannel = supabaseClient
        .channel('games-channel')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'games' }, 
            () => {
                console.log('🔄 Realtime update detected');
                fetchGames();
            }
        )
        .subscribe((status) => {
            console.log('📡 Realtime subscription status:', status);
        });
    
    console.log('✅ App initialized successfully');
});
