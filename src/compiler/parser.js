class Parser {
	constructor(tokens) {
		this.tokens = tokens;
		this.pos = 0;
	}

	// Look at current token without consuming it
	peek() {
		return this.tokens[this.pos];
	}

	// Consume and return current token
	advance() {
		return this.tokens[this.pos++];
	}

	// Consume current token only if it matches expected type
	// Throws an error if it doesn't match
	expect(type) {
		const token = this.peek();
		if (token.type !== type) {
			throw new Error(`Expected ${type} but got ${token.type} ("${token.value}")`);
		}
		return this.advance();
	}

	// Check if current token matches type without consuming
	check(type) {
		return this.peek().type === type;
	}

	// Parse the entire program — returns array of statement nodes
	parse() {
		const statements = [];
		while (!this.check('EOF')) {
			statements.push(this.parseStatement());
		}
		return statements;
	}

	parseStatement() {
		const token = this.peek();

		switch (token.type) {
			case 'LET': return this.parseLetStatement();
			case 'IF': return this.parseIfStatement();
			case 'LOOP': return this.parseLoopStatement();
			case 'DEFINE': return this.parseDefineStatement();
			case 'CALL': return this.parseCallStatement();
			case 'DRAW': return this.parseDrawStatement();
			case 'CLEAR': return this.parseClearStatement();
			case 'STORE': return this.parseStoreStatement();
			case 'LOAD': return this.parseLoadStatement();
			case 'WAIT': return this.parseWaitStatement();
			case 'TIMER': return this.parseTimerStatement();
			default:
				throw new Error(`Unexpected token: ${token.type} ("${token.value}")`);
		}
	}

	// let x = 10;
	// let x = x + 5;
	// let x = random & 0xFF;
	parseLetStatement() {
		this.expect('LET');

		// Check for direct register write: let *VF = 0;
		let name = null;
		let directReg = null;

		if (this.check('STAR')) {
			this.advance();
			directReg = this.expect('IDENTIFIER').value;
		} else {
			name = this.expect('IDENTIFIER').value;
		}

		this.expect('EQUALS');
		const value = this.parseExpression();

		// Check for optional manual register assignment
		let register = null;
		if (this.check('ARROW')) {
			this.advance();
			register = this.expect('IDENTIFIER').value;
		}

		this.expect('SEMICOLON');
		return { type: 'LetStatement', name, directReg, value, register };
	}

	// reg V0 = 10;
	parseRegStatement() {
		this.expect('REG');
		const reg = this.expect('IDENTIFIER').value; // V0, V1 etc
		this.expect('EQUALS');
		const value = this.parseExpression();
		this.expect('SEMICOLON');
		return { type: 'RegStatement', reg, value };
	}

	// if x == 10 { ... }
	// if x == 10 { ... } else { ... }
	parseIfStatement() {
		this.expect('IF');
		const condition = this.parseCondition();
		this.expect('LBRACE');
		const body = this.parseBlock();
		this.expect('RBRACE');

		let elseBody = null;
		if (this.check('ELSE')) {
			this.advance();
			this.expect('LBRACE');
			elseBody = this.parseBlock();
			this.expect('RBRACE');
		}

		return { type: 'IfStatement', condition, body, elseBody };
	}

	// loop { ... }
	parseLoopStatement() {
		this.expect('LOOP');
		this.expect('LBRACE');
		const body = this.parseBlock();
		this.expect('RBRACE');
		return { type: 'LoopStatement', body };
	}

	// define movePlayer { ... }
	parseDefineStatement() {
		this.expect('DEFINE');
		const name = this.expect('IDENTIFIER').value;
		this.expect('LBRACE');
		const body = this.parseBlock();
		this.expect('RBRACE');
		return { type: 'DefineStatement', name, body };
	}

	// call movePlayer;
	parseCallStatement() {
		this.expect('CALL');
		const name = this.expect('IDENTIFIER').value;
		this.expect('SEMICOLON');
		return { type: 'CallStatement', name };
	}

	// draw man at x, y;
	parseDrawStatement() {
		this.expect('DRAW');
		this.expect('LPAREN');
		const sprite = this.expect('IDENTIFIER').value;
		this.expect('RPAREN');
		this.expect('AT');
		const x = this.parseExpression();
		this.expect('COMMA');
		const y = this.parseExpression();

		// Optional height
		let height = null;
		if (this.check('DOWN')) {
			this.advance();
			height = this.expect('NUMBER').value;
		}

		this.expect('SEMICOLON');
		return { type: 'DrawStatement', sprite, x, y, height };
	}

	// clear screen;
	parseClearStatement() {
		this.expect('CLEAR');
		this.expect('SCREEN');
		this.expect('SEMICOLON');
		return { type: 'ClearStatement' };
	}

	// store x to highScore;
	parseStoreStatement() {
		this.expect('STORE');
		const variable = this.expect('IDENTIFIER').value;
		this.expect('TO');
		const address = this.expect('IDENTIFIER').value;
		this.expect('SEMICOLON');
		return { type: 'StoreStatement', variable, address };
	}

	// load highScore into x;
	parseLoadStatement() {
		this.expect('LOAD');
		const address = this.expect('IDENTIFIER').value;
		this.expect('INTO');
		const variable = this.expect('IDENTIFIER').value;
		this.expect('SEMICOLON');
		return { type: 'LoadStatement', address, variable };
	}

	// wait timer.delay;
	parseWaitStatement() {
		this.expect('WAIT');
		this.expect('TIMER');
		this.expect('DOT');
		const timerType = this.expect('IDENTIFIER').value;
		this.expect('SEMICOLON');
		return { type: 'WaitStatement', timerType };
	}

	// timer.delay = 60;
	// timer.sound = 30;
	parseTimerStatement() {
		this.expect('TIMER');
		this.expect('DOT');
		const timerType = this.expect('IDENTIFIER').value;
		this.expect('EQUALS');
		const value = this.parseExpression();
		this.expect('SEMICOLON');
		return { type: 'TimerStatement', timerType, value };
	}

	// Parse a block of statements until we hit a closing brace
	parseBlock() {
		const statements = [];
		while (!this.check('RBRACE') && !this.check('EOF')) {
			statements.push(this.parseStatement());
		}
		return statements;
	}

	// Parse a condition: x == 10, x > 5, x != y
	parseCondition() {
		// Check for key press: key(w) pressed
		if (this.check('KEY')) {
			this.advance();
			this.expect('LPAREN');
			const key = this.expect('IDENTIFIER').value;
			this.expect('RPAREN');
			const state = this.advance().type; // PRESSED or RELEASED
			return { type: 'KeyCondition', key, state };
		}

		const left = this.parseExpression();
		const operator = this.advance().value; // ==, !=, >, 
		const right = this.parseExpression();
		return { type: 'Comparison', left, operator, right };
	}

	// Parse an expression: 10, x, x + 5, random & 0xFF
	parseExpression() {
		// Check for random
		if (this.check('RANDOM')) {
			this.advance();
			this.expect('AND');
			const mask = this.expect('NUMBER').value;
			return { type: 'RandomExpression', mask };
		}

		let left = this.parsePrimary();

		// Check for binary operator
		const ops = ['PLUS', 'MINUS', 'AND', 'OR', 'XOR'];
		if (ops.includes(this.peek().type)) {
			const operator = this.advance().value;
			const right = this.parsePrimary();
			return { type: 'BinaryExpression', left, operator, right };
		}

		return left;
	}

	// Parse a primary value: number or identifier
	parsePrimary() {
		// Pointer dereference: *V0
		if (this.check('STAR')) {
			this.advance();
			const reg = this.expect('IDENTIFIER').value;
			return { type: 'RegisterRef', reg };
		}
		if (this.check('NUMBER')) {
			return { type: 'NumberLiteral', value: this.advance().value };
		}
		if (this.check('IDENTIFIER')) {
			return { type: 'Identifier', name: this.advance().value };
		}
		throw new Error(`Expected value but got ${this.peek().type}`);
	}
}