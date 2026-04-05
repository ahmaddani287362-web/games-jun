// ============================================
// WEB GAMES TRACKER - SUPABASE CONFIGURATION
// ============================================

// CEK APAKAH SUDAH TERDEFINISI SEBELUMNYA
if (typeof window.supabaseClient === 'undefined') {
    // Supabase Configuration (GANTI DENGAN CREDENTIAL ASLI ANDA)
    const SUPABASE_URL = 'https://inwjlxiqxtztjtrttqke.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_ntFp5P_qMnQKQSv3-MX9RA_dgOit_H1';
    
    // Gunakan nama variabel yang unik untuk menghindari konflik
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

const supabase = window.supabaseClient;

// State Management
let currentEditId = null;
let gamesData = [];
let genreChart, completionChart, ratingChart;

// Helper: Escape HTML untuk keamanan
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Render rating stars
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

// Fetch all games dari Supabase
async function fetchGames() {
    try {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        gamesData = data || [];
        renderLibrary();
        updateDashboard();
        updateFilters();
    } catch (error) {
        console.error('Error fetching games:', error);
        showNotification('Gagal memuat data games', 'error');
    }
}

// Render library/games grid
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
        grid.innerHTML = '<div class="empty-state">✨ No games found. Add your first game!</div>';
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
                    <span>${game.hours_played || 0}h</span>
                </div>
                <div class="game-meta">
                    <span class="tag"><i class="fas fa-tag"></i> ${escapeHtml(game.genre) || 'General'}</span>
                    ${game.tags ? game.tags.split(',').map(t => `<span class="tag">#${escapeHtml(t.trim())}</span>`).join('') : ''}
                </div>
                <div class="card-actions">
                    <button class="edit-game" data-id="${game.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-game" data-id="${game.id}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
                <div>
                    <i class="fas fa-${game.status === 'completed' ? 'check-circle' : (game.status === 'playing' ? 'play-circle' : 'book')}"></i> 
                    ${game.status || 'backlog'}
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

// Update dashboard statistics dan charts
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

    // Genre stats untuk chart
    const genreCount = {};
    gamesData.forEach(g => {
        if (g.genre) genreCount[g.genre] = (genreCount[g.genre] || 0) + 1;
    });
    
    const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    // Update atau create charts
    const genreCtx = document.getElementById('genreChart')?.getContext('2d');
    const completionCtx = document.getElementById('completionChart')?.getContext('2d');
    const ratingCtx = document.getElementById('ratingChart')?.getContext('2d');
    
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
                datasets: [{ label: 'Games', data: completionData, backgroundColor: '#8b5cf6' }]
            },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
        });
    }
    
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
                datasets: [{ label: 'Count', data: ratingDist, borderColor: '#f59e0b', tension: 0.3, fill: true }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    }
}

// Update filter options berdasarkan data
function updateFilters() {
    const genres = [...new Set(gamesData.map(g => g.genre).filter(Boolean))];
    const platforms = [...new Set(gamesData.map(g => g.platform).filter(Boolean))];
    
    const genreSelect = document.getElementById('filterGenre');
    const platformSelect = document.getElementById('filterPlatform');
    
    if (genreSelect) {
        genreSelect.innerHTML = '<option value="">All Genres</option>' + 
            genres.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    }
    
    if (platformSelect) {
        platformSelect.innerHTML = '<option value="">All Platforms</option>' + 
            platforms.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    }
}

// Save game (add or edit)
async function saveGame(event) {
    event.preventDefault();
    
    const id = document.getElementById('gameId')?.value;
    const game = {
        title: document.getElementById('title')?.value,
        platform: document.getElementById('platform')?.value,
        genre: document.getElementById('genre')?.value,
        tags: document.getElementById('tags')?.value,
        progress: parseInt(document.getElementById('progress')?.value || 0),
        rating: parseFloat(document.getElementById('rating')?.value || 3),
        hours_played: parseFloat(document.getElementById('hours_played')?.value || 0),
        status: document.getElementById('status')?.value,
        updated_at: new Date()
    };
    
    try {
        if (id) {
            const { error } = await supabase.from('games').update(game).eq('id', id);
            if (error) throw error;
            showNotification('Game berhasil diupdate!', 'success');
        } else {
            const { error } = await supabase.from('games').insert([{ 
                ...game, 
                created_at: new Date() 
            }]);
            if (error) throw error;
            showNotification('Game berhasil ditambahkan!', 'success');
        }
        closeModal();
        fetchGames();
    } catch (error) {
        console.error('Error saving game:', error);
        showNotification('Gagal menyimpan game', 'error');
    }
}

// Open modal untuk edit game
function openEditModal(id) {
    const game = gamesData.find(g => g.id == id);
    if (game) {
        const modalTitle = document.getElementById('modalTitle');
        const gameId = document.getElementById('gameId');
        const title = document.getElementById('title');
        const platform = document.getElementById('platform');
        const genre = document.getElementById('genre');
        const tags = document.getElementById('tags');
        const progress = document.getElementById('progress');
        const rating = document.getElementById('rating');
        const hoursPlayed = document.getElementById('hours_played');
        const status = document.getElementById('status');
        
        if (modalTitle) modalTitle.innerText = 'Edit Game';
        if (gameId) gameId.value = game.id;
        if (title) title.value = game.title;
        if (platform) platform.value = game.platform || '';
        if (genre) genre.value = game.genre || '';
        if (tags) tags.value = game.tags || '';
        if (progress) progress.value = game.progress;
        if (rating) rating.value = game.rating;
        if (hoursPlayed) hoursPlayed.value = game.hours_played || 0;
        if (status) status.value = game.status;
        
        const modal = document.getElementById('gameModal');
        if (modal) modal.style.display = 'flex';
    }
}

// Delete confirmation
let deleteId = null;

function showDeleteConfirm(id) {
    deleteId = id;
    const modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'flex';
}

async function confirmDelete() {
    if (deleteId) {
        try {
            const { error } = await supabase.from('games').delete().eq('id', deleteId);
            if (error) throw error;
            showNotification('Game berhasil dihapus!', 'success');
            fetchGames();
        } catch (error) {
            console.error('Error deleting game:', error);
            showNotification('Gagal menghapus game', 'error');
        }
    }
    closeDeleteModal();
}

// Close modals
function closeModal() {
    const modal = document.getElementById('gameModal');
    const form = document.getElementById('gameForm');
    const gameId = document.getElementById('gameId');
    
    if (modal) modal.style.display = 'none';
    if (form) form.reset();
    if (gameId) gameId.value = '';
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'none';
    deleteId = null;
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element if not exists
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

// Initialize event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
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
            if (pageTitle) pageTitle.innerText = tab === 'dashboard' ? 'Dashboard' : 'Game Library';
            
            if (tab === 'library') renderLibrary();
        });
    });
    
    // Dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', (e) => {
            document.body.classList.toggle('dark-mode', e.target.checked);
            localStorage.setItem('darkMode', e.target.checked);
        });
        
        // Load saved dark mode preference
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        darkModeToggle.checked = savedDarkMode;
        if (savedDarkMode) document.body.classList.add('dark-mode');
    }
    
    // Add game button
    const addGameBtn = document.getElementById('addGameBtn');
    if (addGameBtn) {
        addGameBtn.addEventListener('click', () => {
            const modalTitle = document.getElementById('modalTitle');
            const form = document.getElementById('gameForm');
            const gameId = document.getElementById('gameId');
            
            if (modalTitle) modalTitle.innerText = 'Add New Game';
            if (form) form.reset();
            if (gameId) gameId.value = '';
            
            const modal = document.getElementById('gameModal');
            if (modal) modal.style.display = 'flex';
        });
    }
    
    // Close modals
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
    const gamesChannel = supabase
        .channel('games-channel')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'games' }, 
            () => fetchGames()
        )
        .subscribe();
});

// Add notification styles to CSS
const notificationStyle = document.createElement('style');
notificationStyle.textContent = `
    .notification {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 12px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        display: none;
    }
    
    .notification.success {
        background: linear-gradient(135deg, #10b981, #059669);
    }
    
    .notification.error {
        background: linear-gradient(135deg, #ef4444, #dc2626);
    }
    
    .notification.info {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
    }
    
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(notificationStyle);
