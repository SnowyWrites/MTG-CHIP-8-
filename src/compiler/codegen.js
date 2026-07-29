class CodeGenerator {
	constructor(ast, sprites) {
		this.ast = ast;
		this.sprites = sprites;  // sprite data from sprites.json

		// Symbol table — maps variable names to registers
		this.symbolTable = {};

		// Which registers are taken
		// VF is reserved (flag register), never auto-assigned
		this.registers = {
			V0: null, V1: null, V2: null, V3: null,
			V4: null, V5: null, V6: null, V7: null,
			V8: null, V9: null, VA: null, VB: null,
			VC: null, VD: null, VE: null
			// VF intentionally omitted
		};

		// Output bytes
		this.output = [];

		// Current memory address (ROMs start at 0x200)
		this.address = 0x200;

		// Sprite data gets placed starting here
		this.spriteBaseAddress = 0x300;
		this.spriteAddresses = {};

		// Labels for jumps (subroutine name → address)
		this.labels = {};

		// Forward references — jumps we need to patch later
		this.forwardRefs = [];

		// Map file data
		this.map = {
			registers: {},
			memory: {},
			sprites: {},
			labels: {}
		};
	}

	// Get next free register for auto allocation
	allocateRegister(name) {
		for (const reg in this.registers) {
			if (this.registers[reg] === null) {
				this.registers[reg] = name;
				this.symbolTable[name] = reg;
				this.map.registers[name] = reg;
				return reg;
			}
		}
		throw new Error(`Out of registers! Too many variables.`);
	}

	// Manually assign a variable to a specific register
	assignRegister(name, reg) {
		if (this.registers[reg] !== null && this.registers[reg] !== name) {
			throw new Error(`Register ${reg} is already used by "${this.registers[reg]}"`);
		}
		this.registers[reg] = name;
		this.symbolTable[name] = reg;
		this.map.registers[name] = reg;
		return reg;
	}

	// Get register number (0-14) from name (V0-VE)
	regIndex(reg) {
		return parseInt(reg[1], 16);
	}

	// Look up which register a variable is in
	lookupVar(name) {
		// Direct register reference like V0, V1 etc
		if (/^V[0-9A-Fa-f]$/.test(name)) return name;

		const reg = this.symbolTable[name];
		if (!reg) throw new Error(`Unknown variable: "${name}"`);
		return reg;
	}

	// Emit a two byte opcode
	emit(opcode) {
		this.output.push((opcode >> 8) & 0xFF);
		this.output.push(opcode & 0xFF);
		this.address += 2;
	}

	// Main generate function
	generate() {
		// First pass — figure out where sprites and code will live
		// without emitting anything yet
		let spriteOffset = 0x202;
		for (const [name, bytes] of Object.entries(this.sprites)) {
			this.spriteAddresses[name] = spriteOffset;
			this.map.sprites[name] = `0x${spriteOffset.toString(16).toUpperCase()}`;
			spriteOffset += bytes.length;
		}

		// Pad to even address
		if (spriteOffset % 2 !== 0) spriteOffset++;

		const codeStart = spriteOffset;

		// Now emit — JP to code start
		this.address = 0x200;
		this.emit(0x1000 | codeStart);

		// Emit sprite bytes
		for (const [name, bytes] of Object.entries(this.sprites)) {
			for (const byte of bytes) {
				this.output.push(byte);
				this.address++;
			}
		}

		// Pad to even address if needed
		if (this.address % 2 !== 0) {
			this.output.push(0x00);
			this.address++;
		}

		// Emit code
		for (const node of this.ast) {
			this.generateStatement(node);
		}

		// Halt — infinite loop to stop PC from running off into empty memory
		this.emit(0x1000 | this.address); // JP to itself

		return {
			rom: new Uint8Array(this.output),
			map: this.map
		};		
	}

	generateStatement(node) {
		switch (node.type) {
			case 'LetStatement': this.genLet(node); break;
			case 'DrawStatement': this.genDraw(node); break;
			case 'ClearStatement': this.genClear(); break;
			case 'IfStatement': this.genIf(node); break;
			case 'LoopStatement': this.genLoop(node); break;
			case 'DefineStatement': this.genDefine(node); break;
			case 'CallStatement': this.genCall(node); break;
			case 'TimerStatement': this.genTimer(node); break;
			case 'WaitStatement': this.genWait(node); break;
			case 'StoreStatement': this.genStore(node); break;
			case 'LoadStatement': this.genLoad(node); break;
			default:
				throw new Error(`Unknown statement type: ${node.type}`);
		}
	}

	// let x = 10;
	// let x = 10 -> V0;
	genLet(node) {
		let reg;

		if (node.directReg) {
			// Direct register write: let *VF = 0
			reg = node.directReg;
		} else if (node.register) {
			reg = this.assignRegister(node.name, node.register);
		} else if (this.symbolTable[node.name]) {
			reg = this.symbolTable[node.name];
		} else {
			reg = this.allocateRegister(node.name);
		}

		const regIdx = this.regIndex(reg);
		this.genExpression(node.value, regIdx);
	}

	// Evaluate an expression into a target register
	genExpression(expr, targetReg) {
		switch (expr.type) {
			case 'NumberLiteral':
				// LD Vx, NN — 0x6XNN
				this.emit(0x6000 | (targetReg << 8) | expr.value);
				break;

			case 'Identifier': {
				const srcReg = this.lookupVar(expr.name);
				const srcIdx = this.regIndex(srcReg);
				if (srcIdx !== targetReg) {
					// LD Vx, Vy — 0x8XY0
					this.emit(0x8000 | (targetReg << 8) | (srcIdx << 4) | 0x0);
				}
				break;
			}

			case 'RegisterRef': {
				// *V0 — direct register reference
				const srcIdx = this.regIndex(expr.reg);
				if (srcIdx !== targetReg) {
					this.emit(0x8000 | (targetReg << 8) | (srcIdx << 4) | 0x0);
				}
				break;
			}

			case 'RandomExpression':
				// RND Vx, NN — 0xCXNN
				this.emit(0xC000 | (targetReg << 8) | expr.mask);
				break;

			case 'BinaryExpression': {
				// Load left into target register
				this.genExpression(expr.left, targetReg);

				// Load right into a temp register (use VE as temp)
				const tempReg = 0xE;
				this.genExpression(expr.right, tempReg);

				// Apply operator
				switch (expr.operator) {
					case '+': this.emit(0x8000 | (targetReg << 8) | (tempReg << 4) | 0x4); break;
					case '-': this.emit(0x8000 | (targetReg << 8) | (tempReg << 4) | 0x5); break;
					case '&': this.emit(0x8000 | (targetReg << 8) | (tempReg << 4) | 0x2); break;
					case '|': this.emit(0x8000 | (targetReg << 8) | (tempReg << 4) | 0x1); break;
					case '^': this.emit(0x8000 | (targetReg << 8) | (tempReg << 4) | 0x3); break;
					default:
						throw new Error(`Unknown operator: ${expr.operator}`);
				}
				break;
			}

			default:
				throw new Error(`Unknown expression type: ${expr.type}`);
		}
	}

	// clear screen;
	genClear() {
		this.emit(0x00E0);
	}

	// draw (man) at x, y;
	// draw (man) at x, y down 3;
	genDraw(node) {
		const spriteAddr = this.spriteAddresses[node.sprite];
		if (spriteAddr === undefined) {
			throw new Error(`Unknown sprite: "${node.sprite}"`);
		}

		// Load sprite address into I — 0xANNN
		this.emit(0xA000 | spriteAddr);

		// Get X register
		const xReg = this.regIndex(this.lookupVar(node.x.name));

		// Get Y register
		const yReg = this.regIndex(this.lookupVar(node.y.name));

		// Height — use sprite's natural height or override
		const height = node.height !== null
			? node.height
			: this.sprites[node.sprite].length;

		// DRW Vx, Vy, N — 0xDXYN
		this.emit(0xD000 | (xReg << 8) | (yReg << 4) | height);
	}

	// if condition { body } else { elseBody }
	genIf(node) {
		if (node.condition.type === 'KeyCondition') {
			this.genKeyCondition(node);
		} else {
			this.genComparisonIf(node);
		}
	}

	genKeyCondition(node) {
		const keyMap = {
			'x': 0x0, '1': 0x1, '2': 0x2, '3': 0x3,
			'q': 0x4, 'w': 0x5, 'e': 0x6, 'r': 0x7,
			'a': 0x7, 's': 0x8, 'd': 0x9, 'f': 0xE,
			'z': 0xA, 'c': 0xB, '4': 0xC, 'v': 0xF
		};

		const keyNum = keyMap[node.condition.key];
		if (keyNum === undefined) {
			throw new Error(`Unknown key: "${node.condition.key}"`);
		}

		// Use VD for key temp, VE for math temp
		const keyTempReg = 0xD;
		this.emit(0x6000 | (keyTempReg << 8) | keyNum);

		if (node.condition.state === 'PRESSED') {
			this.emit(0xE09E | (keyTempReg << 8));
		} else {
			this.emit(0xE0A1 | (keyTempReg << 8));
		}

		const jumpPatchIndex = this.output.length;
		this.emit(0x1000);

		for (const stmt of node.body) {
			this.generateStatement(stmt);
		}

		const afterBody = this.address;
		const jumpOpcode = 0x1000 | afterBody;
		this.output[jumpPatchIndex] = (jumpOpcode >> 8) & 0xFF;
		this.output[jumpPatchIndex + 1] = jumpOpcode & 0xFF;

		if (node.elseBody) {
			for (const stmt of node.elseBody) {
				this.generateStatement(stmt);
			}
		}
	}

	genComparisonIf(node) {
		const left = node.condition.left;
		const right = node.condition.right;
		const op = node.condition.operator;

		// Handle both named variables and direct register references
		let leftReg;
		if (left.type === 'RegisterRef') {
			leftReg = this.regIndex(left.reg);
		} else {
			leftReg = this.regIndex(this.lookupVar(left.name));
		}

		const tempReg = 0xE;

		if (right.type === 'NumberLiteral') {
			switch (op) {
				case '==':
					this.emit(0x3000 | (leftReg << 8) | right.value);
					break;
				case '!=':
					this.emit(0x3000 | (leftReg << 8) | right.value);
					//this.emit(0x4000 | (leftReg << 8) | right.value);
					break;
				case '>':
					this.emit(0x6000 | (tempReg << 8) | right.value);
					this.emit(0x8000 | (leftReg << 8) | (tempReg << 4) | 0x5);
					this.emit(0x3000 | (0xF << 8) | 0x01);
					break;
				case '<':
					this.emit(0x6000 | (tempReg << 8) | right.value);
					this.emit(0x8000 | (tempReg << 8) | (leftReg << 4) | 0x5);
					this.emit(0x3000 | (0xF << 8) | 0x01);
					break;
			}
		}

		const jumpPatchIndex = this.output.length;
		this.emit(0x1000);

		for (const stmt of node.body) {
			this.generateStatement(stmt);
		}

		const afterBody = this.address;
		const jumpOpcode = 0x1000 | afterBody;
		this.output[jumpPatchIndex] = (jumpOpcode >> 8) & 0xFF;
		this.output[jumpPatchIndex + 1] = jumpOpcode & 0xFF;

		if (node.elseBody) {
			for (const stmt of node.elseBody) {
				this.generateStatement(stmt);
			}
		}
	}

	// loop { body }
	genLoop(node) {
		const loopStart = this.address;

		for (const stmt of node.body) {
			this.generateStatement(stmt);
		}

		// Jump back to loop start — 0x1NNN
		this.emit(0x1000 | loopStart);
	}

	// define movePlayer { body }
	genDefine(node) {
		// Emit a jump to skip over the subroutine body
		const jumpPatchIndex = this.output.length;
		this.emit(0x1000); // placeholder

		// Record where subroutine starts
		this.labels[node.name] = this.address;
		this.map.labels[node.name] = `0x${this.address.toString(16).toUpperCase()}`;

		// Emit subroutine body
		for (const stmt of node.body) {
			this.generateStatement(stmt);
		}

		// RET
		this.emit(0x00EE);

		// Patch the jump to skip over the subroutine
		const afterSub = this.address;
		const jumpOpcode = 0x1000 | afterSub;
		this.output[jumpPatchIndex] = (jumpOpcode >> 8) & 0xFF;
		this.output[jumpPatchIndex + 1] = jumpOpcode & 0xFF;
	}

	// call movePlayer;
	genCall(node) {
		const addr = this.labels[node.name];
		if (addr === undefined) {
			throw new Error(`Unknown subroutine: "${node.name}"`);
		}
		// CALL NNN — 0x2NNN
		this.emit(0x2000 | addr);
	}

	// timer.delay = 60;
	// timer.sound = 30;
	genTimer(node) {
		const tempReg = 0xE;
		this.genExpression(node.value, tempReg);

		if (node.timerType === 'delay') {
			// LD DT, Vx — 0xF015
			this.emit(0xF015 | (tempReg << 8));
		} else if (node.timerType === 'sound') {
			// LD ST, Vx — 0xF018
			this.emit(0xF018 | (tempReg << 8));
		}
	}

	// wait timer.delay;
	genWait(node) {
		const pollReg = 0xD;
		const loopStart = this.address;
		this.emit(0xF007 | (pollReg << 8));        // LD VD, DT
		this.emit(0x3000 | (pollReg << 8) | 0x00); // SE VD, 0 — skip the jump if timer IS zero (done)
		this.emit(0x1000 | loopStart);              // JP back to LD
	}

	// store x to highScore;
	genStore(node) {
		const reg = this.regIndex(this.lookupVar(node.variable));
		// Point I at memory address for this variable
		const memAddr = this.getMemoryAddress(node.address);
		this.emit(0xA000 | memAddr);
		// Store V0 through Vx — 0xFX55
		this.emit(0xF055 | (reg << 8));
		this.map.memory[node.address] = `0x${memAddr.toString(16).toUpperCase()}`;
	}

	// load highScore into x;
	genLoad(node) {
		const reg = this.regIndex(this.lookupVar(node.variable));
		const memAddr = this.getMemoryAddress(node.address);
		this.emit(0xA000 | memAddr);
		// Load V0 through Vx — 0xFX65
		this.emit(0xF065 | (reg << 8));
	}

	// Assign or look up a memory address for a named variable
	getMemoryAddress(name) {
		if (!this.map.memory[name]) {
			// Allocate next available memory slot
			const addr = 0x400 + Object.keys(this.map.memory).length;
			this.map.memory[name] = `0x${addr.toString(16).toUpperCase()}`;
			return addr;
		}
		return parseInt(this.map.memory[name], 16);
	}
}