/**
 * KUKI GYMRATS - コーチ・トレーナー用 PCダッシュボード ロジック
 */

let currentStaff = null;
let allUsers = [];
let allPlayers = [];
let allConditions = [];
let allPainRecords = [];
let allMenus = [];
let allWorkouts = [];
let allOptins = [];
let allOneRm = [];
let allReflections = [];
let allComments = [];

async function init() {
  currentStaff = Session.getUser();
  if (!currentStaff || (currentStaff.role !== 'coach' && currentStaff.role !== 'trainer')) {
    location.href = 'index.html';
    return;
  }
  document.getElementById('user-avatar').textContent = currentStaff.name.charAt(0);
  document.getElementById('user-name').textContent = currentStaff.name;
  document.getElementById('user-role').textContent = currentStaff.role === 'coach' ? 'コーチ' : 'トレーナー';

  setupNav();
  await loadAllData();

  // ローディング非表示
  const loader = document.getElementById('dashboard-loading');
  if (loader) loader.classList.add('hidden');

  renderOverview();
  renderPainView();
  renderMenuView();
  renderOptinView();
  renderRehabView();
  renderReflectView();
  renderPlayersView();
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view-content').forEach(v => v.classList.add('hidden'));
      document.getElementById(`view-${btn.dataset.view}`).classList.remove('hidden');
    });
  });
}

function logout() {
  Session.clear();
  location.href = 'index.html';
}

async function loadAllData() {
  const [users, conditions, pains, menus, workouts, optins, oneRm, reflections, comments] = await Promise.all([
    Api.listAll('users'),
    Api.listAll('daily_conditions'),
    Api.listAll('pain_records'),
    Api.listAll('menus'),
    Api.listAll('workout_sets'),
    Api.listAll('optin_requests'),
    Api.listAll('one_rm_records'),
    Api.listAll('workout_reflections'),
    Api.listAll('reflection_comments'),
  ]);
  allUsers = users;
  // active フィールドが未設定(undefined)の既存データは「在籍中」として扱う
  allPlayers = users.filter(u => u.role === 'player' && u.active !== false)
    .sort((a,b) => (a.jersey_number||0) - (b.jersey_number||0));
  allConditions = conditions;
  allPainRecords = pains;
  allMenus = menus;
  allWorkouts = workouts;
  allOptins = optins;
  allOneRm = oneRm;
  allReflections = reflections;
  allComments = comments;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function userName(id) {
  const u = allUsers.find(x => x.id === id);
  return u ? u.name : id;
}

function userRoleLabel(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return '';
  if (u.role === 'coach') return 'コーチ';
  if (u.role === 'trainer') return 'トレーナー';
  return '';
}

/* ================== 概要サマリー ================== */

function renderOverview() {
  const today = Api.todayStr();
  const todayConditions = allConditions.filter(c => c.date === today);
  const nutritionDoneCount = todayConditions.filter(c => c.nutrition_done && allPlayers.some(p => p.id === c.user_id)).length;
  const painCount = todayConditions.filter(c => c.has_pain && allPlayers.some(p => p.id === c.user_id)).length;
  const totalPlayers = allPlayers.length;
  const pendingOptin = allOptins.filter(o => o.status === 'pending').length;
  const todayWorkouts = allWorkouts.filter(w => w.date === today && allPlayers.some(p => p.id === w.user_id));
  const completedWorkouts = todayWorkouts.filter(w => w.completed).length;

  const el = document.getElementById('view-overview');
  el.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="font-display text-2xl font-bold mb-0.5">概要サマリー</h1>
        <p class="text-gray-400 text-sm">${today} の全体状況</p>
      </div>
      <button onclick="reloadAll()" class="flex items-center gap-2 text-gray-400 hover:text-white text-sm border border-gray-700 rounded-lg px-3 py-1.5 hover:border-gray-500 transition-colors">
        <i class="fa-solid fa-arrows-rotate"></i>更新
      </button>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${statCard('fa-users', totalPlayers, '登録選手数', 'text-blue-400')}
      ${statCard('fa-drumstick-bite', `${nutritionDoneCount}/${totalPlayers}`, '本日の補食実施', nutritionDoneCount === totalPlayers ? 'text-green-400' : 'text-amber-400')}
      ${statCard('fa-triangle-exclamation', painCount, '本日の痛み報告', painCount > 0 ? 'text-red-400' : 'text-gray-400')}
      ${statCard('fa-star', pendingOptin, 'オプトイン承認待ち', pendingOptin > 0 ? 'text-amber-400' : 'text-gray-400')}
    </div>

    <div class="grid grid-cols-2 gap-6">
      <div class="bg-[#1f2229] rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-gray-300 mb-4"><i class="fa-solid fa-bell mr-1 text-[var(--kuki-red)]"></i>要注意アラート</h2>
        ${renderAlertList()}
      </div>
      <div class="bg-[#1f2229] rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-gray-300 mb-2"><i class="fa-solid fa-chart-simple mr-1 text-[var(--kuki-red)]"></i>本日のトレーニング進捗</h2>
        <div class="text-xs text-gray-500 mb-2 text-center">${completedWorkouts} / ${todayWorkouts.length} セット完了</div>
        <div style="height: 200px;"><canvas id="progress-canvas"></canvas></div>
      </div>
    </div>
  `;

  drawProgressChart(completedWorkouts, todayWorkouts.length - completedWorkouts);
}

function statCard(icon, value, label, colorCls) {
  return `
    <div class="bg-[#1f2229] rounded-2xl p-5">
      <i class="fa-solid ${icon} text-2xl ${colorCls} mb-3 block"></i>
      <div class="text-2xl font-bold">${value}</div>
      <div class="text-xs text-gray-400 mt-1">${label}</div>
    </div>
  `;
}

function renderAlertList() {
  const today = Api.todayStr();
  const alerts = [];

  allPlayers.forEach(p => {
    const painDates = allConditions.filter(c => c.user_id === p.id && c.has_pain).map(c => c.date);
    if (painDates.length >= 2) {
      alerts.push({ type: '痛み継続', name: p.name, detail: `${painDates.length}日分の痛み報告あり`, level: 'high' });
    } else if (painDates.includes(today)) {
      alerts.push({ type: '本日痛み報告', name: p.name, detail: '本日痛みを報告', level: 'mid' });
    }
  });

  if (alerts.length === 0) {
    return '<p class="text-gray-500 text-sm"><i class="fa-solid fa-circle-check text-green-400 mr-1"></i>現在、特に注意すべきアラートはありません</p>';
  }

  const levelStyle = {
    high: 'border-red-500 bg-red-500/10 text-red-300',
    mid:  'border-amber-500 bg-amber-500/10 text-amber-300',
    low:  'border-gray-600 bg-gray-600/10 text-gray-400'
  };

  return `<div class="flex flex-col gap-2 max-h-72 overflow-y-auto no-scrollbar">
    ${alerts.slice(0, 15).map(a => `
      <div class="border-l-4 ${levelStyle[a.level]} rounded-r-lg px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-white truncate">${a.name}</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${levelStyle[a.level]}">${a.type}</span>
        </div>
        <div class="text-xs text-gray-400">${a.detail}</div>
      </div>
    `).join('')}
  </div>`;
}

let progressChart = null;
function drawProgressChart(done, remaining) {
  const ctx = document.getElementById('progress-canvas');
  if (!ctx) return;
  if (progressChart) progressChart.destroy();
  progressChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['完了', '未完了'],
      datasets: [{ data: [done, remaining || 0], backgroundColor: ['#16a34a', '#374151'], borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e5e7eb', padding: 12, font: { size: 11 } } },
        tooltip: { backgroundColor: '#1f2229', titleColor: '#fff', bodyColor: '#9ca3af' }
      }
    }
  });
}

async function reloadAll() {
  await loadAllData();
  renderOverview();
  renderPainView();
  renderMenuView();
  renderOptinView();
  renderRehabView();
  renderReflectView();
  renderPlayersView();
  showToast('データを更新しました', 'success');
}

/* ================== 痛み・コンディション監視 ================== */

function renderPainView() {
  const today = Api.todayStr();
  const el = document.getElementById('view-pain');

  const painRecordsToday = allPainRecords.filter(p => p.date === today);

  el.innerHTML = `
    <h1 class="font-display text-2xl font-bold mb-1">痛み・コンディション監視ボード</h1>
    <p class="text-gray-400 text-sm mb-6">選手の痛み・違和感をリアルタイムに把握します</p>

    <h2 class="text-sm font-semibold text-gray-300 mb-3"><i class="fa-solid fa-circle-exclamation mr-1 text-[var(--kuki-red)]"></i>本日の痛み報告（${today}）</h2>
    <div class="bg-[#1f2229] rounded-2xl overflow-hidden mb-8">
      <table class="w-full text-sm">
        <thead class="bg-[#16181d] text-gray-400 text-xs">
          <tr>
            <th class="text-left px-4 py-3">選手</th>
            <th class="text-left px-4 py-3">部位</th>
            <th class="text-left px-4 py-3">レベル</th>
            <th class="text-left px-4 py-3">メモ</th>
            <th class="text-left px-4 py-3">日付</th>
          </tr>
        </thead>
        <tbody>
          ${painRecordsToday.length === 0
            ? '<tr><td colspan="5" class="text-center text-gray-500 py-6"><i class="fa-solid fa-circle-check text-green-400 mr-2"></i>本日、痛みの報告はありません</td></tr>'
            : painRecordsToday.map(p => painRow(p, true)).join('')
          }
        </tbody>
      </table>
    </div>

    <h2 class="text-sm font-semibold text-gray-300 mb-3"><i class="fa-solid fa-clock-rotate-left mr-1 text-[var(--kuki-red)]"></i>痛み報告の履歴（全期間）</h2>
    <div class="bg-[#1f2229] rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-[#16181d] text-gray-400 text-xs">
          <tr>
            <th class="text-left px-4 py-3">選手</th>
            <th class="text-left px-4 py-3">部位</th>
            <th class="text-left px-4 py-3">レベル</th>
            <th class="text-left px-4 py-3">メモ</th>
            <th class="text-left px-4 py-3">日付</th>
          </tr>
        </thead>
        <tbody>
          ${(() => {
            const sorted = [...allPainRecords].sort((a,b) => new Date(b.date) - new Date(a.date));
            if (sorted.length === 0) return '<tr><td colspan="5" class="text-center text-gray-500 py-6">記録がありません</td></tr>';
            return sorted.slice(0, 50).map(p => painRow(p, false)).join('');
          })()}
        </tbody>
      </table>
    </div>
  `;
}

function painRow(p, isAlert) {
  return `
    <tr class="border-t border-gray-800 ${isAlert ? 'alert-card' : ''}">
      <td class="px-4 py-2.5 font-medium">${userName(p.user_id)}</td>
      <td class="px-4 py-2.5">${p.body_part || '-'}</td>
      <td class="px-4 py-2.5">${painLevelBadge(p.pain_level)}</td>
      <td class="px-4 py-2.5 text-gray-400 text-xs">${escapeHtml(p.note || '-')}</td>
      <td class="px-4 py-2.5 text-gray-400">${p.date}</td>
    </tr>
  `;
}

function painLevelBadge(level) {
  const colors = {
    1: 'bg-yellow-500/20 text-yellow-300',
    2: 'bg-amber-500/20 text-amber-300',
    3: 'bg-orange-500/20 text-orange-300',
    4: 'bg-red-500/20 text-red-300',
    5: 'bg-red-700/40 text-red-400 font-bold'
  };
  return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${colors[level] || 'bg-gray-500/20 text-gray-300'}">Lv.${level}</span>`;
}

/* ================== メニュー配信 ================== */

function renderMenuView() {
  const el = document.getElementById('view-menu');
  el.innerHTML = `
    <h1 class="font-display text-2xl font-bold mb-1">メニュー配信</h1>
    <p class="text-gray-400 text-sm mb-6">種目・セット数・強度（1RMの%）を設定し、グループへ一括配信します</p>

    <div class="grid grid-cols-3 gap-6">
      <div class="col-span-1 bg-[#1f2229] rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-gray-300 mb-4"><i class="fa-solid fa-plus-circle mr-1 text-[var(--kuki-red)]"></i>新規メニュー配信</h2>
        <div class="flex flex-col gap-3">
          <div>
            <label class="text-xs text-gray-400 block mb-1">種目名<span class="text-red-400 ml-1">*</span></label>
            <input id="menu-exercise" type="text" placeholder="例：バックスクワット" class="w-full bg-[#16181d] border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--kuki-red)]">
          </div>
          <div>
            <label class="text-xs text-gray-400 block mb-1">セット数</label>
            <input id="menu-sets" type="number" value="3" min="1" max="10" onchange="renderSetInputRows()" class="w-full bg-[#16181d] border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--kuki-red)]">
          </div>
          <div>
            <label class="text-xs text-gray-400 block mb-1">セットごとの強度（%1RM）・回数</label>
            <p class="text-[11px] text-gray-500 mb-2">各セットで個別に設定できます（ピラミッド式など）</p>
            <div id="menu-set-rows" class="flex flex-col gap-2"></div>
          </div>
          <div>
            <label class="text-xs text-gray-400 block mb-1">配信対象</label>
            <select id="menu-target" class="w-full bg-[#16181d] border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--kuki-red)]">
              <option value="all">全選手（通常メニュー）</option>
              <option value="rehab">個別選手（リハビリ）</option>
            </select>
          </div>
          <div id="menu-rehab-target-wrap" class="hidden">
            <label class="text-xs text-gray-400 block mb-1">対象選手</label>
            <select id="menu-rehab-target" class="w-full bg-[#16181d] border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--kuki-red)]">
              ${allPlayers.map(p => `<option value="${p.id}">${escapeHtml(p.name)}${p.rehab_phase_id ? '（リハビリ中）' : ''}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-400 block mb-1">メモ</label>
            <textarea id="menu-note" rows="2" class="w-full bg-[#16181d] border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--kuki-red)] resize-none" placeholder="補足事項"></textarea>
          </div>
          <button onclick="distributeMenu()" class="w-full bg-[var(--kuki-red)] rounded-lg py-2.5 font-semibold text-sm mt-2 hover:opacity-90"><i class="fa-solid fa-paper-plane mr-1"></i>配信する</button>
        </div>
      </div>

      <div class="col-span-2 bg-[#1f2229] rounded-2xl p-5">
        <h2 class="text-sm font-semibold text-gray-300 mb-4"><i class="fa-solid fa-list-check mr-1 text-[var(--kuki-red)]"></i>配信済みメニュー一覧</h2>
        <div class="overflow-auto rounded-xl border border-gray-800" style="max-height: 70vh;">
          <table class="w-full text-sm">
            <thead class="bg-[#16181d] text-gray-400 text-xs sticky top-0">
              <tr>
                <th class="text-left px-4 py-3">種目</th>
                <th class="text-left px-4 py-3">セット</th>
                <th class="text-left px-4 py-3">強度</th>
                <th class="text-left px-4 py-3">対象</th>
                <th class="text-left px-4 py-3">配信日</th>
              </tr>
            </thead>
            <tbody id="menu-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('menu-target').addEventListener('change', (e) => {
    document.getElementById('menu-rehab-target-wrap').classList.toggle('hidden', e.target.value !== 'rehab');
  });

  renderSetInputRows();
  renderMenuTable();
}

function renderSetInputRows(prevIntensities, prevReps) {
  const setsInput = document.getElementById('menu-sets');
  if (!setsInput) return;
  const setCount = Math.max(1, Math.min(10, parseInt(setsInput.value) || 1));
  const wrap = document.getElementById('menu-set-rows');
  if (!wrap) return;
  const defaultIntensity = [50, 60, 70, 75, 80, 82, 85, 87, 90, 92];
  const defaultReps = [8, 6, 5, 5, 3, 3, 3, 2, 2, 1];
  let rows = '';
  for (let i = 0; i < setCount; i++) {
    const intensityVal = (prevIntensities && prevIntensities[i] !== undefined) ? prevIntensities[i] : (defaultIntensity[i] ?? 70);
    const repsVal = (prevReps && prevReps[i] !== undefined) ? prevReps[i] : (defaultReps[i] ?? 5);
    rows += `
      <div class="flex items-center gap-1.5">
        <span class="text-[11px] text-gray-400 w-10 flex-shrink-0">SET${i + 1}</span>
        <input type="number" class="menu-set-intensity flex-1 min-w-0 bg-[#16181d] border border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[var(--kuki-red)]" value="${intensityVal}" placeholder="強度%">
        <span class="text-[11px] text-gray-500 flex-shrink-0">%</span>
        <input type="number" class="menu-set-reps flex-1 min-w-0 bg-[#16181d] border border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[var(--kuki-red)]" value="${repsVal}" placeholder="回数">
        <span class="text-[11px] text-gray-500 flex-shrink-0">回</span>
      </div>
    `;
  }
  wrap.innerHTML = rows;
}

function renderMenuTable() {
  const body = document.getElementById('menu-table-body');
  if (!body) return;
  const sorted = [...allMenus].sort((a,b) => new Date(b.date) - new Date(a.date));
  const categoryLabel = { normal: '全選手', rehab: 'リハビリ個別', optin: 'オプトイン' };
  if (sorted.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-6">配信済みメニューはありません</td></tr>';
    return;
  }
  body.innerHTML = sorted.map(m => {
    const intensityDisplay = (m.intensity_per_set && m.intensity_per_set.length)
      ? m.intensity_per_set.map(v => v + '%').join(' / ')
      : (m.intensity_percent ? m.intensity_percent + '%' : '-');
    const repsDisplay = (m.reps_per_set && m.reps_per_set.length)
      ? m.reps_per_set.join(' / ')
      : (m.reps || '-');
    const catCls = m.category === 'rehab' ? 'bg-amber-500/20 text-amber-300' : m.category === 'optin' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300';
    const targetLabel = m.category === 'rehab' ? `${categoryLabel[m.category]}（${userName(m.target_group)}）` : categoryLabel[m.category] || m.target_group;
    return `
      <tr class="border-t border-gray-800 hover:bg-[#16181d]/50">
        <td class="px-4 py-3 font-medium">${escapeHtml(m.exercise_name)}</td>
        <td class="px-4 py-3 text-xs text-gray-300">${m.sets}セット（${repsDisplay} 回）</td>
        <td class="px-4 py-3 text-xs text-gray-300">${intensityDisplay}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded-full text-xs ${catCls}">${targetLabel}</span>
        </td>
        <td class="px-4 py-3 text-gray-400">${m.date}</td>
      </tr>
    `;
  }).join('');
}

async function distributeMenu() {
  const exercise = document.getElementById('menu-exercise').value.trim();
  const sets = parseInt(document.getElementById('menu-sets').value) || 3;
  const target = document.getElementById('menu-target').value;
  const note = document.getElementById('menu-note').value;

  if (!exercise) {
    alert('種目名を入力してください');
    return;
  }

  const intensityInputs = document.querySelectorAll('.menu-set-intensity');
  const repsInputs = document.querySelectorAll('.menu-set-reps');
  const intensityPerSet = Array.from(intensityInputs).map(i => parseInt(i.value) || 0);
  const repsPerSet = Array.from(repsInputs).map(i => parseInt(i.value) || 0);

  const targetGroup = target === 'rehab' ? document.getElementById('menu-rehab-target').value : 'all';
  const category = target === 'rehab' ? 'rehab' : 'normal';

  try {
    const created = await Api.create('menus', {
      exercise_name: exercise,
      sets,
      reps: repsPerSet[0] || 5,
      intensity_percent: intensityPerSet[0] || 0,
      intensity_per_set: intensityPerSet,
      reps_per_set: repsPerSet,
      target_group: targetGroup,
      category,
      note,
      created_by: currentStaff.id,
      date: Api.todayStr()
    });
    allMenus.push(created);
    renderMenuTable();
    document.getElementById('menu-exercise').value = '';
    document.getElementById('menu-note').value = '';
    showToast('メニューを配信しました', 'success');
  } catch (e) {
    console.error(e);
    alert('配信に失敗しました');
  }
}

/* ================== オプトイン承認 ================== */

function renderOptinView() {
  const el = document.getElementById('view-optin');
  const pendingCount = allOptins.filter(o => o.status === 'pending').length;
  el.innerHTML = `
    <h1 class="font-display text-2xl font-bold mb-1">オプトイン承認</h1>
    <p class="text-gray-400 text-sm mb-6">選手からの希望メニューリクエストを承認・却下します${pendingCount > 0 ? `（<span class="text-amber-400 font-semibold">${pendingCount}件 承認待ち</span>）` : ''}</p>
    <div id="optin-cards" class="grid grid-cols-3 gap-4"></div>
  `;
  renderOptinCards();
}

function renderOptinCards() {
  const el = document.getElementById('optin-cards');
  const sorted = [...allOptins].sort((a,b) => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    return (order[a.status] - order[b.status]) || (new Date(b.date) - new Date(a.date));
  });
  if (sorted.length === 0) {
    el.innerHTML = '<p class="text-gray-500 text-sm col-span-3 py-4 text-center">リクエストはありません</p>';
    return;
  }
  const statusMap = {
    pending:  { label: '承認待ち', cls: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/40', icon: 'fa-hourglass-half' },
    approved: { label: '承認済み', cls: 'bg-green-600/20 text-green-400 border-green-600/40', icon: 'fa-check-circle' },
    rejected: { label: '却下',     cls: 'bg-red-600/20 text-red-400 border-red-600/40',        icon: 'fa-times-circle' },
  };
  el.innerHTML = sorted.map(o => `
    <div class="bg-[#1f2229] border ${statusMap[o.status]?.cls || 'border-gray-700'} rounded-2xl p-4">
      <div class="flex items-center justify-between mb-2">
        <span class="font-semibold">${escapeHtml(userName(o.user_id))}</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full ${statusMap[o.status]?.cls}"><i class="fa-solid ${statusMap[o.status]?.icon} mr-1"></i>${statusMap[o.status]?.label}</span>
      </div>
      <div class="text-sm text-gray-200 mb-1">${o.menu_type === 'その他' ? ('その他：' + escapeHtml(o.custom_menu_type || '')) : escapeHtml(o.menu_type)}</div>
      ${o.note ? `<div class="text-xs text-gray-400 mb-2">${escapeHtml(o.note)}</div>` : ''}
      <div class="text-[10px] text-gray-500 mb-3">申請日: ${o.date}</div>
      ${o.status === 'pending' ? `
        <div class="flex gap-2">
          <button onclick="updateOptinStatus('${o.id}', 'approved')" class="flex-1 bg-green-700 hover:bg-green-600 rounded-lg py-1.5 text-xs font-semibold transition-colors"><i class="fa-solid fa-check mr-1"></i>承認</button>
          <button onclick="updateOptinStatus('${o.id}', 'rejected')" class="flex-1 bg-gray-700 hover:bg-gray-600 rounded-lg py-1.5 text-xs font-semibold transition-colors"><i class="fa-solid fa-xmark mr-1"></i>却下</button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

async function updateOptinStatus(id, status) {
  try {
    await Api.update('optin_requests', id, { status });
    const o = allOptins.find(x => x.id === id);
    if (o) o.status = status;
    renderOptinView();
    renderOverview();
    showToast(status === 'approved' ? '承認しました' : '却下しました', 'success');
  } catch (e) {
    console.error(e);
    alert('更新に失敗しました');
  }
}

/* ================== リハビリ管理 ================== */

function renderRehabView() {
  const el = document.getElementById('view-rehab');
  const rehabPlayers = allPlayers.filter(p => p.rehab_phase_id);
  const phaseLabel = {
    phase_1: 'フェーズ1（急性期）',
    phase_2: 'フェーズ2（可動域改善）',
    phase_3: 'フェーズ3（筋力強化）',
    phase_4: 'フェーズ4（競技復帰）'
  };

  el.innerHTML = `
    <h1 class="font-display text-2xl font-bold mb-1">リハビリ管理</h1>
    <p class="text-gray-400 text-sm mb-6">リハビリ中の選手のフェーズ・痛み報告状況を確認します（${rehabPlayers.length}名）</p>
    <div class="grid grid-cols-2 gap-5" id="rehab-cards"></div>
  `;

  const cardsEl = document.getElementById('rehab-cards');
  if (rehabPlayers.length === 0) {
    cardsEl.innerHTML = '<div class="col-span-2 text-center py-8"><i class="fa-solid fa-circle-check text-green-400 text-3xl mb-3 block"></i><p class="text-gray-500 text-sm">現在、リハビリ中の選手はいません</p></div>';
    return;
  }

  cardsEl.innerHTML = rehabPlayers.map(p => {
    const painHistory = allPainRecords.filter(pr => pr.user_id === p.id).sort((a,b) => new Date(b.date) - new Date(a.date));
    const menu = allMenus.find(m => m.category === 'rehab' && m.target_group === p.id);
    return `
      <div class="bg-[#1f2229] rounded-2xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-full bg-amber-500/80 flex items-center justify-center font-bold text-lg">${p.name.charAt(0)}</div>
            <div>
              <div class="font-semibold">${escapeHtml(p.name)}</div>
              <div class="text-xs text-amber-400">${phaseLabel[p.rehab_phase_id] || p.rehab_phase_id}</div>
            </div>
          </div>
          <select onchange="updateRehabPhase('${p.id}', this.value)" class="bg-[#16181d] border border-gray-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-400">
            ${['phase_1','phase_2','phase_3','phase_4'].map(ph => `
              <option value="${ph}" ${p.rehab_phase_id === ph ? 'selected' : ''}>${phaseLabel[ph]}</option>
            `).join('')}
          </select>
        </div>
        <div class="text-xs text-gray-400 mb-3 bg-[#16181d] rounded-lg px-3 py-2">
          <span class="font-semibold text-gray-300">専用メニュー: </span>
          ${menu ? `${escapeHtml(menu.exercise_name)}（${menu.sets}セット / ${escapeHtml(menu.note || 'メモなし')}）` : '<span class="text-gray-600">未設定</span>'}
        </div>
        <div class="text-xs font-semibold text-gray-300 mb-2">直近の痛み報告</div>
        <div class="flex flex-col gap-1 max-h-36 overflow-y-auto no-scrollbar">
          ${painHistory.length ? painHistory.slice(0,5).map(pr => `
            <div class="flex items-center justify-between text-xs bg-[#16181d] rounded-lg px-3 py-1.5">
              <span class="text-gray-300">${pr.body_part || '-'}</span>
              ${painLevelBadge(pr.pain_level)}
              <span class="text-gray-500">${pr.date}</span>
            </div>
          `).join('') : '<p class="text-gray-600 text-xs text-center py-2">報告なし</p>'}
        </div>
      </div>
    `;
  }).join('');
}

async function updateRehabPhase(userId, phase) {
  try {
    await Api.update('users', userId, { rehab_phase_id: phase });
    const p = allUsers.find(u => u.id === userId);
    if (p) p.rehab_phase_id = phase;
    renderRehabView();
    showToast('リハビリフェーズを更新しました', 'success');
  } catch (e) {
    console.error(e);
    alert('更新に失敗しました');
  }
}

/* ================== 振り返り一覧 ================== */

function renderReflectView() {
  const el = document.getElementById('view-reflect');
  el.innerHTML = `
    <h1 class="font-display text-2xl font-bold mb-1">振り返り一覧</h1>
    <p class="text-gray-400 text-sm mb-6">選手の振り返り投稿を確認し、コメントでフィードバックできます</p>
    <div id="reflect-list" class="grid grid-cols-2 gap-5"></div>
  `;
  renderReflectList();
}

function renderReflectList() {
  const el = document.getElementById('reflect-list');
  const sorted = [...allReflections].sort((a, b) => {
    const dateDiff = new Date(b.date) - new Date(a.date);
    if (dateDiff !== 0) return dateDiff;
    return (b.updated_label || '').localeCompare(a.updated_label || '');
  });
  if (sorted.length === 0) {
    el.innerHTML = '<p class="text-gray-500 text-sm col-span-2 text-center py-8">まだ振り返りの投稿はありません</p>';
    return;
  }
  el.innerHTML = sorted.map(r => renderReflectCard(r)).join('');
}

function renderReflectCard(r) {
  const comments = allComments.filter(c => c.reflection_id === r.id);
  const role = userRoleLabel(r.user_id);
  const roleLabel = role ? `<span class="text-[9px] px-1.5 py-0.5 rounded-full ml-1 ${role === 'コーチ' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}">${role}</span>` : '';
  return `
    <div class="bg-[#1f2229] rounded-2xl p-4">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-9 h-9 rounded-full bg-[var(--kuki-red)] flex items-center justify-center font-bold text-sm flex-shrink-0">
          ${userName(r.user_id).charAt(0)}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium flex items-center flex-wrap">${escapeHtml(userName(r.user_id))}${roleLabel}</div>
          <div class="text-[10px] text-gray-500">${r.updated_label || r.date}</div>
        </div>
      </div>
      <p class="text-sm text-gray-200 whitespace-pre-wrap mb-3">${escapeHtml(r.content)}</p>

      <div class="flex flex-col gap-1.5 mb-2">
        ${comments.map(c => {
          const cRole = userRoleLabel(c.user_id);
          const cRoleLabel = cRole ? `<span class="text-[9px] px-1.5 py-0.5 rounded-full ml-1 ${cRole === 'コーチ' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'}">${cRole}</span>` : '';
          return `
            <div class="comment-bubble">
              <div class="flex items-center justify-between mb-0.5 flex-wrap gap-1">
                <span class="text-xs font-semibold text-gray-300 flex items-center">${escapeHtml(userName(c.user_id))}${cRoleLabel}</span>
                <span class="text-[10px] text-gray-500">${c.posted_label || ''}</span>
              </div>
              <div class="text-xs text-gray-300">${escapeHtml(c.content)}</div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="flex gap-2">
        <input type="text" id="dash-comment-input-${r.id}" placeholder="コメントを入力..." class="flex-1 bg-[#16181d] border border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--kuki-red)]">
        <button onclick="postDashComment('${r.id}')" class="bg-gray-700 hover:bg-[var(--kuki-red)] rounded-lg px-3 py-1.5 text-xs transition-colors"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    </div>
  `;
}

async function postDashComment(reflectionId) {
  const input = document.getElementById(`dash-comment-input-${reflectionId}`);
  const content = input.value.trim();
  if (!content) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const label = `${Api.todayStr()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  try {
    const created = await Api.create('reflection_comments', {
      reflection_id: reflectionId, user_id: currentStaff.id, content, posted_label: label
    });
    allComments.push(created);
    input.value = '';
    renderReflectList();
    showToast('コメントを送信しました', 'success');
  } catch (e) {
    console.error(e);
    alert('コメントの送信に失敗しました');
  }
}

/* ================== 選手管理・成長 ================== */
/* 選手の新規登録・編集・退部（削除）はコーチ・トレーナー（管理者）のみが操作できる本画面に限定している。
   ログイン選択画面(index.html)・選手用アプリ(player.js)には登録UIを一切設けていない。 */

let playerGrowthChart = null;
let editingPlayerId = null;

function renderPlayersView() {
  const el = document.getElementById('view-players');
  el.innerHTML = `
    <h1 class="font-display text-2xl font-bold mb-1">選手管理・成長確認</h1>
    <p class="text-gray-400 text-sm mb-6">選手の新規登録・編集・退部処理、1RM推移の確認ができます（管理者専用）</p>

    <div class="bg-[#1f2229] rounded-2xl p-5 mb-6">
      <h2 class="font-semibold text-sm mb-4" id="player-form-title"><i class="fa-solid fa-user-plus mr-1 text-[var(--kuki-red)]"></i>選手の新規登録</h2>
      <div class="grid grid-cols-4 gap-3 mb-3">
        <div>
          <label class="text-xs text-gray-400 block mb-1">氏名<span class="text-red-400 ml-1">*</span></label>
          <input id="pf-name" type="text" placeholder="山田 太郎" class="w-full bg-[#16181d] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--kuki-red)]">
        </div>
        <div>
          <label class="text-xs text-gray-400 block mb-1">背番号</label>
          <input id="pf-jersey" type="number" min="0" placeholder="10" class="w-full bg-[#16181d] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--kuki-red)]">
        </div>
        <div>
          <label class="text-xs text-gray-400 block mb-1">ポジション</label>
          <input id="pf-position" type="text" placeholder="FW / MF / DF / GK など" class="w-full bg-[#16181d] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--kuki-red)]">
        </div>
        <div>
          <label class="text-xs text-gray-400 block mb-1">リハビリフェーズ</label>
          <select id="pf-rehab" class="w-full bg-[#16181d] border border-[#2a2d36] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--kuki-red)]">
            <option value="">なし（通常メニュー）</option>
            <option value="phase_1">フェーズ1（急性期）</option>
            <option value="phase_2">フェーズ2（可動域改善）</option>
            <option value="phase_3">フェーズ3（筋力強化）</option>
            <option value="phase_4">フェーズ4（競技復帰）</option>
          </select>
        </div>
      </div>
      <div class="flex gap-2">
        <button onclick="submitPlayerForm()" id="pf-submit-btn" class="px-4 py-2 rounded-lg bg-[var(--kuki-red)] text-white text-sm font-semibold hover:opacity-90"><i class="fa-solid fa-user-plus mr-1"></i>選手を登録</button>
        <button onclick="resetPlayerForm()" id="pf-cancel-btn" class="px-4 py-2 rounded-lg bg-[#2a2d36] text-gray-300 text-sm hidden hover:bg-gray-600">キャンセル</button>
      </div>
    </div>

    <div class="bg-[#1f2229] rounded-2xl p-5 mb-6">
      <h2 class="font-semibold text-sm mb-4"><i class="fa-solid fa-users mr-1 text-[var(--kuki-red)]"></i>登録選手一覧（在籍中 ${allPlayers.length}名）</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-gray-400 text-xs border-b border-[#2a2d36]">
              <th class="py-2 pr-3">背番号</th>
              <th class="py-2 pr-3">氏名</th>
              <th class="py-2 pr-3">ポジション</th>
              <th class="py-2 pr-3">状態</th>
              <th class="py-2 pr-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody id="player-manage-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-6">
      <div class="col-span-1 bg-[#1f2229] rounded-2xl p-4 max-h-[65vh] overflow-y-auto no-scrollbar">
        <h3 class="text-xs text-gray-500 mb-3 font-semibold">成長グラフ確認（選手選択）</h3>
        <div id="player-select-list" class="flex flex-col gap-1"></div>
      </div>
      <div class="col-span-2">
        <div class="bg-[#1f2229] rounded-2xl p-5 mb-5" id="player-detail-header">
          <p class="text-gray-500 text-sm text-center py-4"><i class="fa-solid fa-arrow-left mr-1"></i>左のリストから選手を選択してください</p>
        </div>
        <div class="bg-[#1f2229] rounded-2xl p-5 hidden" id="player-detail-graph-wrap">
          <div class="flex gap-2 mb-4 flex-wrap" id="player-ex-tabs"></div>
          <div style="height: 260px;"><canvas id="player-growth-canvas"></canvas></div>
        </div>
      </div>
    </div>
  `;

  const listEl = document.getElementById('player-select-list');
  listEl.innerHTML = allPlayers.map(p => `
    <button onclick="selectPlayerDetail('${p.id}', this)" class="player-select-btn flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-[#2a2d36] text-sm ${p.rehab_phase_id ? 'text-amber-300' : 'text-gray-200'}">
      <span class="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">${p.jersey_number ?? '-'}</span>
      <span class="truncate">${escapeHtml(p.name)}</span>
      ${p.rehab_phase_id ? '<i class="fa-solid fa-heart-pulse text-amber-400 text-[10px] ml-auto"></i>' : ''}
    </button>
  `).join('');

  renderPlayerManageTable();
}

function renderPlayerManageTable() {
  const tbody = document.getElementById('player-manage-tbody');
  if (!tbody) return;
  if (allPlayers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-gray-500 text-xs">登録済みの選手がいません</td></tr>`;
    return;
  }
  tbody.innerHTML = allPlayers.map(p => `
    <tr class="border-b border-[#2a2d36]/60 hover:bg-[#16181d]/40">
      <td class="py-2 pr-3 text-gray-300">${p.jersey_number ?? '-'}</td>
      <td class="py-2 pr-3 font-medium">${escapeHtml(p.name)}</td>
      <td class="py-2 pr-3 text-gray-400">${escapeHtml(p.position || '-')}</td>
      <td class="py-2 pr-3">
        ${p.rehab_phase_id
          ? '<span class="text-amber-400 text-xs"><i class="fa-solid fa-heart-pulse mr-1"></i>リハビリ中</span>'
          : '<span class="text-green-400 text-xs"><i class="fa-solid fa-circle-check mr-1"></i>在籍中</span>'
        }
      </td>
      <td class="py-2 pr-3 text-right whitespace-nowrap">
        <button onclick="startEditPlayer('${p.id}')" class="px-2 py-1 rounded-md bg-[#2a2d36] hover:bg-gray-600 text-gray-200 text-xs mr-1 transition-colors"><i class="fa-solid fa-pen mr-1"></i>編集</button>
        <button onclick="deletePlayer('${p.id}')" class="px-2 py-1 rounded-md bg-red-900/40 hover:bg-red-800/60 text-red-300 text-xs transition-colors"><i class="fa-solid fa-user-minus mr-1"></i>退部</button>
      </td>
    </tr>
  `).join('');
}

function resetPlayerForm() {
  editingPlayerId = null;
  document.getElementById('player-form-title').innerHTML = '<i class="fa-solid fa-user-plus mr-1 text-[var(--kuki-red)]"></i>選手の新規登録';
  document.getElementById('pf-name').value = '';
  document.getElementById('pf-jersey').value = '';
  document.getElementById('pf-position').value = '';
  document.getElementById('pf-rehab').value = '';
  document.getElementById('pf-submit-btn').innerHTML = '<i class="fa-solid fa-user-plus mr-1"></i>選手を登録';
  document.getElementById('pf-cancel-btn').classList.add('hidden');
}

function startEditPlayer(userId) {
  const p = allPlayers.find(x => x.id === userId);
  if (!p) return;
  editingPlayerId = userId;
  document.getElementById('player-form-title').innerHTML = `<i class="fa-solid fa-pen mr-1 text-amber-400"></i>選手情報の編集：${escapeHtml(p.name)}`;
  document.getElementById('pf-name').value = p.name || '';
  document.getElementById('pf-jersey').value = p.jersey_number ?? '';
  document.getElementById('pf-position').value = p.position || '';
  document.getElementById('pf-rehab').value = p.rehab_phase_id || '';
  document.getElementById('pf-submit-btn').innerHTML = '<i class="fa-solid fa-check mr-1"></i>更新を保存';
  document.getElementById('pf-cancel-btn').classList.remove('hidden');
  document.getElementById('player-form-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function submitPlayerForm() {
  const name = document.getElementById('pf-name').value.trim();
  const jerseyRaw = document.getElementById('pf-jersey').value;
  const position = document.getElementById('pf-position').value.trim();
  const rehab = document.getElementById('pf-rehab').value;

  if (!name) {
    alert('氏名を入力してください');
    return;
  }
  const jersey = jerseyRaw === '' ? null : Number(jerseyRaw);
  if (jersey !== null) {
    const duplicated = allPlayers.some(p => p.jersey_number === jersey && p.id !== editingPlayerId);
    if (duplicated) {
      alert(`背番号 ${jersey} は既に他の選手が使用しています。別の番号を入力してください。`);
      return;
    }
  }

  const payload = {
    name,
    jersey_number: jersey,
    position: position || null,
    rehab_phase_id: rehab || null
  };

  try {
    if (editingPlayerId) {
      const updated = await Api.update('users', editingPlayerId, payload);
      const idx = allUsers.findIndex(u => u.id === editingPlayerId);
      if (idx !== -1) allUsers[idx] = { ...allUsers[idx], ...payload, ...(updated || {}) };
    } else {
      const created = await Api.create('users', { ...payload, role: 'player', active: true });
      allUsers.push(created);
    }
    allPlayers = allUsers.filter(u => u.role === 'player' && u.active !== false)
      .sort((a,b) => (a.jersey_number||0) - (b.jersey_number||0));
    resetPlayerForm();
    renderPlayersView();
    renderOverview();
    showToast(editingPlayerId ? '選手情報を更新しました' : '選手を登録しました', 'success');
  } catch (e) {
    console.error(e);
    alert('選手情報の保存に失敗しました');
  }
}

async function deletePlayer(userId) {
  const p = allPlayers.find(x => x.id === userId);
  if (!p) return;
  const ok = confirm(`「${p.name}」選手を退部（登録解除）扱いにしますか？\n\n過去のトレーニング記録・1RMデータは保持されます。`);
  if (!ok) return;
  try {
    await Api.update('users', userId, { active: false });
    const idx = allUsers.findIndex(u => u.id === userId);
    if (idx !== -1) allUsers[idx].active = false;
    allPlayers = allUsers.filter(u => u.role === 'player' && u.active !== false)
      .sort((a,b) => (a.jersey_number||0) - (b.jersey_number||0));
    if (editingPlayerId === userId) resetPlayerForm();
    renderPlayersView();
    renderOverview();
    showToast(`${p.name} 選手を退部処理しました`, 'success');
  } catch (e) {
    console.error(e);
    alert('退部処理に失敗しました');
  }
}

function selectPlayerDetail(userId, btn) {
  document.querySelectorAll('.player-select-btn').forEach(b => {
    b.classList.remove('bg-[var(--kuki-red)]', 'text-white');
  });
  btn.classList.add('bg-[var(--kuki-red)]', 'text-white');

  const p = allUsers.find(u => u.id === userId);
  if (!p) return;
  const header = document.getElementById('player-detail-header');
  const today = Api.todayStr();
  const cond = allConditions.find(c => c.user_id === userId && c.date === today);
  const phaseLabel = { phase_1: 'フェーズ1', phase_2: 'フェーズ2', phase_3: 'フェーズ3', phase_4: 'フェーズ4' };

  header.innerHTML = `
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-[var(--kuki-red)] flex items-center justify-center font-bold text-lg">${p.name.charAt(0)}</div>
        <div>
          <div class="font-semibold text-lg">${escapeHtml(p.name)}</div>
          <div class="text-xs text-gray-400">
            ${escapeHtml(p.position || '')}${p.position ? ' ・ ' : ''}背番号 <b>${p.jersey_number ?? '-'}</b>
            ${p.rehab_phase_id ? ` ・ <span class="text-amber-400">${phaseLabel[p.rehab_phase_id] || p.rehab_phase_id}（リハビリ中）</span>` : ''}
          </div>
        </div>
      </div>
      <div class="text-right text-xs space-y-1">
        <div>補食: ${cond?.nutrition_done ? '<span class="text-green-400"><i class="fa-solid fa-check mr-1"></i>実施済</span>' : '<span class="text-gray-500">未実施</span>'}</div>
        <div>痛み: ${cond?.has_pain ? '<span class="text-red-400"><i class="fa-solid fa-triangle-exclamation mr-1"></i>あり</span>' : '<span class="text-gray-500">なし</span>'}</div>
        <div class="text-gray-600">${today}</div>
      </div>
    </div>
  `;

  const exercises = [...new Set(allOneRm.filter(r => r.user_id === userId).map(r => r.exercise_name))];
  const graphWrap = document.getElementById('player-detail-graph-wrap');
  if (exercises.length === 0) {
    graphWrap.classList.add('hidden');
    return;
  }
  graphWrap.classList.remove('hidden');
  const tabsEl = document.getElementById('player-ex-tabs');
  tabsEl.innerHTML = exercises.map((ex, i) => `
    <button class="player-ex-tab-btn px-3 py-1.5 rounded-full text-xs ${i === 0 ? 'bg-[var(--kuki-red)] text-white' : 'bg-[#16181d] text-gray-300'}" onclick="drawPlayerGrowth('${userId}', '${ex}', this)">${ex}</button>
  `).join('');
  drawPlayerGrowth(userId, exercises[0]);
}

function drawPlayerGrowth(userId, exercise, btn) {
  if (btn) {
    document.querySelectorAll('.player-ex-tab-btn').forEach(b => {
      b.classList.remove('bg-[var(--kuki-red)]', 'text-white');
      b.classList.add('bg-[#16181d]', 'text-gray-300');
    });
    btn.classList.add('bg-[var(--kuki-red)]', 'text-white');
    btn.classList.remove('bg-[#16181d]', 'text-gray-300');
  }
  const records = allOneRm.filter(r => r.user_id === userId && r.exercise_name === exercise)
    .sort((a,b) => new Date(a.date) - new Date(b.date));
  const ctx = document.getElementById('player-growth-canvas');
  if (!ctx) return;
  if (playerGrowthChart) playerGrowthChart.destroy();
  playerGrowthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: records.map(r => r.date.slice(5)),
      datasets: [{
        label: `${exercise} 1RM (kg)`,
        data: records.map(r => r.one_rm),
        borderColor: '#d61f2c',
        backgroundColor: 'rgba(214,31,44,0.12)',
        fill: true, tension: 0.3,
        pointRadius: 5, pointBackgroundColor: '#d61f2c',
        pointBorderColor: '#fff', pointBorderWidth: 1.5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#e5e7eb', font: { size: 11 } } },
        tooltip: { backgroundColor: '#1f2229', titleColor: '#fff', bodyColor: '#9ca3af' }
      },
      scales: {
        x: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: '#2a2d36' } },
        y: { ticks: { color: '#9ca3af', font: { size: 10 } }, grid: { color: '#2a2d36' } }
      }
    }
  });
}

/* ================== ユーティリティ ================== */

function showToast(message, type = 'success') {
  const existing = document.getElementById('kuki-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'kuki-toast';
  toast.className = `fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl ${type === 'success' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-times-circle'} mr-2"></i>${message}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.5s'; setTimeout(() => toast.remove(), 500); }, 2500);
}

/* ================== 初期化 ================== */
init();
