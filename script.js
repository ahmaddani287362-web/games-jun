// Supabase Configuration (GANTI DENGAN CREDENTIAL ASLI ANDA)
const SUPABASE_URL = 'https://inwjlxiqxtztjtrttqke.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ntFp5P_qMnQKQSv3-MX9RA_dgOit_H1';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentEditId = null;
let gamesData = [];
let genreChart, completionChart, ratingChart;

// Helper: render stars
function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) stars += `<i class="fa${i <= rating ? 's' : 'r'} fa-star"></i>`;
    return stars;
}

// Fetch all games
async function fetchGames() {
    const { data, error } = await supabase.from('games').select('*').order('created_at', { ascending: false });
    if (error) console.error(error);
    else { gamesData = data; renderLibrary(); updateDashboard(); updateFilters(); }
}

// Realtime subscription
supabase.channel('games-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => fetchGames()).subscribe();

function renderLibrary() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const genreFilter = document.getElementById('filterGenre').value;
    const platformFilter = document.getElementById('filterPlatform').value;
    const ratingFilter = document.getElementById('filterRating').value;
    const statusFilter = document.getElementById('filterStatus').value;

    let filtered = gamesData.filter(g => g.title.toLowerCase().includes(search));
    if (genreFilter) filtered = filtered.filter(g => g.genre === genreFilter);
    if (platformFilter) filtered = filtered.filter(g => g.platform === platformFilter);
    if (ratingFilter) filtered = filtered.filter(g => g.rating >= parseInt(ratingFilter));
    if (statusFilter) filtered = filtered.filter(g => g.status === statusFilter);

    const grid = document.getElementById('gamesGrid');
    if (!filtered.length) { grid.innerHTML = '<div class="empty-state">✨ No games found. Add your first game!</div>'; return; }
    grid.innerHTML = filtered.map(game => `
        <div class="game-card" data-id="${game.id}">
            <div class="card-content">
                <div class="game-title">${escapeHtml(game.title)}<small>${game.platform || '-'}</small></div>
                <div class="progress-bar"><div class="progress-fill" style="width:${game.progress}%"></div></div>
                <div class="rating-stars">${renderStars(game.rating)} <span>${game.hours_played || 0}h</span></div>
                <div class="game-meta"><span class="tag"><i class="fas fa-tag"></i> ${game.genre || 'General'}</span>${game.tags ? game.tags.split(',').map(t=>`<span class="tag">#${t.trim()}</span>`).join('') : ''}</div>
                <div class="card-actions">
                    <button class="edit-game" data-id="${game.id}"><i class="fas fa-edit"></i></button>
                    <button class="delete-game" data-id="${game.id}"><i class="fas fa-trash-alt"></i></button>
                </div>
                <div><i class="fas fa-${game.status === 'completed' ? 'check-circle' : (game.status === 'playing' ? 'play-circle' : 'book')}"></i> ${game.status}</div>
            </div>
        </div>
    `).join('');
    document.querySelectorAll('.edit-game').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.id); }));
    document.querySelectorAll('.delete-game').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); showDeleteConfirm(btn.dataset.id); }));
}

function updateDashboard() {
    const total = gamesData.length;
    const completed = gamesData.filter(g => g.status === 'completed').length;
    const totalHours = gamesData.reduce((sum, g) => sum + (g.hours_played || 0), 0);
    const avgRating = (gamesData.reduce((sum, g) => sum + (g.rating || 0), 0) / total).toFixed(1) || 0;
    document.getElementById('totalGames').innerText = total;
    document.getElementById('completedGames').innerText = completed;
    document.getElementById('totalHours').innerText = totalHours;
    document.getElementById('avgRating').innerText = avgRating;

    // Genre stats
    const genreCount = {};
    gamesData.forEach(g => { if(g.genre) genreCount[g.genre] = (genreCount[g.genre]||0)+1; });
    const topGenres = Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (genreChart) genreChart.destroy();
    genreChart = new Chart(document.getElementById('genreChart'), { type: 'doughnut', data: { labels: topGenres.map(g=>g[0]), datasets: [{ data: topGenres.map(g=>g[1]), backgroundColor: ['#8b5cf6','#ec4899','#06b6d4','#f97316','#10b981'] }] }, options: { responsive: true, plugins: { legend: { position: 'bottom' } } } });
    
    const completionData = [gamesData.filter(g=>g.status==='completed').length, gamesData.filter(g=>g.status==='playing').length, gamesData.filter(g=>g.status==='backlog').length];
    if(completionChart) completionChart.destroy();
    completionChart = new Chart(document.getElementById('completionChart'), { type: 'bar', data: { labels: ['Completed','Playing','Backlog'], datasets: [{ label: 'Games', data: completionData, backgroundColor: '#8b5cf6' }] } });
    
    const ratingDist = [0,0,0,0,0];
    gamesData.forEach(g => { if(g.rating>=1 && g.rating<=5) ratingDist[Math.floor(g.rating)-1]++; });
    if(ratingChart) ratingChart.destroy();
    ratingChart = new Chart(document.getElementById('ratingChart'), { type: 'line', data: { labels: ['★1','★2','★3','★4','★5'], datasets: [{ label: 'Count', data: ratingDist, borderColor: '#f59e0b', tension: 0.3, fill: true }] } });
}

function updateFilters() {
    const genres = [...new Set(gamesData.map(g=>g.genre).filter(Boolean))];
    const platforms = [...new Set(gamesData.map(g=>g.platform).filter(Boolean))];
    const genreSelect = document.getElementById('filterGenre'); genreSelect.innerHTML = '<option value="">All Genres</option>' + genres.map(g=>`<option value="${g}">${g}</option>`).join('');
    const platformSelect = document.getElementById('filterPlatform'); platformSelect.innerHTML = '<option value="">All Platforms</option>' + platforms.map(p=>`<option value="${p}">${p}</option>`).join('');
}

async function saveGame(event) {
    event.preventDefault();
    const id = document.getElementById('gameId').value;
    const game = {
        title: document.getElementById('title').value,
        platform: document.getElementById('platform').value,
        genre: document.getElementById('genre').value,
        tags: document.getElementById('tags').value,
        progress: parseInt(document.getElementById('progress').value),
        rating: parseFloat(document.getElementById('rating').value),
        hours_played: parseFloat(document.getElementById('hours_played').value),
        status: document.getElementById('status').value,
    };
    if (id) await supabase.from('games').update(game).eq('id', id);
    else await supabase.from('games').insert([{ ...game, created_at: new Date() }]);
    closeModal();
    fetchGames();
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
        document.getElementById('gameModal').style.display = 'flex';
    }
}

let deleteId = null;
function showDeleteConfirm(id) { deleteId = id; document.getElementById('deleteModal').style.display = 'flex'; }
async function confirmDelete() { if(deleteId) { await supabase.from('games').delete().eq('id', deleteId); fetchGames(); } closeDeleteModal(); }

function closeModal() { document.getElementById('gameModal').style.display = 'none'; document.getElementById('gameForm').reset(); document.getElementById('gameId').value = ''; }
function closeDeleteModal() { document.getElementById('deleteModal').style.display = 'none'; deleteId = null; }

function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, function(m){ if(m==='&') return '&amp;'; if(m==='<') return '&lt;'; if(m==='>') return '&gt;'; return m;}); }

// Tab switching
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
        link.classList.add('active');
        const tab = link.dataset.tab;
        document.getElementById('dashboardSection').classList.toggle('active', tab === 'dashboard');
        document.getElementById('librarySection').classList.toggle('active', tab === 'library');
        document.getElementById('pageTitle').innerText = tab === 'dashboard' ? 'Dashboard' : 'Game Library';
        if(tab === 'library') renderLibrary();
    });
});

// Dark mode
document.getElementById('darkModeToggle').addEventListener('change', (e) => { document.body.classList.toggle('dark-mode', e.target.checked); });

document.getElementById('addGameBtn').addEventListener('click', () => { document.getElementById('modalTitle').innerText = 'Add New Game'; document.getElementById('gameForm').reset(); document.getElementById('gameId').value = ''; document.getElementById('gameModal').style.display = 'flex'; });
document.querySelectorAll('.close-modal, .modal').forEach(el => el.addEventListener('click', function(e) { if(e.target === this || e.target.classList.contains('close-modal')) closeModal(); }));
document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
document.getElementById('gameForm').addEventListener('submit', saveGame);
document.getElementById('searchInput').addEventListener('input', () => renderLibrary());
document.getElementById('filterGenre').addEventListener('change', renderLibrary);
document.getElementById('filterPlatform').addEventListener('change', renderLibrary);
document.getElementById('filterRating').addEventListener('change', renderLibrary);
document.getElementById('filterStatus').addEventListener('change', renderLibrary);

fetchGames();