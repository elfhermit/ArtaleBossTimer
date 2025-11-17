// Storage wrappers: delegate to PerBossStorage (per-boss keys)
// Ensure PerBossStorage is available (docs/js/storage.js must be loaded before this script)
function addRecord(partial) {
    const { bossId } = partial;
    if (!bossId) throw new Error('validation: bossId required');
    return PerBossStorage.addRecordForBoss(bossId, partial);
}

function updateRecord(id, changes) {
    // changes must include bossId for per-boss update
    const bossId = changes && changes.bossId ? changes.bossId : null;
    if (!bossId) {
        // try to find bossId by scanning per-boss storages (fallback)
        // this is rare; prefer passing bossId in changes when calling update
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(PerBossStorage._internal.PERBOSS_PREFIX)) continue;
            const bid = key.slice(PerBossStorage._internal.PERBOSS_PREFIX.length);
            const rows = PerBossStorage.getRecordsForBoss({ bossId: bid });
            if (rows.find(r => r.id === id)) return PerBossStorage.updateRecordForBoss(bid, id, changes);
        }
        throw new Error('bossId required for update');
    }
    return PerBossStorage.updateRecordForBoss(bossId, id, changes);
}

function deleteRecord(id) {
    // find and delete across per-boss keys
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PerBossStorage._internal.PERBOSS_PREFIX)) continue;
        const bid = key.slice(PerBossStorage._internal.PERBOSS_PREFIX.length);
        const rows = PerBossStorage.getRecordsForBoss({ bossId: bid });
        if (rows.find(r => r.id === id)) return PerBossStorage.deleteRecordForBoss(bid, id);
    }
    return false;
}

function getRecords({ bossId, date } = {}) {
    if (bossId) return PerBossStorage.getRecordsForBoss({ bossId, date });
    // aggregate all per-boss records
    try {
        const allJson = PerBossStorage.exportAllPerBoss();
        const obj = JSON.parse(allJson);
        const aggregated = [];
        Object.keys(obj.recordsByBoss || {}).forEach(bid => {
            const val = obj.recordsByBoss[bid];
            if (val && Array.isArray(val.records)) aggregated.push(...val.records);
        });
        let rows = aggregated;
        if (date) {
            const d = new Date(date);
            if (!isNaN(d)) {
                const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0);
                const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999);
                rows = rows.filter(r => {
                    const t = new Date(r.timestamp);
                    return t >= start && t <= end;
                });
            }
        }
        rows.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        return rows;
    } catch (e) {
        console.error('getRecords aggregate failed', e);
        return [];
    }
}

function purgeOldRecordsIfNeeded(bossId) {
    return PerBossStorage.purgeOldRecordsIfNeeded(bossId);
}

function exportJSON() { return PerBossStorage.exportAllPerBoss(); }

function importJSON(json) { return PerBossStorage.importAllPerBoss(json); }

function calculateRespawnTimes(killISO, bossRule) {
	const kill = new Date(killISO);
	if (isNaN(kill)) return { type: 'invalid', times: [], humanReadable: '無效時間' };
	const type = bossRule.type || (bossRule.minMinutes != null && bossRule.maxMinutes != null ? 'rangeMinutes' : 'fixedMinutes');
	if (type === 'fixedMinutes') {
		const minutes = bossRule.minMinutes || 0;
		const t = new Date(kill.getTime() + minutes*60000);
		return { type, times: [t.toISOString()], humanReadable: `${t.toLocaleString()}` };
	}
	if (type === 'rangeMinutes') {
		const min = bossRule.minMinutes;
		const max = bossRule.maxMinutes;
		if (min == null || max == null) return { type: 'invalid', times: [], humanReadable: '缺少 min/max' };
		const tmin = new Date(kill.getTime() + min*60000);
		const tmax = new Date(kill.getTime() + max*60000);
		return { type, times: [tmin.toISOString(), tmax.toISOString()], humanReadable: `${tmin.toLocaleString()} ～ ${tmax.toLocaleString()}` };
	}
	if (type === 'hourlyOffset') {
		const offset = Number(bossRule.offsetMinute);
		if (isNaN(offset)) return { type: 'invalid', times: [], humanReadable: '缺少 offsetMinute' };
		const next = new Date(kill.getTime());
		next.setSeconds(0,0);
		if (next.getMinutes() >= offset) next.setHours(next.getHours()+1);
		next.setMinutes(offset);
		return { type, times: [next.toISOString()], humanReadable: `${next.toLocaleString()}` };
	}
	return { type: 'unknown', times: [], humanReadable: '' };
}


	// --- UI init and render helpers ---
	function init() {
		const container = document.getElementById('app');
		const searchInput = document.getElementById('search');
		const calculatorRoot = document.getElementById('calculator');
		const calcResult = document.getElementById('calc-result');
		const recordFormRoot = document.getElementById('record-form-root');
		const recordsRoot = document.getElementById('records-root');
		const monitorRoot = document.getElementById('monitor-root');
		let BOSSES = [];

		// ensure an aria-live region exists for screen-reader announcements
		try {
			if (!document.getElementById('abt-aria-live')) {
				const al = document.createElement('div');
				al.id = 'abt-aria-live';
				al.setAttribute('aria-live', 'polite');
				al.setAttribute('aria-atomic', 'true');
				al.style.position = 'absolute';
				al.style.left = '-9999px';
				document.body.appendChild(al);
			}
		} catch (e) {}

		// load saved sort state from localStorage if present (key: abt_records_sort)
		try {
			const raw = localStorage.getItem('abt_records_sort');
			if (raw) {
				const s = JSON.parse(raw);
				if (s && s.key) window.__abt_records_sort = s;
			}
		} catch (e) { /* ignore */ }

		// helper to show non-blocking notifications (uses Materialize M.toast when available)
		function showToast(msg, opts = {}) {
			try {
				if (window.M && typeof M.toast === 'function') {
					M.toast(Object.assign({ html: msg, displayLength: 4000 }, opts));
					return;
				}
			} catch (e) {
				// fallthrough to alert
			}
			// fallback
			alert(typeof msg === 'string' ? msg : String(msg));
		}

		// store recently deleted records for undo
		window.__abt_recentlyDeleted = window.__abt_recentlyDeleted || {};
		window.__abt_restoreDeleted = function(id) {
			try {
				const rec = window.__abt_recentlyDeleted && window.__abt_recentlyDeleted[id];
				if (!rec) return showToast('無可還原的紀錄');
				// restore by loading per-boss storage and reinserting the original record
				const st = PerBossStorage.loadBossStorage(rec.bossId);
				st.records = st.records || [];
				// avoid duplicate id: if exists, generate new id
				if (st.records.find(r => r.id === rec.id)) {
					rec.id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
				}
				st.records.push(rec);
				PerBossStorage.saveBossStorage(rec.bossId, st);
				delete window.__abt_recentlyDeleted[id];
				showToast('已還原紀錄', { classes: 'green darken-1' });
				// re-render
				renderRecords();
			} catch (e) { showToast('還原失敗：' + e.message, { classes: 'red darken-1 white-text' }); }
		};

		// small helper to create elements
		function el(tag, props = {}, ...children) {
			const e = document.createElement(tag);
			for (const k in props) {
				if (k === 'class') e.className = props[k];
				else if (k === 'html') e.innerHTML = props[k];
				else e.setAttribute(k, props[k]);
			}
			children.flat().forEach(c => { if (c == null) return; e.append(typeof c === 'string' ? document.createTextNode(c) : c); });
			return e;
		}

		// --- render helpers ---

		// --- Theme toggle helpers ---
		function applyTheme(theme) {
			try {
				if (!theme || theme === 'light') {
					document.body.classList.remove('theme-dark');
					localStorage.setItem('abt_theme', 'light');
					const btn = document.getElementById('theme-toggle'); if (btn) {
						btn.setAttribute('aria-pressed','false');
						btn.title = '目前主題：淺色 / 切換至深色';
						btn.innerHTML = '<strong style="font-size:1.0em">🌞</strong> / 🌙';
						btn.classList.remove('theme-active');
					}
				} else {
					document.body.classList.add('theme-dark');
					localStorage.setItem('abt_theme', 'dark');
					const btn = document.getElementById('theme-toggle'); if (btn) {
						btn.setAttribute('aria-pressed','true');
						btn.title = '目前主題：深色 / 切換至淺色';
						btn.innerHTML = '🌞 / <strong style="font-size:1.0em">🌙</strong>';
						btn.classList.add('theme-active');
					}
				}
			} catch (e) { /* ignore */ }
		}

		function initThemeToggle() {
			try {
				const stored = localStorage.getItem('abt_theme');
				if (stored === 'dark') applyTheme('dark'); else applyTheme('light');
				const btn = document.getElementById('theme-toggle');
				if (!btn) return;
				btn.addEventListener('click', () => {
					const cur = localStorage.getItem('abt_theme') === 'dark' ? 'dark' : 'light';
					applyTheme(cur === 'dark' ? 'light' : 'dark');
				});
				// allow keyboard toggle
				btn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); btn.click(); } });
			} catch (e) {}
		}

		function renderBosses(list) {
			// Populate compact dropdown and list (if present) instead of large grid
			const dropdown = document.getElementById('boss-dropdown');
			const compact = document.getElementById('boss-list-compact');
			if (dropdown) {
				dropdown.innerHTML = '';
				list.forEach(b => {
					dropdown.appendChild(el('option', {value: b.id}, b.name + (b.minMinutes != null ? ` (${b.minMinutes}~${b.maxMinutes}分)` : '')));
				});
			}
			// also update the record form boss select if present
			const recordBossSel = document.getElementById('record-boss');
			if (recordBossSel) {
				recordBossSel.innerHTML = '';
				list.forEach(b => recordBossSel.appendChild(el('option', {value: b.id}, b.name)));
			}
			if (compact) {
				compact.innerHTML = '';
				if (!list.length) {
					compact.appendChild(el('p', {}, '找不到符合條件的 Boss'));
					return;
				}
				list.forEach(b => {
					// use a button for better semantics and keyboard support
					const item = el('button', {type: 'button', 'class': 'compact-boss-item list-item', 'data-boss-id': b.id, 'aria-pressed': 'false', style: 'padding:6px;border-bottom:1px solid #eee;cursor:pointer;width:100%;text-align:left;'}, `${b.name} ${b.minMinutes!=null ? '('+b.minMinutes+'~'+b.maxMinutes+'分)':''}`);
					item.addEventListener('click', () => {
						// remove active state from others
						compact.querySelectorAll('.compact-boss-item').forEach(it => {
							it.classList.remove('active');
							it.removeAttribute('aria-current');
							it.setAttribute('aria-pressed', 'false');
						});
						// mark this one active
						item.classList.add('active');
						item.setAttribute('aria-current', 'true');
						item.setAttribute('aria-pressed', 'true');
						const sel = document.getElementById('boss-dropdown');
						if (sel) sel.value = b.id;
						prefillCalculator(b);
						// announce to screen readers
						try { document.getElementById('abt-aria-live').textContent = `已選 ${b.name}`; } catch (e) {}
					});
					compact.appendChild(item);
				});
			}
			// hide legacy boss-grid if present
			const grid = document.getElementById('boss-grid');
			if (grid) grid.style.display = 'none';

			// also update monitor panel if present
			try {
				if (typeof renderMonitorPanel === 'function') {
					// prepare sorted list for monitor: priority -> nextRespawn -> name
					const stats = {};
					list.forEach(boss => {
						try {
							const rows = PerBossStorage.getRecordsForBoss({ bossId: boss.id }) || [];
							const latest = rows.slice().sort((a,c)=> new Date(c.timestamp)-new Date(a.timestamp))[0];
							if (!latest) {
								stats[boss.id] = { priority: 3, nextTime: Infinity, label: '未紀錄' };
								return;
							}
							const resp = calculateRespawnTimes(latest.timestamp, boss);
							const now = Date.now();
							const t0 = resp.times && resp.times[0] ? Date.parse(resp.times[0]) : NaN;
							const t1 = resp.times && resp.times[1] ? Date.parse(resp.times[1]) : t0;
							let priority = 3; let label = '';
							if (!isNaN(t0) && !isNaN(t1)) {
								if (now > t1) { priority = 0; label = '已復活'; }
								else if (now >= t0 && now <= t1) { priority = 1; label = '復活中'; }
								else { priority = 2; label = '冷卻中'; }
							} else {
								priority = 3; label = '未知';
							}
							stats[boss.id] = { priority, nextTime: isNaN(t0) ? Infinity : t0, label };
						} catch (e) { stats[boss.id] = { priority: 3, nextTime: Infinity, label: '錯誤' }; }
					});
					const sorted = list.slice().sort((a,bossB) => {
						const sa = stats[a.id] || { priority: 3, nextTime: Infinity };
						const sb = stats[bossB.id] || { priority: 3, nextTime: Infinity };
						if (sa.priority !== sb.priority) return sa.priority - sb.priority;
						if (sa.nextTime !== sb.nextTime) return sa.nextTime - sb.nextTime;
						return (a.name || '').localeCompare(bossB.name || '');
					});
					renderMonitorPanel(sorted);
				}
			} catch (e) { /* ignore */ }
			// ensure auto-refresh is started
			try { if (typeof startMonitorAutoRefresh === 'function') startMonitorAutoRefresh(); } catch (e) { /* ignore */ }
	}

		// render the left monitor panel showing boss cards with status/progress
		function renderMonitorPanel(bosses) {
			if (!monitorRoot) return;
			monitorRoot.innerHTML = '';
			if (!Array.isArray(bosses) || !bosses.length) { monitorRoot.appendChild(el('p', {}, '無可顯示的 Boss')); return; }
			bosses.forEach(b => {
					const thumb = el('img', {class: 'monitor-thumb', src: `bosses/${b.image || 'placeholder.svg'}`, alt: b.name, 'data-tip': (b.respawn || ''), 'aria-label': b.name});
					const wrap = el('div', {class: 'monitor-card', tabindex: '0', role: 'button', 'data-boss-id': b.id},
						thumb,
						el('div', {class: 'meta'},
							el('div', {class: 'boss-name'}, b.name),
							el('div', {class: 'respawn-status', id: `respawn-${b.id}`}, b.respawn || ''),
							el('div', {class: 'monitor-progress', id: `progress-${b.id}`}, el('div', {class: 'bar', id: `bar-${b.id}`})),
							el('div', {class: 'monitor-small', id: `lastkill-${b.id}`}, '')
						),
						el('div', {class: 'monitor-actions'},
							el('button', {type: 'button', class: 'btn-small', 'data-boss-id': b.id}, '⚔️ 紀錄擊殺')
						)
					);
				monitorRoot.appendChild(wrap);
				// make the whole card keyboard-activatable and click-through to quick-record button
				try {
					wrap.addEventListener('keydown', (ev) => {
						if (ev.key === 'Enter' || ev.key === ' ') {
							ev.preventDefault();
							const btn = wrap.querySelector('button[data-boss-id]');
							if (btn) btn.click();
						}
					});
					// show pointer cursor
					wrap.style.cursor = 'pointer';
				} catch (e) {}
				// populate dynamic info (last kill, respawn, progress)
				try {
					const rows = PerBossStorage.getRecordsForBoss({ bossId: b.id }) || [];
					const latest = rows.slice().sort((a,c)=> new Date(c.timestamp)-new Date(a.timestamp))[0];
					const lastEl = document.getElementById(`lastkill-${b.id}`);
					if (latest && lastEl) lastEl.textContent = `上次：${new Date(latest.timestamp).toLocaleString()} (Ch.${latest.channel})`;
					// compute respawn and percent
					if (latest) {
						const resp = calculateRespawnTimes(latest.timestamp, b);
						const now = Date.now();
						let t0 = resp.times && resp.times[0] ? Date.parse(resp.times[0]) : NaN;
						let t1 = resp.times && resp.times[1] ? Date.parse(resp.times[1]) : t0;
							const statusEl = document.getElementById(`respawn-${b.id}`);
						if (!isNaN(t0) && !isNaN(t1)) {
							if (now < t0) {
								if (statusEl) statusEl.textContent = `冷卻中：${resp.humanReadable}`;
								// cooling state (neutral gray)
								wrap.classList.remove('respawn-soon','respawn-ready');
								wrap.classList.add('respawn-cooling');
							} else if (now >= t0 && now <= t1) {
								if (statusEl) statusEl.textContent = `復活中：${resp.humanReadable}`;
								// within respawn window -> soon (amber)
								wrap.classList.remove('respawn-cooling','respawn-ready');
								wrap.classList.add('respawn-soon');
							} else {
								if (statusEl) statusEl.textContent = `已復活：${resp.humanReadable}`;
								// ready (green)
								wrap.classList.remove('respawn-cooling','respawn-soon');
								wrap.classList.add('respawn-ready');
							}
							// progress: from kill -> earliest
							const duration = t0 - Date.parse(latest.timestamp);
							let pct = 0;
							if (duration > 0) pct = Math.max(0, Math.min(100, Math.round(((now - Date.parse(latest.timestamp)) / duration) * 100)));
							const bar = document.getElementById(`bar-${b.id}`);
							if (bar) bar.style.width = `${pct}%`;
							// also update thumbnail tooltip (data-tip) to show human readable + last kill
							try { if (thumb) { thumb.setAttribute('data-tip', `${b.respawn || ''} — ${resp.humanReadable || ''}`); thumb.setAttribute('aria-label', `${b.name} ${b.respawn || ''} — ${resp.humanReadable || ''}`); } } catch(e) {}
						}
					}
				} catch (e) { /* ignore */ }
				// wire quick-record button
				wrap.querySelectorAll('button[data-boss-id]').forEach(btn => btn.addEventListener('click', (ev) => {
					const bid = ev.currentTarget.getAttribute('data-boss-id');
					// set record form boss and set timestamp override to now
					try { document.getElementById('record-boss').value = bid; } catch (e) {}
					try { document.getElementById('record-timestamp-iso').value = new Date().toISOString(); } catch (e) {}
					// update preview display
					try { const disp = document.getElementById('record-time-display'); if (disp) disp.innerText = `擊殺時間：${new Date().toLocaleString()}`; } catch (e) {}
					// focus channel
					try { document.getElementById('record-channel').focus(); } catch (e) {}
				}));
			});
		}

			// Refresh monitor panel dynamic values (progress, status, last kill)
			function refreshMonitorPanel() {
				if (!monitorRoot) return;
				// avoid doing work when tab not visible
				try { if (document.visibilityState && document.visibilityState !== 'visible') return; } catch (e) {}
				try {
					BOSSES.forEach(b => {
						try {
							const rows = PerBossStorage.getRecordsForBoss({ bossId: b.id }) || [];
							const latest = rows[0];
							const lastEl = document.getElementById(`lastkill-${b.id}`);
							const statusEl = document.getElementById(`respawn-${b.id}`);
							const bar = document.getElementById(`bar-${b.id}`);
							if (latest) {
								if (lastEl) lastEl.textContent = `上次：${new Date(latest.timestamp).toLocaleString()} (Ch.${latest.channel})`;
								const resp = calculateRespawnTimes(latest.timestamp, b);
								const now = Date.now();
								let t0 = resp.times && resp.times[0] ? Date.parse(resp.times[0]) : NaN;
								let t1 = resp.times && resp.times[1] ? Date.parse(resp.times[1]) : t0;
								if (!isNaN(t0) && !isNaN(t1)) {
									if (now < t0) {
										if (statusEl) statusEl.textContent = `冷卻中：${resp.humanReadable}`;
									} else if (now >= t0 && now <= t1) {
										if (statusEl) statusEl.textContent = `復活中：${resp.humanReadable}`;
									} else {
										if (statusEl) statusEl.textContent = `已復活：${resp.humanReadable}`;
									}
									// update progress bar from kill -> earliest
									const duration = t0 - Date.parse(latest.timestamp);
									let pct = 0;
									if (duration > 0) pct = Math.max(0, Math.min(100, Math.round(((now - Date.parse(latest.timestamp)) / duration) * 100)));
									if (bar) bar.style.width = `${pct}%`;
									// update monitor card semantic class so styles reflect state
									try {
										const wrap = document.querySelector(`.monitor-card[data-boss-id="${b.id}"]`);
										if (wrap) {
											if (now < t0) { wrap.classList.remove('respawn-soon','respawn-ready'); wrap.classList.add('respawn-cooling'); }
											else if (now >= t0 && now <= t1) { wrap.classList.remove('respawn-cooling','respawn-ready'); wrap.classList.add('respawn-soon'); }
											else { wrap.classList.remove('respawn-cooling','respawn-soon'); wrap.classList.add('respawn-ready'); }
										}
									} catch (e) {}
								}
							} else {
								if (lastEl) lastEl.textContent = '';
								if (statusEl) statusEl.textContent = b.respawn || '';
								if (bar) bar.style.width = '0%';
							}
						} catch (e) { /* ignore per-boss errors */ }
					});
				} catch (e) { /* ignore */ }
			}

			// start auto-refresh timer for monitor panel; clears previous timer if exists
			function startMonitorAutoRefresh() {
				try { if (window.__abt_monitor_timer) clearInterval(window.__abt_monitor_timer); } catch (e) {}
				// ensure we don't attach multiple visibility handlers
				try { if (window.__abt_monitor_visibility_handler) document.removeEventListener('visibilitychange', window.__abt_monitor_visibility_handler); } catch (e) {}

				function startTimer() { try { if (!window.__abt_monitor_timer) window.__abt_monitor_timer = setInterval(refreshMonitorPanel, 10000); } catch(e) {} }
				function stopTimer() { try { if (window.__abt_monitor_timer) { clearInterval(window.__abt_monitor_timer); window.__abt_monitor_timer = null; } } catch(e) {} }

				// start or stop based on current visibility
				try {
					if (document.visibilityState && document.visibilityState === 'visible') startTimer();
				} catch(e) { startTimer(); }

				// expose handler so we can remove it on re-init
				window.__abt_monitor_visibility_handler = function() {
					try {
						if (document.visibilityState === 'visible') startTimer(); else stopTimer();
					} catch(e) {}
				};
				try { document.addEventListener('visibilitychange', window.__abt_monitor_visibility_handler); } catch(e) {}
			}


	function prefillCalculator(boss) {
		// populate calculator form with selected boss
		const sel = document.getElementById('calc-boss');
		if (sel) sel.value = boss.id;
		// show sample result (if calculator exists)
		if (calcResult) calcResult.innerHTML = `<strong>已選：</strong>${boss.name}（${boss.respawn || ''}）`;
		// also set record form boss select if present
		const rf = document.getElementById('record-boss');
		if (rf) rf.value = boss.id;

		// remember last selected boss
		try { localStorage.setItem('abt_lastBoss', boss.id); } catch (e) {}

		// update visible preview inside the record card
		try {
			const text = `${boss.name}${boss.minMinutes != null ? `（${boss.minMinutes}~${boss.maxMinutes}分）` : ''}`;
			const nameEl = document.getElementById('selected-boss-name');
			if (nameEl) nameEl.textContent = `已選： ${text}`;
			// countdown to earliest respawn from now (use minMinutes if provided)
			try { window.__abt_preview_timer && clearInterval(window.__abt_preview_timer); } catch (e) {}
			const cdEl = document.getElementById('selected-boss-countdown');
			if (boss.minMinutes != null && cdEl) {
				const next = new Date(Date.now() + boss.minMinutes * 60000);
				function updateCountdown() {
					const diff = next.getTime() - Date.now();
					if (diff <= 0) {
						cdEl.textContent = '（已達最早復活時間）';
						const prevEl = document.getElementById('selected-boss-preview'); if (prevEl) prevEl.style.background = '#fff3e0';
						return;
					}
					const mins = Math.floor(diff / 60000);
					const secs = Math.floor((diff % 60000) / 1000);
					cdEl.textContent = `距離最早復活：${mins}分${secs}秒`;
					// warning if within 10 minutes
					const prevEl = document.getElementById('selected-boss-preview'); if (prevEl) {
						if (diff <= 10 * 60000) prevEl.style.background = '#fff3e0'; else prevEl.style.background = '#fafafa';
					}
				}
				updateCountdown();
				window.__abt_preview_timer = setInterval(updateCountdown, 1000);
			} else {
				if (cdEl) cdEl.textContent = '';
			}
		} catch (e) { /* ignore */ }
	}

	function buildCalculatorAndRecordUI(bosses) {
		// calculator
		if (calculatorRoot) calculatorRoot.innerHTML = '';
		// prepare default local time
		const now = new Date();
		const padded = (n) => n.toString().padStart(2, '0');
		const local = `${now.getFullYear()}-${padded(now.getMonth()+1)}-${padded(now.getDate())}T${padded(now.getHours())}:${padded(now.getMinutes())}`;
		// optional calculator UI: only build if calculatorRoot exists
		if (calculatorRoot) {
			const bossSelect = el('select', {id: 'calc-boss'});
			bosses.forEach(b => bossSelect.appendChild(el('option', {value: b.id}, b.name)));
			const timeInput = el('input', {id: 'calc-time', type: 'datetime-local'});
			// default now (local tz, drop seconds)
			timeInput.value = local;

			const calcBtn = el('button', {type: 'button'}, '計算復活時間');
			calcBtn.addEventListener('click', () => {
				const bossId = document.getElementById('calc-boss').value;
				const boss = bosses.find(b => b.id === bossId);
				if (!boss) { calcResult.innerText = '請先選擇 Boss'; return; }
				const tval = document.getElementById('calc-time').value;
				if (!tval) { calcResult.innerText = '請輸入擊殺時間'; return; }
				const killISO = new Date(tval).toISOString();
				const result = calculateRespawnTimes(killISO, boss);
				if (calcResult) calcResult.innerHTML = `<strong>${boss.name}</strong><br/>${result.humanReadable}`;
			});

			const wrapper = el('div', {},
				el('label', {}, 'Boss：'), bossSelect,
				el('br'),
				el('label', {}, '擊殺時間：'), timeInput,
				el('div', {style: 'margin-top:8px'}, calcBtn)
			);
			calculatorRoot.appendChild(wrapper);
		}

		// --- record form ---
		recordFormRoot.innerHTML = '';
		const rf = el('div', {class: 'card', style: 'padding:12px'},
			el('h5', {}, '📝 紀錄擊殺'),
			// selected boss preview placeholder (will be populated by prefillCalculator)
			el('div', {id: 'selected-boss-preview', style: 'margin:6px 0 12px 0;padding:6px 10px;background:#fafafa;border:1px solid #eee;border-radius:6px;color:#333'},
				el('span', {id: 'selected-boss-name'}, ''),
				el('span', {id: 'selected-boss-countdown', style: 'margin-left:8px;color:#666'}, ''),
				el('button', {id: 'abt-change-boss', type: 'button', class: 'btn-small grey', style: 'margin-left:12px'}, '更改')
			),
			el('label', {}, 'Boss：'), el('select', {id: 'record-boss'}, bosses.map(b => el('option', {value: b.id}, b.name))), el('br'),
			/* 擊殺時間由系統自動生成 (使用新增時刻) */
			el('p', {id: 'record-time-display', style: 'color:#666;margin:8px 0 0 0;font-size:0.95rem'}, `擊殺時間：${new Date().toLocaleString()}`),
			// hidden ISO timestamp override (used by ±1 minute)
			el('input', {type: 'hidden', id: 'record-timestamp-iso'}),
			el('br'),
			el('label', {}, '頻道：'), el('input', {id: 'record-channel', type: 'number', min: 1, max: 3000, step: 1, placeholder: '例如 1'}), el('br'),
			el('label', {}, '是否出貨：')
		);

		// looted switch (仿 Material style)
		const lootedWrapper = el('div', {style: 'margin-top:8px;display:flex;align-items:center;gap:8px'},
			el('label', {class: 'switch'},
				el('input', {type: 'checkbox', id: 'looted-toggle'}),
				el('span', {class: 'slider'})
			),
			el('span', {style: 'margin-left:6px'}, '已出貨')
		);
		rf.appendChild(lootedWrapper);
		rf.appendChild(el('br'));
		rf.appendChild(el('br'));

		rf.appendChild(el('label', {}, '備註：'));
		rf.appendChild(el('textarea', {id: 'record-note', rows: 2, maxlength: 200}));
		// inline validation / status area
		rf.appendChild(el('div', {id: 'record-status', style: 'margin-top:8px;color:crimson'}));
		rf.appendChild(el('br'));
		rf.appendChild(el('button', {id: 'record-add', type: 'button', class: 'btn teal'}, '新增紀錄'));
		rf.appendChild(el('button', {id: 'record-cancel', type: 'button', class: 'btn grey', style: 'margin-left:8px;display:none'}, '取消編輯'));
		// channel stepper (mixed input) + quick-channels
		const stepper = el('div', {class: 'channel-control-group', style: 'margin-top:8px'},
			el('label', {class: 'input-label'}, '頻道'),
			el('div', {class: 'stepper-wrapper', style: 'display:flex;align-items:center;background:#f5f5f5;border-radius:8px;overflow:hidden;border:1px solid #e6e6e6'},
				el('button', {type:'button', id: 'channel-dec', class: 'step-btn', style: 'background:#eee;border:none;width:44px;height:40px'}, '❮'),
				// reuse existing record-channel input for persistence
				el('input', {id: 'record-channel', type: 'number', min: 1, max: 3000, step: 1, value: 1, class: 'channel-input', style: 'flex:1;background:transparent;border:none;text-align:center;font-size:18px;padding:10px 0;outline:none'}),
				el('button', {type:'button', id: 'channel-inc', class: 'step-btn', style: 'background:#eee;border:none;width:44px;height:40px'}, '❯')
			),
			el('div', {id: 'quick-channels', class: 'quick-channels', style: 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap'} )
		);
		rf.appendChild(stepper);

		// time adjust row: [-1]  時間顯示  [+1]
		const timeAdjust = el('div', {id: 'time-adjust-row', style: 'margin-top:8px;display:flex;gap:8px;align-items:center;justify-content:flex-start'},
			el('button', {type: 'button', id: 'minus-1', class: 'btn-small'}, '−1 分'),
			el('p', {id: 'record-time-display-inline', style: 'color:#666;margin:0;font-size:0.95rem;padding:0 6px'}, `擊殺時間：${new Date().toLocaleString()}`),
			el('button', {type: 'button', id: 'plus-1', class: 'btn-small'}, '+1 分')
		);
		rf.appendChild(timeAdjust);
		recordFormRoot.appendChild(rf);

		// wire '更改' 按鈕 to toggle visibility of boss select
		try {
			const changeBtn = document.getElementById('abt-change-boss');
			if (changeBtn) changeBtn.addEventListener('click', () => {
				const sel = document.getElementById('record-boss');
				if (!sel) return;
				if (sel.classList.contains('abt-hidden-select')) {
					sel.classList.remove('abt-hidden-select');
					sel.focus();
				} else {
					sel.classList.add('abt-hidden-select');
				}
			});
		} catch (e) {}

		// wire stepper controls and quick-channels
		try {
			function clampChannel(v){ return Math.max(1, Math.min(3000, Number(v)||1)); }
			const incBtn = document.getElementById('channel-inc');
			const decBtn = document.getElementById('channel-dec');
			const chInput = document.getElementById('record-channel');
			const quickRoot = document.getElementById('quick-channels');
			if (incBtn && chInput) incBtn.addEventListener('click', ()=>{ chInput.value = clampChannel(Number(chInput.value) + 1); chInput.focus(); renderQuickChannels(); });
			if (decBtn && chInput) decBtn.addEventListener('click', ()=>{ chInput.value = clampChannel(Number(chInput.value) - 1); chInput.focus(); renderQuickChannels(); });
			if (chInput) {
				chInput.addEventListener('input', (ev)=>{ ev.target.value = clampChannel(ev.target.value); });
				chInput.addEventListener('change', ()=> renderQuickChannels());
			}

			// recent channels persisted in localStorage key 'abt_recent_channels' as JSON array
			function getRecentChannels(){ try { return JSON.parse(localStorage.getItem('abt_recent_channels')||'[]'); } catch(e){ return []; } }
			function saveRecentChannels(arr){ try { localStorage.setItem('abt_recent_channels', JSON.stringify(arr)); } catch(e){} }
			function addRecentChannel(n){ try { const arr = getRecentChannels().filter(x=>x!==n); arr.unshift(n); if (arr.length>8) arr.length = 8; saveRecentChannels(arr); } catch(e){} }

			function renderQuickChannels(){
				if (!quickRoot) return;
				quickRoot.innerHTML = '';
				const arr = getRecentChannels();
				if (!arr.length) return;
				arr.forEach(ch => {
					const chip = el('button', {type:'button', class:'quick-chip btn-small grey', 'data-channel': String(ch)}, String(ch));
					chip.addEventListener('click', ()=>{ const input = document.getElementById('record-channel'); if (input) { input.value = clampChannel(ch); input.focus(); } });
					quickRoot.appendChild(chip);
				});
			}
			// initial render
			renderQuickChannels();
		} catch (e) { /* ignore */ }

		// time adjust handlers: modify hidden ISO and display
		function ensureTimestampOverrideExists() {
			let isoEl = document.getElementById('record-timestamp-iso');
			if (!isoEl) return null;
			let iso = isoEl.value;
			if (!iso) {
				iso = new Date().toISOString();
				isoEl.value = iso;
			}
			return isoEl;
		}
		try {
			// helper to adjust kill time by minutes
			function adjustKillTime(deltaMinutes) {
				try {
					const isoEl = ensureTimestampOverrideExists();
					if (!isoEl) return;
					const dt = new Date(isoEl.value);
					dt.setMinutes(dt.getMinutes() + deltaMinutes);
					isoEl.value = dt.toISOString();
					// update both display DOM nodes
					const disp = document.getElementById('record-time-display'); if (disp) disp.innerText = `擊殺時間：${dt.toLocaleString()}`;
					const dispInline = document.getElementById('record-time-display-inline'); if (dispInline) dispInline.innerText = `擊殺時間：${dt.toLocaleString()}`;
				} catch (e) { /* ignore */ }
			}

			document.getElementById('minus-1').addEventListener('click', () => adjustKillTime(-1));
			document.getElementById('plus-1').addEventListener('click', () => adjustKillTime(1));

			// keyboard shortcuts: when user focuses inside record form, ArrowUp = +1, ArrowDown = -1
			try {
				const formRoot = document.getElementById('record-form-root');
				if (formRoot) {
					formRoot.addEventListener('keydown', (ev) => {
						if (ev.key === 'ArrowUp') { ev.preventDefault(); adjustKillTime(1); }
						if (ev.key === 'ArrowDown') { ev.preventDefault(); adjustKillTime(-1); }
					});
				}
			} catch(e) {}
		} catch (e) { /* ignore if controls missing */ }

		// build filters UI placeholder (will be filled by buildFiltersUI)
		const filtersRoot = document.getElementById('filters-root');
		if (filtersRoot) filtersRoot.innerHTML = '';

		// default looted toggle to unchecked (否) and set aria state
	try { const lt = document.getElementById('looted-toggle'); if (lt) { lt.checked = false; lt.setAttribute('aria-checked', 'false'); lt.addEventListener('change', () => lt.setAttribute('aria-checked', lt.checked ? 'true' : 'false')); } } catch (e) { /* ignore */ }
		// update display time periodically while form is open (optional)
		try {
			const disp = document.getElementById('record-time-display');
			if (disp) {
				setInterval(() => { try {
					// if user has an ISO override, reflect that value; otherwise show now
					const isoEl = document.getElementById('record-timestamp-iso');
					if (isoEl && isoEl.value) disp.innerText = `擊殺時間：${new Date(isoEl.value).toLocaleString()}`;
					else disp.innerText = `擊殺時間：${new Date().toLocaleString()}`;
				} catch(e){} }, 60000);
			}
		} catch(e) {}

		// restore last selected boss if present
		const lastBoss = localStorage.getItem('abt_lastBoss');
		const recordBossSel = document.getElementById('record-boss');
		if (lastBoss && recordBossSel) {
			try { 
				recordBossSel.value = lastBoss; 
				// hide select by default and leave visible preview
				recordBossSel.classList.add('abt-hidden-select');
			} catch (e) { /* ignore */ }
		}

		// record add / edit handling
		const recordAddBtn = document.getElementById('record-add');
		const recordIdInput = el('input', {type: 'hidden', id: 'record-id'});
		rf.appendChild(recordIdInput);

		function clearRecordForm() {
			document.getElementById('record-id').value = '';
			document.getElementById('record-note').value = '';
			document.getElementById('record-channel').value = '';
			try { const lt = document.getElementById('looted-toggle'); if (lt) { lt.checked = false; lt.setAttribute('aria-checked', 'false'); } } catch(e) {}
			document.getElementById('record-add').innerText = '新增紀錄';
			// hide cancel edit button
			try { document.getElementById('record-cancel').style.display = 'none'; } catch (e) {}
			// reset time display to now
			try { const disp = document.getElementById('record-time-display'); if (disp) disp.innerText = `擊殺時間：${new Date().toLocaleString()}`; } catch(e) {}
		}

		recordAddBtn.addEventListener('click', () => {
			const bossId = document.getElementById('record-boss').value;
			// timestamp: prefer override if user adjusted time, otherwise now
			const isoOverrideEl = document.getElementById('record-timestamp-iso');
			const t = (isoOverrideEl && isoOverrideEl.value) ? isoOverrideEl.value : new Date().toISOString();
			const channel = document.getElementById('record-channel').value;
			const looted = !!(document.getElementById('looted-toggle') && document.getElementById('looted-toggle').checked);
			const note = document.getElementById('record-note').value.trim();
			const editId = document.getElementById('record-id').value;
			// validation (show inline)
			const errors = [];
			if (!bossId) errors.push('請選擇 Boss');
			const chNum = Number(channel);
			if (!channel || isNaN(chNum) || !Number.isInteger(chNum) || chNum < 1 || chNum > 3000) errors.push('頻道請輸入 1..3000 的整數');
			if (note.length > 200) errors.push('備註不可超過 200 字');
			const statusEl = document.getElementById('record-status');
			if (errors.length) { if (statusEl) statusEl.innerHTML = errors.join('<br/>'); else showToast(errors.join('<br/>'), { classes: 'red darken-1 white-text' }); return; }
			if (statusEl) statusEl.innerHTML = '';
			try {
				if (editId) {
					// update (keep original timestamp unless explicitly changed via future feature)
					const updated = updateRecord(editId, { bossId, channel: chNum, looted, note });
					// mark last edited for highlight
					window.__abt_lastEditedId = updated.id;
					renderRecords(bossId, new Date(t));
					clearRecordForm();
					showToast('已儲存修改', { classes: 'green darken-1' });
				} else {
					const rec = addRecord({ bossId, timestamp: t, channel: chNum, looted, note });
					// mark last edited for highlight
					window.__abt_lastEditedId = rec.id;
					renderRecords(bossId, new Date(t));
					// clear note / channel
					document.getElementById('record-note').value = '';
					document.getElementById('record-channel').value = '';
					// remember last boss
					try { localStorage.setItem('abt_lastBoss', bossId); } catch (e) {}
					// add to recent channels list (persist up to 8)
					try {
						const rcKey = 'abt_recent_channels';
						const cur = JSON.parse(localStorage.getItem(rcKey) || '[]');
						const chStr = String(chNum);
						const filtered = cur.filter(x => x !== chStr);
						filtered.unshift(chStr);
						if (filtered.length > 8) filtered.length = 8;
						localStorage.setItem(rcKey, JSON.stringify(filtered));
						// re-render quick channels if present
						try { const quickRoot = document.getElementById('quick-channels'); if (quickRoot && typeof quickRoot.innerHTML !== 'undefined') {
							// rebuild via existing render handler by triggering change event
							const evt = new Event('change'); document.getElementById('record-channel').dispatchEvent(evt);
						} } catch(e) {}
					} catch(e) {}
					showToast('新增完成', { classes: 'green darken-1' });
					// focus channel for next quick entry
					try { document.getElementById('record-channel').focus(); } catch (e) {}
				}
			} catch (e) {
				showToast('操作失敗：' + e.message, { classes: 'red darken-1 white-text' });
			}
		});

		// cancel edit handler
		try {
			document.getElementById('record-cancel').addEventListener('click', () => {
				clearRecordForm();
				showToast('已取消編輯');
			});
		} catch (e) {}

		// build filters UI and wire handlers
		function buildFiltersUI(bosses) {
			const root = document.getElementById('filters-root');
			if (!root) return;
			root.innerHTML = '';
			const wrapper = el('div', {class: 'card', style: 'padding:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center'},
				el('label', {style: 'margin-right:6px'}, '頻道：'), el('input', {type: 'number', id: 'filter-channel', placeholder: '全部', min:1, max:3000, style: 'width:90px'}),
				el('label', {style: 'margin-right:6px'}, '是否出貨：'),
				(el('select', {id: 'filter-looted'}, el('option', {value: ''}, '全部'), el('option', {value: 'yes'}, '是'), el('option', {value: 'no'}, '否'))),
				el('label', {style: 'margin-right:6px'}, '起始日期：'), el('input', {type: 'date', id: 'filter-start', style: 'width:150px'}),
				el('label', {style: 'margin-right:6px'}, '結束日期：'), el('input', {type: 'date', id: 'filter-end', style: 'width:150px'}),
				el('button', {id: 'filter-apply', type: 'button', class: 'btn'}, '套用篩選'),
				el('button', {id: 'filter-clear', type: 'button', class: 'btn grey'}, '清除')
			);
			root.appendChild(wrapper);

			document.getElementById('filter-apply').addEventListener('click', () => {
				// render with current filters
				const bossSel = document.getElementById('record-boss');
				const bossId = bossSel ? bossSel.value : null;
				renderRecords(bossId);
			});

			document.getElementById('filter-clear').addEventListener('click', () => {
				document.getElementById('filter-channel').value = '';
				document.getElementById('filter-looted').value = '';
				document.getElementById('filter-start').value = '';
				document.getElementById('filter-end').value = '';
				const bossSel = document.getElementById('record-boss');
				const bossId = bossSel ? bossSel.value : null;
				renderRecords(bossId);
			});
		}

		// helper to read current filter values from UI
		function readFiltersFromUI() {
			const ch = document.getElementById('filter-channel');
			const lo = document.getElementById('filter-looted');
			const st = document.getElementById('filter-start');
			const ed = document.getElementById('filter-end');
			const result = {};
			if (ch && ch.value) {
				const n = Number(ch.value);
				if (!isNaN(n) && Number.isInteger(n)) result.channel = n;
			}
			if (lo && lo.value) result.looted = lo.value === 'yes' ? true : (lo.value === 'no' ? false : undefined);
			if (st && st.value) result.startDate = st.value; // yyyy-mm-dd
			if (ed && ed.value) result.endDate = ed.value;
			return result;
		}

		// expose buildFiltersUI to be called after bosses load
		window.__abt_buildFiltersUI = buildFiltersUI;
	}

	function renderRecords(bossId, date) {
		recordsRoot.innerHTML = '';
		// determine human-friendly boss name for title
		let bossTitle = '全部';
		if (bossId) {
			const b = (typeof BOSSES !== 'undefined' && Array.isArray(BOSSES)) ? BOSSES.find(x => x.id === bossId) : null;
			bossTitle = b ? b.name : bossId;
		}
		const title = el('h5', {}, `紀錄 — ${bossTitle}`);
		recordsRoot.appendChild(title);

		// sorting state must be available before rendering sort status
		window.__abt_records_sort = window.__abt_records_sort || { key: 'timestamp', dir: 'asc' };
		const sortState = window.__abt_records_sort;

		// show current sort status and reset control next to title
		const keyLabelMap = { boss: '首領', timestamp: '時間', channel: '頻道', looted: '出貨', note: '備註', respawn: '預計復活' };
		function renderSortStatus() {
			// remove existing if present
			const existing = document.getElementById('abt-sort-status');
			if (existing) existing.remove();
			const ks = sortState.key || 'timestamp';
			const dir = sortState.dir === 'asc' ? '▲' : '▼';
			const lbl = keyLabelMap[ks] || ks;
			const span = el('span', {id: 'abt-sort-status', style: 'margin-left:12px;color:#666;font-size:0.9rem'}, `排序：${lbl} ${dir}`);
			// reset button
			const resetBtn = el('button', {id: 'abt-reset-sort', type: 'button', class: 'btn-small grey', style: 'margin-left:8px'}, '重設排序');
			resetBtn.addEventListener('click', () => {
				try { localStorage.removeItem('abt_records_sort'); } catch (e) {}
				window.__abt_records_sort = { key: 'timestamp', dir: 'asc' };
				renderRecords(bossId, date);
				showToast('已重設排序');
			});
			span.appendChild(resetBtn);
			title.parentNode.insertBefore(span, title.nextSibling);
		}
		renderSortStatus();

		// add respawn status legend next to title
		function renderRespawnLegend() {
			const existing = document.getElementById('abt-respawn-legend');
			if (existing) existing.remove();
			const legend = el('div', {id: 'abt-respawn-legend', style: 'margin-left:24px;display:inline-flex;gap:16px;font-size:0.85rem;color:#666;align-items:center'});
			// soon (orange)
			const soonItem = el('span', {style: 'display:inline-flex;align-items:center;gap:6px'},
				el('span', {style: 'display:inline-block;width:10px;height:10px;background:#ffb74d;border-radius:2px'}),
				el('span', {}, '復活中')
			);
			// ready (green)
			const readyItem = el('span', {style: 'display:inline-flex;align-items:center;gap:6px'},
				el('span', {style: 'display:inline-block;width:10px;height:10px;background:#66bb6a;border-radius:2px'}),
				el('span', {}, '已復活')
			);
			legend.appendChild(soonItem);
			legend.appendChild(readyItem);
			// insert after sort status
			const sortStatus = document.getElementById('abt-sort-status');
			if (sortStatus) sortStatus.parentNode.insertBefore(legend, sortStatus.nextSibling);
			else title.parentNode.insertBefore(legend, title.nextSibling);
		}
		renderRespawnLegend();
	// get all records for boss (or all if no bossId)
	let rows = getRecords({ bossId });
	// gather filters from UI (use typeof checks to avoid ReferenceError if helper not yet defined)
	const filters = (typeof readFiltersFromUI === 'function') ? readFiltersFromUI() : ((typeof window.__abt_readFiltersFromUI === 'function') ? window.__abt_readFiltersFromUI() : {});
		// if a specific date is passed, override start/end filters to that date
		if (date) {
			const d = new Date(date);
			if (!isNaN(d)) {
				const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
				filters.startDate = `${y.toString().padStart(4,'0')}-${(m+1).toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
				filters.endDate = filters.startDate;
			}
		}
		// apply channel filter
		if (filters.channel != null) rows = rows.filter(r => Number(r.channel) === Number(filters.channel));
		// apply looted filter
		if (filters.looted === true) rows = rows.filter(r => r.looted === true);
		if (filters.looted === false) rows = rows.filter(r => r.looted === false);
		// apply date range filter (startDate/endDate are yyyy-mm-dd strings)
		if (filters.startDate || filters.endDate) {
			let start = filters.startDate ? new Date(filters.startDate + 'T00:00:00') : new Date(0);
			let end = filters.endDate ? new Date(filters.endDate + 'T23:59:59.999') : new Date(8640000000000000);
			rows = rows.filter(r => {
				const t = new Date(r.timestamp);
				return t >= start && t <= end;
			});
		}

		// --- apply sorting based on global sortState (key, dir) ---
		try {
			const ss = window.__abt_records_sort || { key: 'timestamp', dir: 'asc' };
			if (ss && ss.key) {
				rows.sort((a, b) => {
					const k = ss.key;
					let va, vb;
					switch (k) {
						case 'timestamp':
							va = new Date(a.timestamp).getTime(); vb = new Date(b.timestamp).getTime();
							break;
						case 'channel':
							va = Number(a.channel) || 0; vb = Number(b.channel) || 0; break;
						case 'looted':
							va = a.looted ? 1 : 0; vb = b.looted ? 1 : 0; break;
						case 'note':
							va = (a.note || '').toLowerCase(); vb = (b.note || '').toLowerCase(); break;
						case 'boss':
							va = (BOSSES.find(x => x.id === a.bossId) || { name: '' }).name.toLowerCase();
							vb = (BOSSES.find(x => x.id === b.bossId) || { name: '' }).name.toLowerCase();
							break;
						case 'respawn':
							// compare earliest respawn timestamps (or 0 if not computable)
							try { va = new Date(calculateRespawnTimes(a.timestamp, BOSSES.find(x=>x.id===a.bossId) || {}).times[0] || 0).getTime(); } catch(e){ va = 0; }
							try { vb = new Date(calculateRespawnTimes(b.timestamp, BOSSES.find(x=>x.id===b.bossId) || {}).times[0] || 0).getTime(); } catch(e){ vb = 0; }
							break;
						default:
							va = (a[k] || '').toString().toLowerCase(); vb = (b[k] || '').toString().toLowerCase();
					}
					// decide comparison
					if (typeof va === 'string' && typeof vb === 'string') {
						if (va < vb) return ss.dir === 'asc' ? -1 : 1;
						if (va > vb) return ss.dir === 'asc' ? 1 : -1;
						return 0;
					}
					// numeric fallback
					const na = Number(va) || 0; const nb = Number(vb) || 0;
					return ss.dir === 'asc' ? na - nb : nb - na;
				});
			}
		} catch (e) { console.warn('排序失敗', e); }
		if (!rows.length) { recordsRoot.appendChild(el('p', {}, '無紀錄')); return; }

		// show active filters badges
		const active = [];
		if (filters.channel != null) active.push(`頻道: ${filters.channel}`);
		if (filters.looted === true) active.push('出貨: 是');
		if (filters.looted === false) active.push('出貨: 否');
		if (filters.startDate || filters.endDate) {
			if (filters.startDate === filters.endDate) active.push(`日期: ${filters.startDate}`);
			else active.push(`日期: ${filters.startDate || '開始'} → ${filters.endDate || '結束'}`);
		}
		if (active.length) {
			const af = el('div', {style: 'margin-bottom:8px'});
			active.forEach(a => af.appendChild(el('span', {class: 'chip', style: 'margin-right:6px'}, a)));
			recordsRoot.appendChild(af);
		}


		// prepare table and headers (add Boss column when viewing all bosses)
		const table = el('table', {class: 'striped'});
		const thead = el('thead');
		const headerRow = el('tr');

		// helper to build a sortable header cell (adds aria-sort and keyboard support)
		function thSortable(label, key) {
			const th = el('th');
			th.classList.add('sortable');
			th.style.cursor = 'pointer';
			th.textContent = label;
			th.setAttribute('role', 'button');
			th.setAttribute('tabindex', '0');

			// update visual indicator and aria/data attributes
			function renderIndicator() {
				const isActive = sortState.key === key;
				if (isActive) {
					th.setAttribute('aria-sort', sortState.dir === 'asc' ? 'ascending' : 'descending');
					th.setAttribute('data-sort', sortState.dir === 'asc' ? 'asc' : 'desc');
				} else {
					th.removeAttribute('aria-sort');
					th.removeAttribute('data-sort');
				}
			}
			renderIndicator();

			function toggleSort() {
				if (sortState.key === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
				else { sortState.key = key; sortState.dir = 'asc'; }
				// persist
				window.__abt_records_sort = sortState;
				try { localStorage.setItem('abt_records_sort', JSON.stringify(sortState)); } catch (e) {}
				renderRecords(bossId, date);
			}

			th.addEventListener('click', () => toggleSort());
			th.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleSort(); } });
			return th;
		}

		// if showing all bosses, include Boss column (中文化表頭)
		if (!bossId) headerRow.appendChild(thSortable('首領', 'boss'));
		headerRow.appendChild(thSortable('時間', 'timestamp'));
		headerRow.appendChild(thSortable('頻道', 'channel'));
		headerRow.appendChild(thSortable('出貨', 'looted'));
		headerRow.appendChild(thSortable('備註', 'note'));
		headerRow.appendChild(thSortable('預計復活', 'respawn'));
		headerRow.appendChild(el('th', {}, '操作'));
		thead.appendChild(headerRow);
		table.appendChild(thead);
		const tbody = el('tbody');

		// helper: format record timestamp compactly
		function formatRecordDate(tsInput) {
			const d = new Date(tsInput);
			if (isNaN(d)) return '—';
			const now = new Date();
			if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
				return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
			}
			const mm = (d.getMonth() + 1).toString().padStart(2, '0');
			const dd = d.getDate().toString().padStart(2, '0');
			const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
			return `${mm}/${dd} ${time}`;
		}

		rows.forEach(r => {
			// compute respawn using boss rule if available
			const boss = BOSSES.find(b => b.id === r.bossId);
			const resp = boss ? calculateRespawnTimes(r.timestamp, boss) : { humanReadable: '—' };
			// format timestamp compactly: today -> HH:mm, otherwise MM/DD HH:mm
			const tsDisplay = formatRecordDate(r.timestamp);

			// determine respawn status color class
			let respClass = '';
			try {
				const now = Date.now();
				if (resp && Array.isArray(resp.times) && resp.times.length) {
					// interpret single time as instantaneous (min==max)
					const t0 = resp.times[0] ? Date.parse(resp.times[0]) : NaN;
					const t1 = resp.times[1] ? Date.parse(resp.times[1]) : t0;
					if (!isNaN(t0) && !isNaN(t1)) {
						if (now < t0) {
							// not yet reached earliest respawn -> no special class
							respClass = '';
						} else if (now >= t0 && now <= t1) {
							// now within respawn range -> orange (soon)
							respClass = 'respawn-soon';
						} else if (now > t1) {
							// now after range -> green (available)
							respClass = 'respawn-ready';
						}
					}
				}
			} catch (e) { /* ignore */ }

			const tr = el('tr', {},
				// when viewing all bosses, include boss name as first column; el() will ignore null children
				!bossId ? el('td', {}, (BOSSES.find(bx => bx.id === r.bossId) || { name: r.bossId }).name) : null,
				el('td', {}, tsDisplay),
				el('td', {}, String(r.channel)),
				el('td', {}, r.looted ? '是' : '否'),
				el('td', {class: 'note'}, r.note || ''),
				el('td', {class: respClass}, resp.humanReadable || '—'),
				el('td', {},
					el('button', {type: 'button', 'data-id': r.id, class: 'btn-small delete-btn'}, '刪除'),
					el('button', {type: 'button', 'data-id': r.id, class: 'btn-small edit-btn', style: 'margin-left:6px'}, '編輯')
				)
			);
			// attach delete handler
			if (window.__abt_lastEditedId === r.id) {
				tr.classList.add('highlight');
				setTimeout(() => { try { tr.classList.remove('highlight'); } catch(e){} }, 4000);
				// scroll into view
				try { tr.scrollIntoView({behavior:'smooth', block:'center'}); } catch (e) {}
			}
			tr.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', (ev) => {
				const id = ev.target.getAttribute('data-id');
				const rec = rows.find(x => x.id === id);
				if (!rec) return showToast('找不到紀錄');
				try {
					// perform deletion
					const ok = deleteRecord(id);
					if (!ok) return showToast('刪除失敗');
					// store copy for undo (keep original timestamps/ids)
					window.__abt_recentlyDeleted[id] = rec;
					// schedule cleanup of undo cache after 10s
					setTimeout(() => { try { delete window.__abt_recentlyDeleted[id]; } catch (e) {} }, 10000);
					// show toast with undo button (calls global restore)
					showToast(`<span>已刪除紀錄</span> <button class="btn-flat toast-undo" onclick="window.__abt_restoreDeleted('${id}')">撤銷</button>`, { displayLength: 10000 });
					// re-render
					renderRecords(bossId, date);
				} catch (e) { showToast('刪除失敗：' + e.message, { classes: 'red darken-1 white-text' }); }
			}));
			// attach edit handler
			tr.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', (ev) => {
				const id = ev.target.getAttribute('data-id');
				const rec = rows.find(x => x.id === id);
				if (!rec) return showToast('找不到紀錄');
				try {
					document.getElementById('record-id').value = rec.id;
					document.getElementById('record-boss').value = rec.bossId;
					const dt = new Date(rec.timestamp);
					// show the original kill time in the read-only display
					try { const disp = document.getElementById('record-time-display'); if (disp) disp.innerText = `擊殺時間：${dt.toLocaleString()}`; } catch(e) {}
					document.getElementById('record-channel').value = String(rec.channel);
					try { const lt = document.getElementById('looted-toggle'); if (lt) { lt.checked = !!rec.looted; lt.setAttribute('aria-checked', lt.checked ? 'true' : 'false'); } } catch(e) {}
					document.getElementById('record-note').value = rec.note || '';
					document.getElementById('record-add').innerText = '儲存修改';
					// show cancel button while editing
					try { document.getElementById('record-cancel').style.display = 'inline-block'; } catch (e) {}
					// focus channel for quick edit
					try { document.getElementById('record-channel').focus(); } catch (e) {}
					showToast('已載入紀錄供編輯');
				} catch (e) { showToast('編輯失敗：' + e.message, { classes: 'red darken-1 white-text' }); }
			}));
			tbody.appendChild(tr);
		});
		table.appendChild(tbody);
		recordsRoot.appendChild(table);
		// clear last edited marker after rendering
		try { window.__abt_lastEditedId = null; } catch (e) {}
	}

	// --- fetch bosses and initialize UI ---
	fetch('bosses/bosses.json')
		.then(r => r.json())
		    .then(bosses => {
			    // initialize theme toggle (before UI renders) to apply body class early
			    try { initThemeToggle(); } catch (e) {}
			    BOSSES = bosses;
			renderBosses(bosses);
			buildCalculatorAndRecordUI(bosses);
			// if there was a previously selected boss, call prefill to show preview and highlight
			try {
				const last = localStorage.getItem('abt_lastBoss');
				if (last) {
					const b = BOSSES.find(x => x.id === last);
					if (b) prefillCalculator(b);
				}
			} catch (e) {}
				// build filters UI now that DOM exists
				if (window.__abt_buildFiltersUI) window.__abt_buildFiltersUI(bosses);
			// search filters the dropdown and compact list
			searchInput.addEventListener('input', () => {
				const q = searchInput.value.trim().toLowerCase();
				if (!q) return renderBosses(bosses);
				const filtered = bosses.filter(b => (b.name || '').toLowerCase().includes(q) || ((b.respawn||'') + (b.minMinutes||'')).toString().toLowerCase().includes(q));
				renderBosses(filtered);
			});
			// initial render of records (none selected)
			renderRecords();

			// export/import handlers
			const exportBtn = document.getElementById('export-btn');
			const importBtn = document.getElementById('import-btn');
			const importFile = document.getElementById('import-file');
			if (exportBtn) exportBtn.addEventListener('click', () => {
				const blob = new Blob([PerBossStorage.exportAllPerBoss()], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url; a.download = 'abt_records_export.json';
				document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
			});
			if (importBtn && importFile) {
				importBtn.addEventListener('click', () => importFile.click());
				importFile.addEventListener('change', (ev) => {
					const f = ev.target.files && ev.target.files[0];
					if (!f) return;
					const reader = new FileReader();
					reader.onload = () => {
						try {
							const ok = PerBossStorage.importAllPerBoss(reader.result);
							showToast(ok ? '匯入成功' : '匯入失敗', { classes: ok ? 'green darken-1' : 'red darken-1 white-text' });
							renderRecords();
						} catch (e) { showToast('匯入錯誤：' + e.message, { classes: 'red darken-1 white-text' }); }
					};
					reader.readAsText(f);
				});
			}
		})
		.catch(err => {
			console.error('載入 bosses.json 失敗', err);
			container.innerHTML = '<p style="color:crimson">無法載入 boss 資料 (請確認 docs/bosses/bosses.json 存在)</p>';
		});

}

// ensure init runs even if script is loaded after DOMContentLoaded (e.g. tests.html dynamic load)
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

