// ============================================
// GAME TRACKER PREMIUM - COMPLETE VERSION
// FIXED: Supabase initialization order
// ============================================

// ============================================
// 1. WAIT FOR DOM & ENVIRONMENT VARIABLES
// ============================================

// Pastikan environment variables sudah tersedia
const getEnvVar = (name) => {
    return window[name] || null;
};

// ============================================
// 2. GLOBAL VARIABLES (akan diinisialisasi setelah DOM ready)
// ============================================
let supabaseClient = null;
let gamesData = [];
let currentCoverUrl = null;
let deleteId = null;
let genreChart = null;
let completionChart = null;
let ratingChart = null;
let pullStartY = 0;
let searchTimeout = null;

// ============================================
// 3. HELPER FUNCTIONS
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

function vibrate() {
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(30);
    }
}

function showNotification(message, type) {
    let notif = document.getElementById('notification');
    if (!notif) {
        notif = document.createElement('div');
        notif.id = 'notification';
        notif.style.cssText = 'position:fixed; bottom:30px; right:30px; padding:12px 24px; border-radius:12px; color:white; z-index:10000; display:none; font-size:0.9rem;';
        document.body.appendChild(notif);
    }
    notif.textContent = message;
    notif.style.background = type === 'success' 
        ? 'linear-gradient(135deg, #10b981, #059669)' 
        : 'linear-gradient(135deg, #ef4444, #dc2626)';
    notif.style.display = 'block';
    setTimeout(function() { 
        notif.style.display = 'none'; 
    }, 3000);
}

function getGradientColor(title) {
    const colors = ['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#10b981', '#f59e0b'];
    const index = title ? title.length % colors.length : 0;
    return colors[index];
}

function getSmartPlaceholder(title) {
    if (!title) title = 'Game';
    const color = getGradientColor(title);
    return `https://placehold.co/400x600/${color.substring(1)}/ffffff?text=${encodeURIComponent(title.substring(0,2).toUpperCase())}`;
}

function renderStars(rating) {
    let stars = '';
    const full = Math.floor(rating);
    const half = rating % 1 !== 0;
    for (let i = 1; i <= 5; i++) {
        if (i <= full) {
            stars += '<i class="fas fa-star"></i>';
        } else if (half && i === full + 1) {
            stars += '<i class="fas fa-star-half-alt"></i>';
        } else {
            stars += '<i class="far fa-star"></i>';
        }
    }
    return stars;
}

// ============================================
// 4. SKELETON LOADING
// ============================================

function showSkeletons() {
    const grid = document.getElementById('gamesGrid');
    if (!grid) return;
    grid.innerHTML = Array(6).fill(0).map(function() {
        return `
            <div class="game-card">
                <div class="skeleton skeleton-cover"></div>
                <div class="card-content">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text" style="width:60%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// 5. RAWG API FUNCTIONS
// ============================================

async function searchGamesAPI(query) {
    const RAWG_API_KEY = window.RAWG_API_KEY;
    if (!query || query.length < 2) return [];
    if (!RAWG_API_KEY) return [];
    
    try {
        const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&key=${RAWG_API_KEY}&page_size=8`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results) {
            return data.results.map(function(g) {
                return {
                    id: g.id,
                    name: g.name,
                    cover: g.background_image,
                    genres: g.genres ? g.genres.map(function(ge) { return ge.name; }).join(', ') : '',
                    platforms: g.platforms ? g.platforms.slice(0,2).map(function(p) { return p.platform.name; }).join(', ') : '',
                    rating: g.rating || 0
                };
            });
        }
        return [];
    } catch(e) {
        console.error('Search error:', e);
        return [];
    }
}

async function getGameDetails(id) {
    const RAWG_API_KEY = window.RAWG_API_KEY;
    if (!RAWG_API_KEY) return null;
    
    try {
        const url = `https://api.rawg.io/api/games/${id}?key=${RAWG_API_KEY}`;
        const response = await fetch(url);
        return await response.json();
    } catch(e) {
        console.error('Detail error:', e);
        return null;
    }
}

// ============================================
// 6. RENDER FUNCTIONS
// ============================================

function renderGroupedGames(filtered) {
    const groups = {
        playing: { title: '🎮 Currently Playing', icon: 'fa-play-circle', games: [] },
        backlog: { title: '📚 Backlog', icon: 'fa-book', games: [] },
        completed: { title: '🏆 Completed', icon: 'fa-trophy', games: [] }
    };
    
    filtered.forEach(function(g) {
        if (groups[g.status]) {
            groups[g.status].games.push(g);
        }
    });
    
    let html = '';
    const groupOrder = ['playing', 'backlog', 'completed'];
    
    for (var i = 0; i < groupOrder.length; i++) {
        var key = groupOrder[i];
        var group = groups[key];
        if (group.games.length === 0) continue;
        
        html += '<div class="group-section">';
        html += '<div class="group-title"><i class="fas ' + group.icon + '"></i> ' + group.title + ' (' + group.games.length + ')</div>';
        html += '<div class="games-grid">';
        
        for (var j = 0; j < group.games.length; j++) {
            var game = group.games[j];
            var coverUrl = game.cover_url || getSmartPlaceholder(game.title);
            var gameTitle = escapeHtml(game.title);
            var gamePlatform = escapeHtml(game.platform) || '-';
            var gameGenre = escapeHtml(game.genre) || 'General';
            var gameProgress = game.progress || 0;
            var gameHours = game.hours_played || 0;
            var gameRating = game.rating || 0;
            var gameId = game.id;
            
            html += '<div class="game-card" data-id="' + gameId + '" data-game=\'' + JSON.stringify(game) + '\'>';
            html += '<div class="game-cover">';
            html += '<img src="' + coverUrl + '" alt="' + gameTitle + '" loading="lazy" onerror="this.src=\'' + getSmartPlaceholder(game.title) + '\'">';
            html += '<div class="cover-overlay"></div>';
            html += '<div class="progress-overlay"><div class="progress-fill" style="width:' + gameProgress + '%"></div></div>';
            html += '</div>';
            html += '<div class="card-content">';
            html += '<div class="game-title">' + gameTitle + '<small>' + gamePlatform + '</small></div>';
            html += '<div class="rating-stars">' + renderStars(gameRating) + ' <span style="font-size:0.65rem">⏱️ ' + gameHours + 'h</span></div>';
            html += '<div class="game-meta"><span class="tag">' + gameGenre + '</span></div>';
            html += '<div class="card-actions">';
            html += '<button class="edit-game" data-id="' + gameId + '"><i class="fas fa-edit"></i> Edit</button>';
            html += '<button class="delete-game" data-id="' + gameId + '"><i class="fas fa-trash-alt"></i> Delete</button>';
            html += '</div></div></div>';
        }
        
        html += '</div></div>';
    }
    
    return html;
}

async function renderLibrary() {
    const searchInput = document.getElementById('searchInput');
    const search = searchInput ? searchInput.value.toLowerCase() : '';
    const genreFilter = document.getElementById('filterGenre');
    const platformFilter = document.getElementById('filterPlatform');
    const ratingFilter = document.getElementById('filterRating');
    const statusFilter = document.getElementById('filterStatus');
    
    let genreVal = genreFilter ? genreFilter.value : '';
    let platformVal = platformFilter ? platformFilter.value : '';
    let ratingVal = ratingFilter ? ratingFilter.value : '';
    let statusVal = statusFilter ? statusFilter.value : '';
    
    let filtered = gamesData.filter(function(g) {
        return g.title && g.title.toLowerCase().includes(search);
    });
    
    if (genreVal) filtered = filtered.filter(function(g) { return g.genre === genreVal; });
    if (platformVal) filtered = filtered.filter(function(g) { return g.platform === platformVal; });
    if (ratingVal) filtered = filtered.filter(function(g) { return g.rating >= parseInt(ratingVal); });
    
    const grid = document.getElementById('gamesGrid');
    if (!grid) return;
    
    if (!filtered.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-gamepad"></i><h3>No Games Found</h3><p>Try adjusting your filters or add a new game!</p></div>';
        return;
    }
    
    showSkeletons();
    
    // Simulate async untuk skeleton
    setTimeout(function() {
        var html;
        if (statusVal) {
            html = '<div class="games-grid">';
            for (var i = 0; i < filtered.length; i++) {
                var game = filtered[i];
                var coverUrl = game.cover_url || getSmartPlaceholder(game.title);
                html += '<div class="game-card" data-id="' + game.id + '" data-game=\'' + JSON.stringify(game) + '\'>';
                html += '<div class="game-cover"><img src="' + coverUrl + '" loading="lazy" onerror="this.src=\'' + getSmartPlaceholder(game.title) + '\">';
                html += '<div class="progress-overlay"><div class="progress-fill" style="width:' + (game.progress || 0) + '%"></div></div></div>';
                html += '<div class="card-content"><div class="game-title">' + escapeHtml(game.title) + '<small>' + (escapeHtml(game.platform) || '-') + '</small></div>';
                html += '<div class="rating-stars">' + renderStars(game.rating || 0) + ' <span>⏱️ ' + (game.hours_played || 0) + 'h</span></div>';
                html += '<div class="game-meta"><span class="tag">' + (escapeHtml(game.genre) || 'General') + '</span></div>';
                html += '<div class="card-actions"><button class="edit-game" data-id="' + game.id + '"><i class="fas fa-edit"></i> Edit</button>';
                html += '<button class="delete-game" data-id="' + game.id + '"><i class="fas fa-trash-alt"></i> Delete</button></div></div></div>';
            }
            html += '</div>';
        } else {
            html = renderGroupedGames(filtered);
        }
        grid.innerHTML = html;
        
        // Attach event listeners
        document.querySelectorAll('.game-card').forEach(function(card) {
            card.addEventListener('click', function(e) {
                if (!e.target.closest('.card-actions')) {
                    var gameData = JSON.parse(card.dataset.game);
                    openGameDetail(gameData.id, gameData.title);
                }
            });
        });
        
        document.querySelectorAll('.edit-game').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                vibrate();
                openEditModal(btn.dataset.id);
            });
        });
        
        document.querySelectorAll('.delete-game').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                vibrate();
                deleteId = btn.dataset.id;
                var modal = document.getElementById('deleteModal');
                if (modal) modal.style.display = 'flex';
            });
        });
    }, 100);
}

// ============================================
// 7. CHARTS WITH DARK MODE SYNC
// ============================================

function updateCharts() {
    if (!gamesData) return;
    
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#cbd5e1' : '#475569';
    
    // Genre Chart
    var genreCount = {};
    gamesData.forEach(function(g) {
        if (g.genre) {
            genreCount[g.genre] = (genreCount[g.genre] || 0) + 1;
        }
    });
    
    var topGenres = Object.entries(genreCount).sort(function(a, b) {
        return b[1] - a[1];
    }).slice(0, 5);
    
    var genreCtx = document.getElementById('genreChart');
    if (genreCtx) {
        genreCtx = genreCtx.getContext('2d');
        if (genreChart) genreChart.destroy();
        genreChart = new Chart(genreCtx, {
            type: 'doughnut',
            data: {
                labels: topGenres.map(function(g) { return g[0]; }),
                datasets: [{
                    data: topGenres.map(function(g) { return g[1]; }),
                    backgroundColor: ['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#10b981'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: window.innerWidth < 480 ? 'bottom' : 'right',
                        labels: { color: textColor, font: { size: window.innerWidth < 480 ? 10 : 12 } }
                    }
                }
            }
        });
    }
    
    // Completion Chart
    var completionCtx = document.getElementById('completionChart');
    if (completionCtx) {
        completionCtx = completionCtx.getContext('2d');
        var compData = [
            gamesData.filter(function(g) { return g.status === 'completed'; }).length,
            gamesData.filter(function(g) { return g.status === 'playing'; }).length,
            gamesData.filter(function(g) { return g.status === 'backlog'; }).length
        ];
        if (completionChart) completionChart.destroy();
        completionChart = new Chart(completionCtx, {
            type: 'bar',
            data: {
                labels: ['Completed', 'Playing', 'Backlog'],
                datasets: [{ label: 'Games', data: compData, backgroundColor: '#8b5cf6', borderRadius: 12 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: { y: { grid: { display: false }, beginAtZero: true }, x: { ticks: { color: textColor } } }
            }
        });
    }
    
    // Rating Chart
    var ratingCtx = document.getElementById('ratingChart');
    if (ratingCtx) {
        ratingCtx = ratingCtx.getContext('2d');
        var ratingDist = [0, 0, 0, 0, 0];
        gamesData.forEach(function(g) {
            if (g.rating >= 1 && g.rating <= 5) {
                ratingDist[Math.floor(g.rating) - 1]++;
            }
        });
        if (ratingChart) ratingChart.destroy();
        ratingChart = new Chart(ratingCtx, {
            type: 'line',
            data: {
                labels: ['★1', '★2', '★3', '★4', '★5'],
                datasets: [{
                    label: 'Games',
                    data: ratingDist,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.1)',
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: { y: { grid: { display: false }, beginAtZero: true }, x: { ticks: { color: textColor } } }
            }
        });
    }
}

function updateDashboard() {
    if (!gamesData) return;
    
    var total = document.getElementById('totalGames');
    var completed = document.getElementById('completedGames');
    var totalHours = document.getElementById('totalHours');
    var avgRating = document.getElementById('avgRating');
    
    if (total) total.innerText = gamesData.length;
    if (completed) completed.innerText = gamesData.filter(function(g) { return g.status === 'completed'; }).length;
    if (totalHours) totalHours.innerText = gamesData.reduce(function(s, g) { return s + (g.hours_played || 0); }, 0);
    
    var avg = 0;
    if (gamesData.length > 0) {
        avg = gamesData.reduce(function(s, g) { return s + (g.rating || 0); }, 0) / gamesData.length;
    }
    if (avgRating) avgRating.innerText = avg.toFixed(1);
    
    updateCharts();
}

function updateFilters() {
    if (!gamesData) return;
    
    var genres = [];
    var platforms = [];
    
    gamesData.forEach(function(g) {
        if (g.genre && genres.indexOf(g.genre) === -1) genres.push(g.genre);
        if (g.platform && platforms.indexOf(g.platform) === -1) platforms.push(g.platform);
    });
    
    var genreSelect = document.getElementById('filterGenre');
    var platformSelect = document.getElementById('filterPlatform');
    
    if (genreSelect) {
        var genreHtml = '<option value="">All Genres</option>';
        for (var i = 0; i < genres.length; i++) {
            genreHtml += '<option value="' + escapeHtml(genres[i]) + '">' + escapeHtml(genres[i]) + '</option>';
        }
        genreSelect.innerHTML = genreHtml;
    }
    
    if (platformSelect) {
        var platformHtml = '<option value="">All Platforms</option>';
        for (var j = 0; j < platforms.length; j++) {
            platformHtml += '<option value="' + escapeHtml(platforms[j]) + '">' + escapeHtml(platforms[j]) + '</option>';
        }
        platformSelect.innerHTML = platformHtml;
    }
}

// ============================================
// 8. DETAIL MODAL
// ============================================

async function openGameDetail(id, title) {
    var modal = document.getElementById('detailModal');
    var heroDiv = document.getElementById('detailHero');
    var contentDiv = document.getElementById('detailContent');
    
    if (!modal) return;
    modal.style.display = 'flex';
    heroDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:240px"><div class="loading-spinner"></div></div>';
    contentDiv.innerHTML = '';
    
    var details = await getGameDetails(id);
    if (details) {
        heroDiv.style.backgroundImage = 'url(' + (details.background_image || getSmartPlaceholder(title)) + ')';
        heroDiv.style.backgroundSize = 'cover';
        heroDiv.style.backgroundPosition = 'center';
        heroDiv.innerHTML = '';
        
        var websiteLink = '';
        var redditLink = '';
        if (details.website) {
            websiteLink = '<a href="' + details.website + '" target="_blank" class="detail-link"><i class="fas fa-globe"></i> Official Website</a>';
        }
        if (details.reddit_url) {
            redditLink = '<a href="' + details.reddit_url + '" target="_blank" class="detail-link"><i class="fab fa-reddit"></i> Reddit</a>';
        }
        
        var genresHtml = '';
        if (details.genres) {
            var genreNames = [];
            for (var i = 0; i < details.genres.length; i++) {
                genreNames.push(details.genres[i].name);
            }
            genresHtml = '<div><strong>Genres:</strong> ' + genreNames.join(', ') + '</div>';
        }
        
        var platformsHtml = '';
        if (details.platforms) {
            var platformNames = [];
            for (var j = 0; j < Math.min(5, details.platforms.length); j++) {
                platformNames.push(details.platforms[j].platform.name);
            }
            platformsHtml = '<div><strong>Platforms:</strong> ' + platformNames.join(', ') + '</div>';
        }
        
        contentDiv.innerHTML = `
            <h2 class="detail-title">${escapeHtml(details.name)}</h2>
            <div class="detail-meta">
                <div><i class="fas fa-calendar"></i> ${details.released || 'TBA'}</div>
                <div><i class="fas fa-star"></i> ${details.rating}/5</div>
                ${details.metacritic ? '<div><i class="fas fa-chart-line"></i> Metascore: ' + details.metacritic + '</div>' : ''}
            </div>
            <div class="detail-description">${details.description_raw || 'No description available.'}</div>
            <div class="detail-meta">
                ${genresHtml}
                ${platformsHtml}
            </div>
            <div class="detail-links">
                ${websiteLink}
                ${redditLink}
            </div>
        `;
    } else {
        heroDiv.innerHTML = '';
        contentDiv.innerHTML = '<p style="padding:2rem;text-align:center">Failed to load details.</p>';
    }
}

// ============================================
// 9. CRUD FUNCTIONS (SUPABASE)
// ============================================

async function fetchGames() {
    if (!supabaseClient) {
        console.error('Supabase not initialized');
        return;
    }
    
    try {
        var { data, error } = await supabaseClient.from('games').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        gamesData = data || [];
        console.log('Loaded ' + gamesData.length + ' games');
        renderLibrary();
        updateDashboard();
        updateFilters();
    } catch(e) {
        console.error('Fetch error:', e);
        showNotification('Failed to load games', 'error');
    }
}

async function saveGame(e) {
    e.preventDefault();
    
    if (!supabaseClient) {
        showNotification('Database not ready', 'error');
        return;
    }
    
    var id = document.getElementById('gameId') ? document.getElementById('gameId').value : '';
    var titleInput = document.getElementById('title');
    var platformInput = document.getElementById('platform');
    var genreInput = document.getElementById('genre');
    var tagsInput = document.getElementById('tags');
    var progressInput = document.getElementById('progress');
    var ratingInput = document.getElementById('rating');
    var hoursInput = document.getElementById('hours_played');
    var statusSelect = document.getElementById('status');
    
    var game = {
        title: titleInput ? titleInput.value : null,
        platform: platformInput ? platformInput.value || null : null,
        genre: genreInput ? genreInput.value || null : null,
        tags: tagsInput ? tagsInput.value || null : null,
        progress: progressInput ? parseInt(progressInput.value || 0) : 0,
        rating: ratingInput ? parseFloat(ratingInput.value || 3) : 3,
        hours_played: hoursInput ? parseFloat(hoursInput.value || 0) : 0,
        status: statusSelect ? statusSelect.value : 'backlog',
        cover_url: currentCoverUrl || null,
        updated_at: new Date().toISOString()
    };
    
    if (!game.title) {
        showNotification('Title required!', 'error');
        return;
    }
    
    try {
        if (id) {
            var { error } = await supabaseClient.from('games').update(game).eq('id', id);
            if (error) throw error;
            showNotification('Game updated!', 'success');
        } else {
            var { error } = await supabaseClient.from('games').insert([{ ...game, created_at: new Date().toISOString() }]);
            if (error) throw error;
            showNotification('Game added!', 'success');
        }
        closeModal();
        fetchGames();
    } catch(e) {
        console.error('Save error:', e);
        showNotification('Failed to save', 'error');
    }
}

async function deleteGame() {
    if (!deleteId) return;
    if (!supabaseClient) return;
    
    try {
        var { error } = await supabaseClient.from('games').delete().eq('id', deleteId);
        if (error) throw error;
        showNotification('Game deleted!', 'success');
        fetchGames();
        closeDeleteModal();
    } catch(e) {
        showNotification('Failed to delete', 'error');
    }
}

// ============================================
// 10. SEARCH AUTO-FILL
// ============================================

function setupGameSearch() {
    var input = document.getElementById('gameSearchInput');
    var resultsDiv = document.getElementById('searchResults');
    if (!input) return;
    
    input.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        var q = input.value.trim();
        if (q.length < 2) {
            resultsDiv.style.display = 'none';
            return;
        }
        
        searchTimeout = setTimeout(async function() {
            resultsDiv.innerHTML = '<div style="padding:1rem;text-align:center"><div class="loading-spinner"></div> Searching...</div>';
            resultsDiv.style.display = 'block';
            
            var results = await searchGamesAPI(q);
            if (!results.length) {
                resultsDiv.innerHTML = '<div style="padding:1rem;text-align:center">No games found</div>';
                return;
            }
            
            var html = '';
            for (var i = 0; i < results.length; i++) {
                var g = results[i];
                html += '<div class="search-result-item" data-game=\'' + JSON.stringify(g) + '\'>';
                html += '<img src="' + (g.cover || getSmartPlaceholder(g.name)) + '">';
                html += '<div><h4>' + escapeHtml(g.name) + '</h4><p>' + (g.genres || 'No genre') + ' | ⭐ ' + g.rating + '</p></div>';
                html += '</div>';
            }
            resultsDiv.innerHTML = html;
            
            document.querySelectorAll('.search-result-item').forEach(function(item) {
                item.addEventListener('click', function() {
                    var data = JSON.parse(item.dataset.game);
                    var titleInput = document.getElementById('title');
                    var platformInput = document.getElementById('platform');
                    var genreInput = document.getElementById('genre');
                    var tagsInput = document.getElementById('tags');
                    var ratingInput = document.getElementById('rating');
                    var coverContainer = document.getElementById('coverPreviewContainer');
                    var coverPreview = document.getElementById('coverPreview');
                    
                    if (titleInput) titleInput.value = data.name;
                    if (data.platforms && platformInput) platformInput.value = data.platforms.split(',')[0];
                    if (data.genres) {
                        if (genreInput) genreInput.value = data.genres;
                        var tags = data.genres.split(',').map(function(t) { return t.trim().toLowerCase(); });
                        if (tagsInput) tagsInput.value = tags.join(', ');
                    }
                    if (data.rating && ratingInput) {
                        var rounded = Math.round(data.rating * 2) / 2;
                        ratingInput.value = Math.min(5, Math.max(1, rounded));
                    }
                    if (data.cover) {
                        currentCoverUrl = data.cover;
                        if (coverPreview) coverPreview.src = data.cover;
                        if (coverContainer) coverContainer.style.display = 'block';
                    }
                    resultsDiv.style.display = 'none';
                    input.value = '';
                    showNotification('"' + data.name + '" auto-filled!', 'success');
                });
            });
        }, 500);
    });
    
    document.addEventListener('click', function(e) {
        if (!input.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });
}

// ============================================
// 11. PULL TO REFRESH
// ============================================

function setupPullToRefresh() {
    var container = document.getElementById('mainContent');
    var indicator = document.getElementById('pullToRefresh');
    if (!container || !indicator) return;
    
    var startY = 0;
    
    container.addEventListener('touchstart', function(e) {
        startY = e.touches[0].clientY;
    });
    
    container.addEventListener('touchmove', function(e) {
        if (container.scrollTop === 0 && e.touches[0].clientY > startY + 30) {
            indicator.style.opacity = '1';
            var icon = indicator.querySelector('i');
            if (icon) icon.style.transform = 'rotate(180deg)';
        }
    });
    
    container.addEventListener('touchend', async function(e) {
        if (container.scrollTop === 0 && e.changedTouches[0].clientY > startY + 50) {
            indicator.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Refreshing...';
            await fetchGames();
            indicator.innerHTML = '<i class="fas fa-check"></i> Updated!';
            setTimeout(function() {
                indicator.innerHTML = '<i class="fas fa-arrow-down"></i> Pull down to refresh';
                indicator.style.opacity = '0.5';
            }, 1500);
        }
    });
}

// ============================================
// 12. MODAL FUNCTIONS
// ============================================

function openEditModal(id) {
    var game = null;
    for (var i = 0; i < gamesData.length; i++) {
        if (gamesData[i].id == id) {
            game = gamesData[i];
            break;
        }
    }
    
    if (game) {
        var modalTitle = document.getElementById('modalTitle');
        var gameIdInput = document.getElementById('gameId');
        var titleInput = document.getElementById('title');
        var platformInput = document.getElementById('platform');
        var genreInput = document.getElementById('genre');
        var tagsInput = document.getElementById('tags');
        var progressInput = document.getElementById('progress');
        var ratingInput = document.getElementById('rating');
        var hoursInput = document.getElementById('hours_played');
        var statusSelect = document.getElementById('status');
        var coverContainer = document.getElementById('coverPreviewContainer');
        var coverPreview = document.getElementById('coverPreview');
        
        if (modalTitle) modalTitle.innerText = 'Edit Game';
        if (gameIdInput) gameIdInput.value = game.id;
        if (titleInput) titleInput.value = game.title;
        if (platformInput) platformInput.value = game.platform || '';
        if (genreInput) genreInput.value = game.genre || '';
        if (tagsInput) tagsInput.value = game.tags || '';
        if (progressInput) progressInput.value = game.progress;
        if (ratingInput) ratingInput.value = game.rating;
        if (hoursInput) hoursInput.value = game.hours_played || 0;
        if (statusSelect) statusSelect.value = game.status;
        
        currentCoverUrl = game.cover_url;
        if (currentCoverUrl && coverPreview && coverContainer) {
            coverPreview.src = currentCoverUrl;
            coverContainer.style.display = 'block';
        } else if (coverContainer) {
            coverContainer.style.display = 'none';
        }
        
        var modal = document.getElementById('gameModal');
        if (modal) modal.style.display = 'flex';
    }
}

function closeModal() {
    var modal = document.getElementById('gameModal');
    var form = document.getElementById('gameForm');
    var gameId = document.getElementById('gameId');
    var coverContainer = document.getElementById('coverPreviewContainer');
    var searchResults = document.getElementById('searchResults');
    var searchInput = document.getElementById('gameSearchInput');
    
    if (modal) modal.style.display = 'none';
    if (form) form.reset();
    if (gameId) gameId.value = '';
    if (coverContainer) coverContainer.style.display = 'none';
    if (searchResults) searchResults.style.display = 'none';
    if (searchInput) searchInput.value = '';
    currentCoverUrl = null;
}

function closeDeleteModal() {
    var modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'none';
    deleteId = null;
}

function switchTab(tab) {
    var navLinks = document.querySelectorAll('.nav-link, .nav-item');
    for (var i = 0; i < navLinks.length; i++) {
        navLinks[i].classList.remove('active');
    }
    
    var activeEls = document.querySelectorAll('[data-tab="' + tab + '"]');
    for (var j = 0; j < activeEls.length; j++) {
        activeEls[j].classList.add('active');
    }
    
    var dashboardSection = document.getElementById('dashboardSection');
    var librarySection = document.getElementById('librarySection');
    var pageTitle = document.getElementById('pageTitle');
    
    if (dashboardSection) dashboardSection.classList.toggle('active', tab === 'dashboard');
    if (librarySection) librarySection.classList.toggle('active', tab === 'library');
    if (pageTitle) pageTitle.innerText = tab === 'dashboard' ? 'Dashboard' : 'Game Library';
    
    if (tab === 'library') renderLibrary();
}

// ============================================
// 13. INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Game Tracker Premium Starting...');
    
    // Initialize Supabase AFTER DOM is ready
    var SUPABASE_URL = window.SUPABASE_URL;
    var SUPABASE_KEY = window.SUPABASE_KEY;
    
    if (SUPABASE_URL && SUPABASE_KEY) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase initialized');
    } else {
        console.error('❌ Supabase credentials missing!');
        showNotification('Database configuration error', 'error');
    }
    
    // Setup features
    setupGameSearch();
    setupPullToRefresh();
    
    // Tab switching
    var navItems = document.querySelectorAll('.nav-link, .nav-item');
    for (var i = 0; i < navItems.length; i++) {
        navItems[i].addEventListener('click', function(e) {
            e.preventDefault();
            var tab = this.dataset.tab;
            if (tab) {
                switchTab(tab);
                vibrate();
            }
        });
    }
    
    // Dark mode with chart sync
    var darkToggle = document.getElementById('darkModeToggle');
    if (darkToggle) {
        var saved = localStorage.getItem('darkMode') === 'true';
        darkToggle.checked = saved;
        if (saved) document.body.classList.add('dark-mode');
        darkToggle.addEventListener('change', function() {
            document.body.classList.toggle('dark-mode', darkToggle.checked);
            localStorage.setItem('darkMode', darkToggle.checked);
            updateCharts();
        });
    }
    
    // Add game buttons
    var addBtn = document.getElementById('addGameBtn');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            var modalTitle = document.getElementById('modalTitle');
            var form = document.getElementById('gameForm');
            var gameId = document.getElementById('gameId');
            var progressInput = document.getElementById('progress');
            var ratingInput = document.getElementById('rating');
            var hoursInput = document.getElementById('hours_played');
            var statusSelect = document.getElementById('status');
            var coverContainer = document.getElementById('coverPreviewContainer');
            
            if (modalTitle) modalTitle.innerText = 'Add New Game';
            if (form) form.reset();
            if (gameId) gameId.value = '';
            if (progressInput) progressInput.value = 0;
            if (ratingInput) ratingInput.value = 3;
            if (hoursInput) hoursInput.value = 0;
            if (statusSelect) statusSelect.value = 'backlog';
            if (coverContainer) coverContainer.style.display = 'none';
            currentCoverUrl = null;
            
            var modal = document.getElementById('gameModal');
            if (modal) modal.style.display = 'flex';
        });
    }
    
    var mobileAddBtn = document.getElementById('mobileAddBtn');
    if (mobileAddBtn) {
        mobileAddBtn.addEventListener('click', function() {
            if (addBtn) addBtn.click();
        });
    }
    
    // Close modals
    var closeModalSpans = document.querySelectorAll('.close-modal, .modal');
    for (var j = 0; j < closeModalSpans.length; j++) {
        closeModalSpans[j].addEventListener('click', function(e) {
            if (e.target === this || e.target.classList.contains('close-modal')) {
                closeModal();
                closeDeleteModal();
                var detailModal = document.getElementById('detailModal');
                if (detailModal) detailModal.style.display = 'none';
            }
        });
    }
    
    // Delete buttons
    var confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) confirmBtn.addEventListener('click', deleteGame);
    
    var cancelBtn = document.getElementById('cancelDeleteBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeDeleteModal);
    
    // Save form
    var gameForm = document.getElementById('gameForm');
    if (gameForm) gameForm.addEventListener('submit', saveGame);
    
    // Filters
    var searchInput = document.getElementById('searchInput');
    var filterGenre = document.getElementById('filterGenre');
    var filterPlatform = document.getElementById('filterPlatform');
    var filterRating = document.getElementById('filterRating');
    var filterStatus = document.getElementById('filterStatus');
    
    if (searchInput) searchInput.addEventListener('input', function() { renderLibrary(); });
    if (filterGenre) filterGenre.addEventListener('change', function() { renderLibrary(); });
    if (filterPlatform) filterPlatform.addEventListener('change', function() { renderLibrary(); });
    if (filterRating) filterRating.addEventListener('change', function() { renderLibrary(); });
    if (filterStatus) filterStatus.addEventListener('change', function() { renderLibrary(); });
    
    // Initial load
    if (supabaseClient) {
        fetchGames();
        
        // Realtime subscription
        supabaseClient.channel('games-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, function() {
                fetchGames();
            })
            .subscribe();
    }
    
    // Handle resize for charts
    window.addEventListener('resize', function() {
        updateCharts();
    });
    
    console.log('✅ App Ready!');
});