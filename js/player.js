/**
 * KUKI GYMRATS - 選手用アプリ ロジック
 */

let currentUser = null;
let todayCondition = null; // 本日のDailyConditionsレコード
let bodyParts = []; // 選択中の痛み部位 [{part, level}]
let allMenus = [];
let allUsers = [];
let myWorkouts = []; // 本日のWorkoutSets（セット単位）
let myOneRm = []; // OneRmRecords
let myOptinRequests = [];
let myReflections = []; // 自分の振り返り
let teamReflections = []; // チーム全員の振り返り（直近）
let allComments = [];

const BODY_PART_POINTS = [
  { key: '頭部', cx: 100, cy: 30 },
  { key: '右肩', cx: 72, cy: 68 },
  { key: '左肩', cx: 128, cy: 68 },
  { key: '胸', cx: 100, cy: 90 },
  { key: '右肘', cx: 58, cy: 120 },
  { key: '左肘', cx: 142, cy: 120 },
  { key: '腰', cx: 100, cy: 150 },
  { key: '右手首', cx: 48, cy: 165 },
  { key: '左手首', cx: 152, cy: 165 },
  { key: '右膝', cx: 85, cy: 230 },
  { key: '左膝', cx: 115, cy: 230 },
  { key: '右足首', cx: 85, cy: 290 },
  { key: '左足首', cx: 115, cy: 290 },
];

async function init() {
  currentUser = Session.getUser();
  if (!currentUser || currentUser.role !== 'player') {
    location.href = 'index.html';
    return;
  }
  document.getElementById('header-user-name').textContent =
    `${currentUser.name}（背番号${currentUser.jersey_number ?? '-'}）`;

  if (currentUser.rehab_phase_id) {
    const banner = document.getElementById('rehab-banner');
    banner.classList.remove('hidden');
    document.getElementById('rehab-banner-text').innerHTML =
      `あなたはリハビリ中です（<b>${currentUser.rehab_phase_id}</b>）。専用メニューが自動で割り当てられています。痛みが強い場合は無理をせず記録してください。`;
  }

  setupTabs();
  await loadAllData();
  renderHome();
  renderGraphTab();
  renderReflectTab();
  renderOptinTab();
}

function setupTabs() {
  document.querySelectorAll('.tabbar-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabbar-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    });
  });
}

function logout() {
  Session.clear();
  location.href = 'index.html';
}

function userName(id) {
  const u = allUsers.find(x => x.id === id);
  return u ? u.name : id;
}

async function loadAllData() {
  const today = Api.todayStr();
  const [users, conditions, menus, workouts, oneRm, optins, reflections, comments] = await Promise.all([
    Api.listAll('users'),
    Api.listAll('daily_conditions'),
    Api.listAll('menus'),
    Api.listAll('workout_sets'),
    Api.listAll('one_rm_records'),
    Api.listAll('optin_requests'),
    Api.listAll('workout_reflections'),
    Api.listAll('reflection_comments'),
  ]);
  allUsers = users;

  todayCondition = conditions.find(c => c.user_id === currentUser.id && c.date === today) || null;
  if (!todayCondition) {
    todayCondition = await Api.create('daily_conditions', {
      user_id: currentUser.id, date: today, nutrition_done: false, has_pain: false
    });
  }

  const painAll = await Api.listAll('pain_records');
  bodyParts = painAll.filter(p => p.condition_id === todayCondition.id).map(p => ({
    id: p.id, part: p.body_part, level: p.pain_level, note: p.note || ''
  }));

  allMenus = menus;
  myOneRm = oneRm.filter(r => r.user_id === currentUser.id);

  // 本日の割り当てメニューに対応するWorkoutSets（セット単位）が無ければ生成
  const todaysMenus = getMyMenusForToday();
  myWorkouts = workouts.filter(w => w.user_id === currentUser.id && w.date === today);

  for (const m of todaysMenus) {
    const existingForMenu = myWorkouts.filter(w => w.menu_id === m.id);
    if (existingForMenu.length > 0) continue; // 既に生成済み

    const oneRmVal = getLatestOneRm(m.exercise_name);
    const setCount = m.sets || 1;
    const intensities = (m.intensity_per_set && m.intensity_per_set.length === setCount)
      ? m.intensity_per_set
      : Array.from({ length: setCount }, () => m.intensity_percent || 0);
    const repsArr = (m.reps_per_set && m.reps_per_set.length === setCount)
      ? m.reps_per_set
      : Array.from({ length: setCount }, () => m.reps || 5);

    for (let i = 0; i < setCount; i++) {
      const pct = intensities[i] || 0;
      const targetWeight = oneRmVal && pct ? Math.round(oneRmVal * (pct / 100) * 2) / 2 : 0;
      const created = await Api.create('workout_sets', {
        user_id: currentUser.id,
        menu_id: m.id,
        exercise_name: m.exercise_name,
        set_number: i + 1,
        target_weight: targetWeight,
        target_reps: repsArr[i],
        actual_weight: targetWeight,
        actual_reps: repsArr[i],
        date: today,
        completed: false
      });
      myWorkouts.push(created);
    }
  }

  myOptinRequests = optins.filter(o => o.user_id === currentUser.id);
  myReflections = reflections.filter(r => r.user_id === currentUser.id);
  // チーム全体の振り返り（直近30件、日付降順）
  teamReflections = reflections.sort((a, b) => new Date(b.date) - new Date(a.date) || (b.updated_label || '').localeCompare(a.updated_label || '')).slice(0, 30);
  allComments = comments;
}

function getLatestOneRm(exerciseName) {
  const records = myOneRm.filter(r => r.exercise_name === exerciseName)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return records.length ? records[0].one_rm : null;
}

function getMyMenusForToday() {
  return allMenus.filter(m => {
    if (m.category === 'normal') return true;
    if (m.category === 'rehab') return m.target_group === currentUser.id;
    if (m.category === 'optin') {
      return myOptinRequests.some(o => o.status === 'approved' && menuMatchesOptin(m, o));
    }
    return false;
  });
}

function menuMatchesOptin(menu, optin) {
  return menu.target_group === 'optin_jump' && optin.menu_type.includes('ジャンプ');
}

/* ================== ホームタブ ================== */

function renderHome() {
  const el = document.getElementById('tab-home');
  el.innerHTML = `
    <section class="mb-5">
      <h2 class="text-sm font-semibold text-gray-300 mb-2"><i class="fa-solid fa-clipboard-check mr-1 text-[var(--kuki-red)]"></i>本日のコンディション</h2>
      <div class="bg-[#1f2229] rounded-2xl p-4 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">補食 実施チェック</div>
            <div class="text-xs text-gray-400">今日の補食を摂りましたか？</div>
          </div>
          <div id="nutrition-toggle" class="toggle-switch ${todayCondition.nutrition_done ? 'on' : ''}" onclick="toggleNutrition()">
            <div class="knob"></div>
          </div>
        </div>
        <hr class="border-gray-700">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">痛み・違和感</div>
            <div class="text-xs text-gray-400">体に痛みや違和感はありますか？</div>
          </div>
          <div id="pain-toggle" class="toggle-switch ${bodyParts.length > 0 ? 'on' : ''}" onclick="togglePainSection()">
            <div class="knob"></div>
          </div>
        </div>
        <div id="pain-section" class="${bodyParts.length > 0 ? '' : 'hidden'}">
          ${renderBodyMapSection()}
        </div>
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold text-gray-300 mb-2"><i class="fa-solid fa-dumbbell mr-1 text-[var(--kuki-red)]"></i>本日のトレーニングメニュー</h2>
      <p class="text-[11px] text-gray-500 mb-3">セットごとに重量・回数を調整できます。完了後もいつでも修正可能です。</p>
      <div id="workout-list" class="flex flex-col gap-4"></div>
    </section>
  `;
  renderWorkoutList();
}

function toggleNutrition() {
  todayCondition.nutrition_done = !todayCondition.nutrition_done;
  document.getElementById('nutrition-toggle').classList.toggle('on', todayCondition.nutrition_done);
  Api.update('daily_conditions', todayCondition.id, { nutrition_done: todayCondition.nutrition_done }).catch(console.error);
}

function togglePainSection() {
  const section = document.getElementById('pain-section');
  const nowHidden = section.classList.contains('hidden');
  if (nowHidden) {
    section.classList.remove('hidden');
    document.getElementById('pain-toggle').classList.add('on');
  } else {
    section.classList.add('hidden');
    document.getElementById('pain-toggle').classList.remove('on');
    clearAllPain();
  }
}

function renderBodyMapSection() {
  return `
    <div class="pt-2">
      <div class="flex gap-4">
        <svg viewBox="0 0 200 320" class="body-map-svg w-32 flex-shrink-0">
          <ellipse cx="100" cy="30" rx="16" ry="18" fill="#2a2d36" stroke="#4b5563"/>
          <rect x="75" y="50" width="50" height="80" rx="18" fill="#2a2d36" stroke="#4b5563"/>
          <rect x="50" y="55" width="22" height="70" rx="10" fill="#2a2d36" stroke="#4b5563"/>
          <rect x="128" y="55" width="22" height="70" rx="10" fill="#2a2d36" stroke="#4b5563"/>
          <rect x="78" y="128" width="44" height="60" rx="14" fill="#2a2d36" stroke="#4b5563"/>
          <rect x="80" y="185" width="18" height="100" rx="9" fill="#2a2d36" stroke="#4b5563"/>
          <rect x="102" y="185" width="18" height="100" rx="9" fill="#2a2d36" stroke="#4b5563"/>
          ${BODY_PART_POINTS.map(p => `
            <circle class="part ${getPartClass(p.key)}" data-part="${p.key}" cx="${p.cx}" cy="${p.cy}" r="10" onclick="selectBodyPart('${p.key}')"></circle>
          `).join('')}
        </svg>
        <div class="flex-1 flex flex-col gap-2">
          <p class="text-xs text-gray-400 mb-1">部位をタップして選択してください</p>
          <div id="selected-parts-list" class="flex flex-col gap-2">
            ${renderSelectedPartsList()}
          </div>
        </div>
      </div>
    </div>
  `;
}

function getPartClass(part) {
  const found = bodyParts.find(b => b.part === part);
  if (!found) return '';
  return `selected pain-level-${found.level}`;
}

function renderSelectedPartsList() {
  if (bodyParts.length === 0) {
    return '<p class="text-xs text-gray-500">まだ選択されていません</p>';
  }
  return bodyParts.map(b => `
    <div class="bg-[#16181d] rounded-lg px-3 py-2">
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm font-medium">${b.part}</span>
        <button onclick="removeBodyPart('${b.part}')" class="text-gray-500 hover:text-red-400 text-xs"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-gray-400 mr-1">レベル</span>
        ${[1,2,3,4,5].map(lv => `
          <button onclick="setPainLevel('${b.part}', ${lv})" class="w-6 h-6 rounded text-[10px] font-bold ${b.level === lv ? 'bg-[var(--kuki-red)] text-white' : 'bg-gray-700 text-gray-300'}">${lv}</button>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function selectBodyPart(part) {
  if (!bodyParts.find(b => b.part === part)) {
    bodyParts.push({ part, level: 2, note: '' });
    persistPainRecords();
  }
  refreshPainUI();
}

function removeBodyPart(part) {
  bodyParts = bodyParts.filter(b => b.part !== part);
  persistPainRecords();
  refreshPainUI();
  if (bodyParts.length === 0) {
    document.getElementById('pain-toggle').classList.remove('on');
  }
}

function setPainLevel(part, level) {
  const found = bodyParts.find(b => b.part === part);
  if (found) found.level = level;
  persistPainRecords();
  refreshPainUI();
}

function clearAllPain() {
  bodyParts = [];
  persistPainRecords();
}

function refreshPainUI() {
  document.getElementById('pain-section').innerHTML = renderBodyMapSection();
}

async function persistPainRecords() {
  const hasPain = bodyParts.length > 0;
  try {
    await Api.update('daily_conditions', todayCondition.id, { has_pain: hasPain });
    todayCondition.has_pain = hasPain;

    const painAll = await Api.listAll('pain_records');
    const existing = painAll.filter(p => p.condition_id === todayCondition.id);
    await Promise.all(existing.map(p => Api.remove('pain_records', p.id)));

    await Promise.all(bodyParts.map(b => Api.create('pain_records', {
      condition_id: todayCondition.id,
      user_id: currentUser.id,
      date: todayCondition.date,
      body_part: b.part,
      pain_level: b.level,
      note: b.note || ''
    })));
  } catch (e) {
    console.error('痛み記録の保存に失敗しました', e);
  }
}

/* ================== ワークアウトリスト（種目 > セット） ================== */

function renderWorkoutList() {
  const el = document.getElementById('workout-list');
  if (myWorkouts.length === 0) {
    el.innerHTML = '<p class="text-gray-500 text-sm text-center py-6 bg-[#1f2229] rounded-2xl">本日のメニューはまだ配信されていません</p>';
    return;
  }
  // menu_id ごとにグルーピングし、set_numberでソート
  const menuIds = [...new Set(myWorkouts.map(w => w.menu_id))];
  el.innerHTML = menuIds.map(menuId => renderExerciseCard(menuId)).join('');
}

function renderExerciseCard(menuId) {
  const sets = myWorkouts.filter(w => w.menu_id === menuId).sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
  if (sets.length === 0) return '';
  const exerciseName = sets[0].exercise_name;
  const doneCount = sets.filter(s => s.completed).length;
  const allDone = doneCount === sets.length;

  return `
    <div class="bg-[#1f2229] rounded-2xl p-4" id="exercise-${menuId}">
      <div class="flex items-center justify-between mb-3">
        <div class="font-semibold text-base">${exerciseName}</div>
        <span class="text-xs px-2 py-1 rounded-full ${allDone ? 'bg-green-600/20 text-green-400' : 'bg-gray-700/50 text-gray-300'}">
          ${doneCount}/${sets.length} セット完了
        </span>
      </div>
      <div class="flex flex-col gap-2">
        ${sets.map(w => renderSetRow(w)).join('')}
      </div>
    </div>
  `;
}

function renderSetRow(w) {
  return `
    <div class="set-row ${w.completed ? 'done' : ''} bg-[#16181d] rounded-xl p-3 flex items-center gap-2" id="set-${w.id}">
      <div class="w-9 text-center flex-shrink-0">
        <div class="text-[10px] text-gray-500">SET</div>
        <div class="text-sm font-bold">${w.set_number || 1}</div>
      </div>

      <div class="flex-1 grid grid-cols-2 gap-2">
        <div>
          <div class="text-[10px] text-gray-500 mb-0.5">重量(kg) <span class="text-gray-600">目標${w.target_weight || 0}</span></div>
          <div class="flex items-center gap-1">
            <button class="stepper-btn" style="width:32px;height:32px;font-size:16px;border-radius:8px;" onclick="adjustSet('${w.id}', 'weight', -2.5)">−</button>
            <div class="text-sm font-bold w-12 text-center" id="weight-${w.id}">${w.actual_weight}</div>
            <button class="stepper-btn" style="width:32px;height:32px;font-size:16px;border-radius:8px;" onclick="adjustSet('${w.id}', 'weight', 2.5)">＋</button>
          </div>
        </div>
        <div>
          <div class="text-[10px] text-gray-500 mb-0.5">回数 <span class="text-gray-600">目標${w.target_reps || 0}</span></div>
          <div class="flex items-center gap-1">
            <button class="stepper-btn" style="width:32px;height:32px;font-size:16px;border-radius:8px;" onclick="adjustSet('${w.id}', 'reps', -1)">−</button>
            <div class="text-sm font-bold w-12 text-center" id="reps-${w.id}">${w.actual_reps}</div>
            <button class="stepper-btn" style="width:32px;height:32px;font-size:16px;border-radius:8px;" onclick="adjustSet('${w.id}', 'reps', 1)">＋</button>
          </div>
        </div>
      </div>

      <div class="check-btn ${w.completed ? 'done' : ''}" id="check-${w.id}" onclick="toggleSetComplete('${w.id}')">
        <i class="fa-solid fa-check"></i>
      </div>
    </div>
  `;
}

function adjustSet(id, field, delta) {
  const w = myWorkouts.find(x => x.id === id);
  if (!w) return;
  // 完了後も修正可能（ロックしない）
  if (field === 'weight') {
    w.actual_weight = Math.max(0, Math.round((w.actual_weight + delta) * 10) / 10);
    document.getElementById(`weight-${id}`).textContent = w.actual_weight;
  } else {
    w.actual_reps = Math.max(0, w.actual_reps + delta);
    document.getElementById(`reps-${id}`).textContent = w.actual_reps;
  }
  Api.update('workout_sets', id, { actual_weight: w.actual_weight, actual_reps: w.actual_reps }).catch(console.error);
}

function toggleSetComplete(id) {
  const w = myWorkouts.find(x => x.id === id);
  if (!w) return;
  w.completed = !w.completed;
  const row = document.getElementById(`set-${id}`);
  const check = document.getElementById(`check-${id}`);
  if (row) row.classList.toggle('done', w.completed);
  if (check) check.classList.toggle('done', w.completed);

  // カードのバッジ更新
  const cardEl = document.getElementById(`exercise-${w.menu_id}`);
  if (cardEl) {
    const sets = myWorkouts.filter(x => x.menu_id === w.menu_id);
    const doneCount = sets.filter(s => s.completed).length;
    const badge = cardEl.querySelector('span');
    if (badge) {
      badge.textContent = `${doneCount}/${sets.length} セット完了`;
      badge.className = `text-xs px-2 py-1 rounded-full ${doneCount === sets.length ? 'bg-green-600/20 text-green-400' : 'bg-gray-700/50 text-gray-300'}`;
    }
  }

  Api.update('workout_sets', id, { completed: w.completed }).catch(console.error);
}

/* ================== 成長グラフタブ ================== */

let growthChart = null;

function renderGraphTab() {
  const el = document.getElementById('tab-graph');
  const exercises = [...new Set(myOneRm.map(r => r.exercise_name))];

  if (exercises.length === 0) {
    el.innerHTML = '<p class="text-gray-500 text-sm text-center py-10">1RMの記録がまだありません</p>';
    return;
  }

  el.innerHTML = `
    <h2 class="text-sm font-semibold text-gray-300 mb-3"><i class="fa-solid fa-chart-line mr-1 text-[var(--kuki-red)]"></i>1RM 推移グラフ</h2>
    <div class="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
      ${exercises.map((ex, i) => `
        <button class="ex-tab-btn px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${i === 0 ? 'bg-[var(--kuki-red)] text-white' : 'bg-[#1f2229] text-gray-300'}" data-ex="${ex}" onclick="switchExerciseGraph('${ex}', this)">${ex}</button>
      `).join('')}
    </div>
    <div class="bg-[#1f2229] rounded-2xl p-4" style="height: 320px;">
      <canvas id="growth-canvas"></canvas>
    </div>
    <div id="growth-summary" class="mt-4 grid grid-cols-2 gap-3"></div>
  `;

  drawGrowthChart(exercises[0]);
}

function switchExerciseGraph(ex, btn) {
  document.querySelectorAll('.ex-tab-btn').forEach(b => {
    b.classList.remove('bg-[var(--kuki-red)]', 'text-white');
    b.classList.add('bg-[#1f2229]', 'text-gray-300');
  });
  btn.classList.add('bg-[var(--kuki-red)]', 'text-white');
  btn.classList.remove('bg-[#1f2229]', 'text-gray-300');
  drawGrowthChart(ex);
}

function drawGrowthChart(exercise) {
  const records = myOneRm.filter(r => r.exercise_name === exercise).sort((a, b) => new Date(a.date) - new Date(b.date));
  const ctx = document.getElementById('growth-canvas');
  if (growthChart) growthChart.destroy();

  growthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: records.map(r => r.date.slice(5)),
      datasets: [{
        label: `${exercise} 1RM (kg)`,
        data: records.map(r => r.one_rm),
        borderColor: '#d61f2c',
        backgroundColor: 'rgba(214,31,44,0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#d61f2c',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#e5e7eb' } } },
      scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: '#2a2d36' } },
        y: { ticks: { color: '#9ca3af' }, grid: { color: '#2a2d36' } }
      }
    }
  });

  const first = records[0]?.one_rm || 0;
  const last = records[records.length - 1]?.one_rm || 0;
  const diff = Math.round((last - first) * 10) / 10;
  const summary = document.getElementById('growth-summary');
  summary.innerHTML = `
    <div class="bg-[#1f2229] rounded-xl p-3 text-center">
      <div class="text-[11px] text-gray-400">最新1RM</div>
      <div class="text-xl font-bold text-white">${last} kg</div>
    </div>
    <div class="bg-[#1f2229] rounded-xl p-3 text-center">
      <div class="text-[11px] text-gray-400">期間中の伸び</div>
      <div class="text-xl font-bold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}">${diff >= 0 ? '+' : ''}${diff} kg</div>
    </div>
  `;
}

/* ================== 振り返りタブ ================== */

function renderReflectTab() {
  const el = document.getElementById('tab-reflect');
  const today = Api.todayStr();
  const myTodayReflection = myReflections.find(r => r.date === today);

  el.innerHTML = `
    <h2 class="text-sm font-semibold text-gray-300 mb-3"><i class="fa-solid fa-comment-dots mr-1 text-[var(--kuki-red)]"></i>本日の振り返り</h2>
    <div class="bg-[#1f2229] rounded-2xl p-4 mb-6">
      <textarea id="reflect-input" rows="4" class="w-full bg-[#16181d] border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3" placeholder="今日のトレーニングの振り返りを書きましょう（できたこと・課題・体の状態など）">${myTodayReflection ? escapeHtml(myTodayReflection.content) : ''}</textarea>
      <div class="flex items-center justify-between">
        <span class="text-[11px] text-gray-500">${myTodayReflection ? '最終更新: ' + myTodayReflection.updated_label : '未投稿'}</span>
        <button onclick="saveReflection()" class="bg-[var(--kuki-red)] rounded-lg px-4 py-2 text-sm font-semibold"><i class="fa-solid fa-paper-plane mr-1"></i>${myTodayReflection ? '更新する' : '投稿する'}</button>
      </div>
    </div>

    <h2 class="text-sm font-semibold text-gray-300 mb-3"><i class="fa-solid fa-users mr-1 text-[var(--kuki-red)]"></i>チームの振り返り</h2>
    <div id="team-reflect-list" class="flex flex-col gap-3"></div>
  `;
  renderTeamReflectList();
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function saveReflection() {
  const content = document.getElementById('reflect-input').value.trim();
  if (!content) { alert('振り返りを入力してください'); return; }
  const today = Api.todayStr();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const label = `${today} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const existing = myReflections.find(r => r.date === today);
  try {
    if (existing) {
      await Api.update('workout_reflections', existing.id, { content, updated_label: label });
      existing.content = content;
      existing.updated_label = label;
    } else {
      const created = await Api.create('workout_reflections', {
        user_id: currentUser.id, date: today, content, updated_label: label
      });
      myReflections.push(created);
      teamReflections.unshift(created);
    }
    renderReflectTab();
    alert('振り返りを保存しました');
  } catch (e) {
    console.error(e);
    alert('保存に失敗しました');
  }
}

function renderTeamReflectList() {
  const el = document.getElementById('team-reflect-list');
  if (teamReflections.length === 0) {
    el.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">まだ振り返りの投稿はありません</p>';
    return;
  }
  el.innerHTML = teamReflections.map(r => renderReflectionCard(r)).join('');
}

function renderReflectionCard(r) {
  const comments = allComments.filter(c => c.reflection_id === r.id);
  const isMine = r.user_id === currentUser.id;
  return `
    <div class="bg-[#1f2229] rounded-2xl p-4">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-8 h-8 rounded-full ${isMine ? 'bg-[var(--kuki-red)]' : 'bg-gray-600'} flex items-center justify-center font-bold text-xs flex-shrink-0">${userName(r.user_id).charAt(0)}</div>
        <div>
          <div class="text-sm font-medium">${userName(r.user_id)}${isMine ? '（あなた）' : ''}</div>
          <div class="text-[10px] text-gray-500">${r.updated_label || r.date}</div>
        </div>
      </div>
      <p class="text-sm text-gray-200 whitespace-pre-wrap mb-3">${escapeHtml(r.content)}</p>

      <div class="flex flex-col gap-1.5 mb-2" id="comments-${r.id}">
        ${comments.map(c => `
          <div class="comment-bubble">
            <div class="flex items-center justify-between mb-0.5">
              <span class="text-xs font-semibold text-gray-300">${userName(c.user_id)}</span>
              <span class="text-[10px] text-gray-500">${c.posted_label || ''}</span>
            </div>
            <div class="text-xs text-gray-300">${escapeHtml(c.content)}</div>
          </div>
        `).join('')}
      </div>

      <div class="flex gap-2">
        <input type="text" id="comment-input-${r.id}" placeholder="コメントする..." class="flex-1 bg-[#16181d] border border-gray-700 rounded-lg px-3 py-1.5 text-xs">
        <button onclick="postComment('${r.id}')" class="bg-gray-700 hover:bg-[var(--kuki-red)] rounded-lg px-3 py-1.5 text-xs"><i class="fa-solid fa-paper-plane"></i></button>
      </div>
    </div>
  `;
}

async function postComment(reflectionId) {
  const input = document.getElementById(`comment-input-${reflectionId}`);
  const content = input.value.trim();
  if (!content) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const label = `${Api.todayStr()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  try {
    const created = await Api.create('reflection_comments', {
      reflection_id: reflectionId, user_id: currentUser.id, content, posted_label: label
    });
    allComments.push(created);
    input.value = '';
    renderTeamReflectList();
  } catch (e) {
    console.error(e);
    alert('コメントの送信に失敗しました');
  }
}

/* ================== オプトインタブ ================== */

function renderOptinTab() {
  const el = document.getElementById('tab-optin');
  el.innerHTML = `
    <h2 class="text-sm font-semibold text-gray-300 mb-3"><i class="fa-solid fa-star mr-1 text-[var(--kuki-red)]"></i>希望メニューのリクエスト</h2>
    <div class="bg-[#1f2229] rounded-2xl p-4 mb-5">
      <label class="text-xs text-gray-400 block mb-1">希望メニュー種別</label>
      <select id="optin-type" onchange="onOptinTypeChange()" class="w-full bg-[#16181d] border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm">
        <option>ジャンプ力向上プログラム</option>
        <option>スプリント強化メニュー</option>
        <option>可動域改善メニュー</option>
        <option>体幹強化メニュー</option>
        <option value="その他">その他（自由入力）</option>
      </select>
      <div id="optin-custom-wrap" class="hidden mb-3">
        <label class="text-xs text-gray-400 block mb-1">希望メニュー内容（自由入力）</label>
        <input id="optin-custom" type="text" class="w-full bg-[#16181d] border border-gray-700 rounded-lg px-3 py-2 text-sm" placeholder="例：肩甲骨の可動域を広げるメニュー">
      </div>
      <label class="text-xs text-gray-400 block mb-1">補足メモ（任意）</label>
      <textarea id="optin-note" rows="2" class="w-full bg-[#16181d] border border-gray-700 rounded-lg px-3 py-2 mb-3 text-sm" placeholder="希望理由など"></textarea>
      <button onclick="submitOptin()" class="w-full bg-[var(--kuki-red)] rounded-lg py-2.5 font-semibold text-sm">申請する</button>
    </div>

    <h3 class="text-xs font-semibold text-gray-400 mb-2">申請履歴</h3>
    <div id="optin-history" class="flex flex-col gap-2"></div>
  `;
  renderOptinHistory();
}

function onOptinTypeChange() {
  const val = document.getElementById('optin-type').value;
  document.getElementById('optin-custom-wrap').classList.toggle('hidden', val !== 'その他');
}

function renderOptinHistory() {
  const el = document.getElementById('optin-history');
  if (myOptinRequests.length === 0) {
    el.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">申請履歴はありません</p>';
    return;
  }
  const statusMap = {
    pending: { label: '承認待ち', cls: 'bg-yellow-600/20 text-yellow-400' },
    approved: { label: '承認済み', cls: 'bg-green-600/20 text-green-400' },
    rejected: { label: '却下', cls: 'bg-red-600/20 text-red-400' },
  };
  el.innerHTML = myOptinRequests.sort((a,b) => new Date(b.date) - new Date(a.date)).map(o => `
    <div class="bg-[#1f2229] rounded-xl p-3">
      <div class="flex items-center justify-between mb-1">
        <span class="font-medium text-sm">${o.menu_type === 'その他' ? (o.custom_menu_type || 'その他') : o.menu_type}</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full ${statusMap[o.status]?.cls}">${statusMap[o.status]?.label}</span>
      </div>
      <div class="text-xs text-gray-400">${o.note || ''}</div>
      <div class="text-[10px] text-gray-500 mt-1">${o.date}</div>
    </div>
  `).join('');
}

async function submitOptin() {
  const type = document.getElementById('optin-type').value;
  const customType = document.getElementById('optin-custom')?.value.trim() || '';
  const note = document.getElementById('optin-note').value;

  if (type === 'その他' && !customType) {
    alert('希望メニュー内容を入力してください');
    return;
  }

  try {
    const created = await Api.create('optin_requests', {
      user_id: currentUser.id,
      menu_type: type,
      custom_menu_type: type === 'その他' ? customType : '',
      note,
      status: 'pending',
      date: Api.todayStr()
    });
    myOptinRequests.push(created);
    renderOptinHistory();
    document.getElementById('optin-note').value = '';
    if (document.getElementById('optin-custom')) document.getElementById('optin-custom').value = '';
    alert('リクエストを送信しました。トレーナー・コーチの承認をお待ちください。');
  } catch (e) {
    console.error(e);
    alert('送信に失敗しました');
  }
}

/* ================== 初期化 ================== */
init();
