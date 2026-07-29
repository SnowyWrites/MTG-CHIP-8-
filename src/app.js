let cachedVarNames = {};

// Subscribe to stats stream
window.chip8.emulator.onStats((stats) => {
	document.getElementById('fps').textContent = stats.fps;
	document.getElementById('cycles').textContent = stats.cyclesPerSecond;
	document.getElementById('rom').textContent = stats.rom;
	document.getElementById('pc').textContent = '0x' + stats.pc.toString(16).toUpperCase();
	document.getElementById('sound').textContent = stats.soundActive ? '🔊' : '🔇';

	// Debug panel
	if (!stats.registers) return;

	// Load map if we have a project
	const panel = document.getElementById('debugPanel');
	let varNames = {};
	if (currentProject) {
		window.chip8.fs.readFile(`${currentProject}/output.map`).then(base64 => {
			const map = JSON.parse(atob(base64));
			varNames = Object.fromEntries(
				Object.entries(map.registers).map(([name, reg]) => [reg, name])
			);
			renderDebugPanel(panel, stats, varNames);
		}).catch(() => renderDebugPanel(panel, stats, {}));
	} else {
		renderDebugPanel(panel, stats, cachedVarNames);
	}
});

function renderDebugPanel(panel, stats, varNames) {
	const regBytes = Uint8Array.from(atob(stats.registers), c => c.charCodeAt(0));
	const rows = Array.from(regBytes).map((val, i) => {
		const reg = 'V' + i.toString(16).toUpperCase();
		const name = varNames[reg] || '';
		return `<tr>
            <td>${name}</td>
            <td>${reg}</td>
            <td>0x${val.toString(16).padStart(2, '0').toUpperCase()}</td>
            <td>${val}</td>
        </tr>`;
	});

	rows.push(`<tr><td></td><td>I</td><td>0x${stats.i.toString(16).toUpperCase()}</td><td></td></tr>`);
	rows.push(`<tr><td></td><td>PC</td><td>0x${stats.pc.toString(16).toUpperCase()}</td><td></td></tr>`);
	rows.push(`<tr><td></td><td>DT</td><td>0x${stats.dt.toString(16).padStart(2, '0').toUpperCase()}</td><td>${stats.dt}</td></tr>`);
	rows.push(`<tr><td></td><td>ST</td><td>0x${stats.st.toString(16).padStart(2, '0').toUpperCase()}</td><td>${stats.st}</td></tr>`);

	panel.innerHTML = `<table>${rows.join('')}</table>`;
}

document.getElementById('launchBtn').onclick = async () => {
	if (!currentProject) {
		alert('No project open!');
		return;
	}
	await window.chip8.emulator.launch(`${currentProject}/output.ch8`);
};

document.getElementById('stopBtn').onclick = async () => {
	await window.chip8.emulator.stop();
	document.getElementById('fps').textContent = '--';
	document.getElementById('cycles').textContent = '--';
	document.getElementById('rom').textContent = '--';
	document.getElementById('pc').textContent = '--';
	document.getElementById('sound').textContent = '--';
};

window.chip8.emulator.onStopped(() => {
	document.getElementById('fps').textContent = '--';
	document.getElementById('cycles').textContent = '--';
	document.getElementById('rom').textContent = '--';
	document.getElementById('pc').textContent = '--';
	document.getElementById('sound').textContent = '--';
});

// ── Sprite Editor ────────────────────────────────────────────────────────

const SPRITE_ROWS = 15;
const SPRITE_COLS = 8;
const grid = document.getElementById('spriteGrid');
const bytesDisplay = document.getElementById('spriteBytes');

// Build the grid
const cells = [];
for (let row = 0; row < SPRITE_ROWS; row++) {
	for (let col = 0; col < SPRITE_COLS; col++) {
		const cell = document.createElement('div');
		cell.className = 'spriteCell';
		cell.dataset.row = row;
		cell.dataset.col = col;
		cell.addEventListener('click', () => {
			cell.classList.toggle('on');
			updateBytes();
		});
		grid.appendChild(cell);
		cells.push(cell);
	}
}

// Convert grid state to bytes and display them
function updateBytes() {
	const bytes = [];
	for (let row = 0; row < SPRITE_ROWS; row++) {
		let byte = 0;
		for (let col = 0; col < SPRITE_COLS; col++) {
			const cell = cells[row * SPRITE_COLS + col];
			if (cell.classList.contains('on')) {
				byte |= (0x80 >> col);
			}
		}
		bytes.push(byte);
	}

	bytesDisplay.textContent = 'Bytes: ' + bytes.map(b => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(', ');
}

updateBytes();

document.getElementById('clearSpriteBtn').onclick = () => {
	cells.forEach(cell => cell.classList.remove('on'));
	updateBytes();
};

// ── Project Management ───────────────────────────────────────────────────

let currentProject = null; // will hold the project folder path

// Recent Projects
async function loadRecentProjects() {
	try {
		const base64 = await window.chip8.fs.readFile('recent.json', 'AppData');
		return JSON.parse(atob(base64));
	} catch {
		return [];
	}
}

async function saveRecentProject(projectPath) {
	let recent = await loadRecentProjects();

	// Remove if already exists
	recent = recent.filter(p => p !== projectPath);

	// Add to front
	recent.unshift(projectPath);

	// Keep only last 5
	recent = recent.slice(0, 5);

	await window.chip8.fs.writeFile(
		'recent.json',
		btoa(JSON.stringify(recent)),
		'AppData'
	);
}

document.getElementById('newProjectBtn').onclick = async () => {
	const folderPath = await window.chip8.dialog.save({
		title: 'Create New Project',
		buttonLabel: 'Create',
		filters: [{ name: 'CHIP-8 Project', extensions: [''] }]
	});

	if (!folderPath) return;

	// Create project structure
	await window.chip8.fs.mkdir(folderPath);
	await window.chip8.fs.writeFile(
		`${folderPath}/sprites.json`,
		btoa(JSON.stringify({ sprites: {} }, null, 2))
	);
	await window.chip8.fs.writeFile(
		`${folderPath}/script.chip8`,
		btoa('# CHIP-8 Script\n')
	);

	currentProject = folderPath;
	document.getElementById('projectName').textContent = folderPath.split('/').pop();
	await saveRecentProject(folderPath);
	refreshFileBrowser();
	renderPreview();
};

document.getElementById('openProjectBtn').onclick = async () => {
	const folderPath = await window.chip8.dialog.open({
		title: 'Open Project',
		properties: ['openDirectory']
	});

	if (!folderPath) return;

	currentProject = folderPath;
	document.getElementById('projectName').textContent = folderPath.split('/').pop();
	await saveRecentProject(folderPath);
	refreshFileBrowser();
	renderPreview();

	// Load script into editor
	try {
		const scriptBase64 = await window.chip8.fs.readFile(`${currentProject}/script.chip8`);
		scriptInput.value = atob(scriptBase64);
	} catch {
		scriptInput.value = '';
	}
};

async function renderRecentProjects() {
	const recent = await loadRecentProjects();
	const panel = document.getElementById('recentProjects');
	panel.innerHTML = '';

	if (recent.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'fileItem';
		empty.style.color = 'var(--text-muted)';
		empty.textContent = 'No recent projects';
		panel.appendChild(empty);
		return;
	}

	recent.forEach(projectPath => {
		const item = document.createElement('div');
		item.className = 'fileItem';
		item.textContent = '📁 ' + projectPath.split('/').pop();
		item.title = projectPath; // full path on hover
		item.onclick = async () => {
			currentProject = projectPath;
			document.getElementById('projectName').textContent = projectPath.split('/').pop();
			await saveRecentProject(projectPath);
			await refreshFileBrowser();
			renderPreview();
			try {
				const scriptBase64 = await window.chip8.fs.readFile(`${currentProject}/script.chip8`);
				scriptInput.value = atob(scriptBase64);
			} catch {
				scriptInput.value = '';
			}
		};
		panel.appendChild(item);
	});
}

async function refreshFileBrowser() {
	const browser = document.getElementById('fileBrowser');
	browser.innerHTML = '';

	if (!currentProject) return;

	// Project files section
	const filesHeader = document.createElement('div');
	filesHeader.className = 'fileHeader';
	filesHeader.textContent = 'Project';
	browser.appendChild(filesHeader);

	['sprites.json', 'script.chip8', 'output.ch8'].forEach(file => {
		const item = document.createElement('div');
		item.className = 'fileItem';
		item.textContent = file;
		browser.appendChild(item);
	});

	// Sprites section
	const spritesHeader = document.createElement('div');
	spritesHeader.className = 'fileHeader';
	spritesHeader.textContent = 'Sprites';
	browser.appendChild(spritesHeader);

	try {
		const base64 = await window.chip8.fs.readFile(`${currentProject}/sprites.json`);
		const spritesData = JSON.parse(atob(base64));

		Object.keys(spritesData.sprites).forEach(name => {
			const item = document.createElement('div');
			item.className = 'fileItem';

			const label = document.createElement('span');
			label.textContent = `🖼 ${name}`;
			label.onclick = () => loadSpriteIntoEditor(name, spritesData.sprites[name]);

			const del = document.createElement('span');
			del.textContent = '✕';
			del.style.cssText = 'float:right; cursor:pointer; color:var(--text-muted);';
			del.onclick = async (e) => {
				e.stopPropagation();
				const confirmed = await window.chip8.dialog.confirm(`Delete sprite "${name}"?`);
				if (!confirmed) return;
				delete spritesData.sprites[name];
				await window.chip8.fs.writeFile(
					`${currentProject}/sprites.json`,
					btoa(JSON.stringify(spritesData, null, 2))
				);
				refreshFileBrowser();
				renderPreview();
			};

			item.appendChild(label);
			item.appendChild(del);
			browser.appendChild(item);
		});
	} catch {
		const empty = document.createElement('div');
		empty.className = 'fileItem';
		empty.style.color = 'var(--text-muted)';
		empty.textContent = 'No sprites yet';
		browser.appendChild(empty);
	}
}

document.getElementById('saveSpriteBtn').onclick = async () => {
	if (!currentProject) {
		alert('No project open!');
		return;
	}

	const name = document.getElementById('spriteName').value.trim();
	if (!name) {
		alert('Give your sprite a name first!');
		return;
	}

	// Get current byte values from grid
	const bytes = [];
	for (let row = 0; row < SPRITE_ROWS; row++) {
		let byte = 0;
		for (let col = 0; col < SPRITE_COLS; col++) {
			const cell = cells[row * SPRITE_COLS + col];
			if (cell.classList.contains('on')) {
				byte |= (0x80 >> col);
			}
		}
		bytes.push(byte);
	}

	// Trim trailing zero rows
	while (bytes.length > 1 && bytes[bytes.length - 1] === 0) {
		bytes.pop();
	}

	// Load existing sprites.json
	const spritesPath = `${currentProject}/sprites.json`;
	let spritesData = { sprites: {} };

	try {
		const base64 = await window.chip8.fs.readFile(spritesPath);
		spritesData = JSON.parse(atob(base64));
	} catch {
		// file doesn't exist yet, use empty default
	}

	// Add or overwrite sprite
	spritesData.sprites[name] = bytes;

	// Save back
	await window.chip8.fs.writeFile(
		spritesPath,
		btoa(JSON.stringify(spritesData, null, 2))
	);

	document.getElementById('spriteName').value = '';
	refreshFileBrowser();
	renderPreview();
};

function loadSpriteIntoEditor(name, bytes) {
	// Clear grid first
	cells.forEach(cell => cell.classList.remove('on'));

	// Set sprite name
	document.getElementById('spriteName').value = name;

	// Fill in the pixels
	bytes.forEach((byte, row) => {
		for (let col = 0; col < 8; col++) {
			if (byte & (0x80 >> col)) {
				cells[row * SPRITE_COLS + col].classList.add('on');
			}
		}
	});

	updateBytes();
}

// -- PREVIEW
function renderPreview() {
	const canvas = document.getElementById('previewCanvas');
	const ctx = canvas.getContext('2d');

	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, 64, 32);

	if (!currentProject) return;

	window.chip8.fs.readFile(`${currentProject}/sprites.json`).then(base64 => {
		const spritesData = JSON.parse(atob(base64));
		ctx.fillStyle = '#fff';

		let px = 0;
		let py = 0;
		let tallestInRow = 0;

		for (const [name, bytes] of Object.entries(spritesData.sprites)) {
			if (px + 8 > 64) {
				px = 0;
				py += tallestInRow + 2;
				tallestInRow = 0;
			}
			if (py >= 32) break;

			bytes.forEach((byte, row) => {
				tallestInRow = Math.max(tallestInRow, bytes.length);
				for (let col = 0; col < 8; col++) {
					if (byte & (0x80 >> col)) {
						ctx.fillRect(px + col, py + row, 1, 1);
					}
				}
			});

			px += 10;
		}
	}).catch(() => { });
}

// -- Script Editor

const scriptInput = document.getElementById('scriptInput');
const tokenOutput = document.getElementById('tokenOutput');

let tokenizeTimeout = null;

// Auto-save script when typing stops
let saveTimeout = null;

scriptInput.addEventListener('input', () => {
	clearTimeout(saveTimeout);
	saveTimeout = setTimeout(async () => {
		if (!currentProject) return;
		await window.chip8.fs.writeFile(
			`${currentProject}/script.chip8`,
			btoa(scriptInput.value)
		);
	}, 500);
});

document.getElementById('compileBtn').onclick = async () => {
	if (!currentProject) {
		tokenOutput.textContent = 'No project open!';
		return;
	}

	try {
		// Load sprites from project
		const spritesBase64 = await window.chip8.fs.readFile(`${currentProject}/sprites.json`);
		const spritesData = JSON.parse(atob(spritesBase64));

		// Tokenize
		const tokens = new Tokenizer(scriptInput.value).tokenize();

		// Parse
		const ast = new Parser(tokens).parse();

		// Generate
		const codegen = new CodeGenerator(ast, spritesData.sprites);
		const { rom, map } = codegen.generate();

		// Debug — show hex dump
		const hex = Array.from(rom)
			.map(b => b.toString(16).padStart(2, '0').toUpperCase())
			.join(' ');
		console.log('ROM hex:', hex);
		tokenOutput.textContent = `Compiled! ${rom.length} bytes\n${hex}`;

		// Save ROM
		const romBase64 = btoa(String.fromCharCode(...rom));
		await window.chip8.fs.writeFile(`${currentProject}/output.ch8`, romBase64);

		// Save map
		await window.chip8.fs.writeFile(
			`${currentProject}/output.map`,
			btoa(JSON.stringify(map, null, 2))
		);
		cachedVarNames = Object.fromEntries(
			Object.entries(map.registers).map(([name, reg]) => [reg, name])
		);

		tokenOutput.textContent = `Compiled! ${rom.length} bytes → output.ch8`;

	} catch (err) {
		tokenOutput.textContent = `Error: ${err.message}`;
	}
};

// --Startup 
renderRecentProjects();
renderPreview();
