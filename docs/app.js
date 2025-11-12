// Simple runtime for docs/index.html
// Loads `bosses/bosses.json` and renders a small searchable grid of bosses.

document.addEventListener('DOMContentLoaded', () => {
	const container = document.getElementById('app');
	const searchInput = document.getElementById('search');
	const calculatorRoot = document.getElementById('calculator');
	const calcResult = document.getElementById('calc-result');

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

	function renderBosses(list) {
		const grid = document.getElementById('boss-grid');
		grid.innerHTML = '';
		if (!list.length) {
			grid.appendChild(el('p', {class: 'center'}, '找不到符合條件的 Boss'));
			return;
		}
		list.forEach(b => {
				const card = el('div', {class: 'boss-card'},
					el('img', {src: 'bosses/' + b.image, alt: b.name, width: 240, height: 140}),
					el('h3', {}, b.name),
					el('p', {}, '預估復活：' + (b.respawn || (b.minMinutes + '分~' + b.maxMinutes + '分')))
				);
				card.style.cursor = 'pointer';
				card.addEventListener('click', () => prefillCalculator(b));
			grid.appendChild(card);
		});
	}

		function prefillCalculator(boss) {
			// populate calculator form with selected boss
			const sel = document.getElementById('calc-boss');
			if (sel) sel.value = boss.id;
			else buildCalculator(bosss);
			// show sample result
			calcResult.innerHTML = `<strong>已選：</strong>${boss.name}（${boss.respawn || ''}）`;
		}

	fetch('bosses/bosses.json')
		.then(r => r.json())
		.then(bosses => {
				// initial render
				renderBosses(bosses);

				// build calculator UI
				buildCalculator(bosses);

				// search
				searchInput.addEventListener('input', () => {
					const q = searchInput.value.trim().toLowerCase();
					if (!q) return renderBosses(bosses);
					const filtered = bosses.filter(b => (b.name || '').toLowerCase().includes(q) || (b.respawn || '').toLowerCase().includes(q));
					renderBosses(filtered);
				});
		})
		.catch(err => {
			console.error('載入 bosses.json 失敗', err);
			container.innerHTML = '<p style="color:crimson">無法載入 boss 資料 (請確認 docs/bosses/bosses.json 存在)</p>';
		});

		function buildCalculator(bosses) {
			calculatorRoot.innerHTML = '';
			const bossSelect = el('select', {id: 'calc-boss'});
			bosses.forEach(b => bossSelect.appendChild(el('option', {value: b.id}, b.name)));
			const timeInput = el('input', {id: 'calc-time', type: 'datetime-local'});
			// default now
			const now = new Date();
			const padded = (n) => n.toString().padStart(2, '0');
			const local = `${now.getFullYear()}-${padded(now.getMonth()+1)}-${padded(now.getDate())}T${padded(now.getHours())}:${padded(now.getMinutes())}`;
			timeInput.value = local;

			const calcBtn = el('button', {type: 'button'}, '計算復活時間');
			calcBtn.addEventListener('click', () => {
				const bossId = document.getElementById('calc-boss').value;
				const boss = bosses.find(b => b.id === bossId);
				if (!boss) { calcResult.innerText = '請先選擇 Boss'; return; }
				const tval = document.getElementById('calc-time').value;
				if (!tval) { calcResult.innerText = '請輸入擊殺時間'; return; }
				const kill = new Date(tval);
				if (isNaN(kill)) { calcResult.innerText = '無效時間格式'; return; }
				const min = boss.minMinutes != null ? boss.minMinutes : null;
				const max = boss.maxMinutes != null ? boss.maxMinutes : null;
				if (min == null || max == null) { calcResult.innerText = '此 Boss 尚無結構化復活時間欄位'; return; }
				const fmt = (d) => {
					const y = d.getFullYear();
					const m = (d.getMonth()+1).toString().padStart(2,'0');
					const day = d.getDate().toString().padStart(2,'0');
					const hh = d.getHours().toString().padStart(2,'0');
					const mm = d.getMinutes().toString().padStart(2,'0');
					return `${y}-${m}-${day} ${hh}:${mm}`;
				};
				const minDate = new Date(kill.getTime() + min*60000);
				const maxDate = new Date(kill.getTime() + max*60000);
				calcResult.innerHTML = `<strong>${boss.name}</strong><br/>可能復活時間範圍：<br/>${fmt(minDate)} ～ ${fmt(maxDate)}`;
			});

			const wrapper = el('div', {},
				el('label', {}, 'Boss：'), bossSelect,
				el('br'),
				el('label', {}, '擊殺時間：'), timeInput,
				el('div', {style: 'margin-top:8px'}, calcBtn)
			);
			calculatorRoot.appendChild(wrapper);
		}
});

